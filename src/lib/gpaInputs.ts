import type { GradeScheme } from "./gradeSchemes";
import { pointsForLetter } from "./gradeSchemes";

/** Reject an incompatible previous record instead of converting its scale. */
export function validPriorGpa(gpa: number, max: number): boolean {
  return Number.isFinite(gpa) && gpa >= 0 && gpa <= max;
}

/** Stored credit hours retain the precision entered by the student. */
export function nonNegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function manualSemesterTotals(
  rows: readonly { name: string; credits: string; letter: string }[],
  scheme: GradeScheme,
): { credits: number; points: number; incomplete: boolean } {
  let credits = 0, points = 0, incomplete = false;
  for (const row of rows) {
    if (![row.name, row.credits, row.letter].some((value) => value.trim())) continue;
    const hours = Number(row.credits);
    if (!Number.isFinite(hours) || hours <= 0 || !scheme.bands.some((band) => band.letter === row.letter)) {
      incomplete = true;
      continue;
    }
    credits += hours;
    points += pointsForLetter(scheme, row.letter) * hours;
  }
  return { credits, points, incomplete };
}
