import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementBounds } from '../src/lib/notes/ink';
import { rotateNotePage } from '../src/lib/notes/pageActions';
import { emptyLibrary, newNotebook, type InkStroke, type NoteImage, type NoteText } from '../src/lib/notes/types';
import { validateNotesLibrary } from '../src/lib/notes/storage';

test('quarter-turn page rotation keeps transformed ink, text and image visual bounds', () => {
  const notebook = newNotebook('Rotate page');
  const page = notebook.pages[0];
  const stroke: InkStroke = { id: 'ink', kind: 'stroke', tool: 'pen', color: '#123456', width: 5, pressure: false,
    points: [{ x: 100, y: 180, p: .5, t: 0 }, { x: 260, y: 200, p: .5, t: 1 }], transform: [1.4, .2, .3, .8], rotation: 25 };
  const text: NoteText = { id: 'text', kind: 'text', x: 200, y: 300, w: 180, h: 60, text: 'عنوان', fontSize: 24, color: '#123456', rotation: -15 };
  const image: NoteImage = { id: 'image', kind: 'image', assetId: 'asset', x: 400, y: 500, w: 120, h: 90, rotation: 30 };
  page.elements = [stroke, text, image];
  const before = page.elements.map(elementBounds);
  const rotated = rotateNotePage(page, 'clockwise');
  assert.deepEqual([rotated.width, rotated.height, rotated.rotation], [page.height, page.width, 90]);
  rotated.elements.forEach((element, index) => {
    const bounds = elementBounds(element), original = before[index];
    assert.ok(Math.abs(bounds.x - (page.height - original.y - original.h)) < 1e-6);
    assert.ok(Math.abs(bounds.y - original.x) < 1e-6);
    assert.ok(Math.abs(bounds.w - original.h) < 1e-6);
    assert.ok(Math.abs(bounds.h - original.w) < 1e-6);
  });
  notebook.pages[0] = rotated;
  assert.doesNotThrow(() => validateNotesLibrary({ ...emptyLibrary(), notebooks: [notebook] }));
  const restored = rotateNotePage(rotated, 'counterclockwise');
  assert.deepEqual([restored.width, restored.height, restored.rotation], [page.width, page.height, 0]);
  restored.elements.forEach((element, index) => {
    const bounds = elementBounds(element), original = before[index];
    assert.ok(Math.abs(bounds.x - original.x) < 1e-6);
    assert.ok(Math.abs(bounds.y - original.y) < 1e-6);
  });
});
