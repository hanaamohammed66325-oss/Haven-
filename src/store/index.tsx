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
  MissedEntry,
  NotifPrefs,
  PlannerData,
  PlannerNote,
  Semester,
  ThemeId,
  GpaMode,
} from "@/types";
import { DEFAULT_NOTIF_PREFS, normalizeNotifPrefs } from "@/lib/notifPrefs";
import { demoCourses } from "@/lib/demo";
import { supabase } from "@/lib/supabase";
import { toISODate, addDays } from "@/lib/dates";
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
// Tiny pre-paint cache: the last-applied theme + language, mirrored to
// localStorage so the blocking boot script in the root <head> can apply them
// BEFORE first paint — even for signed-in users whose real prefs live in the
// cloud (a DB round-trip is far too slow for pre-paint). Starts with "haven" so
// clearHavenLocalStorage() wipes it on sign-out (→ logged-out falls back to the
// default theme). Keep this key in sync with the boot script in src/app/layout.tsx.
const BOOT_CACHE_KEY = "haven-boot";

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

// A NEW / empty semester defaults its start date to "today" (the user's local
// calendar day) instead of a hardcoded date, and its end date to a full default
// term later so the two stay coherent. These are ONLY fallbacks for a fresh
// semester — an existing semester with a saved start/end keeps its own values
// (the load path below only reaches for these when a field is missing).
const DEFAULT_TEACHING_WEEKS = 15;
const DEFAULT_FINALS_WEEKS = 2;
const defaultSemesterStart = new Date();

const defaultSemester: Semester = {
  name: "Current Semester",
  startDate: toISODate(defaultSemesterStart),
  endDate: toISODate(
    addDays(defaultSemesterStart, (DEFAULT_TEACHING_WEEKS + DEFAULT_FINALS_WEEKS) * 7)
  ),
  calendarType: "gregorian",
  gradingSystem: "saudi5",
  weeks: DEFAULT_TEACHING_WEEKS,
  finalsWeeks: DEFAULT_FINALS_WEEKS,
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
  reminderDays: 2,
  gpaMode: "semester",
  cumulativeGpa: 0,
  cumulativeHours: 0,
  notifPrefs: DEFAULT_NOTIF_PREFS,
};

// Planner note colours are derived from the tag (mirror of Planner.tsx TAGS).
// The cloud stores only the tag, so the colour is rebuilt on load.
const PLANNER_TAG_COLORS: Record<string, string> = {
  tagExam: "#d9534f",
  tagQuiz: "#e89b4a",
  tagAssignment: "#477680",
  tagDeadline: "#b8975a",
  tagHoliday: "#5fa98c",
};
const DEFAULT_NOTE_COLOR = "#477680";
const colorForTag = (tag?: string | null) =>
  (tag && PLANNER_TAG_COLORS[tag]) || DEFAULT_NOTE_COLOR;

/** Client-side id for optimistic rows before the cloud assigns a real one. */
const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Whether a session carries any timetable detail worth its own detail row. */
const sessionHasDetails = (s: Pick<CourseSession, "time" | "building" | "room" | "notes">) =>
  !!(s.time || s.building || s.room || (s.notes && s.notes.length));

/** Reshape cloud planner rows + the per-account autoEdits into PlannerData. */
function buildPlanner(
  items: db.DbPlannerItem[],
  autoEditsPref: unknown
): PlannerData {
  const notes: PlannerNote[] = items.map((it) => ({
    id: it.id,
    week: it.week,
    day: it.day == null ? undefined : it.day,
    text: it.text,
    color: colorForTag(it.tag),
    tag: it.tag ?? undefined,
    done: it.done,
    dueTime: it.dueTime,
  }));
  const autoEdits =
    autoEditsPref && typeof autoEditsPref === "object"
      ? (autoEditsPref as PlannerData["autoEdits"])
      : {};
  return { notes, strokes: [], highlights: [], autoEdits };
}

/**
 * Result of a cloud-backed "add" mutation. Add flows return this instead of
 * void so the calling modal can react: keep itself open and show an error when
 * `ok` is false, and only close once the row is really in the store. Before
 * this, every add swallowed its error in a catch and the modal closed
 * regardless — a failed save looked identical to a successful one.
 */
export type MutationResult = { ok: true } | { ok: false; error: string };

