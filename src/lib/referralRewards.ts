import { AMBASSADOR_RUNGS } from "./ambassadorRewards";
import type { ReferralProfile } from "./referrals";
import type { AppData, CompanionKind } from "@/types";
import { plural } from "./format";

export type ReferralRewardKind = "outfit" | "companion" | "theme";
/** Derived from the displayed ladder; unknown items never gain an entitlement. */
export function referralRewardThreshold(kind: ReferralRewardKind, id: string): number | null {
  if (kind === "outfit" && id === "none") return 0;
  const rung = AMBASSADOR_RUNGS.find(r => kind === "outfit" ? r.outfits.includes(id) : kind === "companion" ? r.companion?.id === id : r.theme?.id === id);
  return rung?.count ?? (kind === "theme" ? 0 : null);
}
export function canUseReferralReward(profile: ReferralProfile | null | undefined, kind: ReferralRewardKind, id: string): boolean {
  const threshold = referralRewardThreshold(kind, id);
  return threshold === 0 || (threshold !== null && !!profile && profile.unlockedThresholds.includes(threshold));
}
export function referralUnlockHint(kind: ReferralRewardKind, id: string, ar: boolean): string {
  const n = referralRewardThreshold(kind, id);
  if (!n) return "";
  const count = plural(n, ar ? ["دعوة محتسبة واحدة", "دعوتين محتسبتين", "# دعوات محتسبة", "# دعوة محتسبة"] : ["# counted referral", "# counted referrals"])
    .replace(String(n), new Intl.NumberFormat(ar ? "ar-SA" : "en-US").format(n));
  return (ar ? "يُفتح عند " : "Unlocks at ") + count;
}
export function highestEarnedReferralBadge(profile: ReferralProfile | null | undefined): string | null {
  if (!profile) return null;
  return AMBASSADOR_RUNGS.filter(r => r.badge && profile.unlockedThresholds.includes(r.count)).at(-1)?.badge || null;
}
/** Transient projection: never saves a referral grant or changes base XP. */
export function filterReferralPreferences(data: Pick<AppData, "theme" | "haviCosmetics" | "haviCompanions">, profile: ReferralProfile | null | undefined) {
  return {
    theme: canUseReferralReward(profile, "theme", data.theme) ? data.theme : "haven" as const,
    haviCosmetics: (Array.isArray(data.haviCosmetics) ? data.haviCosmetics : []).filter(id => typeof id === "string" && id !== "none" && canUseReferralReward(profile, "outfit", id)),
    haviCompanions: (Array.isArray(data.haviCompanions) ? data.haviCompanions : []).filter((id): id is CompanionKind => canUseReferralReward(profile, "companion", id)),
  };
}
