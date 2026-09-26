"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { effectiveGpaGoal } from "@/lib/gradeSchemes";
import { useStore, useScheme } from "@/store";
import { useT } from "@/i18n";
import { Card } from "./Card";
import { CircularProgress } from "./CircularProgress";
import { CountUp } from "./CountUp";
import { InfoPopover } from "./InfoPopover";
import { semesterGPA, projectedCumulativeGpa } from "@/lib/grades";

export function GpaGoalCard() {
  const { t } = useT();
  const { courses, gpaGoal, setGpaGoal, gpaMode, cumulativeGpa, cumulativeHours, academic } = useStore();
  const scheme = useScheme();

  // Follow the same Semester / Cumulative toggle the GPA card uses (shared
  // store state) so this ring shows — and measures progress against — the GPA
  // currently on screen, not a fixed semester figure.
  const gpa =
    gpaMode === "cumulative"
      ? projectedCumulativeGpa(courses, cumulativeGpa, cumulativeHours, scheme, academic)
      : semesterGPA(courses, scheme);
  const goal = effectiveGpaGoal(gpaGoal, scheme);
  // The box edits a draft so a percentage student can type "85" without the
  // "8" being rejected mid-way; a valid value is committed as they type.
  const [draft, setDraft] = useState<string | null>(null);
  const pct = gpa != null ? Math.min(100, (gpa / goal) * 100) : 0;
  const reached = gpa != null && gpa >= goal;
  const message =
    gpa == null
      ? t("goalNoData")
      : reached
      ? t("goalReached")
      : t("goalToGo", { n: (goal - gpa).toFixed(2) });

  return (
    <Card>
      <div className="flex items-center gap-1.5 mb-6">
        <h2 className="font-display text-lg" style={{ color: "var(--color-ink)" }}>
          {t("gpaGoalTitle")}
        </h2>
        <InfoPopover
          label={t("gpaRoundingInfo")}
          trigger={
            <Info size={14} className="haven-nudge" style={{ color: "var(--color-muted)" }} />
          }
        >
          {t("gpaRoundingNote")}
        </InfoPopover>
      </div>
      <div className="flex items-center gap-6">
        <CircularProgress value={pct} size={104} color="gradient">
          <div className="flex flex-col items-center leading-none">
            <span className="font-display text-2xl" style={{ color: "var(--color-ink)" }}>
              {gpa != null ? <CountUp value={gpa} decimals={2} /> : "—"}
            </span>
            <span className="text-[11px] mt-1" style={{ color: "var(--color-muted)" }}>
              / {goal}
            </span>
          </div>
        </CircularProgress>
        <div className="flex-1 min-w-0">
          <label className="haven-label block mb-1.5">{t("goalTarget")}</label>
          <input
            type="number"
            min="0"
            max={scheme.max}
            step={scheme.percent ? 1 : 0.1}
            value={draft ?? String(goal)}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = Number(e.target.value);
              if (n > 0 && n <= scheme.max) setGpaGoal(n);
            }}
            onBlur={() => setDraft(null)}
            className="w-20 rounded-xl border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
            style={{ borderColor: "var(--color-border)" }}
          />
          <p
            className="text-sm mt-3 font-medium"
            style={{ color: reached ? "var(--color-success)" : "var(--color-muted)" }}
          >
            {message}
          </p>
        </div>
      </div>
    </Card>
  );
}
