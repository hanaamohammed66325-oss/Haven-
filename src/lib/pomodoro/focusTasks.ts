/**
 * Pomodoro for tasks: besides a course, a focus session can be spent on one
 * task — a course's assignment/project, preparing for one of its exams, or a
 * planner task. Keys: "component:<id>" | "planner:<id>". The focus spent on
 * each (minutes, sessions, the student's estimate, done) lives in
 * preferences.taskFocus (see TaskFocus).
 */
import type { ComponentType, Course, PlannerNote, TaskFocus } from "@/types";
import { addDays, toISODate } from "@/lib/dates";
import { EXAM_TYPES } from "@/lib/upcoming";

export type FocusTaskKind = "assignment" | "exam" | "planner";

export interface FocusTask {
  key: string;
  kind: FocusTaskKind;
  name: string;
  /** the course an assessment belongs to; planner tasks have none */
  courseId: string | null;
  courseName: string | null;
  /** assessments: their date (ISO) or null; planner tasks: null */
  date: string | null;
  /** planner tasks: week + day, to keep them in the planner's order */
  week?: number;
  day?: number;
}

// An assignment stays on the list a while past its date (submitted late, or not
// graded yet); an exam's date is the last day to prepare for it.
const ASSIGNMENT_GRACE_DAYS = 14;

export const componentTaskKey = (id: string) => `component:${id}`;
export const plannerTaskKey = (id: string) => `planner:${id}`;
/** A planner task's key → its note's id. */
export const plannerIdOf = (key: string) => key.slice("planner:".length);
export const isTaskKey = (key: string) => key.startsWith("component:") || key.startsWith("planner:");
export const kindOf = (type: ComponentType): FocusTaskKind => (EXAM_TYPES.includes(type) ? "exam" : "assignment");

/**
 * What the student can focus on right now, soonest first: ungraded assessments
 * not marked done (an exam until its day, an assignment up to two weeks past
 * its date), then the planner's open tasks of this week and the next.
 */
export function focusTasks(
  courses: Course[],
  notes: PlannerNote[],
  currentWeek: number,
  taskFocus: Record<string, TaskFocus>,
  today: string = toISODate(new Date()),
): FocusTask[] {
  const oldest = toISODate(addDays(new Date(today + "T00:00:00"), -ASSIGNMENT_GRACE_DAYS));
  const assessments: FocusTask[] = [];
  for (const c of courses) {
    for (const comp of c.components) {
      const key = componentTaskKey(comp.id);
      if (comp.score != null || taskFocus[key]?.done) continue;
      const kind = kindOf(comp.type);
      if (comp.date && comp.date < (kind === "exam" ? today : oldest)) continue;
      assessments.push({ key, kind, name: comp.name, courseId: c.id, courseName: c.name, date: comp.date });
    }
  }
  assessments.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  const planner: FocusTask[] = notes
    .filter((n) => !n.done && (n.week === currentWeek || n.week === currentWeek + 1) && n.text.trim())
    .map((n) => ({
      key: plannerTaskKey(n.id),
      kind: "planner" as const,
      name: n.text.trim(),
      courseId: null,
      courseName: null,
      date: null,
      week: n.week,
      day: n.day,
    }))
    .sort((a, b) => a.week - b.week || (a.day ?? 7) - (b.day ?? 7)); // whole-week tasks after the days

  return [...assessments, ...planner];
}

/** preferences.taskFocus → a clean map (unknown keys and bad values dropped). */
export function readTaskFocus(raw: unknown): Record<string, TaskFocus> {
  if (!raw || typeof raw !== "object") return {};
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);
  const out: Record<string, TaskFocus> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isTaskKey(key) || !v || typeof v !== "object") continue;
    const e = v as Record<string, unknown>;
    out[key] = { minutes: num(e.minutes), sessions: num(e.sessions) };
    if (num(e.estimate)) out[key].estimate = num(e.estimate);
    if (e.done === true) out[key].done = true;
    if (typeof e.doneAt === "string") out[key].doneAt = e.doneAt;
  }
  return out;
}
