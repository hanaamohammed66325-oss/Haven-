import type { Course, Semester } from "@/types";

/** absence below this is "approaching" the limit; at/above the withdrawal limit is danger */
export const APPROACHING_ABSENCE = 18;

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

// Semester GPA = Σ(points × credits) / Σ(credits)
export function semesterGPA(courses: Course[]): number | null {
  let n = 0,
    d = 0;
  courses.forEach((c) => {
    const p = courseCurrentPct(c);
    if (p == null) return;
    n += pctToGrade(p).points * c.creditHours;
    d += c.creditHours;
  });
  return d ? n / d : null;
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
  const limit = sem && sem.withdrawalLimit > 0 ? sem.withdrawalLimit : 25;

  const total = minutesPerWeek(c) * weeks; // total contact minutes for the term
  if (!total) return null;

  const missed = (c.missedSessions ?? []).reduce(
    (sum, m) => sum + (Number(m.minutes) || 0),
    0
  );

  const unit = (100 / total) * 60; // percent per hour
  const absence = Math.min(100, (missed / total) * 100);
  const rate = 100 - absence;
  const status: "ok" | "warn" | "danger" =
    absence >= limit ? "danger" : absence >= APPROACHING_ABSENCE ? "warn" : "ok";

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
