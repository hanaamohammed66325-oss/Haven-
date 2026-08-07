"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { getSubscription, getProfileFlags, type DbSubscription, type DbProfileFlags } from "./db";

export interface SubState {
  /** The user's subscription row, or null (no row / signed out / not loaded). */
  sub: DbSubscription | null;
  /** The user's premium-relevant profile flags (is_vip), or null. */
  profile: DbProfileFlags | null;
  /** true until the first read resolves. Gates should render nothing until then. */
  loading: boolean;
}

const SubContext = createContext<SubState>({ sub: null, profile: null, loading: true });

// Reads the current user's subscription row AND premium profile flags (is_vip)
// ONCE, near the top of the app, and shares them through context so every
// premium gate (hasActiveAccess / canAddCourse / canUseTheme / canUseHavi in
// premium.js) evaluates against the same (profile, subscription) pair.
// Re-reads whenever the account changes (sign in/out, account switch).
export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SubState>({ sub: null, profile: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // A missing subscription row is normal for a brand-new user — it just
        // means "no access" (unless VIP), never an error. Read both together.
        const [sub, profile] = await Promise.all([getSubscription(), getProfileFlags()]);
        if (!cancelled) setState({ sub, profile, loading: false });
      } catch (e) {
        console.error("Haven: failed to read premium access", e);
        if (!cancelled) setState({ sub: null, profile: null, loading: false });
      }
    };
    load();
    const { data } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return <SubContext.Provider value={state}>{children}</SubContext.Provider>;
}

export function useSubscription(): SubState {
  return useContext(SubContext);
}
