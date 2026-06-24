"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import type {
  AppData,
  Course,
  CourseSession,
  GradeComponent,
  PlannerData,
  Semester,
  ThemeId,
} from "@/types";
import { demoCourses } from "@/lib/demo";

const STORAGE_KEY = "haven-data";

const THEME_IDS: ThemeId[] = [
  "haven",
  "midnight",
  "rose",
  "lavender",
  "sand",
  "forest",
  "ocean",
  "mono",
];

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const defaultSemester: Semester = {
  name: "Current Semester",
  startDate: "2026-04-19",
  endDate: "2026-08-09",
  calendarType: "gregorian",
  gradingSystem: "saudi5",
  weeks: 15,
  finalsWeeks: 2,
  withdrawalLimit: 25,
};

const emptyPlanner: PlannerData = { notes: [], strokes: [], highlights: [] };

const initialData: AppData = {
  profileName: "Student",
  email: "",
  profilePhoto: null,
  gpaGoal: 4.5,
  language: "en",
  theme: "haven",
  semester: defaultSemester,
  courses: [],
  planner: emptyPlanner,
  taskOrder: [],
};

function normalizePlanner(p: unknown): PlannerData {
  const pl = (p ?? {}) as Partial<PlannerData>;
  return {
    notes: Array.isArray(pl.notes) ? pl.notes : [],
    strokes: Array.isArray(pl.strokes) ? pl.strokes : [],
    highlights: Array.isArray(pl.highlights) ? pl.highlights : [],
  };
}

// Bring courses saved under older shapes up to the current model.
function normalizeCourse(c: Partial<Course>): Course {
  const rawSessions = Array.isArray(c.sessions) ? c.sessions : [];
  const sessions: CourseSession[] = rawSessions.map((s) => {
    const sess = s as Partial<CourseSession> & { hours?: number };
    return {
      id: sess.id ?? uid(),
      day: Number(sess.day) || 0,
      // migrate legacy `hours` → minutes
      minutes:
        sess.minutes != null
          ? Number(sess.minutes) || 0
          : sess.hours != null
          ? (Number(sess.hours) || 0) * 60
          : 60,
      // optional timetable details — preserve when present
      ...(sess.time ? { time: String(sess.time) } : {}),
      ...(sess.building ? { building: String(sess.building) } : {}),
      ...(sess.room ? { room: String(sess.room) } : {}),
      ...(sess.note ? { note: String(sess.note) } : {}),
    };
  });
  return {
    id: (c.id as string) ?? uid(),
    name: (c.name as string) ?? "",
    creditHours: Number(c.creditHours) || 0,
    sessions,
    missedLectures: Number(c.missedLectures) || 0,
    missedSessions: Array.isArray(c.missedSessions) ? c.missedSessions : [],
    components: Array.isArray(c.components) ? (c.components as GradeComponent[]) : [],
  };
}

interface StoreValue extends AppData {
  hydrated: boolean;
  setProfileName: (name: string) => void;
  setEmail: (email: string) => void;
  setProfilePhoto: (photo: string | null) => void;
  setGpaGoal: (goal: number) => void;
  setPlanner: (planner: PlannerData) => void;
  setLanguage: (lang: "en" | "ar") => void;
  setTheme: (theme: ThemeId) => void;
  setTaskOrder: (order: string[]) => void;
  setSemester: (patch: Partial<Semester>) => void;
  addCourse: (course: { name: string; creditHours: number }) => void;
  updateCourse: (
    id: string,
    data: Partial<Omit<Course, "id" | "components">>
  ) => void;
  deleteCourse: (id: string) => void;
  addComponent: (
    courseId: string,
    component: Omit<GradeComponent, "id">
  ) => void;
  updateComponent: (
    courseId: string,
    componentId: string,
    data: Partial<Omit<GradeComponent, "id">>
  ) => void;
  deleteComponent: (courseId: string, componentId: string) => void;
  addSession: (courseId: string, session: Omit<CourseSession, "id">) => void;
  updateSession: (
    courseId: string,
    sessionId: string,
    data: Partial<Omit<CourseSession, "id">>
  ) => void;
  deleteSession: (courseId: string, sessionId: string) => void;
  setMissedLectures: (courseId: string, missed: number) => void;
  addMissedSession: (courseId: string, sessionId: string) => void;
  removeMissedSession: (courseId: string, missedId: string) => void;
  loadDemo: () => void;
  resetData: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(initialData);
  const [hydrated, setHydrated] = useState(false);

