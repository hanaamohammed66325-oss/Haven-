import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHaviOutfit, drawHaviOutfitLayer } from "../src/lib/haviOutfit";
import { COSMETICS } from "../src/lib/haviCosmetics";
import { parseState } from "../src/lib/study/parse";
import { drawHaviSprite, drawGroveHavi } from "../src/lib/pomodoro/pondRenderer";
import { drawSocialHavi, drawWaterArrival, drawWaterLeave, type DeskPose } from "../src/lib/study/havi";
import { StudyScene, type SceneModel } from "../src/lib/study/scene";

const me = "00000000-0000-4000-8000-000000000001", peer = "00000000-0000-4000-8000-000000000002";
const member = (userId: string, seat: number, extra: Record<string, unknown> = {}) => ({ user_id: userId, seat, display_name: "Student", havi_name: "Havi", havi_color: "#a8d98a", flower_color: "#e88bb5", ...extra });
const raw = (members: unknown[]) => ({ server_time: "2026-10-13T12:00:00Z", group: { id: me, name: "Group", version: 1, epoch: 1, is_owner: true, cap: 10 }, members, sitting: null, round: null });

test("known clothes are deduplicated and respect the app's existing body zones", () => {
  assert.deepEqual(normalizeHaviOutfit(["scarf", "glasses", "crown", "glasses", "none", "not-art"]), ["crown", "glasses", "scarf"]);
  assert.deepEqual(normalizeHaviOutfit(["bowtie", "scarf", "beanie", "crown"]), ["crown", "scarf"]);
  assert.deepEqual(normalizeHaviOutfit(["glasses", "king", "scarf", "crown"]), ["king"]);
  for (const input of [null, {}, "crown", ["constructor", "__proto__"], Array(33).fill("crown")]) assert.deepEqual(normalizeHaviOutfit(input), []);
});

test("adapter preserves every original outfit pixel, including the royal back layer", () => {
  const grid = () => {
    const cells = new Map<string, string>();
    return { cells, paint(x: number, y: number, w: number, h: number, color: string) { for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) cells.set(`${x + col}:${y + row}`, color); } };
  };
  for (const [id, art] of Object.entries(COSMETICS)) for (const layer of ["back", "front"] as const) {
    const direct = grid(), adapted = grid();
    const ctx = { fillStyle: "", fillRect(x: number, y: number, w: number, h: number) { direct.paint(x, y, w, h, this.fillStyle); } };
    (art as { back?: Function; front?: Function })[layer]?.(ctx, 1);
    drawHaviOutfitLayer([id], layer, adapted.paint);
    assert.deepEqual([...adapted.cells].sort(), [...direct.cells].sort(), `${id}:${layer}`);
  }
});

test("each wardrobe row uses the body painter rather than fixed screen coordinates", () => {
  const rows: Array<[number, number, number, string]> = [];
  drawHaviOutfitLayer(["king"], "front", (x, y, w, h, color) => { assert.equal(h, 1); rows.push([x, Math.round(y * 0.58 + 8), w, color]); });
  assert.ok(rows.length > 0); assert.ok(rows.some(r => r[1] === 8), "crown follows the sleeping head");
  assert.ok(rows.some(r => r[1] >= 16), "robe follows the sleeping torso");
});

test("group snapshot keeps each person's wardrobe and never substitutes the viewer's", () => {
  const state = parseState(raw([member(me, 0, { havi_cosmetics: ["king"] }), member(peer, 1, { havi_cosmetics: ["glasses", "scarf"] })]))!;
  assert.deepEqual(state.members[0].haviCosmetics, ["king"]);
  assert.deepEqual(state.members[1].haviCosmetics, ["glasses", "scarf"]);
});

test("old and malformed outfit fields keep otherwise valid group members usable", () => {
  const old = parseState(raw([member(me, 0)]))!;
  assert.equal(Object.hasOwn(old.members[0], "haviCosmetics"), false);
  for (const input of [null, "king", { king: true }, ["unknown"]]) {
    const state = parseState(raw([member(me, 0, { havi_cosmetics: input })]))!;
    assert.equal(state.members.length, 1); assert.deepEqual(state.members[0].haviCosmetics, []);
  }
});

