import test from "node:test";
import assert from "node:assert/strict";
import { companionLane } from "../src/lib/haviCompanionPlacement";

const card = { left: 0, right: 300, top: 100 };
const havi = { left: 110, right: 180, top: 45, bottom: 120 };

test("companions can remain on Havi's card with a clear gap on either side", () => {
  assert.deepEqual(companionLane(card, 60, 36, 3, havi, "left"), { left: 8, right: 98 });
  assert.deepEqual(companionLane(card, 60, 36, 3, havi, "right"), { left: 192, right: 292 });
});

test("a later Havi movement changes the lane without permitting overlap", () => {
  const moved = { ...havi, left: 25, right: 100 };
  assert.deepEqual(companionLane(card, 60, 36, 3, moved, "left"), { left: 112, right: 292 });
  assert.equal(companionLane({ ...card, right: 140 }, 60, 36, 3, moved), null);
  assert.deepEqual(companionLane(card, 60, 36, 3, { ...havi, top: 300, bottom: 370 }), { left: 8, right: 292 });
  assert.deepEqual(companionLane(card, 60, 36, 3, null), { left: 8, right: 292 });
});

test("a lane reserves Havi and the other pet together", () => {
  const pet = { left: 15, right: 80, top: 50, bottom: 103 };
  assert.deepEqual(companionLane(card, 60, 36, 3, [havi, pet]), { left: 192, right: 292 });
  assert.deepEqual(companionLane(card, 60, 36, 3, [pet, havi]), { left: 192, right: 292 });
  assert.equal(companionLane({ ...card, right: 245 }, 60, 36, 3, [havi, pet]), null);
});
