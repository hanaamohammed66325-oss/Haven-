import type { AcademicInfo, Course, Semester } from "@/types";
import { resolveHolidaysForSemester, holidayMinutes, holidayLectureCount, clipHolidays } from "./holidays";
import { addDays, toISODate } from "./dates";
import { resolveTardinessRule, tardinessToAbsenceMinutes } from "./tardiness";
import { NO_ADJUST, repeatAdjust, type RepeatAdjust } from "./repeats";
import { SAUDI5, bandForPct, isWithdrawn, passMark, pointsForOfficial, pointsForPct, type GradeScheme } from "./gradeSchemes";

/** Status thresholds scale with each course's own limit: "approaching" starts at
 *  70% of the limit, "withdrawal risk" at the limit itself. */
export const STATUS_COLOR: Record<"ok" | "warn" | "danger", string> = {
  ok: "var(--color-success)",
  warn: "#C77E2E",
  danger: "var(--color-danger)",
};

export const APPROACHING_FRACTION = 0.7;
export { fmtPct } from "./format";

/** Float tolerance for "is the absence exactly on the limit" comparisons. */
const LIMIT_EPS = 1e-9;

/** The limits a course's absence is held to, and where they come from.
 *  `total` caps all absence (excused included); `unexcused` caps absence
 *  without an accepted excuse. Either can be null. */
export interface LimitRule {
  total: number | null;
  unexcused: number | null;
  warnings: number[];
  /** denied on reaching the limit, not only above it (e.g. "20% or more") */
  inclusive?: boolean;
  /** course = this course's own limit · university = the verified official rule
   *  · personal = the student's own answer · legacy = no rule attached (demo,
   *  admin tools): the semester limit · none = unknown, no percentage */
  source: "course" | "university" | "personal" | "legacy" | "none";
}

/** The course counting mode the term's rule sets (by hour / by lecture), or
 *  null when the rule doesn't say or isn't in force yet. */
export function ruleMode(sem?: Semester): "hour" | "lecture" | null {
  const r = sem?.attendanceRule;
  if (!r || r.source === "none") return null;
  return r.method === "lectures" ? "lecture" : r.method === "hours" ? "hour" : null;
}

/** Resolve a course's limits: its own limit, then the term's rule (the verified
 *  university rule or the student's own answer), else unknown. A semester with
 *  no rule attached keeps the old behaviour (its withdrawalLimit, fallback 25). */
export function courseRule(c: Course, sem?: Semester): LimitRule {
  const r = sem?.attendanceRule;
  const warnings = r?.warnings ?? [];
  if (!r) {
    if (c.attendanceLimit && c.attendanceLimit > 0) return { total: c.attendanceLimit, unexcused: null, warnings, source: "course" };
    return { total: sem && sem.withdrawalLimit > 0 ? sem.withdrawalLimit : 25, unexcused: null, warnings: [], source: "legacy" };
  }
  if (hasOwnLimit(c, sem)) return { total: c.attendanceLimit!, unexcused: null, warnings, source: "course" };
  const unknown: LimitRule = { total: null, unexcused: null, warnings: [], source: "none" };
  if (r.source === "none" || r.method === "none" || r.method === "count") return unknown;
  const inclusive = r.inclusive === true;
  if (!r.excusedCounts) {
    // Only absence without an excuse counts toward the limit.
    const lim = r.maxUnexcused ?? r.maxAbsence;
    return lim ? { total: null, unexcused: lim, warnings, inclusive, source: r.source } : unknown;
  }
  if (r.maxAbsence == null && r.maxUnexcused == null) return unknown;
  return {
    total: r.maxAbsence,
    unexcused: r.maxUnexcused != null && r.maxUnexcused !== r.maxAbsence ? r.maxUnexcused : null,
    warnings,
    inclusive,
    source: r.source,
  };
}

/** Whether the course's stored limit is one the student chose. Until the rules
 *  work, every course was saved with the default (the DB's 25, or the term
 *  limit), so those values don't override the university's rule unless the
 *  student marked them as their own. */
export function hasOwnLimit(c: Course, sem?: Semester): boolean {
  const l = c.attendanceLimit ?? 0;
  if (!(l > 0)) return false;
  if (c.ownLimit) return true;
  return l !== 25 && l !== sem?.withdrawalLimit;
}

/** The main withdrawal limit (%) a course is compared against, or 0 when it's
 *  unknown. See courseRule for the full picture. */
