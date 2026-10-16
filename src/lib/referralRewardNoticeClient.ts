import { supabase } from "@/lib/supabase";
import { parseClaimedReferralRewards } from "./referralRewardNotices";

export async function claimReferralRewardNotices(accountId: string) {
  const { data, error } = await supabase.rpc("referral_claim_reward_notices", { p_expected_account: accountId });
  if (error) throw error;
  const rewards = parseClaimedReferralRewards(data, accountId);
  if (!rewards) throw new Error("invalid_reward_notice_response");
  return rewards;
}
