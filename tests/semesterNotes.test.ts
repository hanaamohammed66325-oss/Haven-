import { test } from "node:test";
import assert from "node:assert/strict";
import { notesForSemester } from "@/lib/notes/filterSemester";
import type { NotesLibrary } from "@/lib/notes/types";

test("historical notes keep selected course and personal material without showing another term", () => {
  const library = {
    schema: 1,
    revision: 3,
    folders: [
      { id: "old", parentId: null, title: "Old course", color: "#fff", courseId: "old-course" },
      { id: "old-child", parentId: "old", title: "Tutorials", color: "#fff", courseId: null },
      { id: "current", parentId: null, title: "Current course", color: "#fff", courseId: "current-course" },
      { id: "current-child", parentId: "current", title: "Tutorials", color: "#fff", courseId: null },
      { id: "personal", parentId: null, title: "Personal", color: "#fff", courseId: null },
    ],
    notebooks: ["old-child", "current-child", "personal", null].map((folderId, index) => ({
      id: `note-${index}`, folderId, title: `Note ${index}`, color: "#fff", cover: "none" as const,
      pages: [], createdAt: 0, updatedAt: 0, deletedAt: null, starred: false,
    })),
  } satisfies NotesLibrary;

  const visible = notesForSemester(library, new Set(["old-course"]));
  assert.deepEqual(visible.folders.map((folder) => folder.id), ["old", "old-child", "personal"]);
  assert.deepEqual(visible.notebooks.map((notebook) => notebook.id), ["note-0", "note-2", "note-3"]);
  assert.equal(library.folders.length, 5, "filtering must not mutate the saved library");
});
