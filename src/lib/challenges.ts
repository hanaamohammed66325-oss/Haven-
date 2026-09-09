import type { Course, PlannerData, PomodoroStats, Semester } from "@/types";
import { POMODORO_ENABLED } from "@/lib/featureFlags";
import type { GamificationState, ChallengeItem, ChallengeState, WeeklySnapshot } from "./gamification";
import { defaultChallenges } from "./gamification";

// ── Context ──────────────────────────────────────────────────────────────────

export interface ChallengeContext {
  courses: Course[];
  planner: PlannerData;
  semester: Semester;
  gamification: GamificationState;
  pomodoroStats: PomodoroStats;
  today: string;
}

/** Completed focus sessions recorded today, from the rolling stats window. */
function pomodoroToday(ctx: ChallengeContext): number {
  const rec = ctx.pomodoroStats.recentDays.find((r) => r.date === ctx.today);
  return rec ? rec.completedSessions : 0;
}

// ── Deterministic shuffle seed ───────────────────────────────────────────────

function dateHash(date: string, salt: string): number {
  let h = 0;
  const s = date + salt;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function sundayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Date helpers ────────────────────────────────────────────────────────────

function noteDate(semesterStart: string, week: number, day?: number): string {
  const d = new Date(semesterStart + "T00:00:00");
  d.setDate(d.getDate() + (week - 1) * 7 + (day ?? 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tomorrow(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Challenge definitions ────────────────────────────────────────────────────

interface ChallengeDef {
  type: string;
  xp: number;
  canGenerate: (ctx: ChallengeContext) => boolean;
  generate: (ctx: ChallengeContext) => Record<string, string>;
  isComplete: (ctx: ChallengeContext, params: Record<string, string>) => boolean;
}

const EXAM_TAGS = new Set(["tagExam", "tagQuiz"]);

const DAILY_POOL: ChallengeDef[] = [
  {
    type: "due-today",
    xp: 15,
    canGenerate: (ctx) =>
      ctx.planner.notes.some(
        (n) =>
          !n.done &&
          n.day != null &&
          noteDate(ctx.semester.startDate, n.week, n.day) === ctx.today
      ),
    generate: (ctx) => {
      const due = ctx.planner.notes.filter(
        (n) =>
          !n.done &&
          n.day != null &&
          noteDate(ctx.semester.startDate, n.week, n.day) === ctx.today
      );
      const pick = due[dateHash(ctx.today, "due-today") % due.length];
      return { taskId: pick.id, taskName: pick.text };
    },
    isComplete: (ctx, p) => {
      // Complete ONLY when the task still exists AND is marked done. A missing
      // task means it was DELETED, not finished — deleting must never award XP.
      const note = ctx.planner.notes.find((n) => n.id === p.taskId);
      return !!note && !!note.done;
    },
  },
  {
    type: "exam-prep",
    xp: 20,
    canGenerate: (ctx) => {
      const tmrw = tomorrow(ctx.today);
      if (ctx.planner.notes.some(
        (n) => EXAM_TAGS.has(n.tag ?? "") && n.day != null &&
          noteDate(ctx.semester.startDate, n.week, n.day) === tmrw
      )) return true;
      return ctx.courses.some((c) =>
        c.components.some(
          (comp) => comp.date === tmrw && (comp.type === "midterm" || comp.type === "final" || comp.type === "quiz")
        )
      );
    },
    generate: (ctx) => {
      const tmrw = tomorrow(ctx.today);
      const fromPlanner = ctx.planner.notes.find(
        (n) => EXAM_TAGS.has(n.tag ?? "") && n.day != null &&
          noteDate(ctx.semester.startDate, n.week, n.day) === tmrw
      );
      if (fromPlanner) return { examName: fromPlanner.text };
      for (const c of ctx.courses) {
        for (const comp of c.components) {
          if (comp.date === tmrw && (comp.type === "midterm" || comp.type === "final" || comp.type === "quiz"))
            return { examName: `${comp.name} — ${c.name}` };
        }
      }
      return { examName: "" };
    },
    isComplete: (ctx) => ctx.gamification.checkedInToday === ctx.today,
  },
  {
    type: "add-task",
    xp: 10,
    canGenerate: () => true,
    generate: (ctx) => ({
      targetCount: String(ctx.planner.notes.length + 1),
    }),
    isComplete: (ctx, p) =>
      ctx.planner.notes.length >= parseInt(p.targetCount),
  },
  {
    type: "complete-task",
    xp: 10,
    canGenerate: (ctx) => ctx.planner.notes.some((n) => !n.done),
    generate: (ctx) => ({
      targetCount: String(ctx.planner.notes.filter((n) => n.done).length + 1),
    }),
    isComplete: (ctx, p) =>
      ctx.planner.notes.filter((n) => n.done).length >= parseInt(p.targetCount),
  },
  {
    type: "open-streak",
    xp: 5,
    canGenerate: (ctx) => ctx.gamification.streak.current > 1,
    generate: () => ({}),
    isComplete: (ctx) => ctx.gamification.streak.lastActiveDate === ctx.today,
  },
  {
    type: "pomodoro-focus",
    xp: 20,
    // Pomodoro is not launched yet — never offer this challenge until it is.
    canGenerate: () => POMODORO_ENABLED,
    generate: (ctx) => ({
      targetSessions: "2",
      baseSessions: String(pomodoroToday(ctx)),
    }),
    isComplete: (ctx, p) =>
      pomodoroToday(ctx) - parseInt(p.baseSessions) >= parseInt(p.targetSessions),
  },
];

const WEEKLY_POOL: ChallengeDef[] = [
  {
    type: "checkin-week",
    xp: 40,
    canGenerate: () => true,
    generate: (ctx) => ({
      targetCheckins: String(ctx.gamification.totalCheckIns + 5),
      displayCount: "5",
    }),
    isComplete: (ctx, p) =>
      ctx.gamification.totalCheckIns >= parseInt(p.targetCheckins),
  },
  {
    type: "complete-n-tasks",
    xp: 35,
    canGenerate: (ctx) => ctx.planner.notes.filter((n) => !n.done).length >= 3,
    generate: (ctx) => {
      const incomplete = ctx.planner.notes.filter((n) => !n.done).length;
      const target = Math.min(Math.max(3, Math.ceil(incomplete * 0.3)), 7);
      const doneNow = ctx.planner.notes.filter((n) => n.done).length;
      return {
        targetCount: String(doneNow + target),
        displayCount: String(target),
      };
    },
    isComplete: (ctx, p) =>
      ctx.planner.notes.filter((n) => n.done).length >= parseInt(p.targetCount),
  },
  {
    type: "log-marks-course",
    xp: 45,
    canGenerate: (ctx) =>
      ctx.courses.some(
        (c) =>
          c.components.length > 0 &&
          c.components.some((comp) => comp.type !== "final" && comp.score == null) &&
          c.components.some((comp) => comp.score != null)
      ),
    generate: (ctx) => {
      const partial = ctx.courses.filter(
        (c) =>
          c.components.length > 0 &&
          c.components.some((comp) => comp.type !== "final" && comp.score == null) &&
          c.components.some((comp) => comp.score != null)
      );
      const pick = partial[dateHash(ctx.today, "log-marks") % partial.length];
      return { courseId: pick.id, courseName: pick.name };
    },
    isComplete: (ctx, p) => {
      const course = ctx.courses.find((c) => c.id === p.courseId);
      if (!course || course.components.length === 0) return false;
      return course.components
        .filter((comp) => comp.type !== "final")
        .every((comp) => comp.score != null);
    },
  },
  {
    type: "perfect-attendance-week",
    xp: 50,
    canGenerate: (ctx) => ctx.courses.length > 0,
    generate: (ctx) => {
      const total = ctx.courses.reduce(
        (sum, c) => sum + c.missedSessions.length,
        0
      );
      return { missedAtStart: String(total) };
    },
    isComplete: (ctx, p) => {
      const total = ctx.courses.reduce(
        (sum, c) => sum + c.missedSessions.length,
        0
      );
      return total <= parseInt(p.missedAtStart);
    },
  },
  {
    type: "update-grades",
    xp: 30,
    canGenerate: (ctx) =>
      ctx.courses.some((c) =>
        c.components.some((comp) => comp.score == null && comp.type !== "final")
      ),
    generate: (ctx) => {
      const graded = ctx.courses.reduce(
        (sum, c) => sum + c.components.filter((comp) => comp.score != null).length,
        0
      );
      return { gradedAtStart: String(graded), targetNew: "2" };
    },
    isComplete: (ctx, p) => {
      const graded = ctx.courses.reduce(
        (sum, c) => sum + c.components.filter((comp) => comp.score != null).length,
        0
      );
      return graded >= parseInt(p.gradedAtStart) + parseInt(p.targetNew);
    },
  },
  {
    type: "pomodoro-streak",
    xp: 50,
    canGenerate: (ctx) => POMODORO_ENABLED && ctx.pomodoroStats.totalSessions > 0,
    generate: () => ({ targetDays: "3" }),
    isComplete: (ctx, p) =>
      ctx.pomodoroStats.currentDailyStreak >= parseInt(p.targetDays),
  },
];

// ── Generation ───────────────────────────────────────────────────────────────

const DAILY_COUNT = 3;
const WEEKLY_COUNT = 2;

function pickChallenges(
  pool: ChallengeDef[],
  count: number,
  ctx: ChallengeContext,
  seed: string
): ChallengeItem[] {
  const available = pool.filter((d) => d.canGenerate(ctx));
  if (available.length === 0) return [];
  available.sort(
    (a, b) => dateHash(seed, a.type) - dateHash(seed, b.type)
  );
  return available.slice(0, count).map((def) => ({
    type: def.type,
    params: def.generate(ctx),
    xp: def.xp,
    done: false,
  }));
}

// ── Refresh (generate + check completion) ────────────────────────────────────

function countTasksDone(ctx: ChallengeContext): number {
  return ctx.planner.notes.filter((n) => n.done).length;
}

function countGradesEntered(ctx: ChallengeContext): number {
  return ctx.courses.reduce(
    (sum, c) => sum + c.components.filter((comp) => comp.score != null).length,
    0
  );
}

export interface WeeklyReportData {
  xpEarned: number;
  checkIns: number;
  tasksCompleted: number;
  gradesEntered: number;
  streak: number;
}

export function refreshChallenges(
  state: GamificationState,
  ctx: ChallengeContext
): { state: GamificationState; xpEarned: number; newlyCompleted: string[]; weeklyReport: WeeklyReportData | null } {
  const challenges: ChallengeState = state.challenges ?? defaultChallenges;
  let xpEarned = 0;
  const newlyCompleted: string[] = [];
  let changed = false;
  let weeklyReport: WeeklyReportData | null = null;
  let weeklySnapshot = state.weeklySnapshot ?? null;
  let lastWeeklyReport = state.lastWeeklyReport ?? null;

  let daily = challenges.daily;
  if (daily.date !== ctx.today) {
    daily = {
      date: ctx.today,
      items: pickChallenges(DAILY_POOL, DAILY_COUNT, ctx, ctx.today),
    };
    changed = true;
  }

  const currentWeekStart = sundayOfWeek(ctx.today);
  let weekly = challenges.weekly;
  const isNewWeek = weekly.weekStart !== currentWeekStart || weekly.items.length < WEEKLY_COUNT;

  if (isNewWeek) {
    // Compute report from last week's snapshot before resetting
    if (weeklySnapshot && weeklySnapshot.weekStart !== currentWeekStart) {
      const currentTasksDone = countTasksDone(ctx);
      const currentGrades = countGradesEntered(ctx);
      weeklyReport = {
        xpEarned: state.xp - weeklySnapshot.xp,
        checkIns: state.totalCheckIns - weeklySnapshot.totalCheckIns,
        tasksCompleted: currentTasksDone - weeklySnapshot.tasksDone,
        gradesEntered: currentGrades - weeklySnapshot.gradesEntered,
        streak: state.streak.current,
      };
      lastWeeklyReport = weeklySnapshot;
      changed = true;
    }

    // Save new snapshot for this week
    weeklySnapshot = {
      weekStart: currentWeekStart,
      xp: state.xp,
      totalCheckIns: state.totalCheckIns,
      tasksDone: countTasksDone(ctx),
      gradesEntered: countGradesEntered(ctx),
    };
    changed = true;

    weekly = {
      weekStart: currentWeekStart,
      items: pickChallenges(WEEKLY_POOL, WEEKLY_COUNT, ctx, currentWeekStart),
    };
  }

  // Drop challenges for locked features that may already sit in the active set.
  if (!POMODORO_ENABLED) {
    const disabled = new Set(["pomodoro-focus", "pomodoro-streak"]);
    const dFiltered = daily.items.filter((it) => !disabled.has(it.type));
    if (dFiltered.length !== daily.items.length) {
      daily = { ...daily, items: dFiltered };
      changed = true;
    }
    const wFiltered = weekly.items.filter((it) => !disabled.has(it.type));
    if (wFiltered.length !== weekly.items.length) {
      weekly = { ...weekly, items: wFiltered };
      changed = true;
    }
  }

  const defMap = new Map<string, ChallengeDef>();
  for (const d of DAILY_POOL) defMap.set(d.type, d);
  for (const d of WEEKLY_POOL) defMap.set(d.type, d);

  const updatedDaily = daily.items.map((item) => {
    if (item.done) return item;
    const def = defMap.get(item.type);
    if (def && def.isComplete(ctx, item.params)) {
      xpEarned += item.xp;
      newlyCompleted.push(item.type);
      changed = true;
      return { ...item, done: true };
    }
    return item;
  });

  const updatedWeekly = weekly.items.map((item) => {
    if (item.done) return item;
    const def = defMap.get(item.type);
    if (def && def.isComplete(ctx, item.params)) {
      xpEarned += item.xp;
      newlyCompleted.push(item.type);
      changed = true;
      return { ...item, done: true };
    }
    return item;
  });

  if (!changed) return { state, xpEarned: 0, newlyCompleted: [], weeklyReport: null };

  return {
    state: {
      ...state,
      xp: state.xp + xpEarned,
      challenges: {
        daily: { date: daily.date, items: updatedDaily },
        weekly: { weekStart: weekly.weekStart, items: updatedWeekly },
      },
      weeklySnapshot,
      lastWeeklyReport,
    },
    xpEarned,
    newlyCompleted,
    weeklyReport,
  };
}
