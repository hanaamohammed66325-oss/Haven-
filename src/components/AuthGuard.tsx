"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Gates the logged-in app pages: on mount we check for a Supabase session and
// redirect to /signin when there isn't one. Until the check resolves we render
// nothing, so protected content never flashes for a signed-out visitor.
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) setAuthed(true);
      else router.replace("/signin");
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!authed) return null;
  return <>{children}</>;
}
