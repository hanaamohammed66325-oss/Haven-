// End-of-term GPA check — the logic behind components/TermCheck.
//
// When the term is over, the student is asked whether our semester GPA matches
// the one on their university portal. If it doesn't, we work backwards from the
// portal GPA to the course most likely graded differently (a single course whose
// letter, one change away, makes the two GPAs agree), ask about just that one,
// and fall back to entering every course's official letter only when we can't
// tell. Official results then replace the estimates everywhere (lib/grades).

import type { Course, CumulativeCheck, OfficialGrade, PastTerm, PastTermCourse, Semester, TermCheck } from "@/types";
import { bandForPct, pointsForOfficial, type GradeScheme } from "./gradeSchemes";
import { courseCurrentPct, projectedCumulativeFromParts, semesterGPA } from "./grades";

const DAY_MS = 864e5;
/** How long "not out yet" waits before asking again. */
export const SNOOZE_DAYS = 7;

/** The largest gap between our GPA and the portal's that is still just rounding:
 *  0.04 on a 4/5 scale (scaled up for larger ones like /20), 0.1 for a
 *  percentage average. */
export function gpaTolerance(scheme: GradeScheme): number {
  if (scheme.percent) return 0.1;
  return scheme.max > 5 ? (0.04 * scheme.max) / 5 : 0.04;
}

export const sameGpa = (a: number, b: number, scheme: GradeScheme) => Math.abs(a - b) <= gpaTolerance(scheme) + 1e-9;

/** Attach each course's official result (from the term check) to the course. */
export function withOfficial(courses: Course[], check: TermCheck | null): Course[] {
  const grades = check?.grades;
  if (!grades || !Object.keys(grades).length) return courses;
  return courses.map((c) => (grades[c.id] ? { ...c, official: grades[c.id] } : c));
}

/** Validate the stored preferences.termCheck blob; answers from another
 *  semester are dropped so a new term starts fresh. */
export function readTermCheck(raw: unknown, term: string): TermCheck | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!r || r.term !== term) return null;
  const grades: Record<string, OfficialGrade> = {};
  if (r.grades && typeof r.grades === "object") {
    for (const [id, g] of Object.entries(r.grades as Record<string, unknown>)) {
      const o = g && typeof g === "object" ? (g as Record<string, unknown>) : null;
      if (!o) continue;
      if (typeof o.letter === "string" && o.letter) grades[id] = { letter: o.letter.slice(0, 24) };
      else if (typeof o.mark === "number" && o.mark >= 0 && o.mark <= 100) grades[id] = { mark: o.mark };
    }
  }
  const reasons = ["repeat", "notCounted", "hours", "unknown"] as const;
  const cum = readCumulative(r.cum);
  return {
    term,
    ...(r.answer === "match" || r.answer === "mismatch" ? { answer: r.answer } : {}),
    ...(typeof r.portalGpa === "number" ? { portalGpa: r.portalGpa } : {}),
    grades,
    ...(typeof r.consent === "boolean" ? { consent: r.consent } : {}),
    ...(reasons.includes(r.reason as (typeof reasons)[number]) ? { reason: r.reason as TermCheck["reason"] } : {}),
    ...(typeof r.snoozeUntil === "string" ? { snoozeUntil: r.snoozeUntil } : {}),
    ...(cum ? { cum } : {}),
    at: typeof r.at === "string" ? r.at : "",
  };
}

/** Validate a stored cumulative check; null when it's missing or malformed. */
export function readCumulative(raw: unknown): CumulativeCheck | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : null);
  if (!o) return null;
  const before = n(o.before),
    hours = n(o.hours),
    portal = n(o.portal),
    ours = n(o.ours);
  if (before == null || hours == null || portal == null || ours == null) return null;
  const reasons = ["repeat", "notCounted", "hours", "unknown"];
  return {
    before,
    hours,
    portal,
    ours,
    result: o.result === "match" ? "match" : "mismatch",
    ...(reasons.includes(o.reason as string) ? { reason: o.reason as CumulativeCheck["reason"] } : {}),
  };
}

/** The term is over once its end date has passed. */
export function termEnded(semester: Semester, now = new Date()): boolean {
  if (!semester.endDate) return false;
  const end = new Date(`${semester.endDate}T23:59:59`);
  return +now > +end;
}

/** Whether the end-of-term window should open: the term is over, at least one
 *  course has a grade, and the student hasn't answered (or the "not out yet"
 *  wait is up). */
export function termCheckDue(
  s: { semester: Semester; courses: Course[]; termCheck: TermCheck | null },
  now = new Date()
): boolean {
  if (!termEnded(s.semester, now)) return false;
  if (!s.courses.some((c) => courseCurrentPct(c) != null)) return false;
  const tc = s.termCheck;
  if (!tc) return true;
  if (tc.answer) return false;
  return !tc.snoozeUntil || +now >= +new Date(tc.snoozeUntil);
}

