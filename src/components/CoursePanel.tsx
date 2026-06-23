"use client";

import { useState } from "react";
import { Plus, Trash2, Target, Pencil } from "lucide-react";
import { Card } from "./Card";
import { GradeBadge } from "./GradeBadge";
import { AttendanceSection } from "./AttendanceSection";
import { AddItemModal } from "./AddItemModal";
import { AddCourseModal } from "./AddCourseModal";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import {
  courseCurrentPct,
  weightsTotal,
  finalAdvice,
} from "@/lib/grades";
import { creditHoursLabel } from "@/lib/format";
import type { Course, GradeComponent } from "@/types";

export function CoursePanel({ course }: { course: Course }) {
  const { t, lang } = useT();
  const { addComponent, updateComponent, deleteComponent, deleteCourse, updateCourse } = useStore();
  const [addingItem, setAddingItem] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingItem, setEditingItem] = useState<GradeComponent | null>(null);

  const pct = courseCurrentPct(course);
  const used = weightsTotal(course);
  const left = Math.max(0, 100 - used);
  const advice = finalAdvice(course);

  const border = { borderColor: "var(--color-border)" };

  return (
    <Card padding="p-0" className="overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-8 border-b" style={border}>
        <div className="min-w-0">
          <h2 className="font-display text-xl truncate" style={{ color: "var(--color-ink)" }}>
            {course.name}
          </h2>
          <div className="flex items-center gap-2 mt-2.5 text-[13px]" style={{ color: "var(--color-muted)" }}>
            <span>{creditHoursLabel(course.creditHours, lang)}</span>
            <span>·</span>
            <span>
              {used < 100
                ? t("weightsUnassigned", { used: round(used), left: round(left) })
                : t("weightsComplete", { used: round(used) })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <GradeBadge pct={pct} size="lg" />
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg p-2 transition-colors hover:bg-black/5"
            aria-label={t("editCourse")}
          >
            <Pencil size={16} style={{ color: "var(--color-muted)" }} />
          </button>
          <button
            onClick={() => deleteCourse(course.id)}
            className="rounded-lg p-2 transition-colors hover:bg-black/5"
            aria-label={t("delete")}
          >
            <Trash2 size={16} style={{ color: "var(--color-muted)" }} />
          </button>
        </div>
      </div>

      {/* Components */}
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="haven-label" style={{ color: "var(--color-ink)" }}>{t("componentsHeading")}</h3>
          <button
            onClick={() => setAddingItem(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
          >
            <Plus size={15} />
            {t("addItem")}
          </button>
        </div>

        {course.components.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--color-muted)" }}>{t("noComponents")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {course.components.map((comp) => (
              <ComponentRow
                key={comp.id}
                comp={comp}
                onScore={(score) => updateComponent(course.id, comp.id, { score })}
                onEdit={() => setEditingItem(comp)}
                onDelete={() => deleteComponent(course.id, comp.id)}
              />
            ))}
          </div>
        )}

        {/* Final advice */}
        {advice && (
          <div
            className="mt-6 rounded-xl p-6 flex gap-3"
            style={{ background: "var(--color-primary-soft)" }}
          >
            <Target size={18} className="shrink-0 mt-0.5" style={{ color: "var(--color-primary)" }} />
            <div className="text-sm" style={{ color: "var(--color-ink)" }}>
              <div className="font-semibold mb-1">{t("finalTitle")}</div>
              <ul className="space-y-1" style={{ color: "var(--color-muted)" }}>
                {advice.ceiling ? (
                  <li>{t("finalCeiling", { letter: advice.ceiling.letter, raw: advice.ceiling.raw, total: advice.finalTotal })}</li>
                ) : (
                  <li>{t("finalCeilingNone")}</li>
                )}
                {advice.passesAtZero ? (
                  <li>{t("finalSecured", { letter: advice.securedLetter })}</li>
                ) : (
                  <li>{t("finalAvoidF", { raw: advice.avoidFraw, total: advice.finalTotal })}</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Attendance */}
      <AttendanceSection course={course} />

      <AddItemModal
        open={addingItem}
        onClose={() => setAddingItem(false)}
        onSubmit={(c) => addComponent(course.id, c)}
      />

      <AddItemModal
        open={editingItem != null}
        onClose={() => setEditingItem(null)}
        onSubmit={(c) => {
          if (editingItem) updateComponent(course.id, editingItem.id, c);
        }}
        initial={editingItem ?? undefined}
      />

      <AddCourseModal
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={(data) => updateCourse(course.id, data)}
        initial={{ name: course.name, creditHours: course.creditHours }}
      />
    </Card>
  );
}

function ComponentRow({
  comp,
  onScore,
  onEdit,
  onDelete,
}: {
  comp: GradeComponent;
  onScore: (score: number | null) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  return (
    <div
      className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate" style={{ color: "var(--color-ink)" }}>{comp.name}</div>
        <div className="text-xs" style={{ color: "var(--color-muted)" }}>
          {t(`type_${comp.type}` as const)} · {comp.weight}
          {comp.unit === "percent" ? t("unitPercent") : ` ${t("unitPoints")}`}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          min="0"
          step="any"
          value={comp.score ?? ""}
          placeholder="—"
          onChange={(e) => onScore(e.target.value === "" ? null : Number(e.target.value))}
          className="w-14 rounded-lg border px-2 py-1 text-sm text-center outline-none transition-colors focus:border-[var(--color-primary)]"
          style={{ borderColor: "var(--color-border)" }}
        />
        <span className="text-sm" style={{ color: "var(--color-muted)" }}>/ {comp.total}</span>
      </div>
      <button onClick={onEdit} className="rounded-lg p-1.5 transition-colors hover:bg-black/5 shrink-0" aria-label={t("editItem")}>
        <Pencil size={14} style={{ color: "var(--color-muted)" }} />
      </button>
      <button onClick={onDelete} className="rounded-lg p-1.5 transition-colors hover:bg-black/5 shrink-0" aria-label={t("delete")}>
        <Trash2 size={14} style={{ color: "var(--color-muted)" }} />
      </button>
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
