import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGamification, updateStreak } from '@/lib/gamification';
import { activeStreak, advanceStreak, streakDayGap } from '@/lib/streak';
import { addStudyAwards } from '@/lib/study/awards';
import { semesterPomodoroProgress } from '@/lib/pomodoro/achievementHistory';
import type { PomodoroStats } from '@/types';

test('app streak survives three inactive calendar dates, without counting them', () => {
  const state = { ...defaultGamification, streak: { current: 7, longest: 10, lastActiveDate: '2026-10-13' } };
  const next = updateStreak(state, '2026-10-16');
  assert.equal(next.state.streak.current, 8);
  assert.equal(next.streakBroke, false);
  assert.equal(next.state.streak.longest, 10);
  assert.equal(state.streak.current, 7);
});

test('visible streak expires on date four; activity and missing dates stay distinct', () => {
  for (const gap of [0, 1, 2, 3]) {
    const date = `2026-10-${String(10 + gap).padStart(2, '0')}`;
    assert.equal(activeStreak(7, '2026-10-10', date), 7);
    assert.equal(advanceStreak(7, '2026-10-10', date), gap ? 8 : 7);
  }
  assert.equal(activeStreak(7, '2026-10-10', '2026-10-14'), 0);
  assert.equal(advanceStreak(7, '2026-10-10', '2026-10-14'), 1);
  assert.equal(activeStreak(7, null, '2026-10-14'), 0);
  assert.equal(advanceStreak(0, null, '2026-10-14'), 1);
  assert.equal(streakDayGap('2026-12-31', '2027-01-03'), 3);
  assert.equal(streakDayGap('2028-02-28', '2028-03-02'), 3);
  assert.equal(streakDayGap('2026-03-28', '2026-03-31'), 3);
});

test('older device dates never rewind app activity or award duplicate XP', () => {
  const state = { ...defaultGamification, streak: { current: 7, longest: 10, lastActiveDate: '2026-10-16' } };
  assert.equal(updateStreak(state, '2026-10-15').state, state);
  assert.equal(updateStreak(state, '2026-10-15').xpEarned, 0);
});

const stats = (): PomodoroStats => ({ totalSessions: 7, totalFocusMinutes: 175, lilyPadCount: 7, pads: [], recentDays: [],
  currentDailyStreak: 7, longestDailyStreak: 10, lastSessionDate: '2026-10-10' });
const award = (date: string, id = date) => ({ id, minutes: 25, awardedAt: new Date(`${date}T12:00:00`).getTime(), groupId: 'group' });

test('group and solo advancement share grace boundaries, including delayed batches', () => {
  for (const date of ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']) {
    const next = addStudyAwards(stats(), [award(date)]);
    assert.equal(next.currentDailyStreak, advanceStreak(7, '2026-10-10', date));
    assert.equal(next.longestDailyStreak, 10);
    assert.equal(next.recentDays.length, 1);
  }
  const batch = addStudyAwards(stats(), [award('2026-10-16'), award('2026-10-13')]);
  assert.equal(batch.currentDailyStreak, 9);
  assert.equal(batch.lastSessionDate, '2026-10-16');
  const late = addStudyAwards(batch, [award('2026-10-01')]);
  assert.equal(late.currentDailyStreak, 9);
  assert.equal(late.lastSessionDate, '2026-10-16');
  assert.equal(activeStreak(late.currentDailyStreak, late.lastSessionDate, '2026-10-20'), 0);
});

test('term badge progress counts active dates across grace but never missing dates or other terms', () => {
  const source = stats();
  source.pads = ['2026-09-28', '2026-10-01', '2026-10-04', '2026-10-08'].map(date => ({ date, minutes: 25, courseId: null }));
  const progress = semesterPomodoroProgress(source, { id: 'term', name: 'term', startDate: '2026-10-01', endDate: '2026-12-31' });
  assert.equal(progress.totalSessions, 3);
  assert.equal(progress.longestDailyStreak, 2);
});

test('return on fourth inactive date starts a new streak once and preserves records', () => {
  const state = { ...defaultGamification, streak: { current: 7, longest: 10, lastActiveDate: '2026-10-12' } };
  const next = updateStreak(state, '2026-10-16');
  assert.equal(next.state.streak.current, 1);
  assert.equal(next.streakBroke, true);
  assert.equal(next.state.streak.longest, 10);
  const again = updateStreak(next.state, '2026-10-16');
  assert.equal(again.xpEarned, 0);
  assert.equal(again.state, next.state);
});
