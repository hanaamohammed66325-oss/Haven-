import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strokeOutlinePoints, strokeHitTest, rotateElements, translateElements } from '../src/lib/notes/ink';
import { eraseByGesture, scratchPasses } from '../src/lib/notes/inkGestures';
import { stabilizeInk } from '../src/lib/notes/inkFilter';
import { strokeInputPoints } from '../src/lib/notes/strokeInput';
import { recognizeHeldShape, shapePaths } from '../src/lib/notes/shapes';
import { DEFAULT_ERASER_SETTINGS, DEFAULT_INK_TUNING, DEFAULT_PEN_PROFILES, DEFAULT_HIGHLIGHTER_TUNING, readNotesPreferences, saveNotesPreferences } from '../src/lib/notes/notesPreferences';
import { emptyLibrary, newNotebook, type InkStroke } from '../src/lib/notes/types';
import { validateNotesLibrary } from '../src/lib/notes/storage';

const ink = (points: { x: number; y: number }[], overrides: Partial<InkStroke> = {}): InkStroke => ({
  id: 'ink', kind: 'stroke', tool: 'pen', width: 2.5, color: '#111', pressure: true, renderer: 3,
  tuning: DEFAULT_INK_TUNING, points: points.map((p, i) => ({ ...p, p: .5, t: i * 5 })), ...overrides,
});
function outline(vertices: number[][], closed = true, angle = 0) {
  const path = closed ? [...vertices, vertices[0]] : vertices, co = Math.cos(angle), si = Math.sin(angle);
  const points = path.slice(1).flatMap((end, i) => Array.from({ length: 18 }, (_, j) => {
    const t = j / 18, x = path[i][0] + (end[0] - path[i][0]) * t, y = path[i][1] + (end[1] - path[i][1]) * t;
    return { x: 200 + co * x - si * y + .3 * Math.sin(j), y: 200 + si * x + co * y + .3 * Math.cos(j) };
  }));
  points.push({ x: 200 + path.at(-1)![0] * co - path.at(-1)![1] * si, y: 200 + path.at(-1)![0] * si + path.at(-1)![1] * co });
  return ink(points);
}

test('held fitting covers rotated polygons, stars, ellipses and continuous arrows', () => {
  for (const sides of [3, 5, 6, 7, 8]) for (const angle of [0, .42, 1.2]) {
    const vertices = Array.from({ length: sides }, (_, i) => [60 * Math.cos(i * Math.PI * 2 / sides), 60 * Math.sin(i * Math.PI * 2 / sides)]);
    const source = outline(vertices, true, angle), before = structuredClone(source);
    const recognized = recognizeHeldShape(source)!;
    assert.ok(recognized, `${sides} sides at ${angle}`);
    assert.equal(recognized.tool, sides === 3 ? 'triangle' : sides === 5 ? 'pentagon' : 'polygon', `${sides} sides at ${angle}`);
    assert.equal(shapePaths(recognized)[0].points.length, sides);
    assert.deepEqual(source, before);
    assert.ok(shapePaths(recognized)[0].closed);
  }
  const star = Array.from({ length: 10 }, (_, i) => [(i % 2 ? 26.4 : 60) * Math.cos(i * Math.PI / 5), (i % 2 ? 26.4 : 60) * Math.sin(i * Math.PI / 5)]);
  assert.equal(recognizeHeldShape(outline(star, true, .6))?.tool, 'star');
  const five = Array.from({ length: 5 }, (_, i) => [60 * Math.cos(i * Math.PI * 4 / 5), 60 * Math.sin(i * Math.PI * 4 / 5)]);
  assert.equal(recognizeHeldShape(outline(five, true, .3))?.tool, 'star', 'a continuous five-line pentagram is a star too');
  const ellipse = ink(Array.from({ length: 100 }, (_, i) => {
    const t = i * Math.PI * 2 / 99, x = 75 * Math.cos(t), y = 32 * Math.sin(t);
    return { x: 200 + x * Math.cos(.5) - y * Math.sin(.5), y: 200 + x * Math.sin(.5) + y * Math.cos(.5) };
  }));
  assert.equal(recognizeHeldShape(ellipse)?.tool, 'ellipse');
  const arrow = outline([[0,0], [120,0], [95,-18], [120,0], [95,18]], false, .7);
  assert.equal(recognizeHeldShape(arrow)?.tool, 'arrow');
});

