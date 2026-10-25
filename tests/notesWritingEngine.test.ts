import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementBounds, strokeOutlinePoints } from '../src/lib/notes/ink';
import { stabilizeInk, stabilizeWriting } from '../src/lib/notes/inkFilter';
import { strokeInputPoints } from '../src/lib/notes/strokeInput';
import { DEFAULT_INK_TUNING } from '../src/lib/notes/notesPreferences';
import { emptyLibrary, newNotebook, type InkStroke } from '../src/lib/notes/types';
import { validateNotesLibrary } from '../src/lib/notes/storage';
import { rotateNotePage } from '../src/lib/notes/pageActions';

const line = (overrides: Partial<InkStroke> = {}): InkStroke => ({
  id: 'ink', kind: 'stroke', tool: 'pen', color: '#111', width: 10, pressure: true, renderer: 2, nibAngle: 0,
  tuning: { ...DEFAULT_INK_TUNING, streamline: 0 },
  points: Array.from({ length: 51 }, (_, i) => ({ x: i * 2, y: 20, p: .5, t: i * 8 })), ...overrides,
});
const height = (outline: number[][]) => Math.max(...outline.map(p => p[1])) - Math.min(...outline.map(p => p[1]));
const width = (outline: number[][]) => Math.max(...outline.map(p => p[0])) - Math.min(...outline.map(p => p[0]));

test('new pressure response is gradual across light and heavy pressure, and zero sensitivity is uniform', () => {
  const base = line();
  const results = [.04, .2, .5, .9].map(p => height(strokeOutlinePoints(line({ points: base.points.map(point => ({ ...point, p })), tuning: { ...base.tuning!, pressureSensitivity: 1 } }))));
  assert.ok(results.every((value, i) => !i || value > results[i - 1]));
  assert.ok(results[0] > 3);
  const insensitive = (p: number) => strokeOutlinePoints(line({ points: base.points.map(point => ({ ...point, p })), tuning: { ...base.tuning!, pressureSensitivity: 0 } }));
  assert.deepEqual(insensitive(.03), insensitive(.95));
});

test('flatness produces a directional elliptical nib and respects the saved nib angle', () => {
  const base = line(), tuning = { ...base.tuning!, tipFlatness: 1 };
  const horizontal = strokeOutlinePoints(line({ tuning }));
  const vertical = strokeOutlinePoints(line({ tuning, points: base.points.map(p => ({ ...p, x: 20, y: p.x })) }));
  assert.ok(width(vertical) > height(horizontal) * 2);
  assert.ok(height(strokeOutlinePoints(line({ tuning, nibAngle: 90 }))) > height(horizontal) * 2);
});

test('page rotation preserves the orientation and outline of a flat nib', () => {
  const stroke = line({ tuning: { ...DEFAULT_INK_TUNING, streamline: 0, tipFlatness: 1 } });
  const page = { ...newNotebook('rotation').pages[0], width: 200, height: 300, elements: [stroke] };
  const rotated = rotateNotePage(page, 'clockwise').elements[0] as InkStroke;
  const expected = strokeOutlinePoints(stroke).map(([x, y]) => [page.height - y, x]);
  const actual = strokeOutlinePoints(rotated);
  assert.equal(rotated.nibAngle, 90);
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(Math.abs(actual[i][0] - expected[i][0]) < .00001);
    assert.ok(Math.abs(actual[i][1] - expected[i][1]) < .00001);
  }
});

test('sharpness narrows the end without changing the middle width or deleting dots', () => {
  const blunt = line(), sharp = line({ tuning: { ...blunt.tuning!, tipSharpness: 1 } });
  const bluntOutline = strokeOutlinePoints(blunt), sharpOutline = strokeOutlinePoints(sharp);
  assert.ok(height(sharpOutline.filter(([x]) => x > 98)) < height(bluntOutline.filter(([x]) => x > 98)) * .7);
  assert.ok(Math.abs(height(sharpOutline.filter(([x]) => x > 40 && x < 60)) - height(bluntOutline.filter(([x]) => x > 40 && x < 60))) < .01);
  for (const tool of ['pen', 'pencil'] as const) {
    const dot = line({ tool, width: 2.5, points: [{ x: 10, y: 20, p: .02, t: 0 }], tuning: { ...blunt.tuning!, tipSharpness: 1, tipFlatness: 1, pressureSensitivity: 1, streamline: 1 } });
    assert.ok(height(strokeOutlinePoints(dot)) >= 1.29);
    assert.ok(width(strokeOutlinePoints(dot)) >= 1.29);
  }
});

