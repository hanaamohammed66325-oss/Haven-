import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementAtPoint, elementBounds, elementIntersectsPolygon, rotateElements, selectionBounds, strokeHitTest } from '../src/lib/notes/ink';
import { emptyLibrary, newNotebook, type InkStroke, type NoteElement, type NoteImage, type NoteText } from '../src/lib/notes/types';
import { validateNotesLibrary } from '../src/lib/notes/storage';

const rectangle: InkStroke = {
  id: 'rectangle', kind: 'stroke', tool: 'rectangle', color: '#243442', width: 2, pressure: true,
  points: [{ x: 100, y: 100, p: .3, t: 1 }, { x: 200, y: 140, p: .8, t: 2 }],
};

test('a rotated shape keeps its samples and has accurate selection and hit bounds', () => {
  const [rotated] = rotateElements([rectangle], [rectangle.id], 90) as InkStroke[];
  assert.equal(rotated.rotation, 90);
  assert.deepEqual(rotated.points, rectangle.points);
  const bounds = elementBounds(rotated);
  assert.ok(Math.abs(bounds.w - 42) < .001 && Math.abs(bounds.h - 102) < .001);
  assert.equal(strokeHitTest(rotated, { x: 170, y: 120 }, 2), true);
  assert.equal(strokeHitTest(rotated, { x: 150, y: 100 }, 2), false);
  assert.deepEqual(rotated.points.map(point => point.p), [.3, .8]);
});

test('rotated image and text use their visible geometry for hit tests and group bounds', () => {
  const image: NoteImage = { id: 'image', kind: 'image', assetId: 'asset', x: 100, y: 100, w: 80, h: 20, rotation: 90 };
  const text: NoteText = { id: 'text', kind: 'text', x: 250, y: 150, w: 100, h: 35, text: 'مرحبا', fontSize: 20, color: '#111111' };
  assert.equal(elementAtPoint([image], { x: 140, y: 75 })?.id, image.id);
  assert.equal(elementAtPoint([image], { x: 105, y: 105 }), undefined);
  assert.equal(elementIntersectsPolygon(image, [{ x: 132, y: 72 }, { x: 148, y: 72 }, { x: 148, y: 85 }, { x: 132, y: 85 }]), true);
  const group = [image, text] as NoteElement[];
  const before = selectionBounds(group, [image.id, text.id]);
  const rotated = rotateElements(group, [image.id, text.id], 30);
  const after = selectionBounds(rotated, [image.id, text.id]);
  assert.ok(before && after && after.w > 0 && after.h > 0);
  assert.equal(rotated[0].rotation, 120);
  assert.equal(rotated[1].rotation, 30);
  if (rotated[0].kind !== 'image') throw new Error('Expected the image to remain in place in the element list.');
  assert.notDeepEqual({ x: rotated[0].x, y: rotated[0].y }, { x: image.x, y: image.y });
});

test('rotation remains optional for old notebooks and validates stored angles', () => {
  const notebook = newNotebook('Rotation');
  notebook.pages[0].elements = [rectangle];
  assert.doesNotThrow(() => validateNotesLibrary({ ...emptyLibrary(), notebooks: [notebook] }));
  notebook.pages[0].elements = rotateElements(notebook.pages[0].elements, [rectangle.id], -45);
  assert.doesNotThrow(() => validateNotesLibrary({ ...emptyLibrary(), notebooks: [notebook] }));
  notebook.pages[0].elements[0].rotation = 900;
  assert.throws(() => validateNotesLibrary({ ...emptyLibrary(), notebooks: [notebook] }));
});

test('eraser radius remains in page units after a nonuniform resize', () => {
  const line: InkStroke = {
    id: 'ink', kind: 'stroke', tool: 'pen', color: '#243442', width: 2, pressure: false,
    points: [{ x: 100, y: 100, p: .5, t: 1 }, { x: 200, y: 100, p: .5, t: 2 }],
    transform: [.2, 0, 0, 2],
  };
  assert.equal(strokeHitTest(line, { x: 150, y: 108 }, 7), true);
  assert.equal(strokeHitTest(line, { x: 150, y: 113 }, 7), false);
  assert.equal(strokeHitTest({ ...line, tool: 'line' }, { x: 150, y: 113 }, 7), false);
  assert.equal(strokeHitTest({ ...line, tool: 'line' }, { x: 150, y: 108 }, 7), true);
});
