/** Three inactive local calendar dates are protected; the fourth expires. */
export const STREAK_GRACE_DAYS = 3;

export function streakDayGap(last: string, today: string): number {
  // ISO calendar dates, not elapsed hours: daylight-saving changes do not matter.
  return (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`)) / 86_400_000;
}

export function activeStreak(current: number, last: string | null, today: string): number {
  if (!last) return 0;
  const gap = streakDayGap(last, today);
  return Number.isFinite(gap) && gap <= STREAK_GRACE_DAYS ? current : 0;
}

/** Count activity dates only. Older deliveries must never rewind the anchor. */
export function advanceStreak(current: number, last: string | null, date: string): number {
  if (last && date <= last) return current;
  return activeStreak(current, last, date) + 1;
}