  // Load saved data once after mount (never during render / on the server)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppData>;
        setData({
          ...initialData,
          ...parsed,
          theme: THEME_IDS.includes(parsed.theme as ThemeId)
            ? (parsed.theme as ThemeId)
            : "haven",
          taskOrder: Array.isArray(parsed.taskOrder) ? parsed.taskOrder : [],
          semester: { ...defaultSemester, ...(parsed.semester ?? {}) },
          courses: Array.isArray(parsed.courses)
            ? parsed.courses.map((c) => normalizeCourse(c))
            : [],
          planner: normalizePlanner(parsed.planner),
        });
      }
    } catch {
      // corrupt storage — ignore and keep defaults
    }
    setHydrated(true);
  }, []);

  // Persist on change (only after hydration so we don't overwrite saved data)
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage full / unavailable — ignore
    }
  }, [data, hydrated]);

  // Reflect the active theme onto <html> so CSS variables cascade everywhere
  // (including modals portaled to <body>).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", data.theme);
  }, [data.theme]);

  const setProfileName = useCallback(
    (name: string) => setData((d) => ({ ...d, profileName: name })),
    []
  );

  const setEmail = useCallback(
    (email: string) => setData((d) => ({ ...d, email })),
    []
  );

  const setProfilePhoto = useCallback(
    (photo: string | null) => setData((d) => ({ ...d, profilePhoto: photo })),
    []
  );

  const setGpaGoal = useCallback(
    (goal: number) => setData((d) => ({ ...d, gpaGoal: goal })),
    []
  );

  const setPlanner = useCallback(
    (planner: PlannerData) => setData((d) => ({ ...d, planner })),
    []
  );

  const setLanguage = useCallback(
    (lang: "en" | "ar") => setData((d) => ({ ...d, language: lang })),
    []
  );

  const setTheme = useCallback(
    (theme: ThemeId) => setData((d) => ({ ...d, theme })),
    []
  );

  const setTaskOrder = useCallback(
    (order: string[]) => setData((d) => ({ ...d, taskOrder: order })),
    []
  );

  const setSemester = useCallback(
    (patch: Partial<Semester>) =>
      setData((d) => ({ ...d, semester: { ...d.semester, ...patch } })),
    []
  );

  const addCourse = useCallback(
    (course: { name: string; creditHours: number }) =>
      setData((d) => ({
        ...d,
        courses: [
          ...d.courses,
          {
            id: uid(),
            name: course.name,
            creditHours: course.creditHours,
            sessions: [],
            missedLectures: 0,
            missedSessions: [],
            components: [],
          },
        ],
      })),
    []
  );

  const updateCourse = useCallback(
    (id: string, patch: Partial<Omit<Course, "id" | "components">>) =>
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),
    []
  );

  const deleteCourse = useCallback(
    (id: string) =>
      setData((d) => ({
        ...d,
        courses: d.courses.filter((c) => c.id !== id),
      })),
    []
  );

  const addComponent = useCallback(
    (courseId: string, component: Omit<GradeComponent, "id">) =>
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? { ...c, components: [...c.components, { ...component, id: uid() }] }
            : c
        ),
      })),
    []
  );

  const updateComponent = useCallback(
    (
      courseId: string,
      componentId: string,
      patch: Partial<Omit<GradeComponent, "id">>
    ) =>
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? {
                ...c,
                components: c.components.map((comp) =>
                  comp.id === componentId ? { ...comp, ...patch } : comp
                ),
              }
            : c
        ),
      })),
    []
  );

  const deleteComponent = useCallback(
    (courseId: string, componentId: string) =>
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? {
                ...c,
                components: c.components.filter((comp) => comp.id !== componentId),
              }
            : c
        ),
      })),
    []
  );

  const addSession = useCallback(
    (courseId: string, session: Omit<CourseSession, "id">) =>
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? { ...c, sessions: [...c.sessions, { ...session, id: uid() }] }
            : c
        ),
      })),
    []
  );

  const updateSession = useCallback(
    (courseId: string, sessionId: string, patch: Partial<Omit<CourseSession, "id">>) =>
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? {
                ...c,
                sessions: c.sessions.map((s) =>
                  s.id === sessionId ? { ...s, ...patch } : s
                ),
              }
            : c
        ),
      })),
    []
  );

  const deleteSession = useCallback(
    (courseId: string, sessionId: string) =>
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? {
                ...c,
                sessions: c.sessions.filter((s) => s.id !== sessionId),
                missedSessions: c.missedSessions.filter((m) => m.sessionId !== sessionId),
              }
            : c
        ),
      })),
    []
  );

  const setMissedLectures = useCallback(
    (courseId: string, missed: number) =>
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId ? { ...c, missedLectures: Math.max(0, missed) } : c
        ),
      })),
    []
  );

  const addMissedSession = useCallback(
    (courseId: string, sessionId: string) =>
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? { ...c, missedSessions: [...c.missedSessions, { id: uid(), sessionId }] }
            : c
        ),
      })),
    []
  );

  const removeMissedSession = useCallback(
    (courseId: string, missedId: string) =>
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? { ...c, missedSessions: c.missedSessions.filter((m) => m.id !== missedId) }
            : c
        ),
      })),
    []
  );

  const loadDemo = useCallback(
    () =>
      setData((d) => ({
        ...d,
        courses: demoCourses(),
      })),
    []
  );

  const resetData = useCallback(
    () =>
      setData((d) => ({
        ...initialData,
        language: d.language,
        theme: d.theme,
        profileName: d.profileName,
        email: d.email,
        profilePhoto: d.profilePhoto,
        gpaGoal: d.gpaGoal,
        semester: d.semester,
      })),
    []
  );

  const value: StoreValue = {
    ...data,
    hydrated,
    setProfileName,
    setEmail,
    setProfilePhoto,
    setGpaGoal,
    setPlanner,
    setLanguage,
    setTheme,
    setTaskOrder,
    setSemester,
    addCourse,
    updateCourse,
    deleteCourse,
    addComponent,
    updateComponent,
    deleteComponent,
    addSession,
    updateSession,
    deleteSession,
    setMissedLectures,
    addMissedSession,
    removeMissedSession,
    loadDemo,
    resetData,
  };

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
