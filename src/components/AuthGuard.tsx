"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { HaviLoader } from "./HaviLoader";

type Status = "loading" | "authed" | "guest";

const AUTH_TIMEOUT_MS = 5000;

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
      if (event === "INITIAL_SESSION") setStatus("guest");
    });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setStatus((prev) => (prev === "loading" ? (data.session ? "authed" : "guest") : prev));
    });

    // If neither onAuthStateChange nor getSession resolves within 5s,
    // check localStorage directly for a stored session token.
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      setStatus((prev) => {
        if (prev !== "loading") return prev;
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf("sb-") === 0 && k.indexOf("-auth-token") > 0) {
              const v = localStorage.getItem(k);
              if (v && v !== "null" && v !== "undefined") {
                return "authed";
              }
            }
          }
        } catch {}
        return "guest";
      });
    }, AUTH_TIMEOUT_MS);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (status === "guest") router.replace("/signin");
  }, [status, router]);

  if (status === "loading") return <HaviLoader />;
  if (status !== "authed") return null;
  return <>{children}</>;
}
