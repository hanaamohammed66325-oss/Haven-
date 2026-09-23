import type { Course, Semester } from "@/types";
import { resolveHolidaysForSemester, holidayMinutes, holidayLectureCount } from "./holidays";
import { resolveTardinessRule, tardinessToAbsenceMinutes } from "./tardiness";
import { SAUDI5, bandForPct, pointsForPct, type GradeScheme } from "./gradeSchemes";

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

// Saudi 5.0 scale — the historical default. The full set of systems (5.0 / 4.0 /
// percentage) lives in ./gradeSchemes; SCALE stays as an alias of the 5.0 bands
// so older callers keep working.
export const SCALE = SAUDI5.bands;

/** The band a percentage earns under a scheme (defaults to Saudi 5.0). The
 *  LETTER is the same across the point-based schemes, so callers that only need
 *  the letter can ignore the scheme argument. */
export const pctToGrade = (p: number, scheme: GradeScheme = SAUDI5) =>
  bandForPct(scheme, p);

/**
 * Course grade as it currently stands, out of the FULL 100 — descending from
 * A+ downward.
 *
 * A course is graded out of 100, not out of a single task. So you START at 100
 * (A+) and only lose the marks you actually missed on graded work; anything not
 * graded yet is still fully achievable and never drags you down:
 *
 *     pct = 100 − Σ_graded (1 − score/total) × weight
 *
 * Example: one 5/7 quiz worth 10% → 100 − (2/7 × 10) = 97 → A+ (not C).
 *
 * This descends only as real losses accumulate, and once the whole 100% of the
 * weight is graded it EQUALS the true final % — so the semester/cumulative GPA
 * lands exactly right at the end and is never wrongly dragged down mid-term by
 * one small task. Returns null only when nothing is graded yet.
 *
 * (The "if you got 0 on everything remaining" floor is computed where it's
 * actually needed — see `finalAdvice`'s secured letter.)
 */
export function courseCurrentPct(course: Course): number | null {
  const g = course.components.filter((c) => c.score != null && c.total > 0);
  if (!g.length) return null;
  let lost = 0;
  g.forEach((c) => {
    lost += (1 - c.score! / c.total) * c.weight;
  });
  return Math.max(0, 100 - lost);
}

// Semester GPA broken into its parts, so callers can reuse the graded credit
// hours and quality points (e.g. to project a new cumulative GPA live).
export interface SemesterGpaDetail {
  gpa: number | null; // Σ(points × credits) / Σ(credits), or null if ungraded
  points: number; // Σ(points × credits) over graded courses
  credits: number; // Σ(credits) over graded courses
}
export function semesterGpaDetail(
  courses: Course[],
  scheme: GradeScheme = SAUDI5
): SemesterGpaDetail {
  let n = 0,
    d = 0;
  courses.forEach((c) => {
    const p = courseCurrentPct(c);
    if (p == null) return;
    n += pointsForPct(scheme, p) * c.creditHours;
    d += c.creditHours;
  });
  return { gpa: d ? n / d : null, points: n, credits: d };
}

// Semester GPA = Σ(points × credits) / Σ(credits)
export function semesterGPA(
  courses: Course[],
  scheme: GradeScheme = SAUDI5
): number | null {
  return semesterGpaDetail(courses, scheme).gpa;
}

/** Blend a set of semester quality points/credits with the entered current
 *  cumulative GPA (over its completed hours). Shared by the live GPA card and
 *  the What-If simulator so both project cumulative GPA identically. */
export function projectedCumulativeFromParts(
  points: number,
  credits: number,
  currentGpa: number,
  completedHours: number,
  scheme: GradeScheme = SAUDI5
): number | null {
  const max = scheme.max;
  const prevGpa = Math.max(0, Math.min(max, Number(currentGpa) || 0));
  const prevHours = Math.max(0, Number(completedHours) || 0);
  const totalHours = prevHours + credits;
  if (totalHours <= 0) return prevHours > 0 ? prevGpa : null;
  return Math.min(max, (prevGpa * prevHours + points) / totalHours);
}

/** Projected new cumulative GPA: blends the entered current cumulative GPA
 *  (over its completed hours) with this semester's live quality points. Capped
 *  at the 5.0 scale. Returns null only when there's nothing to show at all. */
