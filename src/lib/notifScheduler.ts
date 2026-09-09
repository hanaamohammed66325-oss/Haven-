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
import { plannerItemDate } from "./reminders";

/** A single, ready-to-fire smart reminder (built in the React layer from
 *  buildSmartSuggestions, so the notification says the same smart thing the
 *  dashboard chips do). */
export interface SmartAlert {
  id: string;
  title: string;
  body: string;
}

let activeTimers: ReturnType<typeof setTimeout>[] = [];
const FIRED_KEY = "haven-notif-fired";

// setTimeout max safe delay (~24.85 days). Values above this wrap to 1ms.
const MAX_DELAY = 0x7fffffff;

// Friendly, varied lecture-reminder body (mirrors the server push template).
// The client has no room data, so room is omitted here.
function lectureBody(lang: "en" | "ar", course: string, mins: number): string {
  if (lang === "en") {
    const v = [
      `Don't forget ${course}! Starts in ${mins} min 🚀`,
      `Heads up — ${course} is coming up 📚`,
      `Time for ${course}! Get ready 🚀`,
    ];
    return v[Math.floor(Math.random() * v.length)];
  }
  const v = [
    `لا تنسى ${course}! يبدأ بعد ${mins} دقيقة 🚀`,
    `يلا! عندك ${course} بعد شوي 📚`,
    `وقت ${course}! جهّز نفسك 🚀`,
  ];
  return v[Math.floor(Math.random() * v.length)];
}

function clearAll() {
  for (const t of activeTimers) clearTimeout(t);
  activeTimers = [];
}

function localDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firedToday(id: string): boolean {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw) as { date: string; ids: string[] };
    if (obj.date !== localDateStr()) return false;
    return obj.ids.includes(id);
  } catch {
    return false;
  }
}

function markFired(id: string) {
  try {
    const today = localDateStr();
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
  const todayDay = new Date().getDay();
  const tomorrowDay = (todayDay + 1) % 7;

  for (const course of courses) {
    for (const session of course.sessions) {
      if (!session.time) continue;
      const m = /^(\d{1,2}):(\d{2})$/.exec(session.time);
      if (!m) continue;

      if (session.day === todayDay) {
        const lectureMs = todayAt(Number(m[1]), Number(m[2]));
        const fireAt = lectureMs - prefs.lectures.minutesBefore * 60_000;
        const delay = fireAt - now;
        const id = `lec-${course.id}-${session.id}-${session.time}`;
        scheduleAt(delay, `${course.name} 📚`, lectureBody(lang, course.name, prefs.lectures.minutesBefore), id);
      } else if (session.day === tomorrowDay) {
        const tomorrowMs = todayAt(Number(m[1]), Number(m[2])) + 86400000;
        const fireAt = tomorrowMs - prefs.lectures.minutesBefore * 60_000;
        const delay = fireAt - now;
        const id = `lec-${course.id}-${session.id}-${session.time}-tmrw`;
        scheduleAt(delay, `${course.name} 📚`, lectureBody(lang, course.name, prefs.lectures.minutesBefore), id);
      }
    }
  }
}

// ---- Daily smart reminder (single, highest-priority suggestion) ----

// One notification a day carrying the SINGLE most relevant suggestion (nearest
// deadline / attendance risk / low grade …), not a stacked list. The content is
// computed in the React layer (buildSmartSuggestions) and passed in ready-made.
function scheduleSmartDaily(alert: SmartAlert | null, prefs: NotifPrefs) {
  if (!prefs.exams.enabled || !alert) return;
  const now = Date.now();
  const fireAt = todayAt(prefs.dailyReminderHour, 0);
  const id = `smart-${localDateStr()}`;
  const delay = fireAt - now;
  if (delay > 0) {
    scheduleAt(delay, alert.title, alert.body, id);
  } else {
    // App opened after the scheduled hour — fire immediately instead of skipping.
    fire(alert.title, alert.body, id);
  }
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
  lang: "en" | "ar",
  smartAlert: SmartAlert | null,
) {
  clearAll();
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  scheduleLectures(courses, notifPrefs, semester, lang);
  scheduleSmartDaily(smartAlert, notifPrefs);
  scheduleTasks(planner, semester, notifPrefs, lang);
}

export function cancelAll() {
  clearAll();
}
