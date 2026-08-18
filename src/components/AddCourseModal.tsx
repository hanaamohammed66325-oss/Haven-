"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useT } from "@/i18n";
import type { MutationResult } from "@/store";

const field =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

interface AddCourseModalProps {
  open: boolean;
  onClose: () => void;
  // May be async and report failure: on add it's the store's addCourse
  // (Promise<MutationResult>); on edit it's a plain optimistic update (void).
  onSubmit: (course: {
    name: string;
    creditHours: number;
    attendanceLimit: number;
  }) => void | Promise<MutationResult | void>;
  /** when provided, the modal edits an existing course (prefilled) */
  initial?: { name: string; creditHours: number; attendanceLimit?: number };
  /** global default withdrawal limit — seeds the field for new courses */
  defaultLimit?: number;
}

export function AddCourseModal({ open, onClose, onSubmit, initial, defaultLimit = 25 }: AddCourseModalProps) {
  const { t } = useT();
  const isEdit = initial != null;
  // The course's own limit, falling back to the global default when unset.
  const initialLimit =
    initial?.attendanceLimit && initial.attendanceLimit > 0 ? initial.attendanceLimit : defaultLimit;
  const [name, setName] = useState(initial?.name ?? "");
  const [credits, setCredits] = useState(String(initial?.creditHours ?? 3));
  const [limit, setLimit] = useState(String(initialLimit));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const border = { borderColor: "var(--color-border)" };

  // Sync the form whenever the modal opens (prefill for edit, reset for add).
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setCredits(String(initial?.creditHours ?? 3));
      setLimit(String(initialLimit));
      setError("");
      setSaving(false);
    }
  }, [open, initial?.name, initial?.creditHours, initialLimit]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cr = Number(credits);
    if (!name.trim() || !cr || cr <= 0) return;
    // Clamp the limit to a sane 1..100; fall back to the global default.
    const lim = Number(limit);
    const attendanceLimit = lim >= 1 && lim <= 100 ? lim : defaultLimit;
    setError("");
    setSaving(true);
    // Await the save. Only close once the store actually has the row; if it
    // failed, keep the modal open and show why (was: closed silently regardless).
    const res = await onSubmit({ name: name.trim(), creditHours: cr, attendanceLimit });
    setSaving(false);
    if (res && res.ok === false) {
      setError(t("saveError"));
      return;
    }
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
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("withdrawalLimitLabel")}</label>
          <input className={field} style={border} type="number" min="1" max="100" step="1" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        {error && (
          <span className="text-xs" style={{ color: "var(--color-danger)" }}>{error}</span>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={saving} className="haven-btn px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-60">
            {saving ? t("saving") : isEdit ? t("save") : t("addCourse")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
