"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { getSubscription, isActivePremium } from "./db";

export interface PremiumState {
  /** true only once we've confirmed an active premium subscription. */
  premium: boolean;
  /** true until the first subscription read resolves. */
  loading: boolean;
}

// Reads premium entitlement straight from Supabase (the `subscriptions` table
// via db.getSubscription) rather than the app store — so it works even for
// components mounted OUTSIDE the store provider, like HaviMascot in the root
// layout. Re-checks whenever the account changes.
//
// Background re-checks intentionally do NOT flip `loading` back to true or clear
// `premium`: we keep showing the last known state until the new read resolves,
// so a token refresh never makes a premium-gated element flash out and back in.
export function usePremium(): PremiumState {
  const [state, setState] = useState<PremiumState>({ premium: false, loading: true });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const sub = await getSubscription();
        if (!cancelled) setState({ premium: isActivePremium(sub), loading: false });
      } catch (e) {
        console.error("Haven: failed to read subscription", e);
        if (!cancelled) setState({ premium: false, loading: false });
      }
    };

    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