const asError = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const NOT_SIGNED_IN: MutationResult = { ok: false, error: "not signed in" };

export interface StoreValue extends AppData {
  hydrated: boolean;
  setProfileName: (name: string) => void;
  setEmail: (email: string) => void;
  setProfilePhoto: (photo: string | null) => void;
  setGpaGoal: (goal: number) => void;
  // Planner notes are cloud-backed (planner_items); autoEdits ride in
  // profiles.preferences. Each mutation persists per account.
  addPlannerNote: (note: Omit<PlannerNote, "id">) => Promise<MutationResult>;
  updatePlannerNote: (id: string, patch: Partial<PlannerNote>) => void;
  deletePlannerNote: (id: string) => void;
  setPlannerAutoEdit: (id: string, patch: PlannerData["autoEdits"][string]) => void;
  setLanguage: (lang: "en" | "ar") => void;
  setTheme: (theme: ThemeId) => void;
  /** Set the Tasks page section order and persist it to the cloud per account
   *  (profiles.preferences.taskOrder). Drives the Tasks page drag-to-reorder. */
  setTaskOrder: (order: string[]) => void;
  /** Reminder window (days ahead); persisted to profiles.preferences per account. */
  setReminderDays: (days: number) => void;
  /** Semester-GPA card mode (semester / cumulative); persisted per account. */
  setGpaMode: (mode: GpaMode) => void;
  /** The user's current cumulative GPA (cumulative mode); persisted per account. */
  setCumulativeGpa: (gpa: number) => void;
  /** Completed credit hours behind the cumulative GPA; persisted per account. */
  setCumulativeHours: (hours: number) => void;
  /** Customizable notification preferences; persisted to preferences.notifPrefs. */
  setNotifPrefs: (next: NotifPrefs) => void;
  setSemester: (patch: Partial<Semester>) => void;
  addCourse: (course: {
    name: string;
    creditHours: number;
    attendanceLimit?: number;
  }) => Promise<MutationResult>;
  updateCourse: (
    id: string,
    data: Partial<Omit<Course, "id" | "components">>
  ) => void;
  deleteCourse: (id: string) => void;
  addComponent: (
    courseId: string,
    component: Omit<GradeComponent, "id">
  ) => Promise<MutationResult>;
  updateComponent: (
    courseId: string,
    componentId: string,
    data: Partial<Omit<GradeComponent, "id">>
  ) => void;
  deleteComponent: (courseId: string, componentId: string) => void;
  addSession: (courseId: string, session: Omit<CourseSession, "id">) => Promise<MutationResult>;
  updateSession: (
    courseId: string,
    sessionId: string,
    data: Partial<Omit<CourseSession, "id">>
  ) => void;
  deleteSession: (courseId: string, sessionId: string) => void;
  setMissedLectures: (courseId: string, missed: number) => void;
  addMissedSession: (courseId: string, sessionId: string) => Promise<MutationResult>;
  removeMissedSession: (courseId: string, missedId: string) => void;
  loadDemo: () => void;
  resetData: () => void;
}

