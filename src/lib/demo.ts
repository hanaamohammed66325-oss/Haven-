import type { Course } from "@/types";

function id(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// A realistic mid-semester snapshot used by the "Load demo data" button.
export function demoCourses(): Course[] {
  return [
    {
      id: id(),
      name: "Calculus I",
      creditHours: 4,
      attendedLectures: 27,
      totalLectures: 30,
      components: [
        { id: id(), name: "Quiz 1", type: "quiz", weight: 10, unit: "percent", total: 10, score: 9, date: null },
        { id: id(), name: "Midterm", type: "midterm", weight: 30, unit: "percent", total: 40, score: 35, date: null },
        { id: id(), name: "Assignments", type: "assignment", weight: 20, unit: "percent", total: 20, score: 18, date: null },
        { id: id(), name: "Final Exam", type: "final", weight: 40, unit: "percent", total: 60, score: null, date: null },
      ],
    },
    {
      id: id(),
      name: "Physics II",
      creditHours: 3,
      attendedLectures: 24,
      totalLectures: 30,
      components: [
        { id: id(), name: "Quiz 1", type: "quiz", weight: 10, unit: "percent", total: 10, score: 7, date: null },
        { id: id(), name: "Quiz 2", type: "quiz", weight: 10, unit: "percent", total: 10, score: 8, date: null },
        { id: id(), name: "Midterm", type: "midterm", weight: 30, unit: "percent", total: 30, score: 24, date: null },
        { id: id(), name: "Lab Project", type: "project", weight: 15, unit: "percent", total: 15, score: 14, date: null },
        { id: id(), name: "Final Exam", type: "final", weight: 35, unit: "percent", total: 50, score: null, date: null },
      ],
    },
    {
      id: id(),
      name: "Programming",
      creditHours: 3,
      attendedLectures: 30,
      totalLectures: 30,
      components: [
        { id: id(), name: "Project 1", type: "project", weight: 25, unit: "percent", total: 25, score: 24, date: null },
        { id: id(), name: "Midterm", type: "midterm", weight: 25, unit: "percent", total: 25, score: 23, date: null },
        { id: id(), name: "Project 2", type: "project", weight: 20, unit: "percent", total: 20, score: 19, date: null },
        { id: id(), name: "Final Exam", type: "final", weight: 30, unit: "percent", total: 40, score: null, date: null },
      ],
    },
    {
      id: id(),
      name: "English",
      creditHours: 2,
      attendedLectures: 22,
      totalLectures: 30,
      components: [
        { id: id(), name: "Essay 1", type: "assignment", weight: 20, unit: "percent", total: 20, score: 16, date: null },
        { id: id(), name: "Midterm", type: "midterm", weight: 30, unit: "percent", total: 30, score: 22, date: null },
        { id: id(), name: "Presentation", type: "project", weight: 20, unit: "percent", total: 20, score: 17, date: null },
        { id: id(), name: "Final Exam", type: "final", weight: 30, unit: "percent", total: 40, score: null, date: null },
      ],
    },
  ];
}
