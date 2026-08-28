"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { getSubscription, getProfileFlags, touchLastActive, type DbSubscription, type DbProfileFlags } from "./db";

export interface SubState {
  /** The user's subscription row, or null (no row / signed out / not loaded). */
  sub: DbSubscription | null;
  /** The user's premium-relevant profile flags (is_vip), or null. */
  profile: DbProfileFlags | null;
  /** true until the first read resolves. Gates should render nothing until then. */
  loading: boolean;
  /**
   * Re-read the current user's subscription row + profile flags from Supabase.
   * Call after an action that changes access (e.g. returning from checkout) so
   * premium UI updates without a full re-login. Never rejects.
   */
  refresh: () => Promise<void>;
}

const SubContext = createContext<SubState>({
  sub: null,
  profile: null,
  loading: true,
  refresh: async () => {},
});

// Reads the current user's subscription row AND premium profile flags (is_vip)
// ONCE, near the top of the app, and shares them through context so every
// premium gate (hasActiveAccess / canAddCourse / canUseTheme / canUseHavi in
// premium.js) evaluates against the same (profile, subscription) pair.
// Re-reads whenever the account changes (sign in/out, account switch) or when a
// consumer calls refresh().
export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<SubState, "refresh">>({
    sub: null,
    profile: null,
    loading: true,
  });

  // Retry timer for a transient read failure. Held in a ref so a re-render or
  // an auth change can cancel a pending retry instead of stacking them.
  const retryRef = useRef<number | null>(null);
  const clearRetry = useCallback(() => {
    if (retryRef.current != null) {
      window.clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      // A missing subscription row is normal for a brand-new user — it just
      // means "no access" (unless VIP), never an error. Read both together.
      const [sub, profile] = await Promise.all([getSubscription(), getProfileFlags()]);
      clearRetry();
      setState({ sub, profile, loading: false });
      touchLastActive().catch(() => {});
    } catch (e) {
      console.error("Haven: failed to read premium access", e);
      // NEVER downgrade on a transient error. Clearing sub+profile here made a
      // single dropped request during boot lock a PAYING subscriber (or a VIP)
      // out of their themes, Havi and the planner, and cap them at 3 courses,
      // until they happened to reload. Keep the last known-good entitlement and
      // retry in the background instead.
      setState((s) => ({ ...s, loading: false }));
      clearRetry();
      retryRef.current = window.setTimeout(() => {
        retryRef.current = null;
        void refresh();
      }, 5000);
    }
  }, [clearRetry]);

  useEffect(() => {
    refresh();
    const { data } = supabase.auth.onAuthStateChange(() => refresh());
    return () => {
      data.subscription.unsubscribe();
      clearRetry();
    };
  }, [refresh, clearRetry]);

  return <SubContext.Provider value={{ ...state, refresh }}>{children}</SubContext.Provider>;
}

export function useSubscription(): SubState {
  return useContext(SubContext);
}
