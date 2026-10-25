import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyLibrary, newNotebook, type NoteFolder } from '../src/lib/notes/types';
import { validateNotesLibrary } from '../src/lib/notes/storage';
import { folderSection, notebookSection, moveLibraryItem, canMoveLibraryItem } from '../src/lib/notes/libraryActions';
import { upcomingMeetings } from '../src/lib/notes/schedule';

const folder = (id: string, parentId: string | null = null, courseId: string | null = null): NoteFolder => ({ id, parentId, courseId, color: '#477680', title: id });
function fixture() {
  return { ...emptyLibrary(), dividers: [{ id: 'research', title: 'Research', createdAt: 1 }], folders: [folder('course', null, 'course-id'), folder('child', 'course'), folder('personal')], notebooks: [newNotebook('Lecture', 'child')] };
}

test('moving a linked course folder moves its whole subtree without duplicating pages or unlinking its course', () => {
  const library = fixture();
  const moved = moveLibraryItem(library, { kind: 'folder', id: 'course' }, { folderId: null, dividerId: 'research' });
  assert.equal(moved.folders[0].courseId, 'course-id');
  assert.equal(folderSection(moved.folders[1], moved.folders), 'research');
  assert.equal(notebookSection(moved.notebooks[0], moved.folders), 'research');
  assert.equal(moved.notebooks, library.notebooks);
  assert.equal(moved.notebooks[0].pages, library.notebooks[0].pages);
  assert.equal(library.folders[0].dividerId, undefined);
  validateNotesLibrary(moved);
});

test('self and descendant folder moves are rejected; missing destinations cannot orphan contents', () => {
  const library = fixture();
  for (const folderId of ['course', 'child', 'missing']) {
    const destination = { folderId, dividerId: 'courses' };
    assert.equal(canMoveLibraryItem(library, { kind: 'folder', id: 'course' }, destination), false);
    assert.equal(moveLibraryItem(library, { kind: 'folder', id: 'course' }, destination), library);
  }
});

test('a notebook moves between any section root and nested folder while keeping its content', () => {
  const library = fixture();
  const item = { kind: 'notebook' as const, id: library.notebooks[0].id };
  const root = moveLibraryItem(library, item, { folderId: null, dividerId: 'research' });
  assert.equal(root.notebooks[0].folderId, null);
  assert.equal(notebookSection(root.notebooks[0], root.folders), 'research');
  const nested = moveLibraryItem(root, item, { folderId: 'child', dividerId: 'courses' });
  assert.equal(nested.notebooks[0].dividerId, undefined);
  assert.equal(notebookSection(nested.notebooks[0], nested.folders), 'courses');
  assert.equal(nested.notebooks[0].pages, library.notebooks[0].pages);
  validateNotesLibrary(nested);
});

test('first-page previews validate alongside legacy covers and section metadata persists', () => {
  const library = fixture();
  library.notebooks[0].cover = 'none';
  const restored = structuredClone(library);
  validateNotesLibrary(restored);
  assert.equal(restored.notebooks[0].cover, 'none');
  restored.notebooks[0].cover = 'unknown' as never;
  assert.throws(() => validateNotesLibrary(restored));
});

test('upcoming meetings sort by their real occurrence, including different times on the same day and next week', () => {
  const now = new Date(2026, 9, 28, 12, 0); // Wednesday noon.
  const sessions = [{ id: 'past', day: 3, time: '09:00' }, { id: 'afternoon', day: 3, time: '15:00' }, { id: 'morning', day: 3, time: '13:00' }, { id: 'sunday', day: 0, time: '10:00' }];
  assert.deepEqual(upcomingMeetings(sessions, now).map(item => item.session.id), ['morning', 'afternoon', 'sunday', 'past']);
  assert.equal(upcomingMeetings(sessions, now).at(-1)!.date.getDate(), 4);
  assert.deepEqual(sessions.map(item => item.id), ['past', 'afternoon', 'morning', 'sunday']);
});

test('invalid or unconfigured meeting times never produce invalid dates in the carousel', () => {
  const sessions = [{ id: 'blank', day: 0 }, { id: 'bad', day: 0, time: '25:00' }, { id: 'bad-day', day: 8, time: '12:00' }, { id: 'valid', day: 0, time: '08:30' }];
  assert.deepEqual(upcomingMeetings(sessions, new Date(2026, 9, 24)).map(item => item.session.id), ['valid']);
});
