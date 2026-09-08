"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Renders nothing and replaces the current route with /dashboard. Used to close
 * paid-only routes (/premium, /checkout) during the free launch (ENFORCE_PREMIUM
 * off) so they bounce home instead of 404-ing or showing a paywall.
 */
export function RedirectHome() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return null;
}
