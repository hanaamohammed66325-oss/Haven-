// Working out a university's percentage cutoffs from students' real results.
//
// Each observation is a course's percentage next to the letter it actually got
// (from the end-of-term check or a past term, shared with consent). For the
// boundary under letter L, every result graded L or higher must be at or above
// the cutoff, and every result graded lower must be below it — so the cutoff
// lies between the highest "lower" % and the lowest "L or higher" %. When those
// overlap the results contradict each other (instructors setting letters
// themselves, or a typo), and no cutoff is suggested for that letter.
// Suggestions are only that: the admin approves them (admin → GPA checks).

import type { GradeScheme } from "./gradeSchemes";

export interface Observation {
  letter: string;
  pct: number;
}

export interface LetterEvidence {
  letter: string;
  /** results seen with this letter, and their % range */
  n: number;
  min: number | null;
  max: number | null;
  /** the cutoff in use now (estimated, or approved earlier) */
  current: number;
  /** where the results put the cutoff, or null (no results for it or above) */
  suggested: number | null;
  /** results on either side of this boundary contradict each other */
  conflict: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Evidence for every letter of the scheme except the last (whose cutoff is 0). */
export function learnCutoffs(scheme: GradeScheme, obs: Observation[]): LetterEvidence[] {
  const index = new Map(scheme.bands.map((b, i) => [b.letter, i]));
  const seen = obs
    .filter((o) => index.has(o.letter) && o.pct >= 0 && o.pct <= 100)
    .map((o) => ({ i: index.get(o.letter)!, pct: o.pct }));
  return scheme.bands.slice(0, -1).map((band, i) => {
    const own = seen.filter((o) => o.i === i).map((o) => o.pct);
    const atOrAbove = seen.filter((o) => o.i <= i).map((o) => o.pct);
    const below = seen.filter((o) => o.i > i).map((o) => o.pct);
    const hi = atOrAbove.length ? Math.min(...atOrAbove) : null;
    const lo = below.length ? Math.max(...below) : null;
    const conflict = hi != null && lo != null && lo >= hi;
    let suggested: number | null = null;
    if (hi != null && !conflict) {
      // Cutoffs are usually whole numbers: prefer one when it still fits.
      const whole = Math.floor(hi);
      suggested = lo == null || whole > lo ? whole : round2(hi);
    }
    return {
      letter: band.letter,
      n: own.length,
      min: own.length ? Math.min(...own) : null,
      max: own.length ? Math.max(...own) : null,
      current: band.min,
      suggested,
      conflict,
    };
  });
}

/** A set of cutoffs is usable when every letter has one and they strictly
 *  descend (the same rule gradeSchemes.applyCutoffs enforces). */
export function validCutoffs(values: (number | null)[]): boolean {
  return values.every((v, i) => v != null && v > 0 && v <= 100 && (i === 0 || v < values[i - 1]!));
}
