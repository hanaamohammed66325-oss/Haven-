import test from "node:test";
import assert from "node:assert/strict";
import { classOffDays } from "@/lib/holidays";
import { holidayCalendar } from "@/lib/universityCountry";
import { defaultGamification, updateStreak } from "@/lib/gamification";
import { activeStreak, advanceStreak } from "@/lib/streak";
import { addStudyAwards } from "@/lib/study/awards";
import { semesterPomodoroProgress } from "@/lib/pomodoro/achievementHistory";
import { refreshChallenges, type ChallengeContext } from "@/lib/challenges";
import { buildSmartSuggestions } from "@/lib/smartSuggestions";
import { smartCandidates } from "@/lib/smartNotificationPolicy";
import type { PlannerData, PlannerNote, PomodoroStats, Semester } from "@/types";

const semester: Semester = {
  id: "fall", name: "Fall", startDate: "2026-11-01", endDate: "2026-12-31",
  weeks: 8, finalsWeeks: 1, calendarType: "gregorian", gradingSystem: "saudi5", withdrawalLimit: 25,
};
const holidays = new Set(classOffDays(semester, "SA"));
const nov26 = new Date(2026, 10, 26, 10);
const stats: PomodoroStats = {
  totalSessions: 7, totalFocusMinutes: 175, lilyPadCount: 7, pads: [], recentDays: [],
  currentDailyStreak: 7, longestDailyStreak: 10, lastSessionDate: "2026-11-19",
};
const streak = { current: 7, longest: 10, lastActiveDate: stats.lastSessionDate };
const game = { ...defaultGamification, streak };
const planner = (notes: PlannerNote[]): PlannerData => ({ notes, strokes: [], highlights: [], autoEdits: {} });
const task = (patch: Partial<PlannerNote> = {}): PlannerNote =>
  ({ id: "project", text: "Submit the report", week: 4, day: 4, tag: "tagDeadline", color: "#888888", ...patch });
const context = (notes: PlannerNote[], today = "2026-11-26"): ChallengeContext => ({
  courses: [], planner: planner(notes), semester, gamification: game, pomodoroStats: stats, today, holidayDays: holidays,
});

test("official and custom holidays follow the existing calendar and dismissal rules", () => {
  assert.ok(holidays.has("2026-11-20"));
  assert.ok(holidays.has("2026-11-28"));
  assert.ok(!holidays.has("2026-11-29"));
  const revised = classOffDays({ ...semester, dismissedHolidays: ["fall-break"],
    customHolidays: [{ id: "personal", name: "Personal break", startDate: "2026-12-01", endDate: "2026-12-02" }] }, "SA");
  assert.ok(!revised.includes("2026-11-26"));
  assert.ok(revised.includes("2026-12-02"));
});

test("holiday dates preserve but never extend an app streak and do not consume normal grace", () => {
  assert.equal(activeStreak(7, "2026-11-19", "2026-11-28", holidays), 7);
  assert.equal(updateStreak(game, "2026-11-26", holidays).state, game);
  assert.equal(advanceStreak(0, null, "2026-11-26", holidays), 0);
  const resumed = updateStreak(game, "2026-11-29", holidays);
  assert.equal(resumed.state.streak.current, 8);
  assert.equal(resumed.streakBroke, false);
  assert.equal(activeStreak(7, "2026-11-19", "2026-12-01", holidays), 7);
  assert.equal(activeStreak(7, "2026-11-19", "2026-12-02", holidays), 0);
  assert.equal(activeStreak(7, "2026-11-15", "2026-11-26", holidays), 0);
});

