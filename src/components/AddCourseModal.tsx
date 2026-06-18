"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useT } from "@/i18n";
import type { Course } from "@/types";

const field =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

interface AddCourseModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (course: Omit<Course, "id" | "components">) => void;
}

export function AddCourseModal({ open, onClose, onSubmit }: AddCourseModalProps) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [credits, setCredits] = useState("3");
  const [total, setTotal] = useState("30");
  const border = { borderColor: "var(--color-border)" };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cr = Number(credits);
    if (!name.trim() || !cr || cr <= 0) return;
    onSubmit({
      name: name.trim(),
      creditHours: cr,
      attendedLectures: Number(total) || 0,
      totalLectures: Number(total) || 0,
    });
    setName("");
    setCredits("3");
    setTotal("30");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t("newCourse")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("courseName")}</label>
          <input className={field} style={border} value={name} placeholder={t("courseNamePlaceholder")} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("creditHours")}</label>
            <input className={field} style={border} type="number" min="1" step="1" value={credits} onChange={(e) => setCredits(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("totalLectures")}</label>
            <input className={field} style={border} type="number" min="0" step="1" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}>
            {t("cancel")}
          </button>
          <button type="submit" className="haven-btn px-5 py-2 rounded-xl text-sm font-medium">
            {t("addCourse")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
