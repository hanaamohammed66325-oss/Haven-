import type { Course, CourseSession, MissedEntry } from "@/types";

function id(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Build weekly sessions (day 0=Sun..6=Sat, hours) and a few logged absences
// referencing them, so both counting methods show realistic numbers.
function withAttendance(
  defs: { day: number; minutes: number }[],
  missedLectures: number,
  missedSessionIndexes: number[]
): { sessions: CourseSession[]; missedLectures: number; missedSessions: MissedEntry[] } {
  const sessions: CourseSession[] = defs.map((d) => ({ id: id(), day: d.day, minutes: d.minutes }));
  const missedSessions: MissedEntry[] = missedSessionIndexes.map((i) => ({
    id: id(),
    sessionId: sessions[i].id,
  }));
  return { sessions, missedLectures, missedSessions };
}

// A realistic mid-semester snapshot used by the "Load demo data" button.
export function demoCourses(): Course[] {
  return [
    {
      id: id(),
      name: "Calculus I",
      creditHours: 4,
      // Sun 2h + Tue 2h → 2 lectures / 240 min per week
      ...withAttendance([{ day: 0, minutes: 120 }, { day: 2, minutes: 120 }], 3, [0, 1, 0]),
      components: [
        { id: id(), name: "Quiz 1", type: "quiz", weight: 10, unit: "percent", total: 10, score: 9, date: "2026-05-05" },
        { id: id(), name: "Midterm", type: "midterm", weight: 30, unit: "percent", total: 40, score: 35, date: "2026-05-28" },
        { id: id(), name: "Assignments", type: "assignment", weight: 20, unit: "percent", total: 20, score: 18, date: null },
        { id: id(), name: "Final Exam", type: "final", weight: 40, unit: "percent", total: 60, score: null, date: "2026-07-20" },
      ],
    },
    {
      id: id(),
      name: "Physics II",
      creditHours: 3,
      // Sun 1h + Mon 1h + Wed 1.5h → 3 lectures / 210 min per week
      ...withAttendance([{ day: 0, minutes: 60 }, { day: 1, minutes: 60 }, { day: 3, minutes: 90 }], 9, [0, 1, 2, 0, 1]),
      components: [
        { id: id(), name: "Quiz 1", type: "quiz", weight: 10, unit: "percent", total: 10, score: 7, date: "2026-05-03" },
        { id: id(), name: "Quiz 2", type: "quiz", weight: 10, unit: "percent", total: 10, score: 8, date: "2026-06-10" },
        { id: id(), name: "Midterm", type: "midterm", weight: 30, unit: "percent", total: 30, score: 24, date: "2026-05-25" },
        { id: id(), name: "Lab Project", type: "project", weight: 15, unit: "percent", total: 15, score: 14, date: "2026-06-15" },
        { id: id(), name: "Final Exam", type: "final", weight: 35, unit: "percent", total: 50, score: null, date: "2026-07-22" },
      ],
    },
    {
      id: id(),
      name: "Programming",
      creditHours: 3,
      // Sun 2h + Thu 1h → 2 lectures / 180 min per week, perfect attendance
      ...withAttendance([{ day: 0, minutes: 120 }, { day: 4, minutes: 60 }], 0, []),
      components: [
        { id: id(), name: "Project 1", type: "project", weight: 25, unit: "percent", total: 25, score: 24, date: "2026-05-10" },
        { id: id(), name: "Midterm", type: "midterm", weight: 25, unit: "percent", total: 25, score: 23, date: "2026-05-30" },
        { id: id(), name: "Project 2", type: "project", weight: 20, unit: "percent", total: 20, score: null, date: "2026-06-28" },
        { id: id(), name: "Final Exam", type: "final", weight: 30, unit: "percent", total: 40, score: null, date: "2026-07-25" },
      ],
    },
    {
      id: id(),
      name: "English",
      creditHours: 2,
      // Mon 2h + Wed 1h → 2 lectures / 180 min per week, near the limit
      ...withAttendance([{ day: 1, minutes: 120 }, { day: 3, minutes: 60 }], 8, [0, 1, 0, 1]),
      components: [
        { id: id(), name: "Essay 1", type: "assignment", weight: 20, unit: "percent", total: 20, score: 16, date: "2026-05-08" },
        { id: id(), name: "Midterm", type: "midterm", weight: 30, unit: "percent", total: 30, score: 22, date: "2026-05-27" },
        { id: id(), name: "Presentation", type: "project", weight: 20, unit: "percent", total: 20, score: 17, date: "2026-06-18" },
        { id: id(), name: "Final Exam", type: "final", weight: 30, unit: "percent", total: 40, score: null, date: "2026-07-28" },
      ],
    },
  ];
}
