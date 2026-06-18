import type { Course, Semester } from "@/types";

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

// Attendance: warn ≥18% absence (approaching), danger ≥25% (withdrawal/"حرمان" limit)
export function attendanceInfo(c: Course) {
  if (!c.totalLectures) return null;
  const rate = (c.attendedLectures / c.totalLectures) * 100,
    absence = 100 - rate;
  return {
    rate,
    absence,
    status: absence >= 25 ? "danger" : absence >= 18 ? "warn" : "ok",
  } as { rate: number; absence: number; status: "ok" | "warn" | "danger" };
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