test('response and scratch settings persist independently across all pen profiles without account access', () => {
  const store = new Map<string,string>(), previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key,value) } } });
  try {
    const scope = 'disposable-pen-batch-unit';
    saveNotesPreferences(scope, {
      penProfiles: { fountain: { ...DEFAULT_PEN_PROFILES.fountain, response: .1 }, ball: { ...DEFAULT_PEN_PROFILES.ball, response: .4 }, brush: { ...DEFAULT_PEN_PROFILES.brush, response: .7 } },
      pencilInk: { ...DEFAULT_INK_TUNING, response: .8 }, highlighter: { ...DEFAULT_HIGHLIGHTER_TUNING, response: .9 },
      eraser: { ...DEFAULT_ERASER_SETTINGS, scratchEnabled: false, scratchMode: 'scribble' },
    });
    const saved = readNotesPreferences(scope);
    assert.deepEqual([saved.penProfiles.fountain.response, saved.penProfiles.ball.response, saved.penProfiles.brush.response, saved.pencilInk.response, saved.highlighter.response], [.1,.4,.7,.8,.9]);
    assert.equal(saved.eraser.scratchEnabled, false); assert.equal(saved.eraser.scratchMode, 'scribble');
    const notebook = newNotebook('validation'); notebook.pages[0].elements = [ink([{ x: 0, y: 0 }, { x: 30, y: 20 }], { tuning: saved.penProfiles.brush })];
    assert.doesNotThrow(() => validateNotesLibrary({ ...emptyLibrary(), notebooks: [notebook] }));
    (notebook.pages[0].elements[0] as InkStroke).tuning!.response = 2;
    assert.throws(() => validateNotesLibrary({ ...emptyLibrary(), notebooks: [notebook] }));
    assert.equal(store.size, 1, 'only the isolated fake preference entry is touched');
  } finally { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); }
});

test('scribble mode handles two-dimensional strokes and gesture erasure honors rotated target geometry', () => {
  const gesture = outline([[0,0],[100,20],[0,40],[100,60],[0,10],[100,45]], false);
  assert.equal(scratchPasses(gesture, 'strike'), null);
  assert.ok(scratchPasses(gesture, 'scribble'));
  const target = ink([{ x: 250, y: 180 }, { x: 250, y: 280 }]);
  assert.deepEqual(eraseByGesture([target], gesture, { ...DEFAULT_ERASER_SETTINGS, scratchMode: 'scribble' }), []);
  const rotated = { ...target, rotation: 45, transform: [1.2,.1,.2,.9] as [number,number,number,number] };
  assert.deepEqual(eraseByGesture([rotated], gesture, { ...DEFAULT_ERASER_SETTINGS, scratchMode: 'scribble' }), []);
});

test('unmatched held paths are regularized only on request and stay editable, transformable and valid', () => {
  const source = outline([[0,0], [65,4], [22,27], [80,38], [38,55], [100,65]], false);
  assert.equal(recognizeHeldShape(source), null, 'strict OCR classification must not consume free handwriting');
  const fitted = recognizeHeldShape(source, true)!;
  assert.ok(fitted.shapePath); assert.equal(fitted.shapePath.closed, false);
  assert.ok(fitted.points.length < 200);
  const moved = translateElements([fitted], ['ink'], 20, 30)[0] as InkStroke;
  assert.equal(moved.points[0].x, fitted.points[0].x + 20);
  const rotated = rotateElements([moved], ['ink'], 40)[0] as InkStroke;
  assert.ok(strokeHitTest(rotated, { x: 250, y: 230 }, 150));
  const notebook = newNotebook('fixture'); notebook.pages[0].elements = [rotated];
  assert.doesNotThrow(() => validateNotesLibrary({ ...emptyLibrary(), notebooks: [notebook] }));
});

const strike = (angle = 0, offsetX = 0, offsetY = 0) => {
  const vertices = [[10, 0], [110, 0], [10, 2], [110, 2], [10, 4]];
  const stroke = outline(vertices, false, angle);
  return { ...stroke, points: stroke.points.map(p => ({ ...p, x: p.x + offsetX, y: p.y + offsetY })) };
};

test('default back-and-forth erasure removes intersected drawings atomically and respects target toggles', () => {
  assert.equal(DEFAULT_ERASER_SETTINGS.scratchEnabled, true);
  assert.equal(DEFAULT_ERASER_SETTINGS.scratchMode, 'strike');
  const target = ink([{ x: 250, y: 180 }, { x: 250, y: 230 }]), far = { ...target, id: 'far', points: target.points.map(p => ({ ...p, x: p.x + 500 })) };
  const elements = [target, far], original = structuredClone(elements), gesture = strike();
  assert.ok(scratchPasses(gesture, 'strike'));
  assert.deepEqual(eraseByGesture(elements, gesture, DEFAULT_ERASER_SETTINGS), [far]);
  assert.deepEqual(elements, original, 'the immutable original is available to one-step Undo');
  assert.equal(eraseByGesture(elements, gesture, { ...DEFAULT_ERASER_SETTINGS, scratchEnabled: false }), null);
  assert.equal(eraseByGesture(elements, gesture, { ...DEFAULT_ERASER_SETTINGS, targets: { ...DEFAULT_ERASER_SETTINGS.targets, pen: false } }), null);
  const shape = outline([[-30,-30],[30,-30],[30,30],[-30,30]]);
  const regular = recognizeHeldShape(shape)!;
  assert.deepEqual(eraseByGesture([regular], strike(0,-60,0), DEFAULT_ERASER_SETTINGS), []);
});