test('short moving Pencil taps keep a visible area at maximum brush settings', () => {
  for (const distance of [0, .5, 1, 2, 4, 6, 8, 10, 12]) for (const angle of [0, 45, 90, 325]) {
    const stroke = line({ width: 2.5, nibAngle: angle, points: [{ x: 0, y: 0, p: .02, t: 0 }, { x: distance, y: 0, p: .02, t: 20 }],
      tuning: { ...line().tuning!, tipSharpness: 1, tipFlatness: 1, pressureSensitivity: 1, streamline: 1 } });
    const points = strokeOutlinePoints(stroke);
    const area = Math.abs(points.reduce((sum, point, i) => { const next = points[(i + 1) % points.length]; return sum + point[0] * next[1] - point[1] * next[0]; }, 0)) / 2;
    assert.ok(area >= .9, `moving tap ${distance}, angle ${angle}, area ${area}`);
  }
  const curve = line({ width: 2.5, points: Array.from({ length: 20 }, (_, i) => { const angle = Math.PI / 4 + i / 19 * Math.PI * 1.5; return { x: 10 + 3 * Math.cos(angle), y: 10 + 3 * Math.sin(angle), p: .5, t: i * 10 }; }),
    tuning: { ...line().tuning!, streamline: 0, tipSharpness: 1, tipFlatness: 1, pressureSensitivity: 1 } });
  assert.ok(Math.min(...strokeOutlinePoints(curve).map(point => point[0])) < 8, 'a short curved letter must not be replaced with the straight tap capsule');
  const jitter = line({ width: 2.5, points: [{ x: 0, y: 0, p: .02, t: 0 }, { x: 2, y: 1, p: .02, t: 20 }, { x: -.5, y: -.2, p: .02, t: 40 }, { x: .2, y: .1, p: .02, t: 60 }],
    tuning: { ...line().tuning!, streamline: 1, tipSharpness: 1, tipFlatness: 1, pressureSensitivity: 1 } });
  assert.ok(height(strokeOutlinePoints(jitter)) >= 1.29, 'a tap with minor back-and-forth jitter must stay visible');
});

test('stabilization remains adjustable above fifty percent and preserves raw coordinates', () => {
  const points = Array.from({ length: 160 }, (_, i) => ({ x: i * 2, y: 20 + (i % 2 ? 2 : -2), p: .5, t: i * 4 }));
  const original = structuredClone(points), half = stabilizeInk(points, .5), maximum = stabilizeInk(points, 1);
  const variation = (samples: typeof points) => samples.slice(40).reduce((sum, p, i) => sum + Math.abs(p.y - samples[i + 39].y), 0);
  assert.ok(variation(maximum) < variation(half));
  assert.ok(points.at(-1)!.x - maximum.at(-1)!.x < 15);
  assert.deepEqual(points, original);
  assert.deepEqual(stabilizeInk(points, 0), points);
});

test('renderer4 strongly suppresses tremor even at maximum response, across Pencil sample rates', () => {
  for (const hz of [60, 120, 240]) {
    const points = Array.from({ length: hz + 1 }, (_, i) => ({ x: 480 * i / hz, y: 4 * Math.sin(2 * Math.PI * 23 * i / hz), p: .2 + .6 * i / hz, t: i * 1000 / hz }));
    const original = structuredClone(points);
    const rms = (samples: typeof points) => Math.sqrt(samples.slice(20, -10).reduce((sum, point) => sum + point.y ** 2, 0) / (samples.length - 30));
    for (const response of [0, 1]) {
      const off = stabilizeWriting(points, 0, response), half = stabilizeWriting(points, .5, response), full = stabilizeWriting(points, 1, response);
      assert.deepEqual(off, original);
      assert.ok(rms(full) < rms(off) * .3, 'maximum must reduce high-frequency noise by at least70%, including maximum response');
      assert.ok(rms(full) < rms(half) * .55, 'the upper half of the stabilization control must keep making a visible difference');
      assert.deepEqual(full[0], points[0]);
      assert.deepEqual(full.at(-1), points.at(-1), 'the tip reaches the actual stroke endpoint');
      assert.deepEqual(full.map(point => [point.p, point.t]), points.map(point => [point.p, point.t]));
    }
    assert.deepEqual(points, original);
  }
});

