"use client";

import { useEffect, useState } from "react";
import { hasSeenWhatsNew, CURRENT_WHATS_NEW_VERSION, whatsNewVersion, type WhatsNewSeen } from "@/lib/whatsNew";
import { useGroupStudyEnabled } from "./useGroupStudyEnabled";

const EVENT = "haven-whatsnew-dismissed";
const key = (account: string, version: number) => `haven-whatsnew-later:${version}:${account}`;
export function whatsNewDeferred(account: string, version = CURRENT_WHATS_NEW_VERSION): boolean {
  try { return sessionStorage.getItem(key(account, version)) === "1"; } catch { return false; }
}
export function deferWhatsNew(account: string, version = CURRENT_WHATS_NEW_VERSION): void {
  try { sessionStorage.setItem(key(account, version), "1"); } catch { /* Memory event still releases waiting dialogs. */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key(account, version) }));
}
/** Postponing the journey releases setup dialogs without acknowledging unread pages. */
export function useWhatsNewReady(account: string | null | undefined, seen: WhatsNewSeen): boolean {
  const version = whatsNewVersion(useGroupStudyEnabled());
  const [deferred, setDeferred] = useState<string | null>(null);
  useEffect(() => {
    setDeferred(account && whatsNewDeferred(account, version) ? key(account, version) : null);
    const onDismiss = (event: Event) => { if (account && (event as CustomEvent).detail === key(account, version)) setDeferred(key(account, version)); };
    window.addEventListener(EVENT, onDismiss);
    return () => window.removeEventListener(EVENT, onDismiss);
  }, [account, version]);
  return hasSeenWhatsNew(seen, version) || !!account && deferred === key(account, version);
}
