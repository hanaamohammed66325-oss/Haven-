import type { Course, Semester } from "@/types";

/** Status thresholds scale with each course's own limit: "approaching" starts at
 *  70% of the limit, "withdrawal risk" at the limit itself. */
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
}

// Duration-based absence: every session and every logged absence is weighted by its real length
// in minutes, so a 2-hour class counts twice a 1-hour one. Compared against the withdrawal limit.
export function attendanceInfo(c: Course, sem?: Semester): AttendanceInfo | null {
  const weeks = Math.max(1, Math.round(sem?.weeks ?? 15) || 15);
  // Per-course withdrawal limit; thresholds scale with it so any university /
  // college (25% standard, 20% health colleges, …) works automatically.
  const limit = courseLimit(c, sem);
  const approaching = APPROACHING_FRACTION * limit;

  const total = minutesPerWeek(c) * weeks; // total contact minutes for the term
  if (!total) return null;

  const missed = (c.missedSessions ?? []).reduce(
    (sum, m) => sum + (Number(m.minutes) || 0),
    0
  );

  const unit = (100 / total) * 60; // percent per hour — same minutes-based total
  const absence = Math.min(100, (missed / total) * 100);
  const rate = 100 - absence;
  const status: "ok" | "warn" | "danger" =
    absence >= limit ? "danger" : absence >= approaching ? "warn" : "ok";

  return { weeks, unit, absence, rate, limit, status };
}

// Total weeks computed from the semester start/end dates.
export function weeksFromDates(sem: Semester): number {
  const start = +new Date(sem.startDate);
  const end = +new Date(sem.endDate);
  if (!start || !end || end <= start) return 15;
  return Math.max(1, Math.round((end - start) / (7 * 864e5)));
}

// Semester progress from start/end dates
export function semesterProgress(sem: Semester) {
  const start = +new Date(sem.startDate),
    end = +new Date(sem.endDate),
    now = Date.now(),
    wk = 7 * 864e5;
  return {
    pct: Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100)),
    totalWeeks: Math.max(1, Math.round((end - start) / wk)),
    currentWeek: Math.max(
      1,
      Math.min(
        Math.round((end - start) / wk),
        Math.ceil((now - start) / wk)
      )
    ),
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
