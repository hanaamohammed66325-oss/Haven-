"use client";

import { Info } from "lucide-react";
import { bandForPct, DENIED, pointsForOfficial, WITHDRAWN, type GradeScheme } from "@/lib/gradeSchemes";
import type { OfficialGrade } from "@/types";
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
  /** The course's official portal result (end-of-term check). When set it is
   *  shown instead of the estimate, captioned "from the portal". */
  official?: OfficialGrade;
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
  official,
}: GradeBadgeProps) {
  const { t } = useT();
  const officialPoints = official ? pointsForOfficial(scheme, official) : null;
  // W / DN come from the portal but aren't band letters: shown as-is.
  const special =
    !scheme.percent && (official?.letter === WITHDRAWN || official?.letter === DENIED) ? official.letter : null;
  const hasOfficial = officialPoints != null || special != null;
  const isDefault = pct == null && !hasOfficial;
  const displayPct = officialPoints != null && scheme.percent ? officialPoints : pct ?? 100;

  const estimated = bandForPct(scheme, displayPct);
  const grade =
    hasOfficial && !scheme.percent
      ? scheme.bands.find((b) => b.letter === official!.letter) ?? estimated
      : estimated;
  const color =
    special === WITHDRAWN
      ? "#8A8F98"
      : gradeColor(special === DENIED ? scheme.bands[scheme.bands.length - 1].points : grade.points, scheme.bands[0].points);
  const sizeClass = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-lg px-3 py-1",
  }[size];

  // Provisional: a grade exists but only part of the course weight is graded.
  const isProvisional =
    !isDefault && !hasOfficial && gradedPct != null && gradedPct > 0 && gradedPct < 100;

  const badge = (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center font-semibold rounded-lg ${sizeClass}`}
        style={{ background: `${color}1A`, color, opacity: isDefault ? 0.6 : 1 }}
      >
        {special ?? grade.letter}
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

  if (hasOfficial) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        {badge}
        <span className="text-[10px] leading-none" style={{ color: "var(--color-muted)" }}>
          {t("gradeOfficial")}
        </span>
      </span>
    );
  }

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
