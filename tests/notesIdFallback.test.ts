import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newId, newNotebook } from '../src/lib/notes/types';

test('notebooks use secure UUIDv4 identifiers when randomUUID is unavailable', () => {
  const source = globalThis.crypto;
  const previous = Object.getOwnPropertyDescriptor(source, 'randomUUID');
  Object.defineProperty(source, 'randomUUID', { value: undefined, configurable: true });
  try {
    const identifiers = Array.from({ length: 32 }, () => newId());
    const notebook = newNotebook('Fallback');
    identifiers.push(notebook.id, notebook.pages[0].id);
    assert.equal(new Set(identifiers).size, identifiers.length);
    for (const id of identifiers) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    if (previous) Object.defineProperty(source, 'randomUUID', previous);
    else Reflect.deleteProperty(source, 'randomUUID');
  }
});
