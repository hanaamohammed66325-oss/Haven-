import type { Course, PlannerData } from "@/types";
import { attendanceInfo } from "@/lib/grades";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GamificationState {
  streak: { current: number; longest: number; lastActiveDate: string | null };
  xp: number;
  badges: string[];
  checkedInToday: string | null;
}

export const defaultGamification: GamificationState = {
  streak: { current: 0, longest: 0, lastActiveDate: null },
  xp: 0,
  badges: [],
  checkedInToday: null,
};

// ── XP ─────────────────────────────────────────────────────────────────────

export const XP_REWARDS = {
  APP_OPEN: 5,
  CHECK_IN: 15,
  LOG_GRADE: 10,
  LOG_ATTENDANCE: 5,
  COMPLETE_TASK: 5,
} as const;

export const LEVELS = [
  { level: 1, name: "newStudent", xp: 0 },
  { level: 2, name: "hardWorking", xp: 100 },
  { level: 3, name: "outstanding", xp: 300 },
  { level: 4, name: "star", xp: 600 },
  { level: 5, name: "scholar", xp: 1000 },
  { level: 6, name: "expert", xp: 1800 },
  { level: 7, name: "professor", xp: 3000 },
  { level: 8, name: "genius", xp: 5000 },
] as const;

export function getLevel(xp: number) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xp) return LEVELS[i];
  }
  return LEVELS[0];
}

export function getNextLevel(xp: number) {
  const current = getLevel(xp);
  const idx = LEVELS.findIndex((l) => l.level === current.level);
  return idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
}

export function levelProgress(xp: number): number {
  const current = getLevel(xp);
  const next = getNextLevel(xp);
  if (!next) return 1;
  return (xp - current.xp) / (next.xp - current.xp);
}

// ── Streak ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export function updateStreak(state: GamificationState): {
  state: GamificationState;
  xpEarned: number;
  streakBroke: boolean;
} {
  const today = todayISO();
  const last = state.streak.lastActiveDate;

  if (last === today) return { state, xpEarned: 0, streakBroke: false };

  let current = state.streak.current;
  let streakBroke = false;

  if (!last) {
    current = 1;
  } else {
    const gap = daysBetween(last, today);
    if (gap === 1) {
      current += 1;
    } else {
      streakBroke = current > 0;
      current = 1;
    }
  }

  const longest = Math.max(state.streak.longest, current);
  return {
    state: {
      ...state,
      streak: { current, longest, lastActiveDate: today },
      xp: state.xp + XP_REWARDS.APP_OPEN,
    },
    xpEarned: XP_REWARDS.APP_OPEN,
    streakBroke,
  };
}

export function checkIn(state: GamificationState): {
  state: GamificationState;
  xpEarned: number;
  alreadyDone: boolean;
} {
  const today = todayISO();
  if (state.checkedInToday === today) {
    return { state, xpEarned: 0, alreadyDone: true };
  }
  return {
    state: {
      ...state,
      checkedInToday: today,
      xp: state.xp + XP_REWARDS.CHECK_IN,
    },
    xpEarned: XP_REWARDS.CHECK_IN,
    alreadyDone: false,
  };
}

export function awardXP(
  state: GamificationState,
  amount: number
): GamificationState {
  return { ...state, xp: state.xp + amount };
}

// ── Badges ─────────────────────────────────────────────────────────────────

export interface BadgeDef {
  id: string;
  icon: string;
  check: (g: GamificationState, ctx: BadgeContext) => boolean;
}

export interface BadgeContext {
  courses: Course[];
  planner: PlannerData;
  semesterGpa: number | null;
  semesterStartDate: string;
}

function semesterWeeksElapsed(startDate: string): number {
  const start = new Date(startDate + "T00:00:00");
  const now = new Date();
  const days = Math.max(0, (now.getTime() - start.getTime()) / 86400000);
  return Math.floor(days / 7);
}

export const BADGES: BadgeDef[] = [
  {
    id: "first-checkin",
    icon: "🚀",
    check: (g) => g.checkedInToday !== null,
  },
  {
    id: "integrated",
    icon: "🌟",
    check: (_g, ctx) => {
      if (ctx.courses.length < 5) return false;
      return ctx.courses.every(
        (c) =>
          c.components.some(
            (comp) => comp.score != null && comp.score > 0
          ) &&
          c.sessions.length > 0
      );
    },
  },
  {
    id: "safe",
    icon: "🛡️",
    check: (_g, ctx) => {
      if (ctx.courses.length === 0) return false;
      if (semesterWeeksElapsed(ctx.semesterStartDate) < 2) return false;
      const withSessions = ctx.courses.filter((c) => c.sessions.length > 0);
      if (withSessions.length === 0) return false;
      return withSessions.every((c) => {
        const info = attendanceInfo(c);
        return !info || info.status !== "danger";
      });
    },
  },
  {
    id: "organized",
    icon: "📝",
    check: (_g, ctx) => {
      const doneCount = ctx.planner.notes.filter((n) => n.done).length;
      return doneCount >= 5;
    },
  },
  {
    id: "committed",
    icon: "📚",
    check: (_g, ctx) => {
      const withSessions = ctx.courses.filter((c) => c.sessions.length > 0);
      if (withSessions.length === 0) return false;
      if (semesterWeeksElapsed(ctx.semesterStartDate) < 1) return false;
      return withSessions.every((c) => {
        const missed = (c.missedSessions ?? []).filter((m) => !m.excused);
        return missed.length === 0;
      });
    },
  },
  {
    id: "outstanding-gpa",
    icon: "🎓",
    check: (_g, ctx) => {
      const hasGrades = ctx.courses.some((c) =>
        c.components.some((comp) => comp.score != null)
      );
      return hasGrades && ctx.semesterGpa != null && ctx.semesterGpa >= 4.5;
    },
  },
  {
    id: "level-up",
    icon: "🏆",
    check: (g) => g.xp >= LEVELS[1].xp,
  },
  {
    id: "perfect-score",
    icon: "💯",
    check: (_g, ctx) =>
      ctx.courses.some((c) =>
        c.components.some(
          (comp) =>
            comp.total > 0 &&
            comp.score != null &&
            comp.score >= comp.total
        )
      ),
  },
];

export function checkBadges(
  state: GamificationState,
  ctx: BadgeContext
): { state: GamificationState; newBadges: string[] } {
  const newBadges: string[] = [];
  let badges = [...state.badges];

  for (const def of BADGES) {
    if (badges.includes(def.id)) continue;
    if (def.check(state, ctx)) {
      badges.push(def.id);
      newBadges.push(def.id);
    }
  }

  if (newBadges.length === 0) return { state, newBadges: [] };
  return { state: { ...state, badges }, newBadges };
}

export function getBadgeDef(id: string): BadgeDef | undefined {
  return BADGES.find((b) => b.id === id);
}

// ── Streak milestone markers ───────────────────────────────────────────────

export const STREAK_MILESTONES = [7, 14, 30, 60, 100] as const;

export function streakMilestone(current: number): number | null {
  for (let i = STREAK_MILESTONES.length - 1; i >= 0; i--) {
    if (current >= STREAK_MILESTONES[i]) return STREAK_MILESTONES[i];
  }
  return null;
}
