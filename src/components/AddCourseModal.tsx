"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useT } from "@/i18n";

const field =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

interface AddCourseModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (course: { name: string; creditHours: number }) => void;
  /** when provided, the modal edits an existing course (prefilled) */
  initial?: { name: string; creditHours: number };
}

export function AddCourseModal({ open, onClose, onSubmit, initial }: AddCourseModalProps) {
  const { t } = useT();
  const isEdit = initial != null;
  const [name, setName] = useState(initial?.name ?? "");
  const [credits, setCredits] = useState(String(initial?.creditHours ?? 3));
  const border = { borderColor: "var(--color-border)" };

  // Sync the form whenever the modal opens (prefill for edit, reset for add).
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setCredits(String(initial?.creditHours ?? 3));
    }
  }, [open, initial?.name, initial?.creditHours]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cr = Number(credits);
    if (!name.trim() || !cr || cr <= 0) return;
    onSubmit({ name: name.trim(), creditHours: cr });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? t("editCourse") : t("newCourse")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("courseName")}</label>
          <input className={field} style={border} value={name} placeholder={t("courseNamePlaceholder")} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("creditHours")}</label>
          <input className={field} style={border} type="number" min="1" step="1" value={credits} onChange={(e) => setCredits(e.target.value)} />
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}>
            {t("cancel")}
          </button>
          <button type="submit" className="haven-btn px-5 py-2 rounded-xl text-sm font-medium">
            {isEdit ? t("save") : t("addCourse")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
