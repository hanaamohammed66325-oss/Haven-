import { supabase } from "@/lib/supabase";
import type { ReferralApi } from "./referrals";

export const referralApi: ReferralApi = {
  async load(accountId) {
    const { data, error } = await supabase.rpc("referral_get_state", { p_expected_account: accountId });
    if (error) throw error;
    return data;
  },
  async submit(input, accountId) {
    const { data, error } = await supabase.rpc("referral_submit", { p_expected_account: accountId, p_source: input.source || null, p_code: input.code || null, p_skip: input.skip === true });
    if (error) throw error;
    return data;
  },
};
