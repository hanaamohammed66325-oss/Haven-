import type { Course, Semester } from "@/types";
import { resolveHolidaysForSemester, holidayMinutes } from "./holidays";
import { resolveTardinessRule, tardinessToAbsenceMinutes } from "./tardiness";

/** Status thresholds scale with each course's own limit: "approaching" starts at
 *  70% of the limit, "withdrawal risk" at the limit itself. */
export const STATUS_COLOR: Record<"ok" | "warn" | "danger", string> = {
  ok: "var(--color-success)",
  warn: "#C77E2E",
  danger: "var(--color-danger)",
};

export const APPROACHING_FRACTION = 0.7;

/** The effective withdrawal limit (%) for a course: its own attendance_limit
 *  when set, otherwise the semester's global default (fallback 25). */
export function courseLimit(c: Course, sem?: Semester): number {
  if (c.attendanceLimit && c.attendanceLimit > 0) return c.attendanceLimit;
  return sem && sem.withdrawalLimit > 0 ? sem.withdrawalLimit : 25;
}

// Saudi 5.0 scale (default cutoffs; make editable later)
export const SCALE = [
  { min: 95, letter: "A+", points: 5.0 },
  { min: 90, letter: "A", points: 4.75 },
  { min: 85, letter: "B+", points: 4.5 },
  { min: 80, letter: "B", points: 4.0 },
  { min: 75, letter: "C+", points: 3.5 },
  { min: 70, letter: "C", points: 3.0 },
  { min: 65, letter: "D+", points: 2.5 },
  { min: 60, letter: "D", points: 2.0 },
  { min: 0, letter: "F", points: 1.0 },
];

export const pctToGrade = (p: number) => SCALE.find((s) => p >= s.min)!;

// Course current % — graded components only (unit-agnostic)
export function courseCurrentPct(course: Course): number | null {
  const g = course.components.filter((c) => c.score != null && c.total > 0);
  if (!g.length) return null;
  let w = 0,
    s = 0;
  g.forEach((c) => {
    w += (c.score! / c.total) * c.weight;
    s += c.weight;
  });
  return s ? (w / s) * 100 : null;
}

// Semester GPA broken into its parts, so callers can reuse the graded credit
// hours and quality points (e.g. to project a new cumulative GPA live).
export interface SemesterGpaDetail {
  gpa: number | null; // Σ(points × credits) / Σ(credits), or null if ungraded
  points: number; // Σ(points × credits) over graded courses
  credits: number; // Σ(credits) over graded courses
}
export function semesterGpaDetail(courses: Course[]): SemesterGpaDetail {
  let n = 0,
    d = 0;
  courses.forEach((c) => {
    const p = courseCurrentPct(c);
    if (p == null) return;
    n += pctToGrade(p).points * c.creditHours;
    d += c.creditHours;
  });
  return { gpa: d ? n / d : null, points: n, credits: d };
}

// Semester GPA = Σ(points × credits) / Σ(credits)
export function semesterGPA(courses: Course[]): number | null {
  return semesterGpaDetail(courses).gpa;
}

/** Blend a set of semester quality points/credits with the entered current
 *  cumulative GPA (over its completed hours). Shared by the live GPA card and
 *  the What-If simulator so both project cumulative GPA identically. */
export function projectedCumulativeFromParts(
  points: number,
  credits: number,
  currentGpa: number,
  completedHours: number
): number | null {
  const prevGpa = Math.max(0, Math.min(5, Number(currentGpa) || 0));
  const prevHours = Math.max(0, Number(completedHours) || 0);
  const totalHours = prevHours + credits;
  if (totalHours <= 0) return prevHours > 0 ? prevGpa : null;
  return Math.min(5, (prevGpa * prevHours + points) / totalHours);
}

/** Projected new cumulative GPA: blends the entered current cumulative GPA
 *  (over its completed hours) with this semester's live quality points. Capped
 *  at the 5.0 scale. Returns null only when there's nothing to show at all. */
export function projectedCumulativeGpa(
  courses: Course[],
  currentGpa: number,
  completedHours: number
): number | null {
  const { points, credits } = semesterGpaDetail(courses);
  return projectedCumulativeFromParts(points, credits, currentGpa, completedHours);
}

export const weightsTotal = (c: Course) =>
  c.components.reduce((s, x) => s + (Number(x.weight) || 0), 0);

/* ------------------------------------------------------------------ */
/*  Numeric field validation — ONE rule for every score / weight input  */
/* ------------------------------------------------------------------ */

/** Percentage fields (item weights) always run 0…100. */
export const MAX_PERCENT = 100;

