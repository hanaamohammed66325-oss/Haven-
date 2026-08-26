// ---------------------------------------------------------------------------
// Client-side notification scheduler.
//
// Schedules browser Notification API calls based on each user's own notifPrefs
// and course/planner data. Every tab runs its own timers from its own store,
// so per-user timing (lectures.minutesBefore) is always honored — no shared
// server clock that could make different users' reminders fire together.
//
// Entry point: scheduleAll(). Call once after hydration and whenever courses,
// semester, planner, or notifPrefs change. Clears all previous timers first.
// ---------------------------------------------------------------------------

import type { Course, NotifPrefs, PlannerData, Semester } from "@/types";
import { collectUpcoming, plannerItemDate } from "./reminders";

let activeTimers: ReturnType<typeof setTimeout>[] = [];
const FIRED_KEY = "haven-notif-fired";

// setTimeout max safe delay (~24.85 days). Values above this wrap to 1ms.
const MAX_DELAY = 0x7fffffff;

function clearAll() {
  for (const t of activeTimers) clearTimeout(t);
  activeTimers = [];
}

function firedToday(id: string): boolean {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw) as { date: string; ids: string[] };
    if (obj.date !== new Date().toISOString().slice(0, 10)) return false;
    return obj.ids.includes(id);
  } catch {
    return false;
  }
}

function markFired(id: string) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(FIRED_KEY);
    let obj: { date: string; ids: string[] } = { date: today, ids: [] };
    if (raw) {
      const parsed = JSON.parse(raw) as { date: string; ids: string[] };
      if (parsed.date === today) obj = parsed;
    }
    obj.ids.push(id);
    localStorage.setItem(FIRED_KEY, JSON.stringify(obj));
  } catch { /* ignore */ }
}

function fire(title: string, body: string, id: string) {
  if (firedToday(id)) return;
  markFired(id);
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, {
      body,
      icon: "/icons/icon-192.png",
      tag: id,
    });
  }
}

function scheduleAt(ms: number, title: string, body: string, id: string) {
  if (ms <= 0 || ms > MAX_DELAY) return;
  activeTimers.push(setTimeout(() => fire(title, body, id), ms));
}

function todayAt(hh: number, mm: number): number {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

function isWithinSemester(semester: Semester): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = new Date(`${semester.startDate}T00:00:00`);
  const end = new Date(`${semester.endDate}T00:00:00`);
  if (Number.isNaN(+start) || Number.isNaN(+end)) return true;
  return now >= start && now <= end;
}

// ---- Lecture reminders ----

function scheduleLectures(
  courses: Course[],
  prefs: NotifPrefs,
  semester: Semester,
  lang: "en" | "ar",
) {
  if (!prefs.lectures.enabled) return;
  if (!isWithinSemester(semester)) return;
  const now = Date.now();
  const today = new Date().getDay();

  for (const course of courses) {
    for (const session of course.sessions) {
      if (session.day !== today || !session.time) continue;
      const m = /^(\d{1,2}):(\d{2})$/.exec(session.time);
      if (!m) continue;

      const lectureMs = todayAt(Number(m[1]), Number(m[2]));
      const fireAt = lectureMs - prefs.lectures.minutesBefore * 60_000;
      const delay = fireAt - now;

      const id = `lec-${course.id}-${session.id}-${session.time}`;
      const body = lang === "ar"
        ? `تبدأ خلال ${prefs.lectures.minutesBefore} دقيقة`
        : `Starts in ${prefs.lectures.minutesBefore} min`;
      scheduleAt(delay, course.name, body, id);
    }
  }
}

// ---- Daily digest (exams, assignments, planner deadlines) ----

function scheduleDailyDigest(
  courses: Course[],
  planner: PlannerData,
  semester: Semester,
  prefs: NotifPrefs,
  reminderDays: number,
  lang: "en" | "ar",
) {
  if (!prefs.exams.enabled) return;
  const now = Date.now();
  const fireAt = todayAt(prefs.dailyReminderHour, 0);
  if (fireAt - now <= 0) return;

  const maxDays = prefs.exams.days.length ? Math.max(...prefs.exams.days) : reminderDays;
  const items = collectUpcoming(courses, planner, semester, maxDays);
  const filtered = items.filter((it) => prefs.exams.days.some((d) => it.diff <= d));
  if (!filtered.length) return;

  const lines = filtered.map((it) => {
    if (lang === "ar") {
      if (it.diff === 0) return `اليوم: ${it.title}`;
      if (it.diff === 1) return `غداً: ${it.title}`;
      return `بعد ${it.diff} أيام: ${it.title}`;
    }
    if (it.diff === 0) return `Today: ${it.title}`;
    if (it.diff === 1) return `Tomorrow: ${it.title}`;
    return `In ${it.diff} days: ${it.title}`;
  });

  const id = `daily-${new Date().toISOString().slice(0, 10)}`;
  const title = lang === "ar" ? "Haven — القادم" : "Haven — Upcoming";
  scheduleAt(fireAt - now, title, lines.join("\n"), id);
}

// ---- Task hour-based reminders ----

function scheduleTasks(
  planner: PlannerData,
  semester: Semester,
  prefs: NotifPrefs,
  lang: "en" | "ar",
) {
  if (!prefs.tasks.enabled) return;
  const now = Date.now();

  for (const note of planner.notes) {
    if (!note.dueTime || note.day == null) continue;
    const d = plannerItemDate(semester, note.week, note.day);
    if (!d) continue;

    const m = /^(\d{1,2}):(\d{2})$/.exec(note.dueTime);
    if (!m) continue;
    const due = new Date(d);
    due.setHours(Number(m[1]), Number(m[2]), 0, 0);
    const dueMs = due.getTime();

    for (const hoursAhead of prefs.tasks.hours) {
      const fireAt = dueMs - hoursAhead * 3600_000;
      const delay = fireAt - now;
      const id = `task-${note.id}-${hoursAhead}h`;
      const body = lang === "ar"
        ? `موعد التسليم خلال ${hoursAhead} ساعة`
        : `Due in ${hoursAhead}h`;
      scheduleAt(delay, `Haven — ${note.text}`, body, id);
    }
  }
}

// ---- Public API ----

export function scheduleAll(
  courses: Course[],
  planner: PlannerData,
  semester: Semester,
  notifPrefs: NotifPrefs,
  reminderDays: number,
  lang: "en" | "ar",
) {
  clearAll();
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  scheduleLectures(courses, notifPrefs, semester, lang);
  scheduleDailyDigest(courses, planner, semester, notifPrefs, reminderDays, lang);
  scheduleTasks(planner, semester, notifPrefs, lang);
}

export function cancelAll() {
  clearAll();
}
