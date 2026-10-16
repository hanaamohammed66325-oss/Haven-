import test from "node:test";
import assert from "node:assert/strict";
import { achievementBuckets, appendAchievement, prepareAchievementHistory } from "../src/lib/pomodoro/achievementHistory";
import { addStudyAwards } from "../src/lib/study/awards";
import type { PomodoroStats } from "../src/types";
const semester = { id: "term-a", name: "First", startDate: "2026-09-01", endDate: "2026-12-31" };
const empty: PomodoroStats = { totalSessions: 0, totalFocusMinutes: 0, lilyPadCount: 0, currentDailyStreak: 0, longestDailyStreak: 0, lastSessionDate: null, recentDays: [], pads: [] };

test("legacy migration preserves totals without inventing missing dates and runs once", () => {
  const stats = { ...empty, totalSessions: 10, totalFocusMinutes: 200, lilyPadCount: 10, recentDays: [{ date: "2026-09-04", completedSessions: 2, totalFocusMinutes: 40, abandonedSessions: 0 }] };
  const history = prepareAchievementHistory(stats, semester, "2026-10-11");
  assert.equal(history.legacy.sessions, 8);
  assert.equal(history.periods[semester.id].days[0].streak, null);
  assert.equal(history.periods[semester.id].incomplete, true);
  assert.deepEqual(prepareAchievementHistory({ ...stats, achievementHistory: history }, semester, "2026-10-12"), history);
});
test("permanent summaries survive 100 days, reload, name/date edits and another semester", () => {
  let history = prepareAchievementHistory(empty, semester, "2026-09-01");
  for (let i = 0; i < 100; i++) {
    const date = new Date(Date.UTC(2026, 8, 1+i)).toISOString().slice(0,10);
    history = appendAchievement(history, semester, date, 25, i+1);
  }
  const stats = { ...empty, achievementHistory: JSON.parse(JSON.stringify(history)) };
  const renamed = prepareAchievementHistory(stats, { ...semester, name: "Renamed", endDate: "2027-01-01" });
  assert.equal(Object.keys(renamed.periods).length, 1);
  assert.equal(renamed.periods[semester.id].days.length, 100);
  const second = prepareAchievementHistory({ ...empty, achievementHistory: renamed }, { ...semester, id: "term-b", startDate: "2027-01-02", endDate: "2027-05-01" });
  assert.equal(second.periods[semester.id].days.length, 100);
  assert.equal(second.periods["term-b"].days.length, 0);
  assert.equal(history.periods[semester.id].name, "First");
});
test("retained lotus detail recovers older dates without counting a daily total twice", () => {
  const stats = { ...empty, totalSessions: 3, totalFocusMinutes: 60, lilyPadCount: 3,
    recentDays: [{date:"2026-10-01",completedSessions:2,totalFocusMinutes:40,abandonedSessions:0}],
    pads: [{date:"2026-09-01",minutes:20,courseId:null},{date:"2026-10-01",minutes:20,courseId:null}] };
  const history = prepareAchievementHistory(stats, semester);
  assert.equal(history.periods[semester.id].days.length, 2);
  assert.equal(history.periods[semester.id].days.reduce((n,d) => n+d.sessions,0), 3);
  assert.equal(history.legacy.sessions, 0);
});
test("late group awards use earned dates, retain archives and deduplicate a batch", () => {
  const first = prepareAchievementHistory(empty, semester, "2026-09-01");
  const nextSemester = { ...semester, id: "term-b", startDate: "2027-01-01", endDate: "2027-05-01" };
  const award = { id: "earned", awardedAt: Date.parse("2026-10-10T12:00:00"), minutes: 15, groupId: "g" };
  const next = addStudyAwards({ ...empty, achievementHistory: first }, [award, award], nextSemester);
  assert.equal(next.totalSessions, 1);
  assert.equal(next.achievementHistory!.periods[semester.id].days[0].minutes, 15);
  assert.equal(next.achievementHistory!.periods["term-b"].days.length, 0);
  assert.equal(first.periods[semester.id].days.length, 0);
});
test("ambiguous late dates remain unassigned instead of entering the wrong semester", () => {
  const first = prepareAchievementHistory(empty, semester);
  const history = prepareAchievementHistory({ ...empty, achievementHistory: first }, { ...semester, id: "overlap" });
  const next = appendAchievement(history, semester, "2026-10-01", 25, null, false);
  assert.equal(next.unassignedDays.length, 1);
  assert.equal(next.periods[semester.id].days.length, 0);
});
test("weekly/monthly buckets respect term boundaries, totals and historical streak", () => {
  let history = prepareAchievementHistory(empty, semester, "2026-09-01");
  history = appendAchievement(history, semester, "2026-09-07", 20, 7);
  history = appendAchievement(history, semester, "2026-09-08", 30, 8);
  const weekly = achievementBuckets(history.periods[semester.id], "weekly", "2026-10-01");
  assert.equal(weekly[0].end, "2026-09-07");
  assert.equal(weekly[0].minutes, 20);
  assert.equal(weekly[1].streak, 8);
  assert.equal(weekly.reduce((n,b) => n+b.sessions,0), 2);
  const monthly = achievementBuckets(history.periods[semester.id], "monthly", "2026-10-01");
  assert.equal(monthly[0].minutes, 50);
  assert.equal(monthly[1].minutes, 0);
  assert.equal(achievementBuckets(history.periods[semester.id], "daily", "2026-08-30").length, 0);
});
