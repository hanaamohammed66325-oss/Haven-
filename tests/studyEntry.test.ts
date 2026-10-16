import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { StudyScene, type SceneModel } from "@/lib/study/scene";

// Exercise the real entry/river state machine without spending time rasterizing
// artwork. A slow world build advances the same clock used by the real canvas.
function fixture(t: TestContext) {
  let clock = 100;
  t.mock.method(performance, "now", () => clock);
  const scene = new StudyScene(800, 600, 1);
  const state = scene as unknown as {
    started: number; arrivalAt: number; landed: boolean; lakeScale: number;
    session: { levels: number[]; clampCam: () => number[] };
    harvest: { build: () => void; clampCam: () => number[] };
    harvestSky: { build: () => void };
    buildSession: (base: unknown, lakeScale: number) => void;
    paint: (...args: unknown[]) => void;
    places: Array<{ whoAt: number }>;
  };
  const builds = { session: 0, harvest: 0 };
  let progress = -1;
  state.buildSession = (_, lakeScale) => {
    builds.session++; clock += 80; state.lakeScale = lakeScale;
    Object.assign(state.session, { levels: [2.6, 1.65, 1, 0.55], inp: { w: 800, h: 600 }, rx: 200, ry: 240 });
  };
  state.harvest.build = () => { builds.harvest++; clock += 60; Object.assign(state.harvest, { inp: { w: 800, h: 600 }, rx: 200, ry: 240 }); };
  state.harvestSky.build = () => {};
  state.session.clampCam = state.harvest.clampCam = () => [0, 0];
  state.paint = (...args) => { progress = args[6] as number; };
  const model: SceneModel = {
    night: false, reduced: false, view: "session", phase: "waiting", progress: 0,
    places: [{ userId: "one", away: false }, { userId: "two", away: false }],
    members: new Map(), awake: new Map(), harvest: [], harvestFlowers: new Map(), selected: new Set(), pointer: null,
  };
  const draw = (now: number) => { clock = now; scene.draw({} as CanvasRenderingContext2D, now, model); };
  return { scene, state, builds, model, draw, progress: () => progress };
}

test("cold entry prepares only its visible lake and keeps the complete dive and arrivals", (t) => {
  const f = fixture(t);
  f.draw(100);
  assert.deepEqual(f.builds, { session: 1, harvest: 0 });
  assert.equal(f.state.started, 180, "preparation does not spend the dive's duration");
  assert.equal(f.progress(), 0);
  assert.equal(f.state.arrivalAt, 2330);
  f.draw(280);
  assert.ok(Math.abs(f.progress() - 100 / 1900) < 1e-9);
  assert.deepEqual(f.builds, { session: 1, harvest: 0 });
  f.draw(2400);
  assert.equal(f.state.landed, true);
  f.draw(2500);
  assert.equal(f.builds.harvest, 0, "hidden lake waits for members' arrivals too");
});

test("cold achievement entry and river return prepare the correct worlds without a timing jump", (t) => {
  const f = fixture(t);
  f.model.view = "achievement";
  f.draw(100);
  assert.deepEqual(f.builds, { session: 0, harvest: 1 });
  assert.equal(f.state.started, 160);
  assert.equal(f.progress(), 0);
  f.draw(2600);
  f.model.view = "session";
  f.draw(2700);
  assert.deepEqual(f.builds, { session: 1, harvest: 1 });
  assert.equal(f.state.started, 2780);
  assert.equal(f.progress(), 1, "outgoing river starts at its departure, with no negative progress");
  f.draw(4180);
  assert.equal(f.progress(), 0, "incoming dive begins only after the full river trip");
});

test("quiet preparation and viewport resize preserve seated members and the entry timeline", (t) => {
  const f = fixture(t);
  f.draw(100);
  f.draw(10_000);
  const arrivals = f.state.places.map(p => p.whoAt);
  const started = f.state.started;
  f.draw(10_100);
  assert.equal(f.builds.harvest, 1, "the next lake prepares after motion has settled");
  assert.equal(f.state.started, started);
  f.scene.resize(900, 700, 1.25);
  f.draw(10_200);
  assert.equal(f.builds.session, 2);
  assert.equal(f.state.started, started);
  assert.deepEqual(f.state.places.map(p => p.whoAt), arrivals, "resize cannot replay water arrivals");
});
