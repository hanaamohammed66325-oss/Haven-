import { test } from "node:test";
import assert from "node:assert/strict";
import { freeReturnPosition, returnBoxClear, returnMotionClear } from "../src/lib/study/returnPlacement";

const area = { x: 100, y: 40, width: 600, height: 600 };
test("a start/settings control displaces the bar rather than being covered", () => {
  const controls = [{ x: 100, y: 450, width: 600, height: 190 }];
  const box = freeReturnPosition(area, 360, 68, controls)!;
  assert.ok(box); assert.ok(box.y + box.height + 8 <= 450);
  assert.ok(box.x >= 112); assert.ok(box.x + box.width <= 688);
});
test("compact Havi fits a space where the expanded bar cannot fit", () => {
  const blocked = [{ x: 100, y: 40, width: 490, height: 600 }];
  assert.equal(freeReturnPosition(area, 360, 68, blocked), null);
  assert.ok(freeReturnPosition(area, 60, 60, blocked));
});
test("no space means no overlap, and a too-small viewport is rejected", () => {
  assert.equal(freeReturnPosition(area, 60, 60, [area]), null);
  assert.equal(freeReturnPosition({ x: 0, y: 0, width: 60, height: 60 }, 60, 60, []), null);
});
test("scroll keeps an existing free position rather than jumping back to a corner", () => {
  const existing = { x: 160, y: 120, width: 360, height: 68 };
  assert.deepEqual(freeReturnPosition(area, 360, 68, [], existing), existing);
  const obstruction = { x: 150, y: 110, width: 400, height: 90 };
  assert.notDeepEqual(freeReturnPosition(area, 360, 68, [obstruction], existing), existing);
});
test("folding preserves the bottom-right anchor without covering controls", () => {
  const existing = { x: 160, y: 120, width: 360, height: 68 };
  assert.deepEqual(freeReturnPosition(area, 60, 60, [], existing), { x: 460, y: 128, width: 60, height: 60 });
});
test("free endpoints do not authorize motion across an intervening button", () => {
  const from = { x: 120, y: 100, width: 60, height: 60 };
  const to = { x: 500, y: 100, width: 60, height: 60 };
  assert.equal(returnMotionClear(from, to, [{ x: 300, y: 100, width: 50, height: 50 }]), false);
  assert.equal(returnMotionClear(from, to, [{ x: 300, y: 300, width: 50, height: 50 }]), true);
});

test("an obstructed anchor relocates to the nearest pocket rather than the far corner", () => {
  const viewport = { x: 0, y: 0, width: 770, height: 974 };
  const previous = { x: 24, y: 200, width: 62, height: 62 };
  const blocked = [{ x: 20, y: 190, width: 66, height: 66 }];
  const next = freeReturnPosition(viewport, 62, 62, blocked, previous)!;
  assert.ok(returnBoxClear(viewport, next, blocked));
  assert.ok(Math.hypot(next.x - previous.x, next.y - previous.y) < 80);
});

test("a narrow free pocket is found without snapping to a coarse grid", () => {
  const viewport = { x: 0, y: 0, width: 400, height: 400 };
  const blocked = [{ x: 0, y: 0, width: 150, height: 400 }, { x: 229, y: 0, width: 171, height: 400 }];
  const box = freeReturnPosition(viewport, 62, 62, blocked)!;
  assert.ok(box);
  assert.ok(returnBoxClear(viewport, box, blocked));
  assert.ok(box.x >= 158 && box.x <= 159);
});

test("resize clamps to the nearest safe viewport edge", () => {
  const viewport = { x: 0, y: 0, width: 400, height: 300 };
  const previous = { x: 600, y: 800, width: 62, height: 62 };
  assert.deepEqual(freeReturnPosition(viewport, 62, 62, [], previous), { x: 326, y: 226, width: 62, height: 62 });
});

test("independently animating width and position protect their entire envelope", () => {
  const from = { x: 100, y: 100, width: 360, height: 62 };
  const to = { x: 398, y: 100, width: 62, height: 62 };
  assert.equal(returnMotionClear(from, to, [{ x: 480, y: 100, width: 80, height: 80 }]), false);
});

test("placement remains clear for repeated scroll positions and overlapping controls", () => {
  let previous = null as ReturnType<typeof freeReturnPosition>;
  for (let offset = 0; offset < 1000; offset += 11) {
    const blocked = Array.from({ length: 10 }, (_, i) => ({ x: 140, y: i * 180 - offset, width: 380, height: 130 }));
    const box = freeReturnPosition(area, 62, 62, blocked, previous);
    if (box) assert.ok(returnBoxClear(area, box, blocked));
    previous = box;
  }
});