/** `max` = value is above the allowed maximum; `min` = value is negative. */
export type RangeError = "max" | "min" | null;

export interface BoundedValue {
  /** the value safe to SAVE — null means empty ("not graded yet"), never 0 */
  value: number | null;
  /** when set, the input is out of range and the caller must NOT save */
  error: RangeError;
  /** the in-range value to snap back to on blur */
  clamped: number | null;
}

/** Clamp a number into [0, max]. */
export function clampToRange(n: number, max: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(0, n));
}

/**
 * Parse a raw input string against an upper bound (an item's full mark, or 100
 * for percentages). This is the single place the rule lives:
 *
 *  - empty stays empty (null) — "not graded yet", and must never become 0
 *  - decimals are preserved (18.5 out of 20 is valid)
 *  - above `max` or below 0 reports an error and yields NO value to save;
 *    `clamped` carries what to snap back to when the field loses focus
 *
 * `max` is optional: omit it for a field with no meaningful ceiling (a weight
 * expressed in points), and only negatives are rejected.
 */
export function parseBounded(raw: string, max?: number): BoundedValue {
  const s = String(raw).trim();
  if (s === "") return { value: null, error: null, clamped: null };
  const n = Number(s);
  // Unparseable (a lone "-" or "." mid-typing) is treated like empty.
  if (!Number.isFinite(n)) return { value: null, error: null, clamped: null };
  if (n < 0) return { value: null, error: "min", clamped: 0 };
  if (max != null && Number.isFinite(max) && n > max)
    return { value: null, error: "max", clamped: max };
  return { value: n, error: null, clamped: n };
}

export const sessionsPerWeek = (c: Course) => c.sessions.length;
export const minutesPerWeek = (c: Course) =>
  c.sessions.reduce((s, x) => s + (Number(x.minutes) || 0), 0);

export interface AttendanceInfo {
  weeks: number;
  /** percentage cost of one contact hour */
  unit: number;
  absence: number;
  rate: number;
  limit: number;
  status: "ok" | "warn" | "danger";
  /** total contact minutes (after subtracting holidays) */
  totalMinutes: number;
  /** total missed minutes (unexcused only) */
  missedMinutes: number;
  /** excused minutes (tracked but not counted) */
  excusedMinutes: number;
  /** minutes derived from tardiness rule (tardies converted to absences) */
  tardinessMinutes: number;
  /** minutes subtracted for holidays */
  holidayMinutesOff: number;
  /** hours remaining before reaching the limit */
  hoursRemaining: number;
}

// Duration-based absence: every session and every logged absence is weighted by its real length
// in minutes, so a 2-hour class counts twice a 1-hour one. Compared against the withdrawal limit.
export function attendanceInfo(c: Course, sem?: Semester): AttendanceInfo | null {
  const weeks = teachingWeeks(sem);
  const limit = courseLimit(c, sem);
  const approaching = APPROACHING_FRACTION * limit;

  const rawTotal = minutesPerWeek(c) * weeks;
  if (!rawTotal) return null;

  // Subtract holiday sessions from total contact time
  let holidayMins = 0;
  if (sem?.startDate && sem?.endDate) {
    const holidays = resolveHolidaysForSemester(
      sem.startDate,
      sem.endDate,
      sem.dismissedHolidays
    );
    holidayMins = holidayMinutes(c.sessions, holidays);
  }
  const total = Math.max(1, rawTotal - holidayMins);

  // Separate: full absences, excused, and tardies
  const rule = resolveTardinessRule(sem);
  let missed = 0;
  let excused = 0;
  const tardies: { minutesLate: number; sessionMinutes: number }[] = [];

  for (const m of c.missedSessions ?? []) {
    const mins = Number(m.minutes) || 0;
    if (m.excused) {
      excused += mins;
    } else if (m.tardiness && m.tardiness > 0) {
      tardies.push({ minutesLate: m.tardiness, sessionMinutes: mins });
    } else {
      missed += mins;
    }
  }

  const tardinessAbsence = tardinessToAbsenceMinutes(tardies, rule);
  missed += tardinessAbsence;

  const unit = (100 / total) * 60;
  const absence = Math.min(100, (missed / total) * 100);
  const rate = 100 - absence;
  const status: "ok" | "warn" | "danger" =
    absence >= limit ? "danger" : absence >= approaching ? "warn" : "ok";

  const limitMinutes = (limit / 100) * total;
  const hoursRemaining = Math.max(0, (limitMinutes - missed) / 60);

  return {
    weeks,
    unit,
    absence,
    rate,
    limit,
    status,
    totalMinutes: total,
    missedMinutes: missed,
    excusedMinutes: excused,
    tardinessMinutes: tardinessAbsence,
    holidayMinutesOff: holidayMins,
    hoursRemaining,
  };
}

