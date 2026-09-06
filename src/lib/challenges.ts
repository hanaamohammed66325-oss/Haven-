import type { Course, PlannerData } from "@/types";
import type { GamificationState, ChallengeItem, ChallengeState } from "./gamification";
import { defaultChallenges } from "./gamification";

// ── Context ──────────────────────────────────────────────────────────────────

export interface ChallengeContext {
  courses: Course[];
  planner: PlannerData;
  gamification: GamificationState;
  today: string;
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

// ── Challenge definitions ────────────────────────────────────────────────────

interface ChallengeDef {
  type: string;
  xp: number;
  canGenerate: (ctx: ChallengeContext) => boolean;
  generate: (ctx: ChallengeContext) => Record<string, string>;
  isComplete: (ctx: ChallengeContext, params: Record<string, string>) => boolean;
}

const DAILY_POOL: ChallengeDef[] = [
  {
    type: "checkin",
    xp: 10,
    canGenerate: () => true,
    generate: () => ({}),
    isComplete: (ctx) => ctx.gamification.checkedInToday === ctx.today,
  },
  {
    type: "log-grade",
    xp: 15,
    canGenerate: (ctx) =>
      ctx.courses.some((c) =>
        c.components.some((comp) => comp.total > 0 && comp.score == null)
      ),
    generate: (ctx) => {
      const ungraded: { cId: string; cName: string; idx: number; name: string }[] = [];
      for (const c of ctx.courses) {
        for (let i = 0; i < c.components.length; i++) {
          const comp = c.components[i];
          if (comp.total > 0 && comp.score == null)
            ungraded.push({ cId: c.id, cName: c.name, idx: i, name: comp.name });
        }
      }
      const pick = ungraded[dateHash(ctx.today, "log-grade") % ungraded.length];
      return {
        courseId: pick.cId,
        courseName: pick.cName,
        componentIndex: String(pick.idx),
        componentName: pick.name,
      };
    },
    isComplete: (ctx, p) => {
      const course = ctx.courses.find((c) => c.id === p.courseId);
      if (!course) return false;
      const idx = parseInt(p.componentIndex);
      return course.components[idx]?.score != null;
    },
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
];

const WEEKLY_POOL: ChallengeDef[] = [
  {
    type: "complete-n-tasks",
    xp: 25,
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
    type: "checkin-week",
    xp: 30,
    canGenerate: () => true,
    generate: (ctx) => ({
      targetCheckins: String(ctx.gamification.totalCheckIns + 5),
      displayCount: "5",
    }),
    isComplete: (ctx, p) =>
      ctx.gamification.totalCheckIns >= parseInt(p.targetCheckins),
  },
  {
    type: "log-all-course",
    xp: 30,
    canGenerate: (ctx) =>
      ctx.courses.some(
        (c) =>
          c.components.length > 0 &&
          c.components.some((comp) => comp.score == null) &&
          c.components.some((comp) => comp.score != null)
      ),
    generate: (ctx) => {
      const partial = ctx.courses.filter(
        (c) =>
          c.components.length > 0 &&
          c.components.some((comp) => comp.score == null) &&
          c.components.some((comp) => comp.score != null)
      );
      const pick = partial[dateHash(ctx.today, "log-all") % partial.length];
      return { courseId: pick.id, courseName: pick.name };
    },
    isComplete: (ctx, p) => {
      const course = ctx.courses.find((c) => c.id === p.courseId);
      if (!course || course.components.length === 0) return false;
      return course.components.every((comp) => comp.score != null);
    },
  },
];

// ── Generation ───────────────────────────────────────────────────────────────

const DAILY_COUNT = 3;
const WEEKLY_COUNT = 1;

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

export function refreshChallenges(
  state: GamificationState,
  ctx: ChallengeContext
): { state: GamificationState; xpEarned: number; newlyCompleted: string[] } {
  const challenges: ChallengeState = state.challenges ?? defaultChallenges;
  let xpEarned = 0;
  const newlyCompleted: string[] = [];
  let changed = false;

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
  if (weekly.weekStart !== currentWeekStart) {
    weekly = {
      weekStart: currentWeekStart,
      items: pickChallenges(WEEKLY_POOL, WEEKLY_COUNT, ctx, currentWeekStart),
    };
    changed = true;
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

  if (!changed) return { state, xpEarned: 0, newlyCompleted: [] };

  return {
    state: {
      ...state,
      xp: state.xp + xpEarned,
      challenges: {
        daily: { date: daily.date, items: updatedDaily },
        weekly: { weekStart: weekly.weekStart, items: updatedWeekly },
      },
    },
    xpEarned,
    newlyCompleted,
  };
}
