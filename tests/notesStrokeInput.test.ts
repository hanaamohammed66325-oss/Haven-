import { test } from "node:test";
import assert from "node:assert/strict";
import { strokeInputPoints, type PointerSample } from "../src/lib/notes/strokeInput";
import type { InkPoint } from "../src/lib/notes/types";

const sample = (x: number, y: number, pressure = .5, timeStamp = x): PointerSample => ({
  clientX: x, clientY: y, pressure, timeStamp,
});
const position = (x: number, y: number) => ({ x, y });

test("slow and rapid lines include coalesced history once and bridge long gaps", () => {
  const first = strokeInputPoints(sample(0, 0), undefined, position);
  const slow = strokeInputPoints({ ...sample(3, 0, .5, 3), getCoalescedEvents: () => [sample(1, 0, .5, 1), sample(2, 0, .5, 2)] }, first[0], position);
  assert.deepEqual(slow.map(({ x, y }) => [x, y]), [[1, 0], [2, 0], [3, 0]]);

  const fast = strokeInputPoints(sample(63, 0, .5, 63), slow.at(-1), position);
  assert.equal(fast.at(-1)?.x, 63);
  assert.ok(fast.length >= 20);
  assert.ok(fast.every((point, index) => index === 0 || point.x - fast[index - 1].x <= 3.01));
});

test("curves and right-to-left handwriting preserve sample order and coordinates", () => {
  let previous: InkPoint | undefined;
  const collected: InkPoint[] = [];
  for (const [x, y] of [[50, 10], [45, 5], [39, 12], [32, 8], [26, 15]]) {
    const points = strokeInputPoints(sample(x, y), previous, position);
    collected.push(...points);
    previous = collected.at(-1);
  }
  assert.deepEqual([collected[0].x, collected.at(-1)?.x], [50, 26]);
  assert.ok(collected.every((point, index) => index === 0 || Math.hypot(point.x - collected[index - 1].x, point.y - collected[index - 1].y) <= 3.01));
});

test("a stationary dot remains one point and a release with zero pressure adds no blot", () => {
  const down = strokeInputPoints(sample(10, 20, .7, 1), undefined, position);
  assert.equal(down.length, 1);
  assert.deepEqual(strokeInputPoints(sample(10, 20, 0, 2), down[0], position), []);
  const release = strokeInputPoints(sample(11, 20, 0, 3), down[0], position);
  assert.ok(release[0].p > .5);
});

test("pressure noise is smoothed while a sustained pressure change remains responsive", () => {
  let previous = strokeInputPoints(sample(0, 0, .25, 0), undefined, position)[0];
  const pressures: number[] = [];
  for (let x = 1; x <= 8; x++) {
    const points = strokeInputPoints(sample(x, 0, x % 2 ? .95 : .75, x), previous, position);
    previous = points.at(-1)!;
    pressures.push(previous.p);
  }
  assert.ok(pressures[0] < .95);
  assert.ok(pressures.at(-1)! > .65);
  assert.ok(pressures.every((pressure) => pressure >= .02 && pressure <= 1));
});

test('stylus orientation survives coalescing and interpolates across the 360-degree boundary', () => {
  const first = strokeInputPoints({ ...sample(0, 0), twist: 359 }, undefined, position)[0];
  const next = strokeInputPoints({ ...sample(9, 0, .6, 9), twist: 1 }, first, position);
  assert.equal(first.angle, 359);
  assert.equal(next.at(-1)?.angle, 1);
  assert.ok(next.every(point => point.angle !== undefined && (point.angle > 350 || point.angle < 10)));
});

test('stylus azimuth is used for nib direction when tilt is available', () => {
  const point = strokeInputPoints({ ...sample(5, 9), azimuthAngle: Math.PI / 3, altitudeAngle: Math.PI / 4 }, undefined, position)[0];
  assert.ok(Math.abs(point.angle! - 60) < .001);
});
