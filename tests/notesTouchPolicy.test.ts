import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPinch, isUnambiguousPalm } from '../src/lib/notes/touchNavigation';
import { DEFAULT_NOTE_DOCUMENT_SETTINGS, newNotebook } from '../src/lib/notes/types';

test('two broad fingers can pinch while an actual palm or active Pencil cannot claim navigation', () => {
  const fingers = [{ x: 10, y: 10, width: 42, height: 35 }, { x: 100, y: 10, width: 38, height: 33 }];
  assert.equal(canPinch(fingers, false), true);
  assert.equal(canPinch(fingers, true), false);
  assert.equal(canPinch(fingers.slice(0, 1), false), false);
  assert.equal(canPinch([fingers[0], { ...fingers[1], width: 110 }], false), false);
  assert.equal(isUnambiguousPalm(50, 12), true);
  assert.equal(isUnambiguousPalm(42, 35), false);
});

test('new notes use first-page previews and palm rejection is opt-in without rewriting saved choices', () => {
  assert.equal(newNotebook('Imported file').cover, 'none');
  assert.equal(DEFAULT_NOTE_DOCUMENT_SETTINGS.palmRejection, false);
  assert.equal({ ...DEFAULT_NOTE_DOCUMENT_SETTINGS, palmRejection: true }.palmRejection, true);
});
