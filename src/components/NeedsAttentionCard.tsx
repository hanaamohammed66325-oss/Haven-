"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Card } from "./Card";
import { courseCurrentPct, pctToGrade, attendanceInfo } from "@/lib/grades";

export function NeedsAttentionCard() {
  const { t } = useT();
  const { courses, semester } = useStore();

  const items = courses
    .map((c) => {
      const reasons: string[] = [];
      const att = attendanceInfo(c, semester);
      if (att?.status === "danger") {
        reasons.push(t("attnWithdrawal", { n: att.absence.toFixed(0) }));
      } else if (att?.status === "warn") {
        reasons.push(t("attnApproaching", { n: att.absence.toFixed(0) }));
      }
      const pct = courseCurrentPct(c);
      if (pct != null && pctToGrade(pct).points <= 3.0) {
        reasons.push(t("attnLowGrade", { letter: pctToGrade(pct).letter }));
      }
      return { course: c, reasons };
    })
    .filter((x) => x.reasons.length > 0);

  return (
    <Card>
      <h2 className="font-display text-[22px] mb-6" style={{ color: "var(--color-ink)" }}>
        {t("needsAttentionTitle")}
      </h2>

      {items.length === 0 ? (
        <p className="text-sm font-medium" style={{ color: "var(--color-success)" }}>
          {t("attnAllGood")}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map(({ course, reasons }) => (
            <Link
              key={course.id}
              href={`/courses#${course.id}`}
              className="flex items-start gap-3 rounded-xl p-3 -mx-1 transition-colors hover:bg-[var(--color-primary-soft)]"
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: "#C77E2E" }} />
              <span className="text-sm leading-snug">
                <span className="font-semibold" style={{ color: "var(--color-ink)" }}>{course.name}</span>
                <span style={{ color: "var(--color-muted)" }}> — {reasons.join(" · ")}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