export const snoozeDate = (now = new Date()) => new Date(+now + SNOOZE_DAYS * DAY_MS).toISOString();

/** Our estimated letter for a course (null when nothing is graded). */
export function estimatedLetter(course: Course, scheme: GradeScheme): string | null {
  const p = courseCurrentPct(course);
  return p == null ? null : bandForPct(scheme, p).letter;
}

export interface GapGuess {
  courseId: string;
  letter: string;
  /** our semester GPA if that course had this letter */
  gpa: number;
  /** how far the course's % is from that letter's range — the smaller, the
   *  likelier (a grade near a cutoff is the usual culprit). */
  distance: number;
}

/**
 * Courses that, graded one letter differently, would make our GPA match the
 * portal's — likeliest first. Empty for percentage schemes (a mark isn't one
 * of a few letters) or when no single course explains the gap.
 */
export function explainGap(courses: Course[], scheme: GradeScheme, portalGpa: number): GapGuess[] {
  if (scheme.percent) return [];
  const out: GapGuess[] = [];
  for (const c of courses) {
    const pct = courseCurrentPct(c);
    if (pct == null || c.official) continue;
    const current = bandForPct(scheme, pct);
    scheme.bands.forEach((band, i) => {
      if (band.letter === current.letter) return;
      const trial = courses.map((x) => (x.id === c.id ? { ...x, official: { letter: band.letter } } : x));
      const gpa = semesterGPA(trial, scheme);
      if (gpa == null || !sameGpa(gpa, portalGpa, scheme)) return;
      // Band i covers [band.min, upper): upper is the next band up's min.
      const upper = i > 0 ? scheme.bands[i - 1].min : Infinity;
      const distance = pct >= upper ? pct - upper : pct < band.min ? band.min - pct : 0;
      out.push({ courseId: c.id, letter: band.letter, gpa, distance });
    });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

// ── Past terms ──────────────────────────────────────────────────────────────

/** GPA of a past term's courses under the scheme; null when nothing counts. */
export function pastTermGpa(courses: PastTermCourse[], scheme: GradeScheme): number | null {
  let n = 0,
    d = 0;
  for (const c of courses) {
    const p = pointsForOfficial(scheme, c);
    if (p == null || !(c.hours > 0)) continue;
    n += p * c.hours;
    d += c.hours;
  }
  return d ? n / d : null;
}

/** The cumulative GPA after a past term: the one before it (over its hours,
 *  both from the transcript) blended with the term's courses. */
export function pastTermCumulative(courses: PastTermCourse[], scheme: GradeScheme, before: number, hours: number): number | null {
  let n = 0,
    d = 0;
  for (const c of courses) {
    const p = pointsForOfficial(scheme, c);
    if (p == null || !(c.hours > 0)) continue;
    n += p * c.hours;
    d += c.hours;
  }
  return projectedCumulativeFromParts(n, d, before, hours, scheme);
}

/** Validate the stored preferences.pastTerms list; bad entries are dropped. */
export function readPastTerms(raw: unknown): PastTerm[] {
  if (!Array.isArray(raw)) return [];
  const reasons = ["repeat", "notCounted", "hours", "unknown"];
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : undefined);
  const out: PastTerm[] = [];
  for (const r of raw.slice(0, 30)) {
    const o = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
    if (!o || typeof o.id !== "string" || !Array.isArray(o.courses)) continue;
    const courses: PastTermCourse[] = [];
    for (const c of o.courses.slice(0, 20)) {
      const x = c && typeof c === "object" ? (c as Record<string, unknown>) : null;
      const hours = num(x?.hours);
      if (!x || hours == null || hours <= 0) continue;
      courses.push({
        ...(typeof x.name === "string" && x.name ? { name: x.name.slice(0, 60) } : {}),
        hours,
        ...(typeof x.letter === "string" && x.letter ? { letter: x.letter.slice(0, 24) } : {}),
        ...(num(x.mark) != null ? { mark: num(x.mark) } : {}),
        ...(num(x.pct) != null ? { pct: num(x.pct) } : {}),
      });
    }
    const portalGpa = num(o.portalGpa);
    if (!courses.length || portalGpa == null) continue;
    const cum = readCumulative(o.cum);
    out.push({
      id: o.id,
      name: typeof o.name === "string" ? o.name.slice(0, 40) : "",
      scheme: typeof o.scheme === "string" ? o.scheme : "",
      courses,
      portalGpa,
      ours: num(o.ours) ?? 0,
      result: o.result === "match" ? "match" : "mismatch",
      ...(cum ? { cum } : {}),
      ...(typeof o.consent === "boolean" ? { consent: o.consent } : {}),
      ...(reasons.includes(o.reason as string) ? { reason: o.reason as PastTerm["reason"] } : {}),
      at: typeof o.at === "string" ? o.at : "",
    });
  }
  return out;
}
