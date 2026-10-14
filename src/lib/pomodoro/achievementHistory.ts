import type { AchievementDay, AchievementHistory, AchievementPeriod, PomodoroStats, Semester } from "@/types";
import { toISODate } from "@/lib/dates";

export type AchievementSemester = Pick<Semester, "id" | "name" | "startDate" | "endDate">;
const inside = (date: string, p: AchievementSemester) => date >= p.startDate && date <= p.endDate;
export const achievementPeriodId = (semester: AchievementSemester) => semester.id ?? "local-initial";

/** Additive migration: retained dates are evidence; missing older detail stays unassigned. */
export function prepareAchievementHistory(stats: PomodoroStats, semester: AchievementSemester, today = toISODate(new Date())): AchievementHistory {
  const id = achievementPeriodId(semester);
  const saved = stats.achievementHistory;
  const history: AchievementHistory = saved?.version === 1
    ? { ...saved, periods: Object.fromEntries(Object.entries(saved.periods).map(([key, p]) => [key, { ...p, days: [...p.days] }])), unassignedDays: [...saved.unassignedDays], legacy: { ...saved.legacy } }
    : { version: 1, periods: {}, unassignedDays: [], legacy: { sessions: 0, minutes: 0, lotus: 0 } };
  const existing = history.periods[id];
  const period: AchievementPeriod = existing
    ? { ...existing, name: semester.name, startDate: semester.startDate, endDate: semester.endDate, days: [...existing.days] }
    : { id, name: semester.name, startDate: semester.startDate, endDate: semester.endDate, trackedFrom: today, incomplete: today > semester.startDate, days: [] };
  history.periods[id] = period;
  if (!saved) {
    let sessions = 0, minutes = 0;
    const records = new Map(stats.recentDays.map(r => [r.date, { ...r }]));
    // Retained lotus details can recover dates older than the rolling daily log.
    const padDays = new Map<string, { date: string; completedSessions: number; totalFocusMinutes: number; abandonedSessions: number }>();
    for (const pad of stats.pads) {
      const day = padDays.get(pad.date) ?? { date: pad.date, completedSessions: 0, totalFocusMinutes: 0, abandonedSessions: 0 };
      day.completedSessions++; day.totalFocusMinutes += pad.minutes; padDays.set(pad.date, day);
    }
    for (const [date, day] of padDays) if (!records.has(date)) records.set(date, day);
    for (const record of [...records.values()].sort((a,b) => a.date.localeCompare(b.date))) {
      if (!record.completedSessions) continue;
      const day: AchievementDay = { date: record.date, sessions: record.completedSessions, minutes: record.totalFocusMinutes, lotus: record.completedSessions,
        streak: record.date === stats.lastSessionDate ? stats.currentDailyStreak : null };
      (inside(day.date, semester) ? period.days : history.unassignedDays).push(day);
      sessions += day.sessions; minutes += day.minutes;
    }
    history.legacy = { sessions: Math.max(0, stats.totalSessions - sessions), minutes: Math.max(0, stats.totalFocusMinutes - minutes), lotus: Math.max(0, stats.lilyPadCount - sessions) };
    period.incomplete ||= history.legacy.sessions > 0;
  }
  return history;
}

/** Assign delayed awards by their earned date; ambiguous dates remain unassigned. */
export function appendAchievement(history: AchievementHistory, semester: AchievementSemester, date: string, minutes: number, streak: number | null, explicit = true): AchievementHistory {
  const candidates = Object.values(history.periods).filter(p => inside(date, p));
  const id = explicit ? achievementPeriodId(semester) : candidates.length === 1 ? candidates[0].id : null;
  const target = id ? history.periods[id] : null;
  const days = [...(target?.days ?? history.unassignedDays)];
  const index = days.findIndex(d => d.date === date);
  const old = index >= 0 ? days[index] : { date, sessions: 0, minutes: 0, lotus: 0, streak: null };
  const day = { ...old, sessions: old.sessions + 1, minutes: old.minutes + minutes, lotus: old.lotus + 1, streak: streak ?? old.streak };
  if (index >= 0) days[index] = day; else days.push(day);
  days.sort((a, b) => a.date.localeCompare(b.date));
  return target ? { ...history, periods: { ...history.periods, [target.id]: { ...target, days } } } : { ...history, unassignedDays: days };
}

export type AchievementMode = "daily" | "weekly" | "monthly";
export interface AchievementBucket { key: string; start: string; end: string; index: number; sessions: number; minutes: number; lotus: number; streak: number | null; incomplete: boolean }
const nextDate = (date: string, days: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); return toISODate(d); };

/** Calendar weeks are anchored to the student's semester, not a fixed term length. */
export function achievementBuckets(period: AchievementPeriod, mode: AchievementMode, today = toISODate(new Date())): AchievementBucket[] {
  const end = period.endDate < today ? period.endDate : today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period.startDate) || period.startDate > end) return [];
  const buckets: AchievementBucket[] = [];
  let start = period.startDate;
  while (start <= end) {
    let boundary: string;
    if (mode === "monthly") { const d = new Date(`${start}T12:00:00`); boundary = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)); }
    else boundary = nextDate(start, mode === "weekly" ? 7 : 1);
    const stop = nextDate(boundary, -1) < end ? nextDate(boundary, -1) : end;
    const days = period.days.filter(d => d.date >= start && d.date <= stop);
    const known = days.flatMap(d => d.streak === null ? [] : [d.streak]);
    buckets.push({ key: start, start, end: stop, index: buckets.length + 1, sessions: days.reduce((n,d) => n+d.sessions,0), minutes: days.reduce((n,d) => n+d.minutes,0), lotus: days.reduce((n,d) => n+d.lotus,0), streak: known.length ? Math.max(...known) : days.length ? null : 0, incomplete: period.incomplete && start < period.trackedFrom });
    start = boundary;
  }
  return buckets;
}

/** Pomodoro progress inside the current semester only (the Pomodoro badges are
 *  a progress badge for this term): completed sessions and the longest run of
 *  consecutive days with at least one session, both within the term's dates. */
export function semesterPomodoroProgress(stats: PomodoroStats, semester: AchievementSemester): { totalSessions: number; longestDailyStreak: number } {
  const period = prepareAchievementHistory(stats, semester).periods[achievementPeriodId(semester)];
  const days = (period?.days ?? [])
    .filter((d) => d.sessions > 0 && inside(d.date, semester))
    .map((d) => d.date)
    .sort();
  let totalSessions = 0;
  for (const d of period?.days ?? []) if (d.sessions > 0 && inside(d.date, semester)) totalSessions += d.sessions;
  let longest = 0;
  let run = 0;
  let prev = "";
  for (const date of days) {
    run = prev && nextDate(prev, 1) === date ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = date;
  }
  return { totalSessions, longestDailyStreak: longest };
}
