"use client";

import { Info } from "lucide-react";
import { pctToGrade } from "@/lib/grades";
import { useT } from "@/i18n";
import { InfoPopover } from "./InfoPopover";

interface GradeBadgeProps {
  pct: number | null;
  size?: "sm" | "md" | "lg";
  showDefaultNote?: boolean;
  /** Share of the course weight graded so far (0–100). When set and below 100
   *  (with a grade present) a "provisional" caption is shown. */
  gradedPct?: number;
  /** Render the provisional caption below the letter (used on the course page). */
  showProvisional?: boolean;
}

function gradeColor(points: number): string {
  if (points >= 4.5) return "#5FA98C"; // success
  if (points >= 3.5) return "#477680"; // primary
  if (points >= 2.5) return "#E89B4A"; // warning
  return "#D9534F"; // danger
}

export function GradeBadge({
  pct,
  size = "md",
  showDefaultNote = false,
  gradedPct,
  showProvisional = false,
}: GradeBadgeProps) {
  const { t } = useT();
  const isDefault = pct == null;
  const displayPct = pct ?? 100;

  const grade = pctToGrade(displayPct);
  const color = gradeColor(grade.points);
  const sizeClass = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-lg px-3 py-1",
  }[size];

  // Provisional: a grade exists but only part of the course weight is graded.
  const isProvisional =
    !isDefault && gradedPct != null && gradedPct > 0 && gradedPct < 100;

  const badge = (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center font-semibold rounded-lg ${sizeClass}`}
        style={{ background: `${color}1A`, color, opacity: isDefault ? 0.6 : 1 }}
      >
        {grade.letter}
      </span>
      {isDefault && showDefaultNote && (
        <InfoPopover
          label={t("gradeDescNote")}
          trigger={
            <Info size={13} className="haven-nudge" style={{ color: "var(--color-muted)" }} />
          }
        >
          {t("gradeDescNote")}
        </InfoPopover>
      )}
    </span>
  );

  if (isProvisional && showProvisional) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        {badge}
        <span className="text-[10px] leading-none" style={{ color: "var(--color-muted)" }}>
          {t("gradeProvisional", { pct: Math.round(gradedPct!) })}
        </span>
      </span>
    );
  }

  return badge;
}
