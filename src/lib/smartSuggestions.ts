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
  pctToGrade,
  attendanceInfo,
  semesterProgress,
  semesterGPA,
} from "./grades";
import { buildUpcoming } from "./upcoming";
import { toISODate } from "./dates";

export type SuggestionKind =
  | "att-danger"
  | "att-warn"
  | "grade-low"
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

  // 2. Low grade warning
  for (const c of courses) {
    const pct = courseCurrentPct(c);
    if (pct != null && pctToGrade(pct).points <= 3.0) {
      items.push({
        id: `grade-low-${c.id}`,
        kind: "grade-low",
        text: t("smart_lowGrade", { course: c.name, letter: pctToGrade(pct).letter }),
        href: `/courses#${c.id}`,
        color: "var(--color-danger)",
        priority: 3,
      });
    }
  }

  // 3. Upcoming exams/quizzes — individual (7-day window)
  const upcoming = buildUpcoming(courses, planner, semester, now);
  for (const exam of upcoming.filter((u) => u.bucket === "exam" && u.diffDays <= 7)) {
    const when =
      exam.diffDays === 0 ? t("dueToday")
      : exam.diffDays === 1 ? t("dueTomorrow")
      : t("dueInDays", { n: exam.diffDays });
    items.push({
      id: `exam-${exam.date}-${exam.name}`,
      kind: "exam",
      text: `${exam.name}${exam.courseName ? ` · ${exam.courseName}` : ""} — ${when}`,
      href: exam.href,
      color: "#C77E2E",
      priority: exam.diffDays <= 1 ? 2 : 4,
    });
  }

  // 4. Tasks due — individual
  for (const task of upcoming.filter((u) => u.bucket === "task")) {
    const when =
      task.diffDays === 0 ? t("dueToday")
      : task.diffDays === 1 ? t("dueTomorrow")
      : t("dueInDays", { n: task.diffDays });
    items.push({
      id: `task-${task.date}-${task.name}`,
      kind: "task",
      text: `${task.name}${task.courseName ? ` · ${task.courseName}` : ""} — ${when}`,
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