export function projectedCumulativeGpa(
  courses: Course[],
  currentGpa: number,
  completedHours: number,
  scheme: GradeScheme = SAUDI5
): number | null {
  const { points, credits } = semesterGpaDetail(courses, scheme);
  return projectedCumulativeFromParts(points, credits, currentGpa, completedHours, scheme);
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
  /** the counting method these numbers were produced with */
  mode: "hour" | "lecture";
  /** percentage cost of one absence UNIT — a contact hour in "hour" mode, a
   *  single lecture in "lecture" mode. */
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
  /** total lectures in the term (after subtracting holiday lectures) */
  totalLectures: number;
  /** missed (unexcused, full) lectures counted */
  missedLectures: number;
  /** lectures still missable before reaching the limit */
  lecturesRemaining: number;
}

// Duration-based absence: every session and every logged absence is weighted by its real length
// in minutes, so a 2-hour class counts twice a 1-hour one. Compared against the withdrawal limit.
export function attendanceInfo(
  c: Course,
  sem?: Semester,
  universitySlug?: string | null
): AttendanceInfo | null {
  const weeks = teachingWeeks(sem);
  const limit = courseLimit(c, sem);
  const approaching = APPROACHING_FRACTION * limit;

  const rawTotal = minutesPerWeek(c) * weeks;
  if (!rawTotal) return null;

  // Subtract holiday sessions from both totals (contact minutes AND lecture count)
  let holidayMins = 0;
  let holidayLectures = 0;
  if (sem?.startDate && sem?.endDate) {
    const holidays = resolveHolidaysForSemester(sem.startDate, sem.endDate, {
      dismissed: sem.dismissedHolidays,
      universitySlug,
      customHolidays: sem.customHolidays,
    });
    holidayMins = holidayMinutes(c.sessions, holidays);
    holidayLectures = holidayLectureCount(c.sessions, holidays);
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

  // ── By-hour figures (duration-based; always computed for the detail stats) ──
  const unitHour = (100 / total) * 60;
  const absenceHour = Math.min(100, (missed / total) * 100);
  const limitMinutes = (limit / 100) * total;
  const hoursRemainingHour = Math.max(0, (limitMinutes - missed) / 60);

  // ── By-lecture figures — each logged (unexcused, full) absence is ONE lecture,
  // reusing the same absence data; tardies aren't full absences so they're left
  // out. The per-lecture % is auto (an equal share of 100) unless the student
  // pinned their professor's own value.
  const sessionsPerWeek = c.sessions.length;
  const totalLectures = Math.max(1, sessionsPerWeek * weeks - holidayLectures);
  let missedLectures = 0;
  for (const m of c.missedSessions ?? []) {
    if (m.excused) continue;
    if (m.tardiness && m.tardiness > 0) continue;
    missedLectures++;
  }
  const perLecture =
    c.perLecturePct && c.perLecturePct > 0 ? c.perLecturePct : 100 / totalLectures;
  const absenceLecture = Math.min(100, missedLectures * perLecture);
  // Last count still under the limit (exceeding it = denial), mirroring the tool.
  const allowedLectures = Math.max(0, Math.ceil(limit / perLecture) - 1);
  const lecturesRemaining = Math.max(0, allowedLectures - missedLectures);

  // ── Active method drives the حرمان-critical numbers; the other set stays as
  // truthful context on the detail page. Undefined mode = the historical "hour".
  const mode: "hour" | "lecture" = c.attendanceMode === "lecture" ? "lecture" : "hour";
  const absence = mode === "lecture" ? absenceLecture : absenceHour;
  const unit = mode === "lecture" ? perLecture : unitHour;
  const rate = 100 - absence;
  const status: "ok" | "warn" | "danger" =
    absence >= limit ? "danger" : absence >= approaching ? "warn" : "ok";
  const hoursRemaining =
    mode === "lecture"
      ? (lecturesRemaining * (total / totalLectures)) / 60
      : hoursRemainingHour;

  return {
    weeks,
    mode,
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
    totalLectures,
    missedLectures,
    lecturesRemaining,
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

// "What you need on the final" — only when the final is the single remaining
// ungraded item. Letters follow the student's scheme so a plus/minus student
// sees A-/B-, not the 5.0 letters.
export function finalAdvice(course: Course, scheme: GradeScheme = SAUDI5) {
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
  for (const s of scheme.bands) {
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
    securedLetter: bandForPct(scheme, pctIfZero).letter,
  };
}
