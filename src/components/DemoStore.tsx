"use client";

import { ReactNode, useCallback, useMemo, useState } from "react";
import { StoreContext, type StoreValue } from "@/store";
import type {
  AppData,
  Course,
  CourseSession,
  GradeComponent,
  MissedEntry,
  PlannerData,
  PlannerNote,
  Semester,
} from "@/types";

// A fully self-contained, interactive copy of the store used ONLY by the demo
// modal. It renders the REAL app pages, but every mutation stays in local React
// state — nothing is ever written to the user's cloud data. Seeded with a rich,
// realistic mid-semester snapshot so a new visitor sees what a fully-used Haven
// looks like: several courses with grade items, upcoming exams/tasks, weekly
// timetable classes, logged absences, and planner notes.

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** ISO date `days` from today (negative = past), so upcoming items really are
 *  upcoming against the visitor's real clock. */
function dayOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const session = (day: number, minutes: number, time: string, building: string, room: string): CourseSession => ({
  id: uid(),
  day,
  minutes,
  time,
  building,
  room,
  notes: [],
});

const absence = (day: number, minutes: number): MissedEntry => ({ id: uid(), day, minutes });

function demoCourses(): Course[] {
  return [
    {
      id: uid(),
      name: "Calculus I",
      creditHours: 4,
      sessions: [session(0, 120, "08:00", "B24", "105"), session(2, 120, "08:00", "B24", "105")],
      missedLectures: 0,
      missedSessions: [absence(0, 120), absence(2, 120)],
      components: [
        { id: uid(), name: "Quiz 1", type: "quiz", weight: 10, unit: "percent", total: 10, score: 9, date: dayOffset(-24) },
        { id: uid(), name: "Midterm", type: "midterm", weight: 30, unit: "percent", total: 40, score: 35, date: dayOffset(-12) },
        { id: uid(), name: "Assignments", type: "assignment", weight: 20, unit: "percent", total: 20, score: 18, date: null },
        { id: uid(), name: "Quiz 2", type: "quiz", weight: 10, unit: "percent", total: 10, score: null, date: dayOffset(3) },
        { id: uid(), name: "Final Exam", type: "final", weight: 30, unit: "percent", total: 60, score: null, date: dayOffset(18) },
      ],
    },
    {
      id: uid(),
      name: "Physics II",
      creditHours: 3,
      sessions: [session(0, 60, "10:00", "B12", "7"), session(1, 60, "10:00", "B12", "7"), session(3, 90, "11:00", "B12", "7")],
      missedLectures: 0,
      missedSessions: [absence(0, 60), absence(1, 60), absence(3, 90), absence(0, 60)],
      components: [
        { id: uid(), name: "Quiz 1", type: "quiz", weight: 10, unit: "percent", total: 10, score: 7, date: dayOffset(-26) },
        { id: uid(), name: "Midterm", type: "midterm", weight: 30, unit: "percent", total: 30, score: 24, date: dayOffset(-15) },
        { id: uid(), name: "Lab Report", type: "assignment", weight: 15, unit: "percent", total: 15, score: null, date: dayOffset(5) },
        { id: uid(), name: "Final Exam", type: "final", weight: 35, unit: "percent", total: 50, score: null, date: dayOffset(21) },
      ],
    },
    {
      id: uid(),
      name: "Programming",
      creditHours: 3,
      sessions: [session(0, 120, "09:00", "CS", "Lab 1"), session(4, 60, "13:00", "CS", "Lab 1")],
      missedLectures: 0,
      missedSessions: [],
      components: [
        { id: uid(), name: "Project 1", type: "project", weight: 25, unit: "percent", total: 25, score: 24, date: dayOffset(-20) },
        { id: uid(), name: "Midterm", type: "midterm", weight: 25, unit: "percent", total: 25, score: 23, date: dayOffset(-9) },
        { id: uid(), name: "Project 2", type: "project", weight: 20, unit: "percent", total: 20, score: null, date: dayOffset(7) },
        { id: uid(), name: "Final Exam", type: "final", weight: 30, unit: "percent", total: 40, score: null, date: dayOffset(24) },
      ],
    },
    {
      id: uid(),
      name: "English",
      creditHours: 2,
      sessions: [session(1, 120, "13:00", "A3", "2"), session(3, 60, "13:00", "A3", "2")],
      missedLectures: 0,
      missedSessions: [absence(1, 120), absence(3, 60), absence(1, 120)],
      components: [
        { id: uid(), name: "Essay 1", type: "assignment", weight: 20, unit: "percent", total: 20, score: 16, date: dayOffset(-22) },
        { id: uid(), name: "Midterm", type: "midterm", weight: 30, unit: "percent", total: 30, score: 22, date: dayOffset(-11) },
        { id: uid(), name: "Presentation", type: "project", weight: 20, unit: "percent", total: 20, score: null, date: dayOffset(2) },
        { id: uid(), name: "Final Exam", type: "final", weight: 30, unit: "percent", total: 40, score: null, date: dayOffset(27) },
      ],
    },
    {
      id: uid(),
      name: "Statistics",
      creditHours: 3,
      sessions: [session(2, 90, "12:00", "B7", "14"), session(4, 90, "10:00", "B7", "14")],
      missedLectures: 0,
      missedSessions: [absence(2, 90)],
      components: [
        { id: uid(), name: "Quiz 1", type: "quiz", weight: 15, unit: "percent", total: 15, score: 14, date: dayOffset(-18) },
        { id: uid(), name: "Midterm", type: "midterm", weight: 30, unit: "percent", total: 30, score: 27, date: dayOffset(-6) },
        { id: uid(), name: "Homework", type: "assignment", weight: 15, unit: "percent", total: 15, score: null, date: dayOffset(4) },
        { id: uid(), name: "Final Exam", type: "final", weight: 40, unit: "percent", total: 50, score: null, date: dayOffset(23) },
      ],
    },
  ];
}

