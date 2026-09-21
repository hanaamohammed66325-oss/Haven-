// ---------------------------------------------------------------------------
// Shared "smart suggestions" engine.
//
// One prioritized list of the most relevant things for a student right now —
// attendance risk, low grades, the nearest exam/task, a missed check-in, etc.
// Used BOTH by the dashboard chips (SmartSuggestions.tsx) and by the notifier
// (notifScheduler), so a reminder says the same smart thing the dashboard does
// instead of a dumb stacked list. Pure: no React, no JSX — the caller maps each
// `kind` to an icon.
// ---------------------------------------------------------------------------

import type { Course, PlannerData, Semester } from "@/types";
import type { GamificationState } from "./gamification";
import type { TranslationKey } from "@/i18n/translations/en";
import {
  courseCurrentPct,
  attendanceInfo,
  semesterProgress,
  semesterGPA,
} from "./grades";
import { buildUpcoming } from "./upcoming";
import { toISODate } from "./dates";
import { POMODORO_ENABLED } from "./featureFlags";

export type SuggestionKind =
  | "att-danger"
  | "att-warn"
  | "exam"
  | "task"
  | "ungraded"
  | "checkin"
  | "finals-week"
  | "midterm-week"
  | "gpa-goal"
  | "all-good";

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  text: string;
  href?: string;
  color: string;
  priority: number;
}

