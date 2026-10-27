export type LaunchEmailBudget = { date: string; limit: number; used: number };
type QuotaWindow = { used: number; limit: number | null; resets_at: string };
/** Use only confirmed included monthly quota, with no purchases or overage.
 * An unlimited daily window still obeys our90/day cap and the finite monthly
 * allowance. Unknown/unlimited monthly usage cannot become permission to spend. */
export function freeLaunchEmailBudget(usage: unknown, now: number, reserved = 0): LaunchEmailBudget | null {
  if (!Number.isFinite(now) || !Number.isInteger(reserved) || reserved < 0 || reserved > 90) return null;
  const emails = (usage as { emails?: { daily?: QuotaWindow; monthly?: QuotaWindow } })?.emails;
  const valid = (w: QuotaWindow | undefined, maxWindow: number, unlimited = false) => !!w && (unlimited && w.limit === null || Number.isSafeInteger(w.limit) && w.limit! > 0)
    && Number.isSafeInteger(w.used) && w.used >= 0 && (w.limit === null || w.used <= w.limit) && Number.isFinite(Date.parse(w.resets_at))
    && Date.parse(w.resets_at) > now && Date.parse(w.resets_at) <= now + maxWindow;
  if (!valid(emails?.daily, 36 * 3_600_000, true) || !valid(emails?.monthly, 32 * 86_400_000)) return null;
  const dailyRemaining = emails!.daily!.limit === null ? 90 : emails!.daily!.limit - emails!.daily!.used - 10;
  const remaining = Math.max(0, Math.min(90 - reserved, dailyRemaining, emails!.monthly!.limit! - emails!.monthly!.used - 10));
  const limit = reserved + remaining;
  return limit > 0 ? { date: new Date(now).toISOString().slice(0, 10), limit, used: reserved } : null;
}
