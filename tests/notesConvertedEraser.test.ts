import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eraseConvertedText, textWordBoxes, elementTransformCenter, rotatePoint } from '../src/lib/notes/ink';
import { emptyLibrary, newNotebook, type NoteText } from '../src/lib/notes/types';
import { validateNotesLibrary } from '../src/lib/notes/storage';
import { DEFAULT_ERASER_SETTINGS, readNotesPreferences, saveNotesPreferences } from '../src/lib/notes/notesPreferences';

const converted = (): NoteText => ({ id: 'line', kind: 'text', x: 80, y: 120, w: 400, h: 27, text: 'Hello world again', fontSize: 20, color: '#111', fontFamily: 'kalam',
  sourceInk: [{ id: 'ink', kind: 'stroke', tool: 'pen', color: '#111', width: 2, pressure: false, points: [{ x: 80, y: 120, p: .5, t: 0 }, { x: 90, y: 140, p: .5, t: 30 }] }] });
let next = 0;
const id = () => `word-${++next}`;

test('converted word erasure retains the other words at their exact positions and remains erasable', () => {
  const original = converted(), before = structuredClone(original), boxes = textWordBoxes(original);
  const middle = boxes[1], pieces = eraseConvertedText(original, { x: middle.x + middle.w / 2, y: middle.y + middle.h / 2 }, 1, 'word', id);
  assert.deepEqual(pieces.map(piece => piece.text), ['Hello', 'again']);
  assert.equal(pieces[0].x, boxes[0].x); assert.equal(pieces[1].x, boxes[2].x);
  assert.equal(pieces[1].fontFamily, 'kalam'); assert.equal(pieces[1].handwritingTool, 'pen');
  assert.ok(pieces.every(piece => !piece.sourceInk)); // Partial recovery must not resurrect erased words.
  assert.equal(eraseConvertedText(pieces[0], { x: boxes[0].x + 2, y: boxes[0].y + 2 }, 1, 'word', id).length, 0);
  assert.deepEqual(original, before); // Existing one-gesture history keeps a restorable original.
  const notebook = newNotebook('eraser'); notebook.pages[0].elements = pieces;
  assert.doesNotThrow(() => validateNotesLibrary(JSON.parse(JSON.stringify({ ...emptyLibrary(), notebooks: [notebook] }))));
});

test('whole-line option, empty space and ordinary typed text have distinct behavior', () => {
  const text = converted(), box = textWordBoxes(text)[0], point = { x: box.x + 4, y: box.y + 4 };
  assert.deepEqual(eraseConvertedText(text, point, 1, 'line', id), []);
  assert.equal(eraseConvertedText(text, { x: 5, y: 5 }, 2, 'word', id)[0], text);
  const typed = { ...text, sourceInk: undefined };
  assert.equal(eraseConvertedText(typed, point, 20, 'line', id)[0], typed);
});

test('wrapped converted text keeps the other rows after erasing a word on the second row', () => {
  const text = { ...converted(), w: 75, h: 81 }, boxes = textWordBoxes(text);
  assert.equal(new Set(boxes.map(box => box.y)).size, 3);
  const hit = boxes[1], pieces = eraseConvertedText(text, { x: hit.x + 3, y: hit.y + hit.h / 2 }, 1, 'word', id);
  assert.deepEqual(pieces.map(piece => [piece.text, piece.x, piece.y]), [[boxes[0].text, boxes[0].x, boxes[0].y], [boxes[2].text, boxes[2].x, boxes[2].y]]);
});

test('rotated, stretched and sheared converted text is erased in page coordinates without moving survivors', () => {
  for (const alignment of ['left', 'center', 'right'] as const) {
    const text: NoteText = { ...converted(), rotation: 37, transform: [1.3, .2, .25, .8], alignment };
    const boxes = textWordBoxes(text), center = elementTransformCenter(text);
    const world = (p: { x: number; y: number }) => {
      const x = p.x - center.x, y = p.y - center.y, [a,b,c,d] = text.transform!;
      return rotatePoint({ x: center.x + a*x + c*y, y: center.y + b*x + d*y }, center, 37);
    };
    const target = boxes[1], pieces = eraseConvertedText(text, world({ x: target.x + target.w / 2, y: target.y + target.h / 2 }), .5, 'word', id);
    assert.deepEqual(pieces.map(piece => piece.text), ['Hello', 'again']);
    pieces.forEach((piece, index) => {
      const original = boxes[index === 0 ? 0 : 2], expected = world({ x: original.x + original.w / 2, y: original.y + original.h / 2 });
      const actual = elementTransformCenter(piece);
      assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < .00001);
    });
  }
});

test('word and line preference round-trips without modifying other saved eraser settings', () => {
  const store = new Map<string,string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key,value) } } });
  try {
    assert.equal(DEFAULT_ERASER_SETTINGS.convertedText, 'word');
    for (const convertedText of ['line', 'word'] as const) {
      saveNotesPreferences('disposable-eraser-unit', { eraser: { ...DEFAULT_ERASER_SETTINGS, size: 30, convertedText } });
      const saved = readNotesPreferences('disposable-eraser-unit').eraser;
      assert.equal(saved.convertedText, convertedText); assert.equal(saved.size, 30);
    }
  } finally { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); }
});
