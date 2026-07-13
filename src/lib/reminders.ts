// ---------------------------------------------------------------------------
// Upcoming-reminder collection — the SINGLE source for the on-open toast.
// Combines dated course items (tasks / exams / assignments) with reminder-
// eligible planner deadline chips, de-duplicated and sorted soonest-first.
// Each item also carries a precise `ts` (date + optional time) so a future
// notification server / mobile app can read one timestamp per reminder.
// ---------------------------------------------------------------------------

import type { Course, PlannerData, Semester } from "@/types";
import { addDays, toISODate } from "./dates";

/** Planner tags that trigger a reminder. Extend this set to add more.
 *  إجازة (tagHoliday) is intentionally NOT reminder-eligible. */
export const REMINDER_TAGS = new Set<string>([
  "tagDeadline",
  "tagExam",
  "tagQuiz",
  "tagAssignment",
]);

export interface UpcomingItem {
  /** dedup key = `${dateISO}|${note}` */
  key: string;
  /** whole days from today (0 = today, 1 = tomorrow, …) */
  diff: number;
  /** raw title (course name, or the planner note text) */
  title: string;
  /** planner tag key when this came from the planner; undefined for course items */
  tag?: string;
  /** "HH:MM" (24h) when the item has a due time */
  time?: string;
  /** precise target timestamp (calendar date + due time, else date midnight) */
  ts: number;
}

const DAY_MS = 86400000;
const localMidnight = (iso: string) => new Date(`${iso}T00:00:00`);

/** Calendar date (local midnight) of a planner item at (1-based week, weekday
 *  0..6). Mirrors the Planner grid: week start = semester start + (week-1)*7,
 *  then the offset to that weekday within the week window. */
export function plannerItemDate(sem: Semester, week: number, day: number): Date | null {
  const start = new Date(sem.startDate);
  if (Number.isNaN(+start)) return null;
  const weekStart = localMidnight(toISODate(new Date(+start + (week - 1) * 7 * DAY_MS)));
  const offset = (((day - weekStart.getDay()) % 7) + 7) % 7;
  return addDays(weekStart, offset);
}

/**
 * Gather every dated item due within [today, today + reminderDays] (inclusive),
 * from courses AND reminder-eligible planner chips. De-duplicated by date+note,
 * sorted soonest-first; within a day, timed items (earliest first) before untimed.
 */
export function collectUpcoming(
  courses: Course[],
  planner: PlannerData,
  sem: Semester,
  reminderDays: number,
  now: Date = new Date()
): UpcomingItem[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.max(1, Math.round(Number(reminderDays) || 2));

  const out: UpcomingItem[] = [];
  const seen = new Set<string>();

  const push = (dateISO: string, title: string, opts: { tag?: string; time?: string | null }) => {
    const due = localMidnight(dateISO);
    if (Number.isNaN(+due)) return;
    const diff = Math.round((+due - +today) / DAY_MS);
    if (diff < 0 || diff > days) return; // ignore past + beyond the window
    const key = `${dateISO}|${title}`;
    if (seen.has(key)) return; // de-dup by (date + note)
    seen.add(key);
    const time = opts.time || undefined;
    let ts = due.getTime();
    const m = time ? /^(\d{1,2}):(\d{2})$/.exec(time) : null;
    if (m) {
      const dt = new Date(due);
      dt.setHours(Number(m[1]), Number(m[2]), 0, 0);
      ts = dt.getTime();
    }
    out.push({ key, diff, title, tag: opts.tag, time, ts });
  };

  // Course-derived dated items (tasks / exams / assignments).
  for (const c of courses) {
    for (const comp of c.components) {
      if (comp.date) push(comp.date, comp.name, {});
    }
  }

  // Planner deadline chips: reminder-eligible tag + a specific day (not -1).
  for (const n of planner.notes) {
    if (!n.tag || !REMINDER_TAGS.has(n.tag)) continue;
    if (n.day == null) continue; // whole-week chips are never reminded
    const d = plannerItemDate(sem, n.week, n.day);
    if (d) push(toISODate(d), n.text, { tag: n.tag, time: n.dueTime });
  }

  out.sort((a, b) => {
    if (a.diff !== b.diff) return a.diff - b.diff;
    const at = a.time ? 1 : 0;
    const bt = b.time ? 1 : 0;
    if (at !== bt) return bt - at; // timed items before untimed ones
    if (a.time && b.time) return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
    return 0;
  });
  return out;
}
