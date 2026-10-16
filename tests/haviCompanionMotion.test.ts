import test from "node:test";
import assert from "node:assert/strict";
import { sharedMotion, soloMotion, cardTransition, travelMotion, SHARED_MOTIONS } from "../src/lib/haviCompanionMotion";

test("approved shared motions keep unequal-size companions separated for the entire scene", () => {
  const sizes = { fox: { width: 75, scale: 5 }, tiger: { width: 68, scale: 4 } };
  for (const width of [161, 190, 350, 600]) for (const mode of SHARED_MOTIONS) for (let i = 0; i <= 100; i++) {
    const lane = { left: 20, right: 20 + width }, result = sharedMotion(mode, i / 10, lane, sizes)!;
    for (const kind of ["fox", "tiger"] as const) {
      const a = result[kind]; assert.ok(a.left >= lane.left); assert.ok(a.left + sizes[kind].width <= lane.right + .001);
    }
    assert.ok(Math.abs(result.fox.left - result.tiger.left) >= (result.fox.left < result.tiger.left ? sizes.fox.width : sizes.tiger.width) + 17.99);
  }
  assert.equal(sharedMotion("greet", 2, { left: 0, right: 160 }, sizes), null);
});

test("a watching tiger keeps its gait still and every new solo scene stays inside its lane", () => {
  const lane = { left: 40, right: 160 };
  for (const mode of ["guard", "leaf", "hop"]) for (const left of [false, true]) for (let i = 0; i <= 100; i++) {
    const a = soloMotion("tiger", mode, i / 10, lane, 68, 4, left);
    assert.ok(a.left >= lane.left - .001 && a.left + 68 <= lane.right + .001);
  }
  assert.equal(soloMotion("tiger", "guard", 3.8, lane, 68, 4).phase, 0);
  assert.equal(soloMotion("tiger", "leaf", 5, lane, 68, 4).phase, 0);
});

test("card geometry selects a supported step, reachable jump or distant reveal", () => {
  const a = { left: 20, right: 280, top: 220 };
  assert.equal(cardTransition(a, { left: 288, right: 580, top: 220 }), "step");
  assert.equal(cardTransition(a, { left: 296, right: 580, top: 220 }), "jump");
  assert.equal(cardTransition(a, { left: 310, right: 600, top: 280 }), "jump");
  assert.equal(cardTransition(a, { left: 700, right: 960, top: 420 }), "peek");
  for (const mode of ["step", "jump"]) {
    const start = { left: 180, top: 170 }, edge = { left: 210, top: 170 }, dest = { left: 320, top: 230 };
    const atStart = travelMotion(mode, 0, start, edge, dest, 4, "tiger");
    assert.equal(atStart.left, start.left); assert.equal(atStart.top, start.top);
    const end = travelMotion(mode, 10, start, edge, dest, 4, "tiger");
    assert.equal(end.left, dest.left); assert.equal(end.top, dest.top); assert.ok(end.done);
  }
});
