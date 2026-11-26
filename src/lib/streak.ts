/** Three inactive local calendar dates are protected; the fourth expires. */
export const STREAK_GRACE_DAYS = 3;

export function streakDayGap(last: string, today: string): number {
  // ISO calendar dates, not elapsed hours: daylight-saving changes do not matter.
  return (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`)) / 86_400_000;
}

export function activeStreak(current: number, last: string | null, today: string, holidays?: ReadonlySet<string>): number {
  if (!last) return 0;
  let gap = streakDayGap(last, today);
  if (gap > STREAK_GRACE_DAYS && holidays) {
    for (const day of holidays) {
      if (day > last && day <= today) gap--;
    }
  }
  return Number.isFinite(gap) && gap <= STREAK_GRACE_DAYS ? current : 0;
}

/** Count activity dates only. Older deliveries must never rewind the anchor. */
export function advanceStreak(current: number, last: string | null, date: string, holidays?: ReadonlySet<string>): number {
  if (holidays?.has(date) || (last && date <= last)) return current;
  return activeStreak(current, last, date, holidays) + 1;
}
