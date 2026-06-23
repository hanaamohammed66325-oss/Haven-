"use client";

import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Card } from "./Card";
import { CircularProgress } from "./CircularProgress";
import { CountUp } from "./CountUp";
import { semesterGPA } from "@/lib/grades";

export function GpaGoalCard() {
  const { t } = useT();
  const { courses, gpaGoal, setGpaGoal } = useStore();

  const gpa = semesterGPA(courses);
  const goal = gpaGoal > 0 ? gpaGoal : 5;
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
      <h2 className="font-display text-lg mb-6" style={{ color: "var(--color-ink)" }}>
        {t("gpaGoalTitle")}
      </h2>
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
            max="5"
            step="0.1"
            value={gpaGoal}
            onChange={(e) => setGpaGoal(Number(e.target.value) || 0)}
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