export interface SmartContext {
  courses: Course[];
  planner: PlannerData;
  semester: Semester;
  gamification: GamificationState;
  gpaGoal: number;
  now?: Date;
}

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** Build the prioritized suggestion list (lowest `priority` = most urgent). */
export function buildSmartSuggestions(ctx: SmartContext, t: T): Suggestion[] {
  const { courses, planner, semester, gamification, gpaGoal } = ctx;
  const now = ctx.now ?? new Date();
  const today = toISODate(now);
  const checkedIn = gamification.checkedInToday === today;
  const items: Suggestion[] = [];

  // 1. Attendance danger / warn
  for (const c of courses) {
    const att = attendanceInfo(c, semester);
    if (att?.status === "danger") {
      items.push({
        id: `att-danger-${c.id}`,
        kind: "att-danger",
        text: t("smart_attDanger", { course: c.name, n: att.absence.toFixed(0) }),
        href: `/courses#${c.id}`,
        color: "var(--color-danger)",
        priority: 1,
      });
    } else if (att?.status === "warn") {
      items.push({
        id: `att-warn-${c.id}`,
        kind: "att-warn",
        text: t("smart_attWarn", { course: c.name, n: att.absence.toFixed(0) }),
        href: `/courses#${c.id}`,
        color: "#C77E2E",
        priority: 2,
      });
    }
  }

  // (A per-course "low grade" warning used to live here. Removed: mid-semester
  //  it fired off a single partial task and read as misleading — the course
  //  grade is a best-case ceiling out of 100, not a verdict on one quiz.)

  // 3. Upcoming exams/quizzes — individual (7-day window). A "tomorrow" exam
  // gets a warm, conversational nudge ("got an exam tomorrow — review a bit?")
  // instead of the dry "Name · Course — Tomorrow" line.
  const upcoming = buildUpcoming(courses, planner, semester, now);
  for (const exam of upcoming.filter((u) => u.bucket === "exam" && u.diffDays <= 7)) {
    const text =
      exam.diffDays === 1
        ? t("smart_examTomorrow", { exam: exam.name })
        : `${exam.name}${exam.courseName ? ` · ${exam.courseName}` : ""} — ${
            exam.diffDays === 0 ? t("dueToday") : t("dueInDays", { n: exam.diffDays })
          }`;
    items.push({
      id: `exam-${exam.date}-${exam.name}`,
      kind: "exam",
      text,
      // An imminent exam (today/tomorrow) sends the student straight to the focus
      // timer to actually prepare; a further-out one still opens the exam itself.
      href: exam.diffDays <= 1 && POMODORO_ENABLED ? "/pomodoro" : exam.href,
      color: "#C77E2E",
      priority: exam.diffDays <= 1 ? 2 : 4,
    });
  }

  // 4. Tasks due. When several land tomorrow, one "you've got N things due
  // tomorrow — want to start now?" nudge beats a wall of individual lines; a
  // lone task tomorrow gets its own conversational "knock it out now" nudge.
  const tasks = upcoming.filter((u) => u.bucket === "task");
  const tomorrowTasks = tasks.filter((task) => task.diffDays === 1);
  const collapseTomorrow = tomorrowTasks.length >= 3;
  if (collapseTomorrow) {
    items.push({
      id: "tasks-tomorrow-many",
      kind: "task",
      text: t("smart_manyTasksTomorrow", { n: tomorrowTasks.length }),
      href: "/assignments",
      color: "var(--color-primary)",
      priority: 3,
    });
  }
  for (const task of tasks) {
    if (collapseTomorrow && task.diffDays === 1) continue; // folded into the aggregate
    const text =
      task.diffDays === 1
        ? t("smart_taskTomorrowSoon", { task: task.name })
        : `${task.name}${task.courseName ? ` · ${task.courseName}` : ""} — ${
            task.diffDays === 0 ? t("dueToday") : t("dueInDays", { n: task.diffDays })
          }`;
    items.push({
      id: `task-${task.date}-${task.name}`,
      kind: "task",
      text,
      href: task.href,
      color: "var(--color-primary)",
      priority: task.diffDays <= 1 ? 3 : 5,
    });
  }

  // 5. Ungraded components with past dates
  let ungradedCount = 0;
  for (const c of courses) {
    for (const comp of c.components) {
      if (comp.score == null && comp.date && comp.date < today && comp.type !== "final") {
        ungradedCount++;
      }
    }
  }
  if (ungradedCount > 0) {
    items.push({
      id: "ungraded",
      kind: "ungraded",
      text: t("smart_ungraded", { n: ungradedCount }),
      href: "/courses",
      color: "var(--color-primary)",
      priority: 5,
    });
  }

  // 6. Check-in reminder
  if (!checkedIn) {
    const streak = gamification.streak.current;
    items.push({
      id: "checkin",
      kind: "checkin",
      text: streak > 0 ? t("smart_checkinStreak", { n: streak }) : t("smart_checkin"),
      color: "var(--color-brass)",
      priority: 6,
    });
  }

  // 7. Exam-week detection
  const progress = semesterProgress(semester);
  const isFinalsWeek =
    progress.currentWeek > semester.weeks &&
    progress.currentWeek <= semester.weeks + semester.finalsWeeks;
  const isMidtermWeek =
    progress.currentWeek >= Math.floor(semester.weeks / 2) - 1 &&
    progress.currentWeek <= Math.floor(semester.weeks / 2) + 1;
  if (isFinalsWeek) {
    items.push({
      id: "finals-week",
      kind: "finals-week",
      text: t("smart_finalsWeek"),
      color: "var(--color-danger)",
      priority: 1,
    });
  } else if (isMidtermWeek) {
    items.push({
      id: "midterm-week",
      kind: "midterm-week",
      text: t("smart_midtermWeek"),
      color: "#C77E2E",
      priority: 3,
    });
  }

  // 8. GPA goal tracking
  if (gpaGoal > 0 && courses.some((c) => courseCurrentPct(c) != null)) {
    const currentGpa = semesterGPA(courses);
    if (currentGpa != null && currentGpa < gpaGoal && gpaGoal - currentGpa <= 0.5) {
      items.push({
        id: "gpa-goal",
        kind: "gpa-goal",
        text: t("smart_gpaGoal", { current: currentGpa.toFixed(2), goal: gpaGoal.toFixed(1) }),
        color: "var(--color-primary)",
        priority: 5,
      });
    }
  }

  // 9. All good — positive message
  if (items.length === 0) {
    items.push({
      id: "all-good",
      kind: "all-good",
      text: t("smart_allGood"),
      color: "var(--color-success)",
      priority: 99,
    });
  }

  return items.sort((a, b) => a.priority - b.priority);
}
