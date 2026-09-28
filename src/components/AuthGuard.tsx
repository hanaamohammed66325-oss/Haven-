"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store";
import { HaviLoader } from "./HaviLoader";

// Who is signed in is decided once, in the store's auth listener (including a
// signed-in device waiting out a network failure at launch); this only acts on
// it.
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { authStatus } = useStore();

  useEffect(() => {
    if (authStatus === "signedOut") router.replace("/signin");
  }, [authStatus, router]);

  if (authStatus === "pending") return <HaviLoader />;
  if (authStatus === "signedOut") return null;
  return <>{children}</>;
}
