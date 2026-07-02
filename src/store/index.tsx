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
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/db";
import type { Session } from "@supabase/supabase-js";

// localStorage scope depends on whether someone is signed in:
//   • Signed OUT (anonymous): holds the full app state (theme/language/etc) so a
//     visitor's choices survive a reload. There's no account to leak to.
//   • Signed IN: holds ONLY the not-yet-cloud layer — planner, task order, and
//     the per-course attendance layer (sessions + missed). All real per-account
//     settings (theme, language, calendar, gpa goal, profile, semester settings)
//     now live in profiles.preferences in Supabase, so they no longer leak
//     between accounts on a shared device. Course identity + grade components
//     live in Supabase too — see src/lib/db.ts.
// localStorage is device-scoped, so it is wiped on account switch / sign out.
const STORAGE_KEY = "haven-data";

/** Remove every Haven localStorage key (called on sign-out / account switch so
 *  one account never inherits another's device-local data). */
function clearHavenLocalStorage() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("haven")) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

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
  /** Set the Tasks page section order and persist it to the cloud per account
   *  (profiles.preferences.taskOrder). Drives the Tasks page drag-to-reorder. */
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
  // The user id the in-memory store is currently populated for, so we can tell
  // a real account switch apart from a token refresh on the same account.
  const currentUidRef = useRef<string | null>(null);
  const loadedOnceRef = useRef(false);
  useEffect(() => {
    coursesRef.current = data.courses;
  }, [data.courses]);

  // Load (and re-load) the store from auth state. A single onAuthStateChange
  // listener drives everything: the initial session, sign-in, sign-out, and
  // account switches. On a switch we wipe the previous account's device-local
  // data before loading the new one, so nothing leaks between accounts.
  useEffect(() => {
    let cancelled = false;

    // Read the not-yet-cloud, device-local layer (planner / task order / the
    // per-course attendance layer). Settings/prefs are NOT read here for signed
    // in users — those come from the cloud below.
    const readLocal = () => {
      let local: Partial<AppData> = {};
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) local = JSON.parse(raw) as Partial<AppData>;
      } catch {
        // corrupt storage — ignore
      }
      const layer = new Map<string, ReturnType<typeof normalizeCourseLocal>>();
      if (Array.isArray(local.courses)) {
        for (const c of local.courses as Partial<Course>[]) {
          if (c && typeof c.id === "string") layer.set(c.id, normalizeCourseLocal(c));
        }
      }
      return {
        local,
        layer,
        planner: normalizePlanner(local.planner),
      };
    };

    // Signed-out / anonymous: localStorage IS the store (no account to leak to).
    const applyAnonymous = () => {
      const { local, planner } = readLocal();
      setData({
        ...initialData,
        ...local,
        theme: THEME_IDS.includes(local.theme as ThemeId) ? (local.theme as ThemeId) : "haven",
        semester: { ...defaultSemester, ...(local.semester ?? {}) },
        planner,
        // The section order is a cloud/per-account preference — never sourced
        // from localStorage (the Tasks page is behind auth anyway).
        taskOrder: [],
        courses: [],
      });
      setHydrated(true);
    };

    // Signed-in: settings (incl. the Tasks page section order) come from
    // profiles.preferences (the cloud); the not-yet-migrated layer (planner /
    // attendance) comes from localStorage.
    const applyForUser = async (session: Session) => {
      const user = session.user;
      const { layer, planner } = readLocal();
      try {
        const [prefs, sem] = await Promise.all([
          db.getPreferences(),
          db.ensureActiveSemester(),
        ]);
        if (cancelled) return;
        semesterIdRef.current = sem.id;

        const cloudCourses = await db.getCourses(sem.id);
        const courses: Course[] = await Promise.all(
          cloudCourses.map(async (cc) => {
            const components = await db.getGradeComponents(cc.id);
            const l = layer.get(cc.id) ?? { sessions: [], missedLectures: 0, missedSessions: [] };
            return {
              id: cc.id,
              name: cc.name,
              creditHours: cc.creditHours,
              sessions: l.sessions,
              missedLectures: l.missedLectures,
              missedSessions: l.missedSessions,
              components,
            };
          })
        );
        if (cancelled) return;

        const num = (v: unknown, fb: number) => (typeof v === "number" ? v : fb);
        const str = (v: unknown, fb: string) => (typeof v === "string" ? v : fb);
        setData({
          ...initialData,
          profileName:
            str(prefs.profileName, "") ||
            ((user.user_metadata?.full_name as string) ?? "") ||
            initialData.profileName,
          email: user.email ?? "",
          profilePhoto: typeof prefs.profilePhoto === "string" ? prefs.profilePhoto : null,
          gpaGoal: num(prefs.gpaGoal, initialData.gpaGoal),
          language: prefs.language === "ar" ? "ar" : "en",
          theme: THEME_IDS.includes(prefs.theme as ThemeId) ? (prefs.theme as ThemeId) : "haven",
          planner, // local-only for now
          taskOrder: Array.isArray(prefs.taskOrder)
            ? (prefs.taskOrder as unknown[]).filter((id): id is string => typeof id === "string")
            : [],
          semester: {
            ...defaultSemester,
            name: sem.name,
            weeks: num(prefs.weeks, sem.weeks),
            finalsWeeks: num(prefs.finalsWeeks, sem.finalsWeeks),
            calendarType: prefs.calendarType === "hijri" ? "hijri" : "gregorian",
            startDate: str(prefs.startDate, defaultSemester.startDate),
            endDate: str(prefs.endDate, defaultSemester.endDate),
            withdrawalLimit: num(prefs.withdrawalLimit, defaultSemester.withdrawalLimit),
          },
          courses,
        });
        setHydrated(true);
      } catch (e) {
        console.error("Haven: failed to load cloud data", e);
        if (cancelled) return;
        // Safe fallback: defaults + the device-local layer (never localStorage prefs).
        setData({ ...initialData, planner });
        setHydrated(true);
      }
    };

    const apply = (session: Session | null) => {
      loggedInRef.current = !!session;
      semesterIdRef.current = null;
      if (session) void applyForUser(session);
      else applyAnonymous();
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      if (event === "SIGNED_OUT") {
        currentUidRef.current = null;
        loggedInRef.current = false;
        semesterIdRef.current = null;
        loadedOnceRef.current = true;
        clearHavenLocalStorage();
        setData(initialData);
        setHydrated(true);
        return;
      }

      const uid = session?.user?.id ?? null;
      const prev = currentUidRef.current;
      // A token refresh / metadata update for the same account: nothing to do.
      if (loadedOnceRef.current && uid === prev) return;
      // A different account on this device: wipe the previous one's local data.
      if (prev !== null && prev !== uid) {
        clearHavenLocalStorage();
        setData(initialData);
      }
      currentUidRef.current = uid;
      loadedOnceRef.current = true;
      // Defer the load: calling Supabase auth-backed methods (db.* → getUser)
      // synchronously inside this callback can deadlock the auth lock.
      setTimeout(() => {
        if (!cancelled) apply(session);
      }, 0);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Persist to localStorage on change, once hydrated.
  //   • Signed IN: only the device-local layer (planner / task order / the
  //     per-course attendance layer). Real per-account settings live in the
  //     cloud (profiles.preferences) and are intentionally NOT written here, so
  //     they can never leak to another account on this device.
  //   • Signed OUT: the full anonymous state, so a visitor's choices survive a
  //     reload.
  // Course identity and grade components live in Supabase, never here.
  useEffect(() => {
    if (!hydrated) return;
    try {
      const attendanceLayer = data.courses.map((c) => ({
        id: c.id,
        sessions: c.sessions,
        missedLectures: c.missedLectures,
        missedSessions: c.missedSessions,
      }));
      const toSave = loggedInRef.current
        ? {
            planner: data.planner,
            courses: attendanceLayer,
          }
        : {
            profileName: data.profileName,
            email: data.email,
            profilePhoto: data.profilePhoto,
            gpaGoal: data.gpaGoal,
            language: data.language,
            theme: data.theme,
            planner: data.planner,
            semester: data.semester,
            courses: attendanceLayer,
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

  // Persist a per-account preference patch to the cloud. No-op when signed out
  // (anonymous prefs are written to localStorage by the persist effect above).
  const persistPref = useCallback((patch: db.Preferences) => {
    if (!loggedInRef.current) return;
    db.savePreferences(patch).catch((e) =>
      console.error("Haven: failed to save preferences", e)
    );
  }, []);

  const setProfileName = useCallback(
    (name: string) => {
      setData((d) => ({ ...d, profileName: name }));
      persistPref({ profileName: name });
    },
    [persistPref]
  );

  const setEmail = useCallback(
    (email: string) => setData((d) => ({ ...d, email })),
    []
  );

  const setProfilePhoto = useCallback(
    (photo: string | null) => {
      setData((d) => ({ ...d, profilePhoto: photo }));
      persistPref({ profilePhoto: photo });
    },
    [persistPref]
  );

  const setGpaGoal = useCallback(
    (goal: number) => {
      setData((d) => ({ ...d, gpaGoal: goal }));
      persistPref({ gpaGoal: goal });
    },
    [persistPref]
  );

  const setPlanner = useCallback(
    (planner: PlannerData) => setData((d) => ({ ...d, planner })),
    []
  );

  const setLanguage = useCallback(
    (lang: "en" | "ar") => {
      setData((d) => ({ ...d, language: lang }));
      persistPref({ language: lang });
    },
    [persistPref]
  );

  const setTheme = useCallback(
    (theme: ThemeId) => {
      setData((d) => ({ ...d, theme }));
      persistPref({ theme });
    },
    [persistPref]
  );

  // Set the Tasks page section order and persist it to the cloud per account
  // (profiles.preferences.taskOrder). No localStorage — so it syncs across
  // devices and never leaks between accounts on a shared device.
  const setTaskOrder = useCallback(
    (order: string[]) => {
      setData((d) => ({ ...d, taskOrder: order }));
      persistPref({ taskOrder: order });
    },
    [persistPref]
  );

  const setSemester = useCallback((patch: Partial<Semester>) => {
    setData((d) => ({ ...d, semester: { ...d.semester, ...patch } }));
    // Mirror the cloud-backed fields (name / weeks / finals) to the semesters row.
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
    // The remaining semester settings are per-account prefs (no cloud column of
    // their own) — persist them to profiles.preferences so they don't leak.
    const prefPatch: db.Preferences = {};
    if (patch.weeks !== undefined) prefPatch.weeks = patch.weeks;
    if (patch.finalsWeeks !== undefined) prefPatch.finalsWeeks = patch.finalsWeeks;
    if (patch.calendarType !== undefined) prefPatch.calendarType = patch.calendarType;
    if (patch.startDate !== undefined) prefPatch.startDate = patch.startDate;
    if (patch.endDate !== undefined) prefPatch.endDate = patch.endDate;
    if (patch.withdrawalLimit !== undefined) prefPatch.withdrawalLimit = patch.withdrawalLimit;
    if (Object.keys(prefPatch).length) persistPref(prefPatch);
  }, [persistPref]);

  const addCourse = useCallback(
    async (course: { name: string; creditHours: number }) => {
      if (!loggedInRef.current) return;
      try {
        // db.addCourse resolves the current user's active semester itself, so we
        // never pass a (possibly stale) cached semester id from this account.
        const row = await db.addCourse({
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
      // Resolve the current user's active semester fresh (don't trust the ref).
      const sem = await db.ensureActiveSemester();
      semesterIdRef.current = sem.id;
      // Replace any existing courses with the demo set.
      await db.deleteCoursesForSemester(sem.id);
      const demo = demoCourses();
      const courses: Course[] = [];
      for (let i = 0; i < demo.length; i++) {
        const dc = demo[i];
        const row = await db.addCourse({
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