export function courseLimit(c: Course, sem?: Semester): number {
  const r = courseRule(c, sem);
  return r.total ?? r.unexcused ?? 0;
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
/** The points a course counts for in the GPA: its official portal result when
 *  the student entered one (end-of-term check), else the estimate from its
 *  current %. null when neither exists yet. */
export function coursePoints(course: Course, scheme: GradeScheme = SAUDI5): number | null {
  // Withdrawn (W): out of the GPA, even if marks were entered before withdrawing.
  if (isWithdrawn(course.official)) return null;
  const official = course.official ? pointsForOfficial(scheme, course.official) : null;
  if (official != null) return official;
  const p = courseCurrentPct(course);
  return p == null ? null : pointsForPct(scheme, p);
}

export function semesterGpaDetail(
  courses: Course[],
  scheme: GradeScheme = SAUDI5
): SemesterGpaDetail {
  let n = 0,
    d = 0;
  courses.forEach((c) => {
    const p = coursePoints(c, scheme);
    if (p == null) return;
    n += p * c.creditHours;
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
  scheme: GradeScheme = SAUDI5,
  /** repeated courses: earlier attempts the university drops, and any
   *  ceiling on the result (lib/repeats) */
  repeats: RepeatAdjust = NO_ADJUST
): number | null {
  const max = scheme.max;
  const prevGpa = Math.max(0, Math.min(max, Number(currentGpa) || 0));
  let prevHours = Math.max(0, Number(completedHours) || 0);
  let prevPoints = prevGpa * prevHours;
  // Only when the entered record can actually contain those attempts.
  if (repeats.hours > 0 && repeats.hours <= prevHours) {
    prevPoints = Math.max(0, prevPoints - repeats.points);
    prevHours -= repeats.hours;
  }
  const totalHours = prevHours + credits;
  if (totalHours <= 0) return prevHours > 0 ? prevPoints / prevHours : null;
  // A ceiling never pulls the GPA below where the student already is.
  const ceiling = repeats.cap != null ? Math.max(repeats.cap, prevGpa) : max;
  return Math.min(max, ceiling, (prevPoints + points) / totalHours);
}

/** Projected new cumulative GPA: blends the entered current cumulative GPA
 *  (over its completed hours) with this semester's live quality points. Capped
 *  at the 5.0 scale. Returns null only when there's nothing to show at all. */
export function projectedCumulativeGpa(
  courses: Course[],
  currentGpa: number,
  completedHours: number,
  scheme: GradeScheme = SAUDI5,
  /** the academic profile, for how repeated courses count (lib/repeats) */
  academic?: AcademicInfo | null
): number | null {
  const { points, credits } = semesterGpaDetail(courses, scheme);
  return projectedCumulativeFromParts(
    points,
    credits,
    currentGpa,
    completedHours,
    scheme,
    repeatAdjust(courses, scheme, academic)
  );
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
  /** absence sits exactly on the limit: not denial yet (the regulation denies
   *  only ABOVE it), but one more absence crosses it. status is "warn". */
  atLimit: boolean;
  /** total contact minutes (after subtracting holidays) */
  totalMinutes: number;
  /** total missed minutes (excused included — they count toward the limit) */
  missedMinutes: number;
  /** the excused part of missedMinutes */
  excusedMinutes: number;
  /** the excused share of `absence`, in % points (shown as "X% of it excused") */
  excusedPct: number;
  /** minutes derived from tardiness rule (tardies converted to absences) */
  tardinessMinutes: number;
  /** minutes subtracted for holidays */
  holidayMinutesOff: number;
  /** hours remaining before reaching the limit */
  hoursRemaining: number;
  /** total lectures in the term (after subtracting holiday lectures) */
  totalLectures: number;
  /** missed full lectures counted (excused included) */
  missedLectures: number;
  /** lectures still missable before reaching the limit */
  lecturesRemaining: number;
  /** false when the university's rule is unknown: log absences, but don't show
   *  a percentage against a limit, remaining allowance or denial status */
  limitKnown: boolean;
  ruleSource: LimitRule["source"];
  /** the main limit caps only absence WITHOUT an excuse (`absence` is then the
   *  unexcused share) */
  limitIsUnexcused: boolean;
  /** absence without an accepted excuse, in % */
  unexcusedAbsence: number;
  /** a second, lower cap on unexcused absence beside the main one, or null */
  unexcusedLimit: number | null;
  /** the next official warning threshold above the current absence, or null */
  nextWarning: number | null;
}

// Duration-based absence: every session and every logged absence is weighted by its real length
// in minutes, so a 2-hour class counts twice a 1-hour one. Compared against the withdrawal limit.
export function attendanceInfo(
  c: Course,
  sem?: Semester,
  /** whose holidays apply (lib/universityCountry holidayCalendar) */
  calendar?: string | null
): AttendanceInfo | null {
  const weeks = teachingWeeks(sem);
  const lr = courseRule(c, sem);
  const limitKnown = lr.source !== "none";
  // The main limit, and whether it caps unexcused absence only (a university
  // where excused absence doesn't count). A second, lower unexcused cap can
  // sit beside a total cap (e.g. 15% unexcused / 25% total).
  const limitIsUnexcused = lr.total == null && lr.unexcused != null;
  const limit = lr.total ?? lr.unexcused ?? 0;
  const secondUnexcused = lr.total != null ? lr.unexcused : null;

  const rawTotal = minutesPerWeek(c) * weeks;
  if (!rawTotal) return null;

  // Subtract holiday sessions from both totals (contact minutes AND lecture count)
  let holidayMins = 0;
  let holidayLectures = 0;
  if (sem?.startDate && sem?.endDate) {
    // Only breaks inside the counted weeks (first day of classes → `weeks`
    // later, never past the term's end) remove lectures from the total.
    const countedEndISO = toISODate(addDays(new Date(`${sem.startDate}T00:00:00`), weeks * 7 - 1));
    const holidays = clipHolidays(
      resolveHolidaysForSemester(sem.startDate, sem.endDate, {
        dismissed: sem.dismissedHolidays,
        calendar,
        customHolidays: sem.customHolidays,
      }),
      sem.startDate,
      countedEndISO < sem.endDate ? countedEndISO : sem.endDate
    );
    holidayMins = holidayMinutes(c.sessions, holidays);
    holidayLectures = holidayLectureCount(c.sessions, holidays);
  }
  const total = Math.max(1, rawTotal - holidayMins);

  // Separate: full absences and tardies. Excused absences COUNT toward the
  // limit (CUA unified regulation Art. 14–15: denial is by attendance %; an
  // accepted excuse lets the college lift a denial, it doesn't erase the
  // absence), so they're tallied separately only to show "X% of it excused".
  const rule = resolveTardinessRule(sem);
  let missed = 0;
  let excused = 0;
  const tardies: { minutesLate: number; sessionMinutes: number }[] = [];

  for (const m of c.missedSessions ?? []) {
    const mins = Number(m.minutes) || 0;
    if (m.tardiness && m.tardiness > 0) {
      tardies.push({ minutesLate: m.tardiness, sessionMinutes: mins });
    } else {
      missed += mins;
      if (m.excused) excused += mins;
    }
  }

  const tardinessAbsence = tardinessToAbsenceMinutes(tardies, rule);
  missed += tardinessAbsence;

  // ── By-hour figures (duration-based; always computed for the detail stats) ──
  const unitHour = (100 / total) * 60;
  const absenceHour = Math.min(100, (missed / total) * 100);
  const unexcusedHour = Math.min(100, ((missed - excused) / total) * 100);
  const minutesLeft = (capPct: number, used: number) => (capPct / 100) * total - used;
  let hoursRemainingHour = Math.max(0, minutesLeft(limit, limitIsUnexcused ? missed - excused : missed) / 60);
  if (secondUnexcused != null) hoursRemainingHour = Math.min(hoursRemainingHour, Math.max(0, minutesLeft(secondUnexcused, missed - excused) / 60));

  // ── By-lecture figures — each logged full absence is ONE lecture, reusing the
  // same absence data; tardies aren't full absences so they're left out. The
  // per-lecture % is auto (an equal share of 100) unless the student pinned
  // their professor's own value.
  const sessionsPerWeek = c.sessions.length;
  const totalLectures = Math.max(1, sessionsPerWeek * weeks - holidayLectures);
  let missedLectures = 0;
  let excusedLectures = 0;
  for (const m of c.missedSessions ?? []) {
    if (m.tardiness && m.tardiness > 0) continue;
    missedLectures++;
    if (m.excused) excusedLectures++;
  }
  const perLecture =
    c.perLecturePct && c.perLecturePct > 0 ? c.perLecturePct : 100 / totalLectures;
  const absenceLecture = Math.min(100, missedLectures * perLecture);
  const unexcusedLecture = Math.min(100, (missedLectures - excusedLectures) * perLecture);
  // Most absences that stay AT or under the limit — denial is only above it
  // (CUA Art. 14: "إذا قلّت نسبة حضوره عن" the required %). Mirrors the tool.
  // Where reaching the limit is itself a denial ("20% or more"), the last
  // allowed absence is the one before it.
  const allowedLectures = (capPct: number) =>
    lr.inclusive ? Math.ceil(capPct / perLecture - LIMIT_EPS) - 1 : Math.floor(capPct / perLecture + LIMIT_EPS);
  const lecturesLeft = (capPct: number, used: number) => Math.max(0, allowedLectures(capPct) - used);
  let lecturesRemaining = lecturesLeft(limit, limitIsUnexcused ? missedLectures - excusedLectures : missedLectures);
  if (secondUnexcused != null) lecturesRemaining = Math.min(lecturesRemaining, lecturesLeft(secondUnexcused, missedLectures - excusedLectures));

  // ── Active method drives the حرمان-critical numbers; the other set stays as
  // truthful context on the detail page. Undefined mode = the historical "hour".
  const mode: "hour" | "lecture" = c.attendanceMode === "lecture" ? "lecture" : "hour";
  const totalAbsence = mode === "lecture" ? absenceLecture : absenceHour;
  const unexcusedAbsence = mode === "lecture" ? unexcusedLecture : unexcusedHour;
  // The figure compared with the main limit: all absence, or only the
  // unexcused part where excused absence doesn't count.
  const absence = limitIsUnexcused ? unexcusedAbsence : totalAbsence;
  const unit = mode === "lecture" ? perLecture : unitHour;
  const rate = 100 - totalAbsence;
  const excusedPct =
    mode === "lecture" ? excusedLectures * perLecture : (excused / total) * 100;
  // Float tolerance: 15 of 60 lectures is 25.000000000000004%, not over 25.
  const over = (v: number, cap: number) => (lr.inclusive ? v >= cap - LIMIT_EPS : v > cap + LIMIT_EPS);
  const on = (v: number, cap: number) => !over(v, cap) && v >= cap - LIMIT_EPS;
  const near = (v: number, cap: number) => v >= APPROACHING_FRACTION * cap;
  const overLimit = limitKnown && (over(absence, limit) || (secondUnexcused != null && over(unexcusedAbsence, secondUnexcused)));
  const atLimit = limitKnown && !overLimit && (on(absence, limit) || (secondUnexcused != null && on(unexcusedAbsence, secondUnexcused)));
  const warned = lr.warnings.length > 0 && absence >= Math.min(...lr.warnings) - LIMIT_EPS;
  const approachingNow = near(absence, limit) || (secondUnexcused != null && near(unexcusedAbsence, secondUnexcused)) || warned;
  const status: "ok" | "warn" | "danger" = !limitKnown
    ? "ok"
    : overLimit
      ? "danger"
      : atLimit || approachingNow
        ? "warn"
        : "ok";
  const hoursRemaining = !limitKnown
    ? 0
    : mode === "lecture"
      ? (lecturesRemaining * (total / totalLectures)) / 60
      : hoursRemainingHour;
  const nextWarning = [...lr.warnings].sort((a, b) => a - b).find((w) => w > absence + LIMIT_EPS) ?? null;

  return {
    weeks,
    mode,
    unit,
    absence,
    rate,
    limit,
    status,
    atLimit,
    totalMinutes: total,
    missedMinutes: missed,
    excusedMinutes: excused,
    excusedPct,
    tardinessMinutes: tardinessAbsence,
    holidayMinutesOff: holidayMins,
    hoursRemaining,
    totalLectures,
    missedLectures,
    lecturesRemaining: limitKnown ? lecturesRemaining : 0,
    limitKnown,
    ruleSource: lr.source,
    limitIsUnexcused,
    unexcusedAbsence,
    unexcusedLimit: secondUnexcused,
    nextWarning,
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
  // The scheme's own pass mark (60 in KSA, 54 for the Jordan estimates…), not
  // a hardcoded 60 — and failing bands that still carry points (Jordan's D-)
  // are never offered as a goal.
  const pass = passMark(scheme);
  let ceiling: { letter: string; raw: number } | null = null;
  for (const s of scheme.bands) {
    if (s.min < pass) continue;
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
    avoidFraw: Math.max(0, Math.ceil(need(pass) * final.total)),
    passesAtZero: pctIfZero >= pass,
    securedLetter: bandForPct(scheme, pctIfZero).letter,
  };
}
