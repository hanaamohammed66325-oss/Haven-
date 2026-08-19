// ---------------------------------------------------------------------------
// notifPrefs — customizable notification preferences.
//
// Single source of truth for the SHAPE, DEFAULTS, and BOUNDS of the notifPrefs
// object stored under profiles.preferences.notifPrefs. The store reads raw JSON
// through `normalizeNotifPrefs` (so a missing/partial/corrupt value always
// becomes a complete, valid object) and writes it back via the store setter.
//
// There is an older `reminderDays` preference; it is intentionally NOT read
// here — notifPrefs supersedes it.
// ---------------------------------------------------------------------------

import type { NotifPrefs } from "@/types";

/** Applied whenever preferences.notifPrefs is absent — existing users unaffected. */
export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  exams: { enabled: true, days: [3, 1] },
  tasks: { enabled: true, hours: [12, 2] },
  attendance: { enabled: true },
  lectures: { enabled: true, minutesBefore: 15 },
  dailyReminderHour: 9,
};

// Bounds (also enforced in the UI). Days: 1..30, Hours: 1..72, Hour-of-day: 0..23,
// Lecture lead time: 5..120 minutes.
export const EXAM_DAYS_MIN = 1;
export const EXAM_DAYS_MAX = 30;
export const TASK_HOURS_MIN = 1;
export const TASK_HOURS_MAX = 72;
export const DAILY_HOUR_MIN = 0;
export const DAILY_HOUR_MAX = 23;
export const LECTURE_MINUTES_MIN = 5;
export const LECTURE_MINUTES_MAX = 120;

/** An integer within [min,max], or null if the value isn't a valid integer in range. */
function intInRange(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/**
 * Coerce a stored offset list into 1–2 valid, in-range, distinct values, sorted
 * largest-first (earliest lead time first). Falls back to `fallback` when nothing
 * valid survives, so a type always keeps at least one reminder.
 */
function normalizeOffsets(raw: unknown, min: number, max: number, fallback: number[]): number[] {
  if (!Array.isArray(raw)) return [...fallback];
  const out: number[] = [];
  for (const item of raw) {
    const n = intInRange(item, min, max);
    if (n != null && !out.includes(n)) out.push(n);
  }
  if (out.length === 0) return [...fallback];
  out.sort((a, b) => b - a); // largest (earliest) first
  return out.slice(0, 2);
}

function normalizeBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * READ helper — turn anything stored under preferences.notifPrefs into a
 * complete, valid NotifPrefs, applying DEFAULT_NOTIF_PREFS for any part that is
 * missing or invalid. Pass `undefined` to get the defaults.
 */
export function normalizeNotifPrefs(raw: unknown): NotifPrefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const exams = o.exams && typeof o.exams === "object" ? (o.exams as Record<string, unknown>) : {};
  const tasks = o.tasks && typeof o.tasks === "object" ? (o.tasks as Record<string, unknown>) : {};
  const attendance =
    o.attendance && typeof o.attendance === "object" ? (o.attendance as Record<string, unknown>) : {};
  const lectures =
    o.lectures && typeof o.lectures === "object" ? (o.lectures as Record<string, unknown>) : {};
  const hour = intInRange(o.dailyReminderHour, DAILY_HOUR_MIN, DAILY_HOUR_MAX);
  const lectureMinutes = intInRange(lectures.minutesBefore, LECTURE_MINUTES_MIN, LECTURE_MINUTES_MAX);
  return {
    exams: {
      enabled: normalizeBool(exams.enabled, DEFAULT_NOTIF_PREFS.exams.enabled),
      days: normalizeOffsets(exams.days, EXAM_DAYS_MIN, EXAM_DAYS_MAX, DEFAULT_NOTIF_PREFS.exams.days),
    },
    tasks: {
      enabled: normalizeBool(tasks.enabled, DEFAULT_NOTIF_PREFS.tasks.enabled),
      hours: normalizeOffsets(tasks.hours, TASK_HOURS_MIN, TASK_HOURS_MAX, DEFAULT_NOTIF_PREFS.tasks.hours),
    },
    attendance: {
      enabled: normalizeBool(attendance.enabled, DEFAULT_NOTIF_PREFS.attendance.enabled),
    },
    lectures: {
      enabled: normalizeBool(lectures.enabled, DEFAULT_NOTIF_PREFS.lectures.enabled),
      minutesBefore:
        lectureMinutes == null ? DEFAULT_NOTIF_PREFS.lectures.minutesBefore : lectureMinutes,
    },
    dailyReminderHour: hour == null ? DEFAULT_NOTIF_PREFS.dailyReminderHour : hour,
  };
}
