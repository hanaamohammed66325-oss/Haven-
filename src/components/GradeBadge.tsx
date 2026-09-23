"use client";

import { Info } from "lucide-react";
import { bandForPct, type GradeScheme } from "@/lib/gradeSchemes";
import { useT } from "@/i18n";
import { InfoPopover } from "./InfoPopover";

interface GradeBadgeProps {
  /** The active grade scheme, resolved once by the parent (via `useScheme`) so
   *  this leaf stays a pure props-only component and doesn't re-render per store
   *  tick — it's instanced once per course. */
  scheme: GradeScheme;
  pct: number | null;
  size?: "sm" | "md" | "lg";
  showDefaultNote?: boolean;
  /** Share of the course weight graded so far (0–100). When set and below 100
   *  (with a grade present) a "provisional" caption is shown. */
  gradedPct?: number;
  /** Render the provisional caption below the letter (used on the course page). */
  showProvisional?: boolean;
}

// Colour by how close the grade is to the top of ITS OWN scale, so a 4.0 or a
// plus/minus scheme colours the same way a 5.0 does (a top grade is green, a
// failing one red) instead of everything washing out because the points are
// smaller. `top` is the scheme's highest band points (5.0, 4.0, …). The 0.9/
// 0.7/0.5 cutoffs reproduce the original 5.0 mapping exactly.
function gradeColor(points: number, top: number): string {
  const r = top > 0 ? points / top : 0;
  if (r >= 0.9) return "#5FA98C"; // success
  if (r >= 0.7) return "#477680"; // primary
  if (r >= 0.5) return "#E89B4A"; // warning
  return "#D9534F"; // danger
}

export function GradeBadge({
  scheme,
  pct,
  size = "md",
  showDefaultNote = false,
  gradedPct,
  showProvisional = false,
}: GradeBadgeProps) {
  const { t } = useT();
  const isDefault = pct == null;
  const displayPct = pct ?? 100;

  const grade = bandForPct(scheme, displayPct);
  const color = gradeColor(grade.points, scheme.bands[0].points);
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
