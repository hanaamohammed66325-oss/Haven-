import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyLibrary, newNotebook, noteScrollDirection } from '../src/lib/notes/types';
import { validateNotesLibrary } from '../src/lib/notes/storage';
import { readNotesPreferences, saveNotesPreferences } from '../src/lib/notes/notesPreferences';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else delete (globalThis as { window?: unknown }).window;
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage); else delete (globalThis as { localStorage?: unknown }).localStorage;
});

test('legacy notebooks validate and use vertical direction when no override was saved', () => {
  const legacy = newNotebook('Legacy');
  delete legacy.scrollDirection;
  const library = { ...emptyLibrary(), notebooks: [legacy] };
  assert.doesNotThrow(() => validateNotesLibrary(library));
  assert.equal(noteScrollDirection(legacy.scrollDirection), 'vertical');
});

test('stored notebook direction accepts only vertical or horizontal values', () => {
  const valid = { ...emptyLibrary(), notebooks: [newNotebook('Horizontal', null, '#42766c', 'ruled', 'horizontal')] };
  assert.doesNotThrow(() => validateNotesLibrary(valid));
  const invalid = structuredClone(valid) as unknown as { notebooks: Array<Record<string, unknown>> };
  invalid.notebooks[0].scrollDirection = 'diagonal';
  assert.throws(() => validateNotesLibrary(invalid));
});

test('new notebooks normalize their direction while existing notebook overrides stay intact', () => {
  assert.equal(newNotebook('Default').scrollDirection, 'vertical');
  assert.equal(newNotebook('Horizontal', null, '#42766c', 'ruled', 'horizontal').scrollDirection, 'horizontal');
  assert.equal(newNotebook('Fallback', null, '#42766c', 'ruled', 'diagonal' as never).scrollDirection, 'vertical');
});

test('direction preferences persist per Notes scope without mixing preview and account values', () => {
  const values = new Map<string, string>();
  const localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });

  assert.equal(saveNotesPreferences('account:a1', { scrollDirection: 'horizontal' }), true);
  assert.equal(saveNotesPreferences('notes-preview-v1', { scrollDirection: 'vertical' }), true);
  assert.equal(readNotesPreferences('account:a1').scrollDirection, 'horizontal');
  assert.equal(readNotesPreferences('notes-preview-v1').scrollDirection, 'vertical');
  assert.equal(readNotesPreferences('account:a2').scrollDirection, 'vertical');
});