function recorder() {
  const rectangles: Array<{ color: string; x: number; y: number; w: number; h: number }> = [];
  const target = { fillStyle: "", globalAlpha: 1, rectangles, fillRect(x: number, y: number, w: number, h: number) { rectangles.push({ color: String(this.fillStyle), x, y, w, h }); }, getTransform: () => ({ a: 1, d: 1, e: 0, f: 0 }) };
  const ctx = new Proxy(target, { get(object, key) { return key in object ? object[key as keyof typeof target] : () => {}; } }) as unknown as CanvasRenderingContext2D;
  return { ctx, rectangles, crowned: () => rectangles.some(r => r.color === "#d9a441") };
}

test("all solo moods, rest handoff, personal lake and water reflection receive the outfit", () => {
  for (const mood of ["idle", "studying", "fishing", "resting", "celebrating", "sad", "jumping"] as const) {
    const dressed = recorder(), bare = recorder();
    drawHaviSprite(dressed.ctx, 0, 0, 3, mood, 100, 0.5, true, undefined, 30, ["crown"]);
    drawHaviSprite(bare.ctx, 0, 0, 3, mood, 100, 0.5, true, undefined, 30);
    assert.equal(dressed.crowned(), true, mood); assert.equal(bare.crowned(), false, mood);
  }
  const lake = recorder(), reflection = recorder();
  drawGroveHavi(lake.ctx, 0, 0, 1, 10, "idle", ["crown"]);
  drawHaviSprite(reflection.ctx, 0, 0, 3, "jumping", 10, 0, true, 50, undefined, ["crown"]);
  assert.equal(lake.crowned(), true); assert.equal(reflection.crowned(), true);
});

test("all desk poses attach clothes before foreground furniture, including poke transforms", () => {
  for (const pose of ["study", "sleep", "wake", "rest", "phone", "look"] as DeskPose[]) {
    const r = recorder();
    drawSocialHavi(r.ctx, 0, 0, 1, 12, pose, 2, "#a8d98a", false, 200, (ctx, behind) => { if (!behind) { ctx.fillStyle = "foreground-desk"; ctx.fillRect(0, 0, 1, 1); } }, ["crown"]);
    assert.equal(r.crowned(), true, pose);
    assert.ok(r.rectangles.findIndex(p => p.color === "#d9a441") < r.rectangles.findIndex(p => p.color === "foreground-desk"), pose);
  }
});

test("water arrival and departure carry the same clothes through existing masks", () => {
  for (const time of [0.5, 1.2]) { const r = recorder(); drawWaterArrival(r.ctx, 0, 0, 1.4, time, "#a8d98a", ["crown"]); assert.equal(r.crowned(), true); }
  for (const time of [0.2, 0.7]) { const r = recorder(); drawWaterLeave(r.ctx, 0, 0, 1.4, time, "#a8d98a", ["crown"]); assert.equal(r.crowned(), true); }
});

test("a departing member keeps their own last outfit only for the leave duration", () => {
  const scene = new StudyScene(800, 600, 1);
  const internal = scene as unknown as { appearances: Map<string, unknown>; places: unknown[]; drawDesks(ctx: CanvasRenderingContext2D, now: number, model: SceneModel): void };
  const members = new Map([[me, { color: "#a8d98a", flower: "#e88bb5", cosmetics: ["crown"] }], [peer, { color: "#88ddff", flower: "#e88bb5", cosmetics: ["scarf"] }]]);
  const model: SceneModel = { reduced: false, night: false, members, view: "session", phase: "waiting", progress: 0,
    places: [], awake: new Map(), harvest: [], harvestFlowers: new Map(), selected: new Set(), pointer: null };
  internal.drawDesks(recorder().ctx, 10_000, model);
  internal.places = [{ desk: false, deskAt: 0, who: null, whoAt: 0, gone: me, goneAt: 10_000, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, moveAt: 0 }];
  members.delete(me); const leaving = recorder(); internal.drawDesks(leaving.ctx, 10_200, model);
  assert.equal(leaving.crowned(), true); assert.equal(internal.appearances.has(me), true);
  internal.drawDesks(recorder().ctx, 11_200, model); assert.equal(internal.appearances.has(me), false); assert.equal(internal.appearances.has(peer), true);
  scene.dispose(); assert.equal(internal.appearances.size, 0);
});
