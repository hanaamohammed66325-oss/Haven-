import { AMBASSADOR_RUNGS } from "./ambassadorRewards";
import type { ReferralProfile } from "./referrals";

/** Only counted referrals create notices; a reward VIP grant is not a milestone. */
export function pendingReferralRewards(profile: ReferralProfile, acknowledged: unknown) {
  const seen = Array.isArray(acknowledged) ? acknowledged.filter(n => Number.isInteger(n)) : [];
  return AMBASSADOR_RUNGS.filter(r => r.count <= profile.activatedCount && !seen.includes(r.count));
}

export function acknowledgeReferralRewards(previous: unknown, counts: readonly number[]) {
  const values = new Set([...(Array.isArray(previous) ? previous : []), ...counts]);
  return AMBASSADOR_RUNGS.map(r => r.count).filter(n => values.has(n));
}

export function parseClaimedReferralRewards(raw: unknown, accountId: string) {
  if (!raw || typeof raw !== "object" || !("account_id" in raw) || raw.account_id !== accountId || !("thresholds" in raw)) return null;
  const values = raw.thresholds;
  if (!Array.isArray(values) || new Set(values).size !== values.length || values.some(v => !AMBASSADOR_RUNGS.some(r => r.count === v))) return null;
  return AMBASSADOR_RUNGS.filter(r => values.includes(r.count));
}
