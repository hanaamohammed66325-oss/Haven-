// ---------------------------------------------------------------------------
// Upcoming — the SINGLE source of truth for what counts as "upcoming".
//
// Both the dashboard's big UPCOMING number and the Upcoming card's list are
// built from `buildUpcoming()`, so the count can never disagree with the rows.
//
// The rule (see `isUpcoming`): an item must have a REAL date, must not be in
// the past, and must fall inside its bucket's window — exams within 14 days,
// tasks within 7. Undated items never appear, whatever their type.
// ---------------------------------------------------------------------------

import type { Course, PlannerData, Semester } from "@/types";
import { toISODate } from "./dates";
import { plannerItemDate, REMINDER_TAGS } from "./reminders";

/** Component types routed to the exams section. */
export const EXAM_TYPES = ["quiz", "midterm", "final"];
/** Component types routed to the tasks/assignments section. */
export const TASK_TYPES = ["assignment", "project"];
/** Planner tags routed to the exams section (إجازة is never reminder-eligible). */
export const PLANNER_EXAM_TAGS = new Set(["tagExam", "tagQuiz"]);

/** Near-term windows, inclusive of today. */
export const UPCOMING_EXAM_DAYS = 14;
export const UPCOMING_TASK_DAYS = 7;

export type UpcomingBucket = "exam" | "task";

export interface UpcomingEntry {
  /** where clicking the row goes */
  href: string;
  /** course name, or null when this came from the planner */
  courseName: string | null;
  name: string;
  /** component type ("final", "quiz", …) or planner tag ("tagExam", …) */
  kind: string;
  source: "course" | "planner";
  /** always a real ISO date — undated items never reach here */
  date: string;
  /** "HH:MM" (24h) when the item carries a due time */
  time: string | null;
  /** whole days until due; always >= 0 and inside the bucket's window */
  diffDays: number;
  bucket: UpcomingBucket;
}

const DAY_MS = 86400000;

/**
 * Whole days from today (local midnight) to an ISO date.
 * Returns null when there is no usable date — null, undefined, "" and
 * unparseable values all count as "no date".
 */
export function daysUntil(
  date: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!date) return null;
  const due = new Date(`${date}T00:00:00`);
  if (Number.isNaN(+due)) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((+due - +today) / DAY_MS);
}

/** Window length in days for a bucket. */
export function windowFor(bucket: UpcomingBucket): number {
  return bucket === "exam" ? UPCOMING_EXAM_DAYS : UPCOMING_TASK_DAYS;
}

/**
 * THE rule for "does this belong in Upcoming?".
 * Undated items are never upcoming; past-dated ones are left out as before.
 */
export function isUpcoming(
  bucket: UpcomingBucket,
  date: string | null | undefined,
  now?: Date
): boolean {
  const d = daysUntil(date, now);
  if (d == null) return false; // no date -> never upcoming
  return d >= 0 && d <= windowFor(bucket);
}

/** Which section a course component belongs to, or null if it's neither. */
export function bucketForComponentType(type: string): UpcomingBucket | null {
  if (EXAM_TYPES.includes(type)) return "exam";
  if (TASK_TYPES.includes(type)) return "task";
  return null;
}

/** Soonest first; within a day, timed items before untimed, earliest first. */
export function compareUpcoming(a: UpcomingEntry, b: UpcomingEntry): number {
  if (a.date !== b.date) return +new Date(a.date) - +new Date(b.date);
  const at = a.time ? 1 : 0;
  const bt = b.time ? 1 : 0;
  if (at !== bt) return bt - at;
  if (a.time && b.time) return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
  return 0;
}

/**
 * Build the Upcoming list from courses + reminder-eligible planner chips.
 * De-duplicated by (date + title) and sorted soonest-first.
 */
export function buildUpcoming(
  courses: Course[],
  planner: PlannerData,
  sem: Semester,
  now: Date = new Date()
): UpcomingEntry[] {
  const out: UpcomingEntry[] = [];
  const seen = new Set<string>();
  const add = (e: UpcomingEntry) => {
    const key = `${e.date}|${e.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };

  // Course items: still ungraded, real date, inside their bucket's window.
  for (const c of courses) {
    for (const comp of c.components) {
      if (comp.score != null) continue; // already graded
      const bucket = bucketForComponentType(comp.type);
      if (!bucket) continue;
      if (!isUpcoming(bucket, comp.date, now)) continue;
      add({
        href: `/courses#${c.id}`,
        courseName: c.name,
        name: comp.name,
        kind: comp.type,
        source: "course",
        date: comp.date as string,
        time: null,
        diffDays: daysUntil(comp.date, now) as number,
        bucket,
      });
    }
  }

  // Planner deadline chips — reminder-eligible tag pinned to a specific day.
  // Their real date comes from the week's start date + weekday offset.
  for (const n of planner.notes) {
    if (!n.tag || !REMINDER_TAGS.has(n.tag)) continue;
    if (n.day == null) continue; // whole-week chips have no due day
    const d = plannerItemDate(sem, n.week, n.day);
    if (!d) continue;
    const iso = toISODate(d);
    const bucket: UpcomingBucket = PLANNER_EXAM_TAGS.has(n.tag) ? "exam" : "task";
    if (!isUpcoming(bucket, iso, now)) continue;
    add({
      href: "/schedule",
      courseName: null,
      name: n.text,
      kind: n.tag,
      source: "planner",
      date: iso,
      time: n.dueTime ?? null,
      diffDays: daysUntil(iso, now) as number,
      bucket,
    });
  }

  return out.sort(compareUpcoming);
}
