import { test } from "node:test";
import assert from "node:assert/strict";
import {
  elementBounds,
  elementIntersectsPolygon,
  eraseStrokeSegments,
  measureTextElement,
  resizeElements,
  strokeOpacity,
  strokeHitTest,
  strokeOutlinePoints,
  translateElements,
} from "../src/lib/notes/ink";
import type { InkStroke, NoteElement } from "../src/lib/notes/types";
import { DEFAULT_INK_TUNING } from '../src/lib/notes/notesPreferences';

const stroke = (overrides: Partial<InkStroke> = {}): InkStroke => ({
  id: "s", kind: "stroke", tool: "pen", color: "#111111", width: 10, pressure: true,
  points: [
    { x: 0, y: 20, p: .15, t: 0 },
    { x: 20, y: 20, p: .15, t: 1 },
    { x: 40, y: 20, p: .15, t: 2 },
    { x: 60, y: 20, p: .15, t: 3 },
  ],
  ...overrides,
});

const outlineHeight = (points: number[][]) => Math.max(...points.map((p) => p[1])) - Math.min(...points.map((p) => p[1]));

test("real pen pressure changes the generated outline while disabled pressure stays uniform", () => {
  const low = strokeOutlinePoints(stroke());
  const high = strokeOutlinePoints(stroke({ points: stroke().points.map((point) => ({ ...point, p: .95 })) }));
  assert.ok(outlineHeight(high) > outlineHeight(low) + 2);

  const disabledLow = strokeOutlinePoints(stroke({ pressure: false }));
  const disabledHigh = strokeOutlinePoints(stroke({ pressure: false, points: stroke().points.map((point) => ({ ...point, p: .95 })) }));
  assert.deepEqual(disabledHigh, disabledLow);
});

test("pencil keeps opaque ochre and legible light-pressure handwriting while preserving pressure response", () => {
  const lowPressure = stroke({ tool: "pencil", color: "#9b6a05", width: 2.5, points: stroke().points.map((point) => ({ ...point, p: .1 })) });
  const highPressure = { ...lowPressure, points: lowPressure.points.map((point) => ({ ...point, p: .95 })) };
  const legacyLow = { ...lowPressure, tool: "pen" as const };
  const legacyHigh = { ...highPressure, tool: "pen" as const };

  assert.equal(strokeOpacity(lowPressure), 1);
  assert.equal(strokeOpacity(stroke({ tool: "highlighter" })), .24);
  assert.ok(outlineHeight(strokeOutlinePoints(lowPressure)) > outlineHeight(strokeOutlinePoints(legacyLow)) + .3);
  assert.ok(outlineHeight(strokeOutlinePoints(highPressure)) > outlineHeight(strokeOutlinePoints(lowPressure)));
  assert.ok(outlineHeight(strokeOutlinePoints(highPressure)) < outlineHeight(strokeOutlinePoints(legacyHigh)));
});

test('pen profiles and speed-aware pressure change new strokes without changing legacy rendering', () => {
  const legacy = stroke();
  assert.deepEqual(strokeOutlinePoints(legacy), strokeOutlinePoints(stroke({ tuning: DEFAULT_INK_TUNING })));
  const ball = stroke({ tuning: { ...DEFAULT_INK_TUNING, style: 'ball' } });
  const brush = stroke({ tuning: { ...DEFAULT_INK_TUNING, style: 'brush' } });
  assert.notDeepEqual(strokeOutlinePoints(ball), strokeOutlinePoints(brush));
  const speedTuning = { ...DEFAULT_INK_TUNING, speedSensitivity: 1 };
  const slow = stroke({ pressure: false, tuning: speedTuning, points: legacy.points.map((point, index) => ({ ...point, t: index * 100 })) });
  const fast = stroke({ pressure: false, tuning: speedTuning, points: legacy.points.map((point, index) => ({ ...point, t: index })) });
  assert.notDeepEqual(strokeOutlinePoints(slow), strokeOutlinePoints(fast));
  const flat = stroke({ tuning: { ...DEFAULT_INK_TUNING, tipFlatness: 1 }, points: legacy.points.map(point => ({ ...point, angle: 0 })) });
  const rotated = stroke({ tuning: { ...DEFAULT_INK_TUNING, tipFlatness: 1 }, points: legacy.points.map(point => ({ ...point, angle: 90 })) });
  assert.notDeepEqual(strokeOutlinePoints(flat), strokeOutlinePoints(rotated));
});

