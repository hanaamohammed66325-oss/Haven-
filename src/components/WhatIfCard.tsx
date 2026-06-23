"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Card } from "./Card";
import { CountUp } from "./CountUp";
import { courseCurrentPct, pctToGrade } from "@/lib/grades";

export function WhatIfCard() {
  const { t } = useT();
  const { courses } = useStore();

  const buildInitial = useMemo(
    () => () =>
      Object.fromEntries(
        courses.map((c) => [c.id, Math.round(courseCurrentPct(c) ?? 75)])
      ) as Record<string, number>,
    [courses]
  );

  const [sim, setSim] = useState<Record<string, number>>(buildInitial);

  // Re-seed when the set of courses changes (added/removed/loaded demo).
  const courseKey = courses.map((c) => c.id).join(",");
  useEffect(() => {
    setSim(buildInitial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseKey]);

  const gpa = useMemo(() => {
    let n = 0;
    let d = 0;
    courses.forEach((c) => {
      const p = sim[c.id] ?? 75;
      n += pctToGrade(p).points * c.creditHours;
      d += c.creditHours;
    });
    return d ? n / d : null;
  }, [sim, courses]);

  if (!courses.length) return null;

  return (
    <Card>
      <div className="flex items-center justify-between gap-4 mb-2">
        <h2 className="font-display text-[22px]" style={{ color: "var(--color-ink)" }}>
          {t("whatIfTitle")}
        </h2>
        <button
          onClick={() => setSim(buildInitial())}
          className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          style={{ color: "var(--color-primary)" }}
        >
          <RotateCcw size={14} />
          {t("reset")}
        </button>
      </div>
      <p className="text-[13px] mb-6" style={{ color: "var(--color-muted)" }}>
        {t("whatIfNote")}
      </p>

      <div className="flex flex-col gap-5">
        {courses.map((c) => {
          const v = sim[c.id] ?? 75;
          const g = pctToGrade(v);
          return (
            <div key={c.id} className="flex items-center gap-4">
              <span
                className="w-32 shrink-0 text-sm font-medium truncate"
                style={{ color: "var(--color-ink)" }}
              >
                {c.name}
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={v}
                onChange={(e) => setSim((s) => ({ ...s, [c.id]: Number(e.target.value) }))}
                className="flex-1 cursor-pointer"
                style={{ accentColor: "var(--color-primary)" }}
                aria-label={c.name}
              />
              <span className="w-12 shrink-0 text-end text-sm" style={{ color: "var(--color-muted)" }}>
                {v}%
              </span>
              <span
                className="w-9 shrink-0 text-end text-sm font-semibold"
                style={{ color: "var(--color-ink)" }}
              >
                {g.letter}
              </span>
            </div>
          );
        })}
      </div>

      <div
        className="mt-7 pt-6 border-t flex items-center justify-between gap-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span className="haven-label">{t("whatIfResult")}</span>
        <span className="font-display text-3xl" style={{ color: "var(--color-brass)" }}>
          {gpa != null ? <CountUp value={gpa} decimals={2} duration={500} /> : "—"}
          <span className="text-base ml-1" style={{ color: "var(--color-muted)" }}>/ 5.0</span>
        </span>
      </div>
    </Card>
  );
}