export const StoreContext = createContext<StoreValue | null>(null);

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

    // Read the anonymous localStorage layer (theme / language / semester /
    // profile). For signed-in users NONE of this is read — settings come from
    // profiles.preferences and schedule/attendance from their own cloud tables.
    const readLocal = (): Partial<AppData> => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as Partial<AppData>;
      } catch {
        // corrupt storage — ignore
      }
      return {};
    };

    // Signed-out / anonymous: localStorage IS the store (no account to leak to).
    // Planner / courses require an account, so they stay empty here.
    const applyAnonymous = () => {
      const local = readLocal();
      setData({
        ...initialData,
        ...local,
        theme: THEME_IDS.includes(local.theme as ThemeId) ? (local.theme as ThemeId) : "haven",
        semester: { ...defaultSemester, ...(local.semester ?? {}) },
        notifPrefs: normalizeNotifPrefs(local.notifPrefs),
        planner: emptyPlanner,
        taskOrder: [],
        courses: [],
      });
      setHydrated(true);
    };

    // Signed-in: everything comes from the cloud — settings + section order from
    // profiles.preferences; courses, grade components, weekly sessions, timetable
    // details, planner items, and absences from their own per-account tables.
    const applyForUser = async (session: Session) => {
      const user = session.user;
      try {
        const [prefs, sem] = await Promise.all([
          db.getPreferences(),
          db.ensureActiveSemester(),
        ]);
        if (cancelled) return;
        semesterIdRef.current = sem.id;

        // Load each schedule/attendance domain independently: a hiccup in one
        // (e.g. a bad row) must not blank the others — that would look exactly
        // like "nothing saved" after a refresh. Errors are logged, not thrown.
        const safe = <T,>(p: Promise<T[]>, label: string): Promise<T[]> =>
          p.catch((e) => {
            console.error(`Haven: failed to load ${label}`, e);
            return [];
          });
        const [cloudCourses, cloudSessions, cloudTimetable, cloudAbsences, cloudPlanner] =
          await Promise.all([
            db.getCourses(sem.id),
            safe(db.getAttendanceSessions(), "attendance sessions"),
            safe(db.getTimetable(), "timetable"),
            safe(db.getAbsences(), "absences"),
            safe(db.getPlannerItems(), "planner"),
          ]);
        if (cancelled) return;

        // Merge each attendance session (day + duration, its own id) with its
        // optional timetable-detail row (own id, linked back by `sessionId`).
        const ttBySession = new Map<string, (typeof cloudTimetable)[number]>();
        for (const tt of cloudTimetable) {
          if (tt.sessionId) ttBySession.set(tt.sessionId, tt);
        }
        const sessionsByCourse = new Map<string, CourseSession[]>();
        for (const s of cloudSessions) {
          const tt = ttBySession.get(s.id);
          const session: CourseSession = {
            id: s.id,
            day: s.day,
            minutes: s.minutes,
            ...(tt?.time ? { time: tt.time } : {}),
            ...(tt?.building ? { building: tt.building } : {}),
            ...(tt?.room ? { room: tt.room } : {}),
            notes: tt?.notes ?? [],
            ...(tt ? { timetableId: tt.id } : {}),
          };
          const arr = sessionsByCourse.get(s.courseId) ?? [];
          arr.push(session);
          sessionsByCourse.set(s.courseId, arr);
        }
        const absencesByCourse = new Map<string, MissedEntry[]>();
        for (const a of cloudAbsences) {
          const arr = absencesByCourse.get(a.courseId) ?? [];
          arr.push({ id: a.id, day: a.day, minutes: a.minutes });
          absencesByCourse.set(a.courseId, arr);
        }

        const courses: Course[] = await Promise.all(
          cloudCourses.map(async (cc) => {
            const components = await db.getGradeComponents(cc.id);
            return {
              id: cc.id,
              name: cc.name,
              creditHours: cc.creditHours,
              attendanceLimit: cc.attendanceLimit,
              sessions: sessionsByCourse.get(cc.id) ?? [],
              missedLectures: 0,
              missedSessions: absencesByCourse.get(cc.id) ?? [],
              components,
            };
          })
        );
        if (cancelled) return;

        const num = (v: unknown, fb: number) => (typeof v === "number" ? v : fb);
        const str = (v: unknown, fb: string) => (typeof v === "string" ? v : fb);
        // Calendar preference: the canonical `calendar` key (read by server-side
        // Edge Functions for notifications/emails) wins; fall back to the legacy
        // `calendarType` pref, then the anonymous localStorage value, then default.
        const asCal = (v: unknown): "hijri" | "gregorian" | null =>
          v === "hijri" ? "hijri" : v === "gregorian" ? "gregorian" : null;
        const localCal = asCal(readLocal().semester?.calendarType);
        const canonicalCal = asCal(prefs.calendar);
        const legacyCal = asCal(prefs.calendarType);
        const resolvedCalendar: "hijri" | "gregorian" =
          canonicalCal ?? legacyCal ?? localCal ?? "gregorian";
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
          planner: buildPlanner(cloudPlanner, prefs.plannerAutoEdits),
          taskOrder: Array.isArray(prefs.taskOrder)
            ? (prefs.taskOrder as unknown[]).filter((id): id is string => typeof id === "string")
            : [],
          reminderDays:
            typeof prefs.reminderDays === "number" && prefs.reminderDays > 0
              ? Math.round(prefs.reminderDays)
              : initialData.reminderDays,
          gpaMode: prefs.gpaMode === "cumulative" ? "cumulative" : "semester",
          cumulativeGpa: num(prefs.cumulativeGpa, initialData.cumulativeGpa),
          cumulativeHours: num(prefs.cumulativeHours, initialData.cumulativeHours),
          // notifPrefs supersedes the legacy `reminderDays`; missing → defaults.
          notifPrefs: normalizeNotifPrefs(prefs.notifPrefs),
          semester: {
            ...defaultSemester,
            name: sem.name,
            weeks: num(prefs.weeks, sem.weeks),
            finalsWeeks: num(prefs.finalsWeeks, sem.finalsWeeks),
            calendarType: resolvedCalendar,
            startDate: str(prefs.startDate, defaultSemester.startDate),
            endDate: str(prefs.endDate, defaultSemester.endDate),
            withdrawalLimit: num(prefs.withdrawalLimit, defaultSemester.withdrawalLimit),
          },
          courses,
        });
        setHydrated(true);

        // One-time migration: backfill the canonical `calendar` pref for existing
        // users who only have a legacy value (DB `calendarType` or localStorage),
        // so server code can rely on it without waiting for a Settings change.
        if (!canonicalCal && (legacyCal || localCal)) {
          db.savePreferences({ calendar: resolvedCalendar }).catch((e) =>
            console.error("Haven: failed to migrate calendar preference", e)
          );
        }
      } catch (e) {
        console.error("Haven: failed to load cloud data", e);
        if (cancelled) return;
        // Safe fallback: defaults + the device-local layer (never localStorage prefs).
        setData(initialData);
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
  //   • Signed IN: nothing — a signed-in account's data lives entirely in the
  //     cloud now (settings + section order in profiles.preferences; courses,
  //     grade components, planner, timetable, sessions and absences in their own
  //     tables). Writing nothing here is what stops any leak between accounts.
  //   • Signed OUT: the anonymous settings, so a visitor's choices survive a
  //     reload.
  useEffect(() => {
    if (!hydrated || loggedInRef.current) return;
    try {
      const toSave = {
        profileName: data.profileName,
        email: data.email,
        profilePhoto: data.profilePhoto,
        gpaGoal: data.gpaGoal,
        language: data.language,
        theme: data.theme,
        semester: data.semester,
        notifPrefs: data.notifPrefs,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // storage full / unavailable — ignore
    }
  }, [data, hydrated]);

  // Reflect the active theme onto <html> and mirror theme + language into the
  // pre-paint cache (see BOOT_CACHE_KEY / the boot script).
  //
  // CRITICAL: do NOTHING until `hydrated`. Before the real data loads, `data` is
  // still `initialData` (theme "haven", language "en"). The pre-paint boot script
  // has already applied the user's real theme/language to <html>; touching it
  // here with the defaults would clobber that and cause the exact flash we're
  // fixing. Once hydrated, `data` holds the real values, so we apply + cache them.
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.setAttribute("data-theme", data.theme);
    try {
      window.localStorage.setItem(
        BOOT_CACHE_KEY,
        JSON.stringify({ theme: data.theme, lang: data.language })
      );
    } catch {
      // storage full / unavailable — ignore
    }
  }, [data.theme, data.language, hydrated]);

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

  // --- Planner (cloud-backed notes + per-account autoEdits) -----------------

  const addPlannerNote = useCallback(async (note: Omit<PlannerNote, "id">): Promise<MutationResult> => {
    if (!loggedInRef.current) return NOT_SIGNED_IN;
    // Optimistic add: show the note immediately under a temporary id, then
    // reconcile with the row the cloud returns (or roll it back if the insert
    // fails). Previously this awaited the round-trip before the chip appeared —
    // a lag iPad users felt most. update/delete are already local-first.
    const tempId = `temp-${newId()}`;
    setData((d) => ({
      ...d,
      planner: {
        ...d.planner,
        notes: [
          ...d.planner.notes,
          {
            id: tempId,
            week: note.week,
            day: note.day,
            text: note.text,
            color: note.color ?? colorForTag(note.tag),
            tag: note.tag,
            done: note.done ?? false,
            dueTime: note.dueTime ?? null,
          },
        ],
      },
    }));
    try {
      const row = await db.addPlannerItem({
        week: note.week,
        day: note.day ?? null,
        tag: note.tag ?? null,
        text: note.text,
        done: note.done ?? false,
        dueTime: note.dueTime ?? null,
      });
      // Swap the temp row for the real one in place (keeps its grid position).
      setData((d) => ({
        ...d,
        planner: {
          ...d.planner,
          notes: d.planner.notes.map((n) =>
            n.id === tempId
              ? {
                  id: row.id,
                  week: row.week,
                  day: row.day == null ? undefined : row.day,
                  text: row.text,
                  color: colorForTag(row.tag),
                  tag: row.tag ?? undefined,
                  done: row.done,
                  dueTime: row.dueTime,
                }
              : n
          ),
        },
      }));
      return { ok: true };
    } catch (e) {
      console.error("Haven: failed to add planner note", e);
      // Roll back the optimistic row so a failed save leaves nothing behind.
      setData((d) => ({
        ...d,
        planner: { ...d.planner, notes: d.planner.notes.filter((n) => n.id !== tempId) },
      }));
      return { ok: false, error: asError(e) };
    }
  }, []);

  const updatePlannerNote = useCallback((id: string, patch: Partial<PlannerNote>) => {
    // Keep the colour in sync with the tag (colour isn't stored in the cloud).
    const withColor: Partial<PlannerNote> =
      patch.tag !== undefined ? { ...patch, color: colorForTag(patch.tag) } : patch;
    setData((d) => ({
      ...d,
      planner: {
        ...d.planner,
        notes: d.planner.notes.map((n) => (n.id === id ? { ...n, ...withColor } : n)),
      },
    }));
    if (loggedInRef.current) {
      const dbPatch: Parameters<typeof db.updatePlannerItem>[1] = {};
      if (patch.week !== undefined) dbPatch.week = patch.week;
      if (patch.day !== undefined) dbPatch.day = patch.day ?? null;
      if (patch.tag !== undefined) dbPatch.tag = patch.tag ?? null;
      if (patch.text !== undefined) dbPatch.text = patch.text;
      if (patch.done !== undefined) dbPatch.done = patch.done;
      if (patch.dueTime !== undefined) dbPatch.dueTime = patch.dueTime ?? null;
      if (Object.keys(dbPatch).length) {
        db.updatePlannerItem(id, dbPatch).catch((e) =>
          console.error("Haven: failed to update planner note", e)
        );
      }
    }
  }, []);

  const deletePlannerNote = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      planner: { ...d.planner, notes: d.planner.notes.filter((n) => n.id !== id) },
    }));
    if (loggedInRef.current) {
      db.deletePlannerItem(id).catch((e) =>
        console.error("Haven: failed to delete planner note", e)
      );
    }
  }, []);

  const setPlannerAutoEdit = useCallback(
    (id: string, patch: PlannerData["autoEdits"][string]) => {
      let nextAutoEdits: PlannerData["autoEdits"] = {};
      setData((d) => {
        nextAutoEdits = {
          ...(d.planner.autoEdits ?? {}),
          [id]: { ...(d.planner.autoEdits?.[id] ?? {}), ...patch },
        };
        return { ...d, planner: { ...d.planner, autoEdits: nextAutoEdits } };
      });
      persistPref({ plannerAutoEdits: nextAutoEdits });
    },
    [persistPref]
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

  const setReminderDays = useCallback(
    (days: number) => {
      const n = Math.max(1, Math.round(Number(days) || 1));
      setData((d) => ({ ...d, reminderDays: n }));
      persistPref({ reminderDays: n });
    },
    [persistPref]
  );

  const setGpaMode = useCallback(
    (mode: GpaMode) => {
      const m: GpaMode = mode === "cumulative" ? "cumulative" : "semester";
      setData((d) => ({ ...d, gpaMode: m }));
      persistPref({ gpaMode: m });
    },
    [persistPref]
  );

  const setCumulativeGpa = useCallback(
    (gpa: number) => {
      const g = Math.max(0, Math.min(5, Number(gpa) || 0));
      setData((d) => ({ ...d, cumulativeGpa: g }));
      persistPref({ cumulativeGpa: g });
    },
    [persistPref]
  );

  const setCumulativeHours = useCallback(
    (hours: number) => {
      const h = Math.max(0, Math.round(Number(hours) || 0));
      setData((d) => ({ ...d, cumulativeHours: h }));
      persistPref({ cumulativeHours: h });
    },
    [persistPref]
  );

  // WRITE helper for notifPrefs. Normalizes defensively (so a bad partial can
  // never land in the store or the cloud), updates state, and persists the WHOLE
  // notifPrefs object under profiles.preferences.notifPrefs (read-merge-write in
  // db.savePreferences leaves every other preference key untouched).
  const setNotifPrefs = useCallback(
    (next: NotifPrefs) => {
      const clean = normalizeNotifPrefs(next);
      setData((d) => ({ ...d, notifPrefs: clean }));
      persistPref({ notifPrefs: clean });
    },
    [persistPref]
  );

  const setSemester = useCallback((patch: Partial<Semester>) => {
    setData((d) => ({ ...d, semester: { ...d.semester, ...patch } }));
    // Mirror the cloud-backed fields to the active semesters row. name/weeks/
    // finals have always lived there; start/end date are ALSO written to the new
    // semesters.start_date/end_date columns (in the same save) for notification
    // scheduling, while still going to profiles.preferences below for backward
    // compatibility. semesterIdRef is the active semester, so update-by-id is the
    // RLS-safe equivalent of "user_id = auth.uid() AND is_active = true".
    const id = semesterIdRef.current;
    if (loggedInRef.current && id) {
      const cloudPatch: Parameters<typeof db.updateSemester>[1] = {};
      if (patch.name !== undefined) cloudPatch.name = patch.name;
      if (patch.weeks !== undefined) cloudPatch.weeks = patch.weeks;
      if (patch.finalsWeeks !== undefined) cloudPatch.finalsWeeks = patch.finalsWeeks;
      if (patch.startDate !== undefined) cloudPatch.startDate = patch.startDate;
      if (patch.endDate !== undefined) cloudPatch.endDate = patch.endDate;
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
    if (patch.calendarType !== undefined) {
      // Persist BOTH keys: `calendarType` (legacy, read by this app) and the
      // canonical `calendar` (lowercase 'hijri' | 'gregorian') that server-side
      // Edge Functions read to format dates in the user's chosen calendar.
      prefPatch.calendarType = patch.calendarType;
      prefPatch.calendar = patch.calendarType;
    }
    if (patch.startDate !== undefined) prefPatch.startDate = patch.startDate;
    if (patch.endDate !== undefined) prefPatch.endDate = patch.endDate;
    if (patch.withdrawalLimit !== undefined) prefPatch.withdrawalLimit = patch.withdrawalLimit;
    if (Object.keys(prefPatch).length) persistPref(prefPatch);
  }, [persistPref]);

  const addCourse = useCallback(
    async (course: {
      name: string;
      creditHours: number;
      attendanceLimit?: number;
    }): Promise<MutationResult> => {
      if (!loggedInRef.current) return NOT_SIGNED_IN;
      try {
        // db.addCourse resolves the current user's active semester itself, so we
        // never pass a (possibly stale) cached semester id from this account.
        const row = await db.addCourse({
          name: course.name,
          creditHours: course.creditHours,
          position: coursesRef.current.length,
          attendanceLimit: course.attendanceLimit,
        });
        setData((d) => ({
          ...d,
          courses: [
            ...d.courses,
            {
              id: row.id,
              name: row.name,
              creditHours: row.creditHours,
              attendanceLimit: row.attendanceLimit,
              sessions: [],
              missedLectures: 0,
              missedSessions: [],
              components: [],
            },
          ],
        }));
        return { ok: true };
      } catch (e) {
        console.error("Haven: failed to add course", e);
        return { ok: false, error: asError(e) };
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
      // Name / credits / the per-course withdrawal limit live in the cloud.
      if (
        loggedInRef.current &&
        (patch.name !== undefined ||
          patch.creditHours !== undefined ||
          patch.attendanceLimit !== undefined)
      ) {
        db.updateCourse(id, {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.creditHours !== undefined ? { creditHours: patch.creditHours } : {}),
          ...(patch.attendanceLimit !== undefined ? { attendanceLimit: patch.attendanceLimit } : {}),
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
    async (courseId: string, component: Omit<GradeComponent, "id">): Promise<MutationResult> => {
      if (!loggedInRef.current) return NOT_SIGNED_IN;
      try {
        const row = await db.addGradeComponent(courseId, component);
        setData((d) => ({
          ...d,
          courses: d.courses.map((c) =>
            c.id === courseId ? { ...c, components: [...c.components, row] } : c
          ),
        }));
        return { ok: true };
      } catch (e) {
        console.error("Haven: failed to add grade component", e);
        return { ok: false, error: asError(e) };
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

  // --- Attendance + timetable (cloud-backed) --------------------------------
  // A weekly session is an attendance_sessions row (day + duration, its own id).
  // Its optional timetable details (time / building / room / notes) live in a
  // SEPARATE timetable_entries row with its OWN id, tracked here as
  // session.timetableId and linked back by sessionId — the two rows never share
  // an id, so editing/deleting one never touches the other.

  // Persist a session's timetable-detail row: create / update / delete its own
  // row as needed, and keep session.timetableId in sync in state.
  const persistTimetable = useCallback((courseId: string, sessionId: string, s: CourseSession) => {
    const fields = {
      sessionId,
      courseId,
      day: s.day,
      time: s.time,
      building: s.building,
      room: s.room,
      notes: s.notes,
    };
    const patchTimetableId = (ttId: string | undefined) =>
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? {
                ...c,
                sessions: c.sessions.map((x) =>
                  x.id === sessionId ? { ...x, timetableId: ttId } : x
                ),
              }
            : c
        ),
      }));
    if (sessionHasDetails(s)) {
      if (s.timetableId) {
        db.updateTimetableEntry(s.timetableId, fields).catch((e) =>
          console.error("Haven: failed to update timetable details", e)
        );
      } else {
        db.addTimetableEntry(fields)
          .then((ttId) => patchTimetableId(ttId))
          .catch((e) => console.error("Haven: failed to save timetable details", e));
      }
    } else if (s.timetableId) {
      // Details cleared — remove the detail row (its own id only).
      const ttId = s.timetableId;
      db.deleteTimetableEntry(ttId).catch((e) =>
        console.error("Haven: failed to delete timetable details", e)
      );
      patchTimetableId(undefined);
    }
  }, []);

  const addSession = useCallback(
    async (courseId: string, session: Omit<CourseSession, "id">): Promise<MutationResult> => {
      if (!loggedInRef.current) return NOT_SIGNED_IN;
      try {
        const row = await db.addAttendanceSession(courseId, {
          day: session.day,
          minutes: session.minutes,
        });
        let timetableId: string | undefined;
        if (sessionHasDetails(session)) {
          timetableId = await db.addTimetableEntry({
            sessionId: row.id,
            courseId,
            day: row.day,
            time: session.time,
            building: session.building,
            room: session.room,
            notes: session.notes,
          });
        }
        const newSession: CourseSession = {
          id: row.id,
          day: row.day,
          minutes: row.minutes,
          ...(session.time ? { time: session.time } : {}),
          ...(session.building ? { building: session.building } : {}),
          ...(session.room ? { room: session.room } : {}),
          notes: session.notes ?? [],
          ...(timetableId ? { timetableId } : {}),
        };
        setData((d) => ({
          ...d,
          courses: d.courses.map((c) =>
            c.id === courseId ? { ...c, sessions: [...c.sessions, newSession] } : c
          ),
        }));
        return { ok: true };
      } catch (e) {
        console.error("Haven: failed to add session", e);
        return { ok: false, error: asError(e) };
      }
    },
    []
  );

  const updateSession = useCallback(
    (courseId: string, sessionId: string, patch: Partial<Omit<CourseSession, "id">>) => {
      // Read the current session from the ref (deterministic — never rely on a
      // value captured inside a setData updater, which may not run synchronously)
      // and compute the merged result used for BOTH the UI and the DB writes.
      const cur = coursesRef.current
        .find((c) => c.id === courseId)
        ?.sessions.find((s) => s.id === sessionId);
      const updated: CourseSession | undefined = cur ? { ...cur, ...patch } : undefined;

      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? {
                ...c,
                sessions: c.sessions.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)),
              }
            : c
        ),
      }));

      if (!loggedInRef.current || !updated) return;
      if (patch.day !== undefined || patch.minutes !== undefined) {
        db.updateAttendanceSession(sessionId, {
          day: updated.day,
          minutes: updated.minutes,
        }).catch((e) => console.error("Haven: failed to update session", e));
      }
      const touchedDetails =
        patch.time !== undefined ||
        patch.building !== undefined ||
        patch.room !== undefined ||
        patch.notes !== undefined;
      // Sync the detail row when details change, or when the day changes on a
      // session that already has details (so its timetable day stays aligned).
      if (touchedDetails || (patch.day !== undefined && sessionHasDetails(updated))) {
        persistTimetable(courseId, sessionId, updated);
      }
    },
    [persistTimetable]
  );

  const deleteSession = useCallback((courseId: string, sessionId: string) => {
    const cur = coursesRef.current
      .find((c) => c.id === courseId)
      ?.sessions.find((s) => s.id === sessionId);
    const timetableId = cur?.timetableId;
    setData((d) => ({
      ...d,
      courses: d.courses.map((c) =>
        c.id === courseId
          ? { ...c, sessions: c.sessions.filter((s) => s.id !== sessionId) }
          : c
      ),
    }));
    if (loggedInRef.current) {
      db.deleteAttendanceSession(sessionId).catch((e) =>
        console.error("Haven: failed to delete session", e)
      );
      // Only this session's OWN detail row (its own id) — never another's.
      if (timetableId) {
        db.deleteTimetableEntry(timetableId).catch((e) =>
          console.error("Haven: failed to delete timetable details", e)
        );
      }
    }
  }, []);

  // Legacy by-lecture count — unused by the current UI/attendance math; kept
  // in-memory only for API compatibility (never persisted).
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

  const addMissedSession = useCallback(async (courseId: string, sessionId: string): Promise<MutationResult> => {
    if (!loggedInRef.current) return NOT_SIGNED_IN;
    const course = coursesRef.current.find((c) => c.id === courseId);
    const sess = course?.sessions.find((s) => s.id === sessionId);
    if (!sess) return { ok: false, error: "session not found" };
    try {
      const row = await db.addAbsence(courseId, { day: sess.day, minutes: sess.minutes });
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? {
                ...c,
                missedSessions: [
                  ...c.missedSessions,
                  { id: row.id, sessionId, day: row.day, minutes: row.minutes },
                ],
              }
            : c
        ),
      }));
      return { ok: true };
    } catch (e) {
      console.error("Haven: failed to log absence", e);
      return { ok: false, error: asError(e) };
    }
  }, []);

  const removeMissedSession = useCallback((courseId: string, missedId: string) => {
    setData((d) => ({
      ...d,
      courses: d.courses.map((c) =>
        c.id === courseId
          ? { ...c, missedSessions: c.missedSessions.filter((m) => m.id !== missedId) }
          : c
      ),
    }));
    if (loggedInRef.current) {
      db.deleteAbsence(missedId).catch((e) =>
        console.error("Haven: failed to remove absence", e)
      );
    }
  }, []);

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
        // Persist the demo's weekly sessions + logged absences to the cloud too,
        // so the demo timetable/attendance survive a reload like real data.
        const sessions: CourseSession[] = [];
        for (const ds of dc.sessions) {
          const srow = await db.addAttendanceSession(row.id, { day: ds.day, minutes: ds.minutes });
          sessions.push({ id: srow.id, day: srow.day, minutes: srow.minutes, notes: [] });
        }
        const missedSessions: MissedEntry[] = [];
        for (const dm of dc.missedSessions) {
          const arow = await db.addAbsence(row.id, { day: dm.day, minutes: dm.minutes });
          missedSessions.push({ id: arow.id, day: arow.day, minutes: arow.minutes });
        }
        courses.push({
          id: row.id,
          name: row.name,
          creditHours: row.creditHours,
          attendanceLimit: row.attendanceLimit,
          sessions,
          missedLectures: 0,
          missedSessions,
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
      // Reminders are a setting, not academic data — keep them across a reset.
      notifPrefs: d.notifPrefs,
      // Reset removes courses/grades only — planner items aren't deleted in the
      // cloud, so keep them in memory too (they'd otherwise reappear on reload).
      planner: d.planner,
    }));
  }, []);

  const value: StoreValue = {
    ...data,
    hydrated,
    setProfileName,
    setEmail,
    setProfilePhoto,
    setGpaGoal,
    addPlannerNote,
    updatePlannerNote,
    deletePlannerNote,
    setPlannerAutoEdit,
    setLanguage,
    setTheme,
    setTaskOrder,
    setReminderDays,
    setGpaMode,
    setCumulativeGpa,
    setCumulativeHours,
    setNotifPrefs,
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