/** Hard bounds for any semester length, in weeks. */
const MIN_SEMESTER_WEEKS = 1;
const MAX_SEMESTER_WEEKS = 40;

/**
 * THE single source of truth for "how many weeks is this semester".
 *
 * Prefers the real date span (that's what the student actually set), and falls
 * back to the CONFIGURED teaching + finals weeks when the dates are missing or
 * inverted — never to a magic constant. A hardcoded fallback is what made a
 * 20-week semester render as 15 while Settings clearly said 18 + 2.
 *
 * Every consumer (planner grid, dashboard progress, attendance maths) must use
 * this, otherwise they disagree with each other — which previously inflated
 * absence percentages by ~15% and produced false withdrawal warnings.
 */
export function semesterWeeks(sem?: Semester | null): number {
  const clamp = (n: number) =>
    Math.max(MIN_SEMESTER_WEEKS, Math.min(MAX_SEMESTER_WEEKS, Math.round(n)));

  const teaching = Math.round(Number(sem?.weeks) || 0);
  const finals = Math.round(Number(sem?.finalsWeeks) || 0);
  const configured = teaching + finals;

  const start = sem?.startDate ? +new Date(sem.startDate) : NaN;
  const end = sem?.endDate ? +new Date(sem.endDate) : NaN;
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return clamp((end - start) / (7 * 864e5));
  }
  return clamp(configured > 0 ? configured : 15);
}

/**
 * Teaching weeks only (excludes finals) — used by attendance math.
 * Finals weeks have no regular lectures, so they must not inflate the
 * contact-hours denominator.
 */
export function teachingWeeks(sem?: Semester | null): number {
  const clamp = (n: number) =>
    Math.max(MIN_SEMESTER_WEEKS, Math.min(MAX_SEMESTER_WEEKS, Math.round(n)));

  const teaching = Math.round(Number(sem?.weeks) || 0);
  if (teaching > 0) return clamp(teaching);

  const finals = Math.round(Number(sem?.finalsWeeks) || 0);
  const total = semesterWeeks(sem);
  return clamp(finals > 0 ? total - finals : total);
}

// Kept as the historical name used across the app; now date-aware AND
// safely backed by the user's configured weeks.
export function weeksFromDates(sem: Semester): number {
  return semesterWeeks(sem);
}

/**
 * Semester progress. Guards every division so a same-day or inverted date range
 * can never produce NaN/Infinity — which previously rendered a literal "NaN%"
 * in the dashboard gauge and collapsed the week counter to "1 of 1".
 */
export function semesterProgress(sem: Semester) {
  const start = +new Date(sem.startDate);
  const end = +new Date(sem.endDate);
  const wk = 7 * 864e5;
  const totalWeeks = semesterWeeks(sem);

  // Dates unusable → progress can't be derived from them. Report the correct
  // total (from the configured weeks) rather than a bogus 1-of-1.
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { pct: 0, totalWeeks, currentWeek: 1 };
  }

  const now = Date.now();
  const span = end - start;
  const elapsed = now - start;
  return {
    pct: Math.max(0, Math.min(100, (elapsed / span) * 100)),
    totalWeeks,
    currentWeek: Math.max(1, Math.min(totalWeeks, Math.ceil(elapsed / wk) || 1)),
  };
}

// "What you need on the final" — only when the final is the single remaining ungraded item
export function finalAdvice(course: Course) {
  const final = course.components.find((c) => c.type === "final");
  if (!final || final.score != null) return null;
  const others = course.components.filter((c) => c.type !== "final");
  if (!others.length || !others.every((c) => c.score != null)) return null;
  const totalW = weightsTotal(course);
  if (!totalW || !final.weight || !final.total) return null;
  const earned = others.reduce(
    (s, c) => s + (c.score! / c.total) * c.weight,
    0
  );
  const need = (T: number) => ((T / 100) * totalW - earned) / final.weight; // fraction 0..1
  let ceiling: { letter: string; raw: number } | null = null;
  for (const s of SCALE) {
    if (s.letter === "F") continue;
    if (need(s.min) <= 1) {
      ceiling = {
        letter: s.letter,
        raw: Math.max(0, Math.ceil(need(s.min) * final.total)),
      };
      break;
    }
  }
  const pctIfZero = (earned / totalW) * 100;
  return {
    ceiling,
    finalTotal: final.total,
    avoidFraw: Math.max(0, Math.ceil(need(60) * final.total)),
    passesAtZero: pctIfZero >= 60,
    securedLetter: pctToGrade(pctIfZero).letter,
  };
}
