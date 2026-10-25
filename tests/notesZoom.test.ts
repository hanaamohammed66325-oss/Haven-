import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_NOTE_ZOOM_LIMITS, emptyLibrary, newNotebook, noteZoomLimits } from '../src/lib/notes/types';
import { validateNotesLibrary } from '../src/lib/notes/storage';

test('legacy notebooks use the default zoom limits when no limits were saved', () => {
  const notebook = newNotebook('Legacy zoom');
  delete notebook.zoomLimits;
  assert.deepEqual(noteZoomLimits(notebook.zoomLimits), DEFAULT_NOTE_ZOOM_LIMITS);
  assert.doesNotThrow(() => validateNotesLibrary({ ...emptyLibrary(), notebooks: [notebook] }));
});

test('saved per-notebook zoom limits validate and remain readable', () => {
  const notebook = newNotebook('Zoom limits');
  notebook.zoomLimits = { min: .5, max: 3.5 };
  assert.doesNotThrow(() => validateNotesLibrary({ ...emptyLibrary(), notebooks: [notebook] }));
  assert.deepEqual(noteZoomLimits(notebook.zoomLimits), { min: .5, max: 3.5 });
});

test('invalid zoom limits are rejected without changing legacy fallback behavior', () => {
  const library = { ...emptyLibrary(), notebooks: [newNotebook('Invalid zoom')] };
  const invalid = structuredClone(library) as typeof library & { notebooks: Array<Record<string, unknown>> };
  invalid.notebooks[0].zoomLimits = { min: 5, max: .35 };
  assert.throws(() => validateNotesLibrary(invalid));
  assert.deepEqual(noteZoomLimits({ min: 9, max: 10 }), DEFAULT_NOTE_ZOOM_LIMITS);
});
