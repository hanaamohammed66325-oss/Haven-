import type { NotesLibrary } from "./types";

/** Hide other terms' course folders; personal notes remain account-wide. */
export function notesForSemester(library: NotesLibrary, courseIds: ReadonlySet<string>): NotesLibrary {
  const hidden = new Set(library.folders.filter((folder) => folder.courseId && !courseIds.has(folder.courseId))
    .map((folder) => folder.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of library.folders) {
      if (folder.parentId && hidden.has(folder.parentId) && !hidden.has(folder.id)) {
        hidden.add(folder.id);
        changed = true;
      }
    }
  }
  return {
    ...library,
    folders: library.folders.filter((folder) => !hidden.has(folder.id)),
    notebooks: library.notebooks.filter((notebook) => !notebook.folderId || !hidden.has(notebook.folderId)),
  };
}
