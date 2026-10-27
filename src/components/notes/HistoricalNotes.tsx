"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { useNotesLibrary } from "@/lib/notes/useNotesLibrary";
import { notesForSemester } from "@/lib/notes/filterSemester";
import { PageThumbnail } from "./PageSurface";

export function HistoricalNotes({ scope }: { scope: string }) {
  const { courses } = useStore();
  const { t } = useT();
  const { library, status } = useNotesLibrary(scope);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const courseIds = useMemo(() => new Set(courses.map((course) => course.id)), [courses]);
  const visible = useMemo(() => library ? notesForSemester(library, courseIds) : null, [library, courseIds]);
  const selected = visible?.notebooks.find((notebook) => notebook.id === selectedId && !notebook.deletedAt);

  return <section className="mx-auto w-full max-w-5xl space-y-5 p-5 sm:p-8" style={{ color: "var(--color-text)" }}>
    <div>
      <h1 className="text-2xl font-semibold">{t("nav_notes")}</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>{t("semesterHistoryNotesHint")}</p>
    </div>
    {status === "loading" && <p>{t("semesterHistoryNotesLoading")}</p>}
    {selected ? <>
      <button type="button" onClick={() => setSelectedId(null)} className="rounded-lg border px-3 py-2 text-sm"
        style={{ borderColor: "var(--color-border)" }}>{t("semesterHistoryNotesBack")}</button>
      <h2 className="text-lg font-semibold">{selected.title}</h2>
      <div className="space-y-6">
        {selected.pages.map((page) => <div key={page.id} className="overflow-x-auto rounded-xl border p-3"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <PageThumbnail scope={scope} page={page} previewWidth={760} />
        </div>)}
      </div>
    </> : visible && (visible.notebooks.filter((notebook) => !notebook.deletedAt).length
      ? <div className="grid gap-3 sm:grid-cols-2">
          {visible.notebooks.filter((notebook) => !notebook.deletedAt).map((notebook) => <button key={notebook.id}
            type="button" onClick={() => setSelectedId(notebook.id)} className="rounded-xl border p-4 text-start"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
            <span className="block font-semibold">{notebook.title}</span>
            <span className="mt-1 block text-sm" style={{ color: "var(--color-text-muted)" }}>
              {visible.folders.find((folder) => folder.id === notebook.folderId)?.title}
            </span>
          </button>)}
        </div>
      : <p style={{ color: "var(--color-text-muted)" }}>{t("semesterHistoryNoNotes")}</p>)}
  </section>;
}
