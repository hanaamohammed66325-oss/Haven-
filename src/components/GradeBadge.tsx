"use client";

import { pctToGrade } from "@/lib/grades";

interface GradeBadgeProps {
  pct: number | null;
  size?: "sm" | "md" | "lg";
}

function gradeColor(points: number): string {
  if (points >= 4.5) return "#5FA98C"; // success
  if (points >= 3.5) return "#477680"; // primary
  if (points >= 2.5) return "#E89B4A"; // warning
  return "#D9534F"; // danger
}

export function GradeBadge({ pct, size = "md" }: GradeBadgeProps) {
  if (pct == null) {
    return (
      <span className="text-sm" style={{ color: "var(--color-muted)" }}>
        —
      </span>
    );
  }

  const grade = pctToGrade(pct);
  const color = gradeColor(grade.points);
  const sizeClass = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-lg px-3 py-1",
  }[size];

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-lg ${sizeClass}`}
      style={{ background: `${color}1A`, color }}
    >
      {grade.letter}
    </span>
  );
}
