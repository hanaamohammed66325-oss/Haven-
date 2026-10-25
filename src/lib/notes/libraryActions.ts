import type { NoteFolder, Notebook, NotesLibrary } from './types';

export type LibraryItemRef = { kind: 'notebook' | 'folder'; id: string };
export interface LibraryDestination { folderId: string | null; dividerId: string }

/** Descendants inherit the section of their root; a moved course keeps its link. */
export function folderSection(folder: NoteFolder, folders: readonly NoteFolder[]): string {
  let root = folder;
  const seen = new Set<string>();
  while (root.parentId && !seen.has(root.id)) {
    seen.add(root.id);
    const parent = folders.find(item => item.id === root.parentId);
    if (!parent) break;
    root = parent;
  }
  return root.dividerId ?? (root.courseId ? 'courses' : 'personal');
}

export function notebookSection(note: Notebook, folders: readonly NoteFolder[]): string {
  const folder = folders.find(item => item.id === note.folderId);
  return folder ? folderSection(folder, folders) : note.dividerId ?? 'personal';
}

export function canMoveLibraryItem(library: NotesLibrary, item: LibraryItemRef, destination: LibraryDestination): boolean {
  if (!['courses', 'personal', ...(library.dividers ?? []).map(section => section.id)].includes(destination.dividerId)) return false;
  if (destination.folderId && !library.folders.some(folder => folder.id === destination.folderId)) return false;
  if (item.kind === 'notebook') return library.notebooks.some(note => note.id === item.id && !note.deletedAt);
  if (!library.folders.some(folder => folder.id === item.id)) return false;
  let parent = destination.folderId;
  const seen = new Set<string>();
  while (parent) {
    if (parent === item.id || seen.has(parent)) return false;
    seen.add(parent);
    parent = library.folders.find(folder => folder.id === parent)?.parentId ?? null;
  }
  return true;
}

/** A single immutable update moves a folder's whole subtree without copying assets. */
export function moveLibraryItem(library: NotesLibrary, item: LibraryItemRef, destination: LibraryDestination): NotesLibrary {
  if (!canMoveLibraryItem(library, item, destination)) return library;
  const dividerId = destination.folderId ? undefined : destination.dividerId;
  return item.kind === 'notebook'
    ? { ...library, notebooks: library.notebooks.map(note => note.id === item.id ? { ...note, folderId: destination.folderId, dividerId, updatedAt: Date.now() } : note) }
    : { ...library, folders: library.folders.map(folder => folder.id === item.id ? { ...folder, parentId: destination.folderId, dividerId } : folder) };
}
