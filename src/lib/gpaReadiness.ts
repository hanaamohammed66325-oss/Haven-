// What a student still has to record before their GPA can be shown correctly.
// Havi's note (components/HaviGpaNote) lists only the items this returns, so
// every check reads the student's own data; nothing here changes how the GPA
// is calculated.

import { gradeTableStatus, isWithdrawn } from "./gradeSchemes";
import { weightsTotal } from "./grades";
import type { AcademicInfo, Course } from "@/types";

export type GpaGapKind = "university" | "table" | "credits" | "grades" | "weights" | "cumulative";

export interface GpaGap {
  kind: GpaGapKind;
  /** the courses behind a per-course gap (credits / grades / weights) */
  courses?: { id: string; name: string }[];
}

export interface GpaReadinessInput {
  academic: AcademicInfo | null | undefined;
  courses: Course[];
  cumulativeGpa: number;
  cumulativeHours: number;
  /** the term's last day (yyyy-mm-dd): grades are asked for only in its last month */
  semesterEnd?: string;
  now?: Date;
}

/** A level past the first means the student has earlier terms on record. */
const pastFirstLevel = (level: string | undefined): boolean => {
  const n = Number(String(level ?? "").trim());
  return Number.isFinite(n) && n > 1;
};

/** Grades come out through the term, so they are asked for only in its last month. */
const GRADES_WINDOW_DAYS = 30;

const inLastMonth = (end: string | undefined, now: Date): boolean => {
  if (!end) return false;
  const last = new Date(`${end}T23:59:59`);
  return +now <= +last && +last - +now <= GRADES_WINDOW_DAYS * 24 * 60 * 60 * 1000;
};

export function gpaGaps({ academic, courses, cumulativeGpa, cumulativeHours, semesterEnd, now = new Date() }: GpaReadinessInput): GpaGap[] {
  const gaps: GpaGap[] = [];

  // The university decides the points table: none at all means 5.0 by assumption.
  if (!academic?.universityName?.trim()) gaps.push({ kind: "university" });
  else if (gradeTableStatus(academic) !== "ok") gaps.push({ kind: "table" });

  // A course without a portal result is read from its %, so only estimates count.
  const counted = courses.filter((c) => !isWithdrawn(c.official));
  const noCredits = counted.filter((c) => !((Number(c.creditHours) || 0) > 0));
  if (noCredits.length) gaps.push({ kind: "credits", courses: noCredits.map((c) => ({ id: c.id, name: c.name })) });

  // No grade recorded yet: nothing to read a % from, so the course drops out
  // of the GPA without a word. Asked for only in the term's last month.
  if (inLastMonth(semesterEnd, now)) {
    const noGrades = counted.filter((c) => !c.official && !c.components.some((x) => x.score != null && x.total > 0));
    if (noGrades.length) gaps.push({ kind: "grades", courses: noGrades.map((c) => ({ id: c.id, name: c.name })) });
  }

  const badWeights = counted.filter(
    (c) => !c.official && c.components.length > 0 && Math.abs(weightsTotal(c) - 100) > 0.01
  );
  if (badWeights.length) gaps.push({ kind: "weights", courses: badWeights.map((c) => ({ id: c.id, name: c.name })) });

  // The cumulative GPA needs both numbers: one without the other, or neither
  // once the student is past the first level.
  const hasGpa = (Number(cumulativeGpa) || 0) > 0;
  const hasHours = (Number(cumulativeHours) || 0) > 0;
  if (hasGpa !== hasHours || (!hasGpa && pastFirstLevel(academic?.level))) gaps.push({ kind: "cumulative" });

  return gaps;
}
