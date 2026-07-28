"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { getSubscription, type DbSubscription } from "./db";

export interface SubState {
  /** The user's subscription row, or null (no row / signed out / not loaded). */
  sub: DbSubscription | null;
  /** true until the first read resolves. Gates should render nothing until then. */
  loading: boolean;
}

const SubContext = createContext<SubState>({ sub: null, loading: true });

// Reads the current user's subscription row ONCE, near the top of the app, and
// shares it through context so every premium gate (canUse / courseLimit /
// canUseTheme in premium.js) evaluates against the same source of truth.
// Re-reads whenever the account changes (sign in/out, account switch).
export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SubState>({ sub: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const sub = await getSubscription();
        if (!cancelled) setState({ sub, loading: false });
      } catch (e) {
        console.error("Haven: failed to read subscription", e);
        if (!cancelled) setState({ sub: null, loading: false });
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
