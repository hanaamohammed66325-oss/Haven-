"use client";

import { useStore } from "@/store";
import type { ReferralProgram } from "@/lib/referrals";

/** Store-owned account state shared by reward rendering and all forms. */
export function useReferralProgram(): ReferralProgram {
  return useStore().referralProgram;
}
