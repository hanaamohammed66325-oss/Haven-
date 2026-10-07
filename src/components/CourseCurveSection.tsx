"use client";

// "Grading method" on a course: fixed (the university's table) or graded on
// the cohort average («متوسط», lib/curves). Average shows how sure the course's
// letter is and opens the cutoffs editor. Hidden for percentage systems.

import { useState } from "react";
import { Choice } from "./AddCourseModal";
import { CourseCutoffsModal } from "./CourseCutoffsModal";
import { CollapseBody, CollapseToggle, useCardCollapse } from "./Collapsible";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { useUndo } from "./UndoManager";
import { courseCutoffs, curveFits, makeCurve } from "@/lib/curves";
import type { GradeScheme } from "@/lib/gradeSchemes";
import type { Course, CourseCurve } from "@/types";

export function CourseCurveSection({ course, scheme }: { course: Course; scheme: GradeScheme }) {
  const { t } = useT();
  const { academic, curves, setCourseCurve } = useStore();
  const { undoableDelete } = useUndo();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const { open, toggle } = useCardCollapse(`course-curve-${course.id}`, undefined, false);

  if (!curveFits(scheme)) return null;
  const average = course.curve != null;
  const cut = courseCutoffs(course, scheme);

  const save = async (curve: CourseCurve | null) => {
    setError("");
    const res = await setCourseCurve(course.id, curve);
    if (!res.ok) setError(t("saveError"));
    return res;
  };

  const chooseAverage = () => {
    if (average) return;
    // Marked at once; until cutoffs are in, the university's table is used.
    void save(makeCurve(scheme, academic, [], false));
  };

  const chooseFixed = async () => {
    if (!average) return;
    // The saved entry (not the attached copy, which may carry a derived flag).
    const saved = curves[course.id] ?? null;
    const res = await save(null);
    // Undo is offered once the account has it; a failed save already put the
    // entry back on screen.
    if (!res.ok || !saved) return;
    undoableDelete({
      message: t("curve_backToFixed", { name: course.name }),
      onUndo: () => void save(saved),
      onCommit: () => {},
    });
  };

  const status = (() => {
    if (!cut) return null;
    if (course.official) return { text: t("curve_official"), warn: false, button: null };
    if (cut.stale) return { text: t("curve_stale"), warn: true, button: t("curve_review") };
    if (cut.conflict) return { text: t("curve_conflict"), warn: true, button: t("curve_review") };
    if (cut.status === "waiting") return { text: t("curve_waiting"), warn: false, button: t("curve_enter") };
    if (cut.status === "partial") return { text: t("curve_partial"), warn: false, button: t("curve_edit") };
    return { text: t("curve_entered"), warn: false, button: t("curve_edit") };
  })();

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="haven-label" style={{ color: "var(--color-ink)" }}>{t("curve_title")}</h4>
        <CollapseToggle open={open} onToggle={toggle} label={t("curve_title")} />
      </div>
      <CollapseBody open={open}>
      <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={t("curve_title")} className="grid grid-cols-2 gap-2">
        <Choice on={!average} onClick={() => void chooseFixed()} label={t("curve_fixed")} desc={t("curve_fixedDesc")} />
        <Choice on={average} onClick={chooseAverage} label={t("curve_avg")} desc={t("curve_avgDesc")} />
      </div>

      {status && (
        <div
          className="flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: status.warn ? "var(--color-warning)" : "var(--color-border)" }}
        >
          <div className="text-sm leading-relaxed" style={{ color: status.warn ? "var(--color-warning)" : "var(--color-muted)" }}>
            <p>{status.text}</p>
            {cut?.baseMoved && cut.status === "partial" && <p className="mt-1">{t("curve_baseMoved")}</p>}
          </div>
          {status.button && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="shrink-0 self-start rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:self-auto"
              style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
            >
              {status.button}
            </button>
          )}
        </div>
      )}

      {error && (
        <span className="text-xs" style={{ color: "var(--color-danger)" }}>{error}</span>
      )}
      </div>
      </CollapseBody>

      <CourseCutoffsModal open={editing} onClose={() => setEditing(false)} course={course} scheme={scheme} onSave={save} />
    </div>
  );
}
