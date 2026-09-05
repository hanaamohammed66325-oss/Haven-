import type { Course, PlannerData } from "@/types";
import { attendanceInfo } from "@/lib/grades";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GamificationState {
  streak: { current: number; longest: number; lastActiveDate: string | null };
  xp: number;
  badges: string[];
  badgeTier: number;
  totalCheckIns: number;
  checkedInToday: string | null;
}

export const defaultGamification: GamificationState = {
  streak: { current: 0, longest: 0, lastActiveDate: null },
  xp: 0,
  badges: [],
  badgeTier: 1,
  totalCheckIns: 0,
  checkedInToday: null,
};

export const MAX_TIER = 4;

export const TIER_ICONS = ["🥉", "🥈", "🥇", "💎"] as const;
export const TIER_KEYS = ["bronze", "silver", "gold", "diamond"] as const;

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
      totalCheckIns: state.totalCheckIns + 1,
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

// ── Badges (tiered) ───────────────────────────────────────────────────────

export interface BadgeDef {
  id: string;
  icon: string;
  /** Static base thresholds per tier — used as-is for non-adaptive badges,
   *  overridden by getThreshold when the badge adapts to user data. */
  thresholds: number[];
  getThreshold?: (tier: number, ctx: BadgeContext) => number;
  check: (g: GamificationState, ctx: BadgeContext, threshold: number) => boolean;
}

export interface BadgeContext {
  courses: Course[];
  planner: PlannerData;
  semesterGpa: number | null;
  semesterStartDate: string;
  semesterWeeks: number;
}

function semesterWeeksElapsed(startDate: string): number {
  const start = new Date(startDate + "T00:00:00");
  const now = new Date();
  const days = Math.max(0, (now.getTime() - start.getTime()) / 86400000);
  return Math.floor(days / 7);
}

function countPerfectScores(courses: Course[]): number {
  let count = 0;
  for (const c of courses) {
    for (const comp of c.components) {
      if (comp.total > 0 && comp.score != null && comp.score >= comp.total) count++;
    }
  }
  return count;
}

function countQualifiedCourses(courses: Course[]): number {
  return courses.filter(
    (c) =>
      c.components.some((comp) => comp.score != null && comp.score > 0) &&
      c.sessions.length > 0
  ).length;
}

//                              Tier 1   Tier 2   Tier 3   Tier 4 (Diamond/Finals)
// first-checkin: check-ins       1       15       50       100
// integrated:    courses         3        5        0        0 (0 = all) + all graded
// safe:          weeks           2        6       12       16 (full semester)
// organized:     tasks done      5       15       30       50
// committed:     weeks           1        4       10       14
// outstanding:   GPA           4.0      4.5     4.75      4.9
// level-up:      XP            100      500     2000     4000
// perfect-score: perfects        1        3        5        8

function countGradedCourses(courses: Course[]): number {
  return courses.filter((c) =>
    c.components.length > 0 &&
    c.components.every((comp) => comp.score != null)
  ).length;
}

function totalGradableComponents(courses: Course[]): number {
  let n = 0;
  for (const c of courses) for (const comp of c.components) if (comp.total > 0) n++;
  return n;
}