const noteColors: Record<string, string> = {
  tagExam: "#d9534f",
  tagQuiz: "#e89b4a",
  tagAssignment: "#477680",
  tagDeadline: "#b8975a",
  tagHoliday: "#5fa98c",
};

function demoPlanner(): PlannerData {
  const note = (
    week: number,
    day: number | undefined,
    text: string,
    tag?: string,
    done = false,
    dueTime: string | null = null
  ): PlannerNote => ({
    id: uid(),
    week,
    day,
    text,
    tag,
    color: (tag && noteColors[tag]) || "#477680",
    done,
    dueTime,
  });

  // Place a chip on a real near-future date by mapping the offset back to its
  // (1-based week, weekday) — so it lands in the Planner AND shows up as an
  // upcoming deadline on the dashboard, exactly like a user-added one.
  const start = new Date(`${demoSemester.startDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soon = (offsetDays: number, text: string, tag: string, dueTime: string | null = null): PlannerNote => {
    const target = new Date(today);
    target.setDate(target.getDate() + offsetDays);
    const daysSince = Math.round((+target - +start) / 86400000);
    const week = Math.floor(daysSince / 7) + 1;
    return note(week, target.getDay(), text, tag, false, dueTime);
  };

  return {
    notes: [
      note(1, 0, "Review chapter 4", "tagQuiz"),
      note(1, 2, "Submit lab report", "tagAssignment"),
      note(1, undefined, "Group study — library", undefined),
      note(2, 3, "Presentation prep", "tagDeadline"),
      note(2, 1, "Physics past papers", "tagExam", true),
      // Near-future deadlines (one timed) — these surface in Upcoming.
      soon(2, "Submit CS project", "tagDeadline", "20:00"),
      soon(1, "Statistics quiz", "tagQuiz", "09:30"),
    ],
    strokes: [],
    highlights: [],
    autoEdits: {},
  };
}

const demoSemester: Semester = {
  name: "Demo Semester",
  startDate: dayOffset(-63), // ~9 weeks ago
  endDate: dayOffset(42), // ~6 weeks ahead
  calendarType: "gregorian",
  gradingSystem: "saudi5",
  weeks: 13,
  finalsWeeks: 2,
  withdrawalLimit: 25,
};

function buildInitialData(): AppData {
  return {
    profileName: "Sara",
    email: "sara@example.com",
    profilePhoto: null,
    gpaGoal: 4.75,
    language: "en",
    theme: "haven",
    semester: demoSemester,
    courses: demoCourses(),
    planner: demoPlanner(),
    taskOrder: [],
    reminderDays: 2,
    gpaMode: "semester",
    cumulativeGpa: 4.62,
    cumulativeHours: 52,
  };
}

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(buildInitialData);

  const patch = useCallback((p: Partial<AppData>) => setData((d) => ({ ...d, ...p })), []);
  const mapCourses = useCallback(
    (fn: (c: Course) => Course) => setData((d) => ({ ...d, courses: d.courses.map(fn) })),
    []
  );

  const value = useMemo<StoreValue>(() => {
    const inCourse = (id: string, fn: (c: Course) => Course) => (c: Course) => (c.id === id ? fn(c) : c);

    return {
      ...data,
      hydrated: true,

      setProfileName: (name) => patch({ profileName: name }),
      setEmail: (email) => patch({ email }),
      setProfilePhoto: (profilePhoto) => patch({ profilePhoto }),
      setGpaGoal: (gpaGoal) => patch({ gpaGoal }),

      addPlannerNote: (note) =>
        setData((d) => ({
          ...d,
          planner: {
            ...d.planner,
            notes: [...d.planner.notes, { ...note, id: uid() }],
          },
        })),
      updatePlannerNote: (id, np) =>
        setData((d) => ({
          ...d,
          planner: {
            ...d.planner,
            notes: d.planner.notes.map((n) =>
              n.id === id
                ? { ...n, ...np, ...(np.tag !== undefined ? { color: (np.tag && noteColors[np.tag]) || "#477680" } : {}) }
                : n
            ),
          },
        })),
      deletePlannerNote: (id) =>
        setData((d) => ({ ...d, planner: { ...d.planner, notes: d.planner.notes.filter((n) => n.id !== id) } })),
      setPlannerAutoEdit: (id, ap) =>
        setData((d) => ({
          ...d,
          planner: {
            ...d.planner,
            autoEdits: { ...(d.planner.autoEdits ?? {}), [id]: { ...(d.planner.autoEdits?.[id] ?? {}), ...ap } },
          },
        })),

      setLanguage: (language) => patch({ language }),
      setTheme: (theme) => patch({ theme }),
      setTaskOrder: (taskOrder) => patch({ taskOrder }),
      setReminderDays: (reminderDays) => patch({ reminderDays }),
      setGpaMode: (gpaMode) => patch({ gpaMode }),
      setCumulativeGpa: (cumulativeGpa) => patch({ cumulativeGpa }),
      setCumulativeHours: (cumulativeHours) => patch({ cumulativeHours }),
      setSemester: (sp) => setData((d) => ({ ...d, semester: { ...d.semester, ...sp } })),

      addCourse: (course) =>
        setData((d) => ({
          ...d,
          courses: [
            ...d.courses,
            {
              id: uid(),
              name: course.name,
              creditHours: course.creditHours,
              attendanceLimit: course.attendanceLimit,
              sessions: [],
              missedLectures: 0,
              missedSessions: [],
              components: [],
            },
          ],
        })),
      updateCourse: (id, cp) => mapCourses(inCourse(id, (c) => ({ ...c, ...cp }))),
      deleteCourse: (id) => setData((d) => ({ ...d, courses: d.courses.filter((c) => c.id !== id) })),

      addComponent: (courseId, comp) =>
        mapCourses(inCourse(courseId, (c) => ({ ...c, components: [...c.components, { ...comp, id: uid() } as GradeComponent] }))),
      updateComponent: (courseId, componentId, cp) =>
        mapCourses(
          inCourse(courseId, (c) => ({
            ...c,
            components: c.components.map((x) => (x.id === componentId ? { ...x, ...cp } : x)),
          }))
        ),
      deleteComponent: (courseId, componentId) =>
        mapCourses(inCourse(courseId, (c) => ({ ...c, components: c.components.filter((x) => x.id !== componentId) }))),

      addSession: (courseId, s) =>
        mapCourses(inCourse(courseId, (c) => ({ ...c, sessions: [...c.sessions, { ...s, id: uid(), notes: s.notes ?? [] }] }))),
      updateSession: (courseId, sessionId, sp) =>
        mapCourses(
          inCourse(courseId, (c) => ({
            ...c,
            sessions: c.sessions.map((s) => (s.id === sessionId ? { ...s, ...sp } : s)),
          }))
        ),
      deleteSession: (courseId, sessionId) =>
        mapCourses(inCourse(courseId, (c) => ({ ...c, sessions: c.sessions.filter((s) => s.id !== sessionId) }))),

      setMissedLectures: (courseId, missed) =>
        mapCourses(inCourse(courseId, (c) => ({ ...c, missedLectures: Math.max(0, missed) }))),
      addMissedSession: (courseId, sessionId) =>
        mapCourses(
          inCourse(courseId, (c) => {
            const s = c.sessions.find((x) => x.id === sessionId);
            if (!s) return c;
            return { ...c, missedSessions: [...c.missedSessions, { id: uid(), sessionId, day: s.day, minutes: s.minutes }] };
          })
        ),
      removeMissedSession: (courseId, missedId) =>
        mapCourses(inCourse(courseId, (c) => ({ ...c, missedSessions: c.missedSessions.filter((m) => m.id !== missedId) }))),

      loadDemo: () => {},
      resetData: () => {},
    };
  }, [data, patch, mapCourses]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
