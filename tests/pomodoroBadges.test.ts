// While the attendance calculation is suspended the two attendance badges are
// replaced by Pomodoro badges, and attendance badges already earned stay.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { BADGES, checkBadges, defaultGamification, getBadgeThreshold, type BadgeContext } from "@/lib/gamification";
import { ATTENDANCE_CALC_SUSPENDED } from "@/lib/featureFlags";

const ctx = (over: Partial<BadgeContext> = {}): BadgeContext => ({
  courses: [],
  planner: { notes: [] } as unknown as BadgeContext["planner"],
  semesterGpa: null,
  semesterStartDate: "2026-08-23",
  semesterWeeks: 16,
  ...over,
});

test("suspended: Pomodoro badges replace the attendance ones, same count", () => {
  assert.equal(ATTENDANCE_CALC_SUSPENDED, true);
  const ids = BADGES.map((b) => b.id);
  assert.ok(ids.includes("pomodoro-sessions") && ids.includes("pomodoro-streak"));
  assert.ok(!ids.includes("safe") && !ids.includes("committed"));
  assert.equal(ids.length, 9);
});

test("thresholds follow the term's length", () => {
  assert.equal(getBadgeThreshold("pomodoro-sessions", 4, ctx()), 50);
  assert.equal(getBadgeThreshold("pomodoro-sessions", 4, ctx({ semesterWeeks: 5 })), 20);
  assert.equal(getBadgeThreshold("pomodoro-streak", 4, ctx({ semesterWeeks: 2 })), 14);
  assert.equal(getBadgeThreshold("pomodoro-streak", 1, ctx({ semesterWeeks: 0 })), 999);
});

test("earned from the student's own Pomodoro totals", () => {
  const r = checkBadges(defaultGamification, ctx({ pomodoro: { totalSessions: 2, longestDailyStreak: 2 } }));
  assert.ok(r.newBadges.includes("pomodoro-sessions"));
  assert.ok(r.newBadges.includes("pomodoro-streak"));
  const none = checkBadges(defaultGamification, ctx({ pomodoro: { totalSessions: 1, longestDailyStreak: 1 } }));
  assert.ok(!none.newBadges.includes("pomodoro-sessions") && !none.newBadges.includes("pomodoro-streak"));
});

test("an attendance badge already earned stays and still counts toward the tier", () => {
  const g = { ...defaultGamification, badges: ["safe", "committed", "first-checkin"] };
  const r = checkBadges(g, ctx({ pomodoro: { totalSessions: 2, longestDailyStreak: 0 } }));
  // 3 kept + the new sessions badge = 4, under ceil(9 * 0.8) = 8: same tier, nothing dropped.
  assert.deepEqual(r.state.badges, ["safe", "committed", "first-checkin", "pomodoro-sessions"]);
  assert.equal(r.tierAdvanced, false);
});

test("an attendance badge and its Pomodoro stand-in fill one slot (no early tier)", async () => {
  const { earnedBadgeCount, badgesForTier } = await import("@/lib/gamification");
  // Codex F8: 5 real slots earned, but 7 ids — must not reach ceil(8*0.8)=7.
  const g = { ...defaultGamification, badgeTier: 1, badges: ["first-checkin", "safe", "committed", "organized", "coursework-complete"] };
  const r = checkBadges(g, ctx({ pomodoro: { totalSessions: 50, longestDailyStreak: 21 } }));
  assert.equal(r.tierAdvanced, false);
  assert.ok(r.state.badges.includes("pomodoro-sessions") && r.state.badges.includes("safe"));
  // safe + pomodoro-sessions and committed + pomodoro-streak count once each.
  const merged = earnedBadgeCount(r.state.badges, 1);
  assert.equal(merged, earnedBadgeCount(r.state.badges.filter((b) => b !== "safe" && b !== "committed"), 1));
  assert.ok(merged < Math.ceil(badgesForTier(1).length * 0.8));
});

test("Pomodoro badge progress counts this semester only", async () => {
  const { semesterPomodoroProgress } = await import("@/lib/pomodoro/achievementHistory");
  const day = (date: string, sessions: number) => ({ date, sessions, minutes: sessions * 25, lotus: sessions, streak: null });
  const stats = {
    totalSessions: 99,
    longestDailyStreak: 40,
    recentDays: [],
    pads: [],
    achievementHistory: {
      version: 1 as const,
      periods: {
        old: { id: "old", name: "old", startDate: "2026-01-10", endDate: "2026-05-30", trackedFrom: "2026-01-10", incomplete: false, days: [day("2026-03-01", 40)] },
        now: { id: "now", name: "now", startDate: "2026-08-23", endDate: "2026-12-31", trackedFrom: "2026-08-23", incomplete: false,
          days: [day("2026-09-01", 2), day("2026-09-02", 1), day("2026-09-03", 3), day("2026-09-10", 1)] },
      },
      unassignedDays: [],
      legacy: { sessions: 0, minutes: 0, lotus: 0 },
    },
  } as unknown as Parameters<typeof semesterPomodoroProgress>[0];
  const p = semesterPomodoroProgress(stats, { id: "now", name: "now", startDate: "2026-08-23", endDate: "2026-12-31" });
  assert.equal(p.totalSessions, 7);
  assert.equal(p.longestDailyStreak, 3);
});
