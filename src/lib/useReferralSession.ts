"use client";
import { useEffect, useSyncExternalStore } from "react";
import { referralApi } from "./referralClient";
import { createReferralController, type ReferralProgram, type ReferralSnapshot } from "./referrals";
type Controller = ReturnType<typeof createReferralController>;
const sessions = new Map<string, { controller: Controller; subscribers: number }>();
const empty: ReferralSnapshot = { phase: "unavailable", profile: null, busy: false };
const subscribeEmpty = () => () => {};
const readEmpty = () => empty;
/** Store owns one account session; every screen observes the same projection. */
export function useReferralSession(id: string | null): ReferralProgram {
  let entry = id ? sessions.get(id) : null;
  if (id && !entry) { entry = { controller: createReferralController(id, referralApi), subscribers: 0 }; sessions.set(id, entry); }
  const controller = entry?.controller;
  const snapshot = useSyncExternalStore(controller?.subscribe || subscribeEmpty, controller?.getSnapshot || readEmpty, readEmpty);
  useEffect(() => {
    if (!id || !entry) return;
    const current = entry; current.subscribers++;
    if (current.controller.getSnapshot().phase === "idle") void current.controller.load();
    const refresh = () => { if (!document.hidden) void current.controller.refresh(); };
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh);
      current.subscribers--;
      queueMicrotask(() => { if (current.subscribers === 0 && sessions.get(id) === current) { current.controller.dispose(); sessions.delete(id); } });
    };
  }, [id, entry]);
  return { ...snapshot, controller, accountId: id };
}
