import type { PomodoroStats } from "@/types";
import type { PendingStudyAward } from "./types";
import { toISODate } from "@/lib/dates";
import { advanceStreak } from "@/lib/streak";
import { appendAchievement, prepareAchievementHistory, type AchievementSemester } from "@/lib/pomodoro/achievementHistory";

/** Project only server-earned awards. Dates belong to the round, not the retry. */
export function addStudyAwards(previous: PomodoroStats, awards: readonly PendingStudyAward[], semester?: AchievementSemester): PomodoroStats {
  const next: PomodoroStats = { ...previous, recentDays: previous.recentDays.map((d) => ({ ...d })), pads: [...previous.pads] };
  if (semester) next.achievementHistory = prepareAchievementHistory(previous, semester);
  const seen = new Set<string>();
  for (const a of [...awards].sort((x, y) => x.awardedAt - y.awardedAt || x.id.localeCompare(y.id))) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    const date = toISODate(new Date(a.awardedAt));
    if (semester && next.achievementHistory) next.achievementHistory = appendAchievement(next.achievementHistory, semester, date, a.minutes, null, false);
    next.totalSessions++; next.totalFocusMinutes += a.minutes; next.lilyPadCount++;
    let day = next.recentDays.find((d) => d.date === date);
    if (!day) { day = { date, completedSessions: 0, totalFocusMinutes: 0, abandonedSessions: 0 }; next.recentDays.push(day); }
    day.completedSessions++; day.totalFocusMinutes += a.minutes;
    next.pads.push({ date, minutes: a.minutes, courseId: a.focus?.courseId ?? null,
      ...(a.focus?.task ? { task: a.focus.task } : {}), ...(a.focus?.title ? { title: a.focus.title } : {}) });
  }
  next.recentDays.sort((a, b) => a.date.localeCompare(b.date));
  next.pads.sort((a, b) => a.date.localeCompare(b.date));
  // Recover consecutive days without rewinding a newer local streak.
  let run = 0, longest = previous.longestDailyStreak, last: string | null = null;
  const streakDays = [...next.recentDays];
  if (previous.lastSessionDate && !streakDays.some((d) => d.date === previous.lastSessionDate)) streakDays.push({ date: previous.lastSessionDate, completedSessions: 1, totalFocusMinutes: 0, abandonedSessions: 0 });
  streakDays.sort((a, b) => a.date.localeCompare(b.date));
  for (const day of streakDays) {
    if (!day.completedSessions) continue;
    run = advanceStreak(run, last, day.date);
    if (day.date === previous.lastSessionDate) run = Math.max(run, previous.currentDailyStreak);
    longest = Math.max(longest, run); last = day.date;
  }
  if (last && (!previous.lastSessionDate || last > previous.lastSessionDate)) {
    next.currentDailyStreak = Math.max(run, advanceStreak(previous.currentDailyStreak, previous.lastSessionDate, last));
    next.lastSessionDate = last;
  } else if (last === previous.lastSessionDate) next.currentDailyStreak = Math.max(run, previous.currentDailyStreak);
  next.longestDailyStreak = Math.max(longest, next.currentDailyStreak);
  if (next.achievementHistory) {
    const byDate = new Map(next.recentDays.filter(d => d.completedSessions > 0).map(d => [d.date, d]));
    let previousDate: string | null = null, length = 0;
    for (const date of [...byDate.keys()].sort()) {
      length = advanceStreak(length, previousDate, date);
      if (date === previous.lastSessionDate) length = Math.max(length, previous.currentDailyStreak);
      if (date === next.lastSessionDate) length = Math.max(length, next.currentDailyStreak);
      for (const period of Object.values(next.achievementHistory.periods)) {
        period.days = period.days.map(day => day.date === date && (date >= period.trackedFrom || day.streak !== null) && awards.some(a => toISODate(new Date(a.awardedAt)) === date) ? { ...day, streak: length } : day);
      }
      previousDate = date;
    }
  }
  next.recentDays = next.recentDays.slice(-30); next.pads = next.pads.slice(-200);
  return next;
}
