"use client";

import { useEffect, useState } from "react";
import { hasSeenWhatsNew, WHATS_NEW_VERSION, type WhatsNewSeen } from "@/lib/whatsNew";

const EVENT = "haven-whatsnew-dismissed";
const key = (account: string) => `haven-whatsnew-later:${WHATS_NEW_VERSION}:${account}`;
export function whatsNewDeferred(account: string): boolean {
  try { return sessionStorage.getItem(key(account)) === "1"; } catch { return false; }
}
export function deferWhatsNew(account: string): void {
  try { sessionStorage.setItem(key(account), "1"); } catch { /* Memory event still releases waiting dialogs. */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: account }));
}
/** Postponing the journey releases setup dialogs without acknowledging unread pages. */
export function useWhatsNewReady(account: string | null | undefined, seen: WhatsNewSeen): boolean {
  const [deferred, setDeferred] = useState<string | null>(null);
  useEffect(() => {
    setDeferred(account && whatsNewDeferred(account) ? account : null);
    const onDismiss = (event: Event) => { if ((event as CustomEvent).detail === account) setDeferred(account ?? null); };
    window.addEventListener(EVENT, onDismiss);
    return () => window.removeEventListener(EVENT, onDismiss);
  }, [account]);
  return hasSeenWhatsNew(seen) || !!account && deferred === account;
}