test("delayed holiday group awards still earn rewards but cannot consume or extend the streak", () => {
  const award = (date: string) => ({
    id: date, minutes: 25, groupId: "group", awardedAt: new Date(`${date}T12:00:00`).getTime(),
  });
  const holiday = addStudyAwards(stats, [award("2026-11-26")], semester, holidays);
  assert.equal(holiday.currentDailyStreak, 7);
  assert.equal(holiday.lastSessionDate, "2026-11-19");
  assert.equal(holiday.totalSessions, 8);
  assert.equal(holiday.lilyPadCount, 8);
  const after = addStudyAwards(holiday, [award("2026-11-29")], semester, holidays);
  assert.equal(after.currentDailyStreak, 8);
  assert.equal(after.lastSessionDate, "2026-11-29");
  const answered = addStudyAwards({ ...stats, pads: [{ date: "2026-11-19", minutes: 25, courseId: null }] },
    [award("2026-11-29"), award("2026-11-26")], semester, holidays);
  assert.deepEqual(semesterPomodoroProgress(answered, semester, holidays), { totalSessions: 3, longestDailyStreak: 2 });
});

test("existing generic challenges are suspended and a newly planned task can earn its reward once", () => {
  const add = { type: "add-task", params: { baseCount: "0" }, xp: 10, done: false };
  const weekly = { type: "checkin-week", params: { targetDays: "1", checkinsAtStart: "0" }, xp: 30, done: false };
  const saved = { ...game, totalCheckIns: 10, challenges: {
    daily: { date: "2026-11-26", items: [add] },
    weekly: { weekStart: "2026-11-22", items: [weekly] },
  } };
  const generated = refreshChallenges(saved, context([task({ tag: "tagHoliday" }), task({ id: "temp-loading" })]));
  assert.equal(generated.state, saved);
  const assigned = refreshChallenges(saved, context([task()]));
  assert.deepEqual(assigned.state.challenges.daily.items.map(item => item.type), ["add-task", "due-today"]);
  assert.equal(assigned.state.challenges.weekly.items[0], weekly);
  assert.equal(assigned.xpEarned, 0);
  const renamed = refreshChallenges(assigned.state, context([task({ text: "Renamed report" })]));
  assert.equal(renamed.state.challenges.daily.items.at(-1)?.params.taskName, "Renamed report");
  assert.equal(refreshChallenges(renamed.state, context([task({ day: 5 })])).state.challenges.daily.items.length, 1);
  const earned = refreshChallenges(renamed.state, context([task({ done: true })]));
  assert.deepEqual(earned.newlyCompleted, ["due-today"]);
  assert.equal(earned.xpEarned, 15);
  assert.equal(refreshChallenges(earned.state, context([task({ done: true })])).xpEarned, 0);
});

test("dashboard suggestions and pushes keep only user-planned dates during a holiday", () => {
  const input = { ...context([task()]), gpaGoal: 5, now: nov26, holidayCalendar: "SA", attendanceEnabled: false };
  const result = buildSmartSuggestions(input, key => key);
  assert.deepEqual(result.map(item => item.kind), ["task"]);
  assert.deepEqual(smartCandidates(result, semester, nov26).map(item => item.kind), ["task"]);
  assert.deepEqual(buildSmartSuggestions({ ...input, planner: planner([]) }, key => key), []);
  const nextWeek = buildSmartSuggestions({ ...input, now: new Date(2026, 10, 29), planner: planner([]) }, key => key);
  assert.ok(nextWeek.some(item => item.kind === "checkin"));
});

test("student calendars differ across universities while retaining personal dates", () => {
  const saudi = holidayCalendar({ universitySlug: "king-saud", universityName: "King Saud University" });
  const qatar = holidayCalendar({ universitySlug: "other", universityName: "Qatar University" });
  assert.notEqual(saudi, qatar);
  const jordan = holidayCalendar({ universitySlug: "other", universityName: "University of Jordan" });
  assert.notEqual(saudi, jordan);
  const own = { ...semester, customHolidays: [{ id: "personal", name: "Personal break", startDate: "2026-12-01", endDate: "2026-12-02" }] };
  assert.ok(classOffDays(own, saudi).includes("2026-11-26"));
  assert.ok(!classOffDays(own, qatar).includes("2026-11-26"));
  assert.ok(classOffDays(own, qatar).includes("2026-12-18"));
  assert.ok(classOffDays(own, qatar).includes("2026-12-02"));
});