test('single taps remain visible at maximum settings for pen and pencil', () => {
  for (const tool of ['pen', 'pencil'] as const) {
    const dot = stroke({ tool, width: 2.5, points: [{ x: 30, y: 40, p: .02, t: 0 }],
      tuning: { ...DEFAULT_INK_TUNING, pressureSensitivity: 1, tipSharpness: 1, tipFlatness: 1, smoothing: 1, streamline: 1, speedSensitivity: 1 } });
    const outline = strokeOutlinePoints(dot);
    assert.ok(outline.length >= 16);
    assert.ok(outlineHeight(outline) >= 1.5);
  }
});

test('maximum pen settings retain a visible low-pressure handwriting stroke', () => {
  const light = stroke({ width: 3, points: stroke().points.map(point => ({ ...point, p: .02 })),
    tuning: { ...DEFAULT_INK_TUNING, pressureSensitivity: 1, tipSharpness: 1, tipFlatness: 1, smoothing: 1, streamline: 1, speedSensitivity: 1 } });
  const outline = strokeOutlinePoints(light);
  assert.ok(outline.length >= 6);
  assert.ok(outlineHeight(outline) >= 1.5);
});

test('flat nib changes stroke width even when the device omits orientation', () => {
  const line = stroke({ tuning: { ...DEFAULT_INK_TUNING, tipFlatness: 1 } });
  assert.notDeepEqual(strokeOutlinePoints(line), strokeOutlinePoints(stroke({ tuning: DEFAULT_INK_TUNING })));
});

test("translation moves only selected elements and preserves pressure samples", () => {
  const image: NoteElement = { id: "image", kind: "image", assetId: "a", x: 100, y: 60, w: 80, h: 40 };
  const original: NoteElement[] = [stroke(), image];
  const moved = translateElements(original, ["s"], 12, -7);
  assert.equal(moved[0].kind, "stroke");
  if (moved[0].kind === "stroke") {
    assert.deepEqual(moved[0].points[0], { x: 12, y: 13, p: .15, t: 0 });
  }
  assert.equal(moved[1], image);
  assert.deepEqual(original[0], stroke());
});

test("group resize stays anchored at the selection center and enforces useful minimum sizes", () => {
  const elements: NoteElement[] = [
    { id: "a", kind: "image", assetId: "a", x: 0, y: 0, w: 100, h: 100 },
    { id: "b", kind: "text", x: 100, y: 0, w: 100, h: 100, text: "نص", fontSize: 20, color: "#000" },
  ];
  const resized = resizeElements(elements, ["a", "b"], .5);
  const bounds = resized.map(elementBounds);
  assert.deepEqual(bounds[0], { x: 50, y: 25, w: 50, h: 50 });
  assert.deepEqual(bounds[1], { x: 100, y: 25, w: 50, h: 50 });
  const tiny = resizeElements(elements, ["a"], .001)[0];
  assert.equal(tiny.kind, "image");
  if (tiny.kind === "image") assert.deepEqual({ w: tiny.w, h: tiny.h }, { w: 24, h: 24 });
});

test("eraser geometry hits freehand and shape outlines without deleting their empty interiors", () => {
  const line = stroke({ points: [{ x: 5, y: 5, p: .5, t: 0 }, { x: 55, y: 5, p: .5, t: 1 }] });
  assert.equal(strokeHitTest(line, { x: 30, y: 8 }, 1), true);
  assert.equal(strokeHitTest(line, { x: 30, y: 25 }, 1), false);

  const rectangle = stroke({ tool: "rectangle", width: 2, points: [{ x: 0, y: 0, p: .5, t: 0 }, { x: 100, y: 80, p: .5, t: 1 }] });
  assert.equal(strokeHitTest(rectangle, { x: 50, y: 1 }, 2), true);
  assert.equal(strokeHitTest(rectangle, { x: 50, y: 40 }, 2), false);
});