test('single crossing lines, underlines, letters, misses and blank shape interiors are protected', () => {
  const target = ink([{ x: 250, y: 180 }, { x: 250, y: 230 }]);
  const marks = [outline([[10,0],[110,0]], false), outline([[10,0],[110,5]], false), outline([[10,0],[30,20],[50,0],[70,20],[90,0]], false)];
  for (const mark of marks) assert.equal(eraseByGesture([target], mark, DEFAULT_ERASER_SETTINGS), null);
  assert.equal(eraseByGesture([target], strike(0,400,0), DEFAULT_ERASER_SETTINGS), null);
  const box = recognizeHeldShape(outline([[-80,-70],[80,-70],[80,70],[-80,70]]))!;
  assert.equal(eraseByGesture([box], strike(0,-60,0), DEFAULT_ERASER_SETTINGS), null, 'scribbling inside a hollow box without touching its border must not erase it');
  const slow = strike(); slow.points[slow.points.length-1].t = 5000;
  assert.equal(eraseByGesture([target], slow, DEFAULT_ERASER_SETTINGS), null);
  const typed = { id: 'text', kind: 'text' as const, x: 240, y: 190, w: 70, h: 30, text: 'Hello', fontSize: 20, color: '#111' };
  assert.equal(eraseByGesture([typed], strike(), DEFAULT_ERASER_SETTINGS), null);
});

test('fast response reduces filter lag and pressure settling time without moving raw samples or old ink', () => {
  const points = Array.from({ length: 70 }, (_, i) => ({ x: i * 3, y: 40 + Math.sin(i / 10) * 10, p: .4, t: i * 4 }));
  const original = structuredClone(points), normal = stabilizeInk(points, 1, 0), quick = stabilizeInk(points, 1, 1);
  const lag = (output: typeof points) => points.at(-1)!.x - output.at(-1)!.x;
  assert.ok(lag(quick) < lag(normal) * .5); assert.deepEqual(points, original);
  const previous = { x: 0, y: 0, p: .1, t: 0 };
  const event = { clientX: 0, clientY: 0, pressure: .9, timeStamp: 2 };
  assert.ok(strokeInputPoints(event, previous, () => ({ x: 0, y: 0 }), 1)[0].p > strokeInputPoints(event, previous, () => ({ x: 0, y: 0 }), 0)[0].p);
  const old = ink(points, { renderer: 2 });
  assert.deepEqual(strokeOutlinePoints(old), strokeOutlinePoints({ ...old, tuning: { ...DEFAULT_INK_TUNING, response: 1 } }));
  for (const style of ['fountain', 'ball', 'brush'] as const) {
    const current = ink(points, { tuning: { ...DEFAULT_INK_TUNING, style, streamline: 1 } });
    assert.notDeepEqual(strokeOutlinePoints(current), strokeOutlinePoints({ ...current, tuning: { ...current.tuning!, response: 1 } }));
  }
});

test('new expressive nib preserves max-setting taps, pressure contrast, and visible curved short letters', () => {
  const tuning = { ...DEFAULT_INK_TUNING, streamline: 0, tipSharpness: 1, pressureSensitivity: 1, tipFlatness: 1 };
  for (const tool of ['pen','pencil'] as const) for (const length of [0,1,3,7,10]) {
    const stroke = ink([{ x: 0, y: 0 }, { x: length, y: 0 }], { tool, tuning }); stroke.points.forEach(p => { p.p = .02; });
    const outline = strokeOutlinePoints(stroke);
    const area = Math.abs(outline.reduce((sum, p, i) => sum + p[0] * outline[(i+1)%outline.length][1] - p[1] * outline[(i+1)%outline.length][0], 0) / 2);
    assert.ok(area > .9, `${tool} moving tap ${length}`);
  }
  const stroke = ink(Array.from({ length: 60 }, (_, i) => ({ x: i * 2, y: 0 })), { tuning: { ...tuning, tipFlatness: 0, tipSharpness: 0 } });
  const extent = (p: number) => { const outline = strokeOutlinePoints({ ...stroke, points: stroke.points.map(point => ({ ...point, p })) }); return Math.max(...outline.map(p => p[1])) - Math.min(...outline.map(p => p[1])); };
  assert.ok(extent(.9) / extent(.05) > 2.5);
});
