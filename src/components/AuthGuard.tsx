"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Status = "loading" | "authed" | "guest";

// Gates the logged-in app pages. The subtle bug this guards against: Supabase
// restores the persisted session from localStorage ASYNCHRONOUSLY on startup. If
// we decide "logged out" from a bare, too-early check, a returning user is seen
// as a guest for a moment and bounced to /signin — exactly the "I have to sign in
// again every time I reopen the app" complaint.
//
// So we never redirect until the session has genuinely resolved:
//   • onAuthStateChange fires INITIAL_SESSION once the restore completes (with
//     the session, or null if truly signed out) — that is the authoritative
//     first answer. getSession() is a belt-and-suspenders fallback in case the
//     session had already resolved before we subscribed.
//   • Only a real SIGNED_OUT (explicit sign-out or an invalid refresh token)
//     flips us to guest. A refresh that fails because the device is OFFLINE does
//     NOT emit SIGNED_OUT — Supabase retries — and getSession() returns the
//     stored session without needing the network, so an offline relaunch stays
//     signed in.
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        setStatus("guest");
        return;
      }
      if (session) {
        setStatus("authed");
        return;
      }
      // First restore resolved with no session → genuinely signed out.
      if (event === "INITIAL_SESSION") setStatus("guest");
    });

    // Fallback for the case where the session resolved before we subscribed.
    // Only decides while still loading, so it can't override a later SIGNED_OUT.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setStatus((prev) => (prev === "loading" ? (data.session ? "authed" : "guest") : prev));
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status === "guest") router.replace("/signin");
  }, [status, router]);

  // Render nothing until the session is confirmed: no protected-content flash,
  // and no premature redirect while the persisted session is still restoring.
  if (status !== "authed") return null;
  return <>{children}</>;
}