test('precision eraser splits freehand strokes into editable fragments and preserves transformed placement', () => {
  const line = stroke({ width: 2, pressure: false, points: [
    { x: 0, y: 20, p: .5, t: 0 }, { x: 100, y: 20, p: .5, t: 100 },
  ] });
  let sequence = 0;
  const split = eraseStrokeSegments(line, { x: 50, y: 20 }, 4, () => `fragment-${++sequence}`);
  assert.equal(split.length, 2);
  assert.equal(split[0].id, 's');
  assert.equal(split[1].id, 'fragment-1');
  assert.ok(split[0].points.at(-1)!.x < 50);
  assert.ok(split[1].points[0].x > 50);
  assert.equal(line.points.length, 2);

  const resized = stroke({ ...line, transform: [2, 0, 0, 1], rotation: 20 });
  const transformedPoint = { x: 50, y: 20 };
  const rotated = { x: 50 + (transformedPoint.x - 50) * Math.cos(Math.PI / 9), y: 20 + (transformedPoint.x - 50) * Math.sin(Math.PI / 9) };
  const fragments = eraseStrokeSegments(resized, rotated, 4, () => `resized-${++sequence}`);
  assert.equal(fragments.length, 2);
  assert.deepEqual(fragments.map(part => part.transformOrigin), [[50, 20], [50, 20]]);
  const visibleAt = (localX: number) => ({
    x: 50 + 2 * (localX - 50) * Math.cos(Math.PI / 9),
    y: 20 + 2 * (localX - 50) * Math.sin(Math.PI / 9),
  });
  assert.equal(strokeHitTest(fragments[0], visibleAt(20), 2), true);
  assert.equal(strokeHitTest(fragments[1], visibleAt(80), 2), true);
  assert.equal(strokeHitTest(fragments[0], visibleAt(50), 2), false);
});

test('highlighter opacity and stabilization stay attached to each stroke', () => {
  const custom = stroke({ tool: 'highlighter', highlight: { stabilization: .7, opacity: .35, straight: true } });
  assert.equal(strokeOpacity(custom), .35);
  assert.notDeepEqual(strokeOutlinePoints(custom), strokeOutlinePoints(stroke({ tool: 'highlighter' })));
});

test("lasso intersection selects strokes and bounded elements that cross its polygon", () => {
  const polygon = [{ x: 10, y: 10 }, { x: 70, y: 10 }, { x: 70, y: 50 }, { x: 10, y: 50 }];
  assert.equal(elementIntersectsPolygon(stroke(), polygon), true);
  assert.equal(elementIntersectsPolygon({ id: "i", kind: "image", assetId: "x", x: 65, y: 45, w: 30, h: 30 }, polygon), true);
  assert.equal(elementIntersectsPolygon({ id: "o", kind: "image", assetId: "x", x: 100, y: 100, w: 20, h: 20 }, polygon), false);
});

test("text measurement grows for wrapped and explicit multiline text", () => {
  const singleLine = measureTextElement("one two three four", 20, 1_000);
  const wrapped = measureTextElement("one two three four", 20, 55);
  const explicitLines = measureTextElement("سطر أول\nسطر ثان", 20, 1_000);
  assert.ok(wrapped > singleLine);
  assert.ok(explicitLines >= singleLine * 2);

  const text: NoteElement = {
    id: "t", kind: "text", x: 0, y: 0, w: 55, h: 10,
    text: "one two three four", fontSize: 20, color: "#111",
  };
  assert.equal(elementBounds(text).h, wrapped);
});

test('text line spacing changes measured height without changing legacy defaults', () => {
  const text = 'One\nTwo\nThree';
  const legacy = measureTextElement(text, 20, 200);
  const explicitDefault = measureTextElement(text, 20, 200, { lineSpacing: 1.35 });
  const spaced = measureTextElement(text, 20, 200, { lineSpacing: 2 });
  assert.equal(legacy, explicitDefault);
  assert.ok(spaced > legacy);
});