export const BADGES: BadgeDef[] = [
  {
    id: "first-checkin",
    icon: "🚀",
    thresholds: [1, 15, 50, 100],
    check: (g, _ctx, t) => g.totalCheckIns >= t,
  },
  {
    id: "integrated",
    icon: "🌟",
    thresholds: [3, 5, 0, -1],
    getThreshold: (tier, ctx) => {
      const n = ctx.courses.length;
      if (n === 0) return 999;
      if (tier >= 3) return tier === 4 ? -1 : 0;
      return Math.min([3, 5][tier - 1], n);
    },
    check: (_g, ctx, t) => {
      if (ctx.courses.length === 0) return false;
      if (t === -1) {
        return countQualifiedCourses(ctx.courses) >= ctx.courses.length &&
               countGradedCourses(ctx.courses) >= ctx.courses.length;
      }
      const min = t === 0 ? ctx.courses.length : t;
      if (ctx.courses.length < min) return false;
      return countQualifiedCourses(ctx.courses) >= min;
    },
  },
  {
    id: "safe",
    icon: "🛡️",
    thresholds: [2, 6, 12, 16],
    getThreshold: (tier, ctx) => {
      const w = ctx.semesterWeeks;
      if (w === 0) return 999;
      const base = [2, 6, 12, 16][tier - 1];
      return Math.min(base, w);
    },
    check: (_g, ctx, t) => {
      if (ctx.courses.length === 0) return false;
      if (semesterWeeksElapsed(ctx.semesterStartDate) < t) return false;
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
    thresholds: [5, 15, 30, 50],
    check: (_g, ctx, t) => ctx.planner.notes.filter((n) => n.done).length >= t,
  },
  {
    id: "committed",
    icon: "📚",
    thresholds: [1, 4, 10, 14],
    getThreshold: (tier, ctx) => {
      const w = ctx.semesterWeeks;
      if (w === 0) return 999;
      const base = [1, 4, 10, 14][tier - 1];
      return Math.min(base, w);
    },
    check: (_g, ctx, t) => {
      const withSessions = ctx.courses.filter((c) => c.sessions.length > 0);
      if (withSessions.length === 0) return false;
      if (semesterWeeksElapsed(ctx.semesterStartDate) < t) return false;
      return withSessions.every((c) => {
        const missed = (c.missedSessions ?? []).filter((m) => !m.excused);
        return missed.length === 0;
      });
    },
  },
  {
    id: "outstanding-gpa",
    icon: "🎓",
    thresholds: [4.0, 4.5, 4.75, 4.9],
    check: (_g, ctx, t) => {
      const hasGrades = ctx.courses.some((c) =>
        c.components.some((comp) => comp.score != null)
      );
      return hasGrades && ctx.semesterGpa != null && ctx.semesterGpa >= t;
    },
  },
  {
    id: "level-up",
    icon: "🏆",
    thresholds: [100, 500, 2000, 4000],
    check: (g, _ctx, t) => g.xp >= t,
  },
  {
    id: "perfect-score",
    icon: "💯",
    thresholds: [1, 3, 5, 8],
    getThreshold: (tier, ctx) => {
      const total = totalGradableComponents(ctx.courses);
      if (total === 0) return 999;
      const pcts = [0.1, 0.25, 0.5, 0.75];
      return Math.max([1, 2, 3, 4][tier - 1], Math.ceil(total * pcts[tier - 1]));
    },
    check: (_g, ctx, t) => countPerfectScores(ctx.courses) >= t,
  },
];

function resolveThreshold(def: BadgeDef, tier: number, ctx: BadgeContext): number {
  if (def.getThreshold) return def.getThreshold(tier, ctx);
  return def.thresholds[Math.min(tier, MAX_TIER) - 1];
}

export function checkBadges(
  state: GamificationState,
  ctx: BadgeContext
): { state: GamificationState; newBadges: string[]; tierAdvanced: boolean } {
  const tier = Math.min(state.badgeTier, MAX_TIER);
  const newBadges: string[] = [];
  let badges = [...state.badges];

  for (const def of BADGES) {
    if (badges.includes(def.id)) continue;
    const threshold = resolveThreshold(def, tier, ctx);
    if (def.check(state, ctx, threshold)) {
      badges.push(def.id);
      newBadges.push(def.id);
    }
  }

  if (newBadges.length === 0) return { state, newBadges: [], tierAdvanced: false };

  let nextState: GamificationState = { ...state, badges };

  let tierAdvanced = false;
  if (badges.length >= BADGES.length && state.badgeTier < MAX_TIER) {
    nextState = { ...nextState, badgeTier: state.badgeTier + 1, badges: [] };
    tierAdvanced = true;
  }

  return { state: nextState, newBadges, tierAdvanced };
}

export function getBadgeThreshold(id: string, tier: number, ctx?: BadgeContext): number {
  const def = BADGES.find((b) => b.id === id);
  if (!def) return 0;
  if (def.getThreshold && ctx) return def.getThreshold(tier, ctx);
  return def.thresholds[Math.min(tier, MAX_TIER) - 1];
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
