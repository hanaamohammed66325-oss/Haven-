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
  GradeComponent,
  Semester,
} from "@/types";
import { demoCourses } from "@/lib/demo";

const STORAGE_KEY = "haven-data";

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
};

const initialData: AppData = {
  profileName: "Student",
  language: "en",
  semester: defaultSemester,
  courses: [],
};

interface StoreValue extends AppData {
  hydrated: boolean;
  setProfileName: (name: string) => void;
  setLanguage: (lang: "en" | "ar") => void;
  setSemester: (patch: Partial<Semester>) => void;
  addCourse: (course: Omit<Course, "id" | "components">) => void;
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
  updateAttendance: (
    courseId: string,
    attended: number,
    total: number
  ) => void;
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
          semester: { ...defaultSemester, ...(parsed.semester ?? {}) },
          courses: parsed.courses ?? [],
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

  const setProfileName = useCallback(
    (name: string) => setData((d) => ({ ...d, profileName: name })),
    []
  );

  const setLanguage = useCallback(
    (lang: "en" | "ar") => setData((d) => ({ ...d, language: lang })),
    []
  );

  const setSemester = useCallback(
    (patch: Partial<Semester>) =>
      setData((d) => ({ ...d, semester: { ...d.semester, ...patch } })),
    []
  );

  const addCourse = useCallback(
    (course: Omit<Course, "id" | "components">) =>
      setData((d) => ({
        ...d,
        courses: [...d.courses, { ...course, id: uid(), components: [] }],
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

  const updateAttendance = useCallback(
    (courseId: string, attended: number, total: number) =>
      setData((d) => ({
        ...d,
        courses: d.courses.map((c) =>
          c.id === courseId
            ? { ...c, attendedLectures: attended, totalLectures: total }
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
        profileName: d.profileName,
      })),
    []
  );

  const value: StoreValue = {
    ...data,
    hydrated,
    setProfileName,
    setLanguage,
    setSemester,
    addCourse,
    updateCourse,
    deleteCourse,
    addComponent,
    updateComponent,
    deleteComponent,
    updateAttendance,
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
