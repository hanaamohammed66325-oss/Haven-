"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
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
import { getCurrentUser } from "@/lib/auth";
import * as db from "@/lib/db";

// localStorage now holds ONLY the non-cloud data: preferences (theme/language),
// profile, gpa goal, planner, task order, the semester *settings* the cloud
// schema doesn't cover (dates / calendar / withdrawal limit), and the per-course
// attendance layer (sessions + missed). Course identity (name/credits) and grade
// components live in Supabase — see src/lib/db.ts.
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

const emptyPlanner: PlannerData = { notes: [], strokes: [], highlights: [], autoEdits: {} };

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
    autoEdits: pl.autoEdits && typeof pl.autoEdits === "object" ? pl.autoEdits : {},
  };
}

/** Normalize only the local attendance layer of a course (sessions + missed).
 *  Name / credits / components come from the cloud, not from here. */
function normalizeCourseLocal(c: Partial<Course>): {
  sessions: CourseSession[];
  missedLectures: number;
  missedSessions: Course["missedSessions"];
} {
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
      ...(sess.time ? { time: String(sess.time) } : {}),
      ...(sess.building ? { building: String(sess.building) } : {}),
      ...(sess.room ? { room: String(sess.room) } : {}),
      notes: Array.isArray(sess.notes)
        ? sess.notes.filter((n): n is string => typeof n === "string")
        : sess.note
        ? [String(sess.note)]
        : [],
    };
  });
  return {
    sessions,
    missedLectures: Number(c.missedLectures) || 0,
    missedSessions: Array.isArray(c.missedSessions) ? c.missedSessions : [],
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

  // Cloud bookkeeping kept in refs so the (stable) callbacks below always see
  // the latest value without being re-created.
  const semesterIdRef = useRef<string | null>(null);
  const loggedInRef = useRef(false);
  const coursesRef = useRef<Course[]>([]);
  useEffect(() => {
    coursesRef.current = data.courses;
  }, [data.courses]);

  // Load once after mount: local preferences/attendance first, then cloud data.
  useEffect(() => {
    let cancelled = false;

    // 1. Read the local (non-cloud) layer.
    let local: Partial<AppData> = {};
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) local = JSON.parse(raw) as Partial<AppData>;
    } catch {
      // corrupt storage — ignore and keep defaults
    }

    const baseLocal: AppData = {
      ...initialData,
      ...local,
      theme: THEME_IDS.includes(local.theme as ThemeId)
        ? (local.theme as ThemeId)
        : "haven",
      taskOrder: Array.isArray(local.taskOrder) ? local.taskOrder : [],
      semester: { ...defaultSemester, ...(local.semester ?? {}) },
      planner: normalizePlanner(local.planner),
      courses: [], // filled from the cloud below
    };

    // Local attendance layer, keyed by course id, to merge onto cloud courses.
    const localLayer = new Map<string, ReturnType<typeof normalizeCourseLocal>>();
    if (Array.isArray(local.courses)) {
      for (const c of local.courses as Partial<Course>[]) {
        if (c && typeof c.id === "string") localLayer.set(c.id, normalizeCourseLocal(c));
      }
    }

    (async () => {
      const user = await getCurrentUser();
      loggedInRef.current = !!user;

      if (!user) {
        if (!cancelled) {
          setData(baseLocal);
          setHydrated(true);
        }
        return;
      }

      try {
        const sem = await db.ensureActiveSemester({
          name: baseLocal.semester.name,
          weeks: baseLocal.semester.weeks,
          finalsWeeks: baseLocal.semester.finalsWeeks,
        });
        semesterIdRef.current = sem.id;

        const cloudCourses = await db.getCourses(sem.id);
        const courses: Course[] = await Promise.all(
          cloudCourses.map(async (cc) => {
            const components = await db.getGradeComponents(cc.id);
            const layer = localLayer.get(cc.id) ?? {
              sessions: [],
              missedLectures: 0,
              missedSessions: [],
            };
            return {
              id: cc.id,
              name: cc.name,
              creditHours: cc.creditHours,
              sessions: layer.sessions,
              missedLectures: layer.missedLectures,
              missedSessions: layer.missedSessions,
              components,
            };
          })
        );

        if (!cancelled) {
          // Cloud is authoritative for the semester fields it stores.
          setData({
            ...baseLocal,
            semester: {
              ...baseLocal.semester,
              name: sem.name,
              weeks: sem.weeks,
              finalsWeeks: sem.finalsWeeks,
            },
            courses,
          });
          setHydrated(true);
        }
      } catch (e) {
        console.error("Haven: failed to load cloud data", e);
        if (!cancelled) {
          setData(baseLocal);
          setHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the local (non-cloud) layer on change, once hydrated. Course
  // identity and grade components are intentionally NOT written here — they
  // live in Supabase.
  useEffect(() => {
    if (!hydrated) return;
    try {
      const toSave = {
        profileName: data.profileName,
        email: data.email,
        profilePhoto: data.profilePhoto,
        gpaGoal: data.gpaGoal,
        language: data.language,
        theme: data.theme,
        taskOrder: data.taskOrder,
        planner: data.planner,
        semester: data.semester,
        courses: data.courses.map((c) => ({
          id: c.id,
          sessions: c.sessions,
          missedLectures: c.missedLectures,
          missedSessions: c.missedSessions,
        })),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // storage full / unavailable — ignore
    }
  }, [data, hydrated]);

  // Reflect the active theme onto <html> so CSS variables cascade everywhere.
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

  const setSemester = useCallback((patch: Partial<Semester>) => {
    setData((d) => ({ ...d, semester: { ...d.semester, ...patch } }));
    // Mirror the cloud-backed fields (name / weeks / finals) to Supabase.
    const id = semesterIdRef.current;
    if (loggedInRef.current && id) {
      const cloudPatch: Parameters<typeof db.updateSemester>[1] = {};
      if (patch.name !== undefined) cloudPatch.name = patch.name;
      if (patch.weeks !== undefined) cloudPatch.weeks = patch.weeks;
      if (patch.finalsWeeks !== undefined) cloudPatch.finalsWeeks = patch.finalsWeeks;
      if (Object.keys(cloudPatch).length) {
        db.updateSemester(id, cloudPatch).catch((e) =>
          console.error("Haven: failed to update semester", e)
        );
      }
    }
  }, []);

  const addCourse = useCallback(
    async (course: { name: string; creditHours: number }) => {
      if (!loggedInRef.current) return;
      try {
        let semesterId = semesterIdRef.current;
        if (!semesterId) {
          const sem = await db.ensureActiveSemester();
          semesterId = sem.id;
          semesterIdRef.current = sem.id;
        }
        const row = await db.addCourse(semesterId, {
          name: course.name,
          creditHours: course.creditHours,
          position: coursesRef.current.length,
        });
        setData((d) => ({
          ...d,
          courses: [
            ...d.courses,
            {
              id: row.id,
              name: row.name,
              creditHours: row.creditHours,
              sessions: [],
              missedLectures: 0,
              missedSessions: [],
              components: [],
            },
          ],
        }));
      } catch (e) {
        console.error("Haven: failed to add course", e);
      }
    },
    []
  );

  const updateCourse = useCallback(
    (id: string, patch: Partial<Omit<Course, "id" | "components">>) => {
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
      // Only name / credits live in the cloud; sessions & attendance stay local.
      if (loggedInRef.current && (patch.name !== undefined || patch.creditHours !== undefined)) {
        db.updateCourse(id, {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.creditHours !== undefined ? { creditHours: patch.creditHours } : {}),
        }).catch((e) => console.error("Haven: failed to update course", e));
      }
    },
    []
  );

  const deleteCourse = useCallback((id: string) => {
    setData((d) => ({ ...d, courses: d.courses.filter((c) => c.id !== id) }));
    if (loggedInRef.current) {
      db.deleteCourse(id).catch((e) => console.error("Haven: failed to delete course", e));
    }
  }, []);

  const addComponent = useCallback(
    async (courseId: string, component: Omit<GradeComponent, "id">) => {
      if (!loggedInRef.current) return;
      try {
        const row = await db.addGradeComponent(courseId, component);
        setData((d) => ({
          ...d,
          courses: d.courses.map((c) =>
            c.id === courseId ? { ...c, components: [...c.components, row] } : c
          ),
        }));
      } catch (e) {
        console.error("Haven: failed to add grade component", e);
      }
    },
    []
  );

  const updateComponent = useCallback(
    (
      courseId: string,
      componentId: string,
      patch: Partial<Omit<GradeComponent, "id">>
    ) => {
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
      }));
      if (loggedInRef.current) {
        db.updateGradeComponent(componentId, patch).catch((e) =>
          console.error("Haven: failed to update grade component", e)
        );
      }
    },
    []
  );

  const deleteComponent = useCallback((courseId: string, componentId: string) => {
    setData((d) => ({
      ...d,
      courses: d.courses.map((c) =>
        c.id === courseId
          ? { ...c, components: c.components.filter((comp) => comp.id !== componentId) }
          : c
      ),
    }));
    if (loggedInRef.current) {
      db.deleteGradeComponent(componentId).catch((e) =>
        console.error("Haven: failed to delete grade component", e)
      );
    }
  }, []);

  // --- Local-only mutations (attendance / schedule layer) -------------------

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

  const loadDemo = useCallback(async () => {
    if (!loggedInRef.current) return;
    try {
      let semesterId = semesterIdRef.current;
      if (!semesterId) {
        const sem = await db.ensureActiveSemester();
        semesterId = sem.id;
        semesterIdRef.current = sem.id;
      }
      // Replace any existing courses with the demo set.
      await db.deleteCoursesForSemester(semesterId);
      const demo = demoCourses();
      const courses: Course[] = [];
      for (let i = 0; i < demo.length; i++) {
        const dc = demo[i];
        const row = await db.addCourse(semesterId, {
          name: dc.name,
          creditHours: dc.creditHours,
          position: i,
        });
        const components: GradeComponent[] = [];
        for (const comp of dc.components) {
          // addGradeComponent ignores the demo's local id and returns the cloud row.
          components.push(await db.addGradeComponent(row.id, comp));
        }
        courses.push({
          id: row.id,
          name: row.name,
          creditHours: row.creditHours,
          sessions: dc.sessions,
          missedLectures: dc.missedLectures,
          missedSessions: dc.missedSessions,
          components,
        });
      }
      setData((d) => ({ ...d, courses }));
    } catch (e) {
      console.error("Haven: failed to load demo data", e);
    }
  }, []);

  const resetData = useCallback(async () => {
    const semesterId = semesterIdRef.current;
    if (loggedInRef.current && semesterId) {
      try {
        await db.deleteCoursesForSemester(semesterId);
      } catch (e) {
        console.error("Haven: failed to reset cloud data", e);
      }
    }
    setData((d) => ({
      ...initialData,
      language: d.language,
      theme: d.theme,
      profileName: d.profileName,
      email: d.email,
      profilePhoto: d.profilePhoto,
      gpaGoal: d.gpaGoal,
      semester: d.semester,
    }));
  }, []);

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
