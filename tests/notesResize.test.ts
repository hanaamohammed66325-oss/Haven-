import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementAtPoint, elementBounds, resizeCornerAtPoint, resizeCornerPoint, resizeElementsFromCorner, selectionBounds } from '../src/lib/notes/ink';
import { emptyLibrary, newNotebook } from '../src/lib/notes/types';
import { validateNotesLibrary } from '../src/lib/notes/storage';
import type { NoteElement } from '../src/lib/notes/types';

const image = (id = 'image', x = 10, y = 20, w = 100, h = 50): NoteElement => ({ id, kind: 'image', assetId: `${id}-asset`, x, y, w, h });
const text = (id = 'text', x = 140, y = 30, w = 80, h = 40): Extract<NoteElement, { kind: 'text' }> => ({ id, kind: 'text', text: 'Readable text', color: '#243442', fontSize: 20, x, y, w, h });
const stroke = (): NoteElement => ({ id: 'stroke', kind: 'stroke', tool: 'pen', color: '#243442', width: 4, pressure: true, points: [{ x: 10, y: 20, p: .2, t: 1 }, { x: 110, y: 70, p: .8, t: 2 }] });

test('each corner keeps its opposite group corner fixed under proportional resize', () => {
  const source = [image()];
  const cases = [
    ['nw', { x: -90, y: -30 }, { x: 110, y: 70 }],
    ['ne', { x: 210, y: -30 }, { x: 10, y: 70 }],
    ['se', { x: 210, y: 120 }, { x: 10, y: 20 }],
    ['sw', { x: -90, y: 120 }, { x: 110, y: 20 }],
  ] as const;
  for (const [corner, dragged, fixed] of cases) {
    const result = resizeElementsFromCorner(source, ['image'], corner, dragged, true);
    const bounds = selectionBounds(result, ['image'])!;
    const actual = corner === 'nw' ? { x: bounds.x + bounds.w, y: bounds.y + bounds.h }
      : corner === 'ne' ? { x: bounds.x, y: bounds.y + bounds.h }
        : corner === 'se' ? { x: bounds.x, y: bounds.y } : { x: bounds.x + bounds.w, y: bounds.y };
    assert.deepEqual(actual, fixed);
    assert.equal(bounds.w / bounds.h, 2);
  }
});

test('free resize changes axes independently while locked resize keeps image proportions', () => {
  const source = [image()];
  const free = resizeElementsFromCorner(source, ['image'], 'ne', { x: 210, y: -80 }, false)[0] as Extract<NoteElement, { kind: 'image' }>;
  assert.deepEqual(elementBounds(free), { x: 10, y: -80, w: 200, h: 150 });
  const locked = resizeElementsFromCorner(source, ['image'], 'ne', { x: 210, y: -80 }, true)[0] as Extract<NoteElement, { kind: 'image' }>;
  assert.equal(elementBounds(locked).w / elementBounds(locked).h, 2);
});

test('group resize transforms every selected element, preserves stroke pressure, and scales readable text', () => {
  const source = [stroke(), text(), image('image2', 240, 40, 60, 90)];
  const result = resizeElementsFromCorner(source, ['stroke', 'text', 'image2'], 'se', { x: 590, y: 200 }, false);
  const resizedStroke = result[0] as Extract<NoteElement, { kind: 'stroke' }>;
  const resizedText = result[1] as Extract<NoteElement, { kind: 'text' }>;
  const resizedImage = result[2] as Extract<NoteElement, { kind: 'image' }>;
  assert.deepEqual(resizedStroke.points.map(point => point.p), [.2, .8]);
  assert.ok(elementBounds(resizedStroke).w > elementBounds(source[0]).w && resizedText.fontSize >= 6);
  assert.ok(elementBounds(resizedImage).w > 60 && elementBounds(resizedImage).h > 90);
});

test('resize enforces usable minimums and corner hit testing is independent of element kind', () => {
  const source = [image()];
  const result = resizeElementsFromCorner(source, ['image'], 'se', { x: 12, y: 22 }, false)[0] as Extract<NoteElement, { kind: 'image' }>;
  assert.ok(elementBounds(result).w >= 24 && elementBounds(result).h >= 24);
  const bounds = selectionBounds(source, ['image'])!;
  assert.equal(resizeCornerAtPoint(bounds, { x: 10, y: 20 }, 8), 'nw');
});

test('free resize keeps both visible corners exact for rotated images, wrapped text, ink and mixed groups', () => {
  const sources: NoteElement[][] = [
    [{ ...image(), rotation: 30 }],
    [{ ...text(), text: 'مرحبا بالعالم\nWrapped English text', h: 18, rotation: -25 }],
    [{ ...stroke(), rotation: 45 }],
    [{ ...image(), rotation: 30 }, { ...image('second', 240), rotation: -20 }, { ...stroke(), rotation: 90 }],
  ];
  for (const source of sources) for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
    const ids = source.map(element => element.id), before = selectionBounds(source, ids)!;
    const opposite = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' } as const;
    const fixed = resizeCornerPoint(before, opposite[corner]);
    const moving = resizeCornerPoint(before, corner);
    const dragged = { x: fixed.x + (moving.x - fixed.x) * 1.7, y: fixed.y + (moving.y - fixed.y) * .8 };
    const result = resizeElementsFromCorner(source, ids, corner, dragged, false);
    const after = selectionBounds(result, ids)!;
    for (const [actual, expected] of [[resizeCornerPoint(after, opposite[corner]), fixed], [resizeCornerPoint(after, corner), dragged]]) {
      assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-7, `${source[0].kind} ${corner}: ${JSON.stringify({ actual, expected })}`);
    }
    assert.deepEqual(result.map(element => element.rotation), source.map(element => element.rotation), 'resize preserves independently editable rotation');
    const again = resizeElementsFromCorner(result, ids, corner, moving, false);
    const restored = selectionBounds(again, ids)!;
    assert.ok(Math.abs(restored.w - before.w) < 1e-7 && Math.abs(restored.h - before.h) < 1e-7, 'repeated affine resizes do not lose geometry');
    const center = elementBounds(result[0]);
    if (result[0].kind !== 'stroke') assert.equal(elementAtPoint([result[0]], { x: center.x + center.w / 2, y: center.y + center.h / 2 })?.id, result[0].id);
  }
});

test('transforms survive serialization while singular, malformed and non-finite matrices are rejected', () => {
  const notebook = newNotebook('Transforms');
  notebook.pages[0].elements = resizeElementsFromCorner([{ ...image(), rotation: 30 }], ['image'], 'se', { x: 250, y: 160 }, false);
  const library = JSON.parse(JSON.stringify({ ...emptyLibrary(), notebooks: [notebook] }));
  assert.doesNotThrow(() => validateNotesLibrary(library));
  for (const transform of [[1, 0, 0, 0], [1, 2], [1, NaN, 0, 1], [-1, 0, 0, 1]]) {
    library.notebooks[0].pages[0].elements[0].transform = transform;
    assert.throws(() => validateNotesLibrary(library));
  }
});