test('new geometry shares live/saved stabilization and does not reinterpret older stroke versions', () => {
  const points = Array.from({ length: 100 }, (_, i) => ({ x: i * 2, y: 20 + 4 * Math.sin(i * 1.2), p: .5, t: i * 4 }));
  const old = line({ renderer: 3, points, tuning: { ...line().tuning!, streamline: 1, response: 1 } });
  const modern = { ...old, renderer: 4 as const };
  const notebook = newNotebook('renderer4 fixture'); notebook.pages[0].elements = [modern];
  assert.doesNotThrow(() => validateNotesLibrary(JSON.parse(JSON.stringify({ ...emptyLibrary(), notebooks: [notebook] }))));
  const savedOld = strokeOutlinePoints(old);
  assert.notDeepEqual(strokeOutlinePoints(modern), savedOld);
  assert.deepEqual(strokeOutlinePoints(modern, false), strokeOutlinePoints(modern, true));
  assert.deepEqual(strokeOutlinePoints(old), savedOld);
  const dot = { ...modern, points: [points[0]], tuning: { ...modern.tuning!, tipSharpness: 1, tipFlatness: 1 } };
  assert.ok(strokeOutlinePoints(dot).length >= 12);
});

test('highlighter uses identical live and saved geometry with working stabilization and pressure-independent width', () => {
  const base = line({ tool: 'highlighter', highlight: { opacity: .24, stabilization: .8, straight: false } });
  assert.deepEqual(strokeOutlinePoints(base, false), strokeOutlinePoints(base, true));
  const noisy = { ...base, points: base.points.map((p, i) => ({ ...p, y: p.y + (i % 2 ? 3 : -3) })) };
  assert.notDeepEqual(strokeOutlinePoints(noisy), strokeOutlinePoints({ ...noisy, highlight: { ...noisy.highlight!, stabilization: 0 } }));
  assert.deepEqual(strokeOutlinePoints(base), strokeOutlinePoints({ ...base, points: base.points.map(p => ({ ...p, p: .05 })) }));
});

test('new ink extents contain the rendered nib, and engine metadata survives validation without changing legacy defaults', () => {
  const stroke = line({ points: line().points.map(p => ({ ...p, p: 1 })), tuning: { ...DEFAULT_INK_TUNING, pressureSensitivity: 1 } });
  const bounds = elementBounds(stroke);
  for (const [x, y] of strokeOutlinePoints(stroke)) assert.ok(x >= bounds.x - .001 && x <= bounds.x + bounds.w + .001 && y >= bounds.y - .001 && y <= bounds.y + bounds.h + .001);
  const notebook = newNotebook('test'); notebook.pages[0].elements = [stroke];
  const library = { ...emptyLibrary(), notebooks: [notebook] };
  assert.doesNotThrow(() => validateNotesLibrary(JSON.parse(JSON.stringify(library))));
  assert.throws(() => validateNotesLibrary({ ...library, notebooks: [{ ...notebook, pages: [{ ...notebook.pages[0], elements: [{ ...stroke, renderer: 99 }] }] }] }));
  const legacy = line({ renderer: undefined });
  assert.notDeepEqual(strokeOutlinePoints(legacy), strokeOutlinePoints(stroke));
});

test('stationary force and angle changes are retained, release samples do not make a blot, and duplicate samples are ignored', () => {
  const initial = { x: 10, y: 20, p: .2, t: 0, angle: 0 };
  const position = (x: number, y: number) => ({ x, y });
  const changed = strokeInputPoints({ clientX: 10, clientY: 20, pressure: .9, timeStamp: 10, twist: 90 }, initial, position);
  assert.equal(changed.length, 1); assert.ok(changed[0].p > initial.p); assert.equal(changed[0].angle, 90);
  assert.deepEqual(strokeInputPoints({ clientX: 10, clientY: 20, pressure: 0, timeStamp: 11, twist: 90 }, changed[0], position), []);
  assert.deepEqual(strokeInputPoints({ clientX: 10, clientY: 20, pressure: .9, timeStamp: 10, twist: 90 }, changed[0], position), []);
  const reset = strokeInputPoints({ clientX: 10, clientY: 20, pressure: .9, timeStamp: 20, twist: 0 }, changed[0], position);
  assert.equal(reset[0].angle, 0);
});

test('force smoothing responds to elapsed time rather than the number of input events', () => {
  const position = (x: number, y: number) => ({ x, y });
  const run = (step: number) => {
    let point = { x: 0, y: 0, p: .2, t: 0 };
    for (let t = step; t <= 24; t += step) point = strokeInputPoints({ clientX: t, clientY: 0, pressure: .9, timeStamp: t }, point, position).at(-1)!;
    return point.p;
  };
  assert.ok(Math.abs(run(2) - run(8)) < .0001);
});
