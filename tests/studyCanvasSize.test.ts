import { test } from "node:test";
import assert from "node:assert/strict";
import { studyCanvasSize } from "../src/lib/study/canvasSize";

test("phone portrait and landscape use native 3x resolution with the same pixel budget", () => {
  const portrait = studyCanvasSize(390, 844, 3), landscape = studyCanvasSize(844, 390, 3);
  assert.equal(portrait.dpr, 3); assert.equal(landscape.dpr, 3);
  assert.equal(portrait.pixelWidth, 1170); assert.equal(portrait.pixelHeight, 2532);
  assert.equal(portrait.pixelWidth * portrait.pixelHeight, landscape.pixelWidth * landscape.pixelHeight);
});
test("extra density is bounded and existing large-screen 2x rendering is retained", () => {
  assert.equal(studyCanvasSize(1024, 1366, 3).dpr, 2);
  assert.equal(studyCanvasSize(768, 1024, 2).dpr, 2);
  assert.equal(studyCanvasSize(390, 844, 1).dpr, 1);
  const largerPhone = studyCanvasSize(500, 900, 3);
  assert.ok(largerPhone.pixelWidth * largerPhone.pixelHeight <= 3_505_000);
});
test("invalid device density and zero initial layout produce a finite canvas", () => {
  const initial = studyCanvasSize(0, 0, NaN);
  assert.deepEqual(initial, { w: 1, h: 1, dpr: 1, pixelWidth: 1, pixelHeight: 1 });
});
