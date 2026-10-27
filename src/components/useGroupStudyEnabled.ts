"use client";
import { useSyncExternalStore } from "react";
import { GROUP_STUDY_ENABLED, groupStudyAvailable } from "@/lib/featureFlags";
import { GROUP_LAUNCH_STARTS_AT } from "../../supabase/functions/_shared/groupLaunch";

/** No polling or application remount: the subscribed surfaces unlock together.
 * A background tab rechecks on return, and static HTML hydrates its closed gate. */
export function subscribeGroupStudyLaunch(changed: () => void): () => void {
  if (GROUP_STUDY_ENABLED || groupStudyAvailable()) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    clearTimeout(timer);
    changed();
    const remaining = Date.parse(GROUP_LAUNCH_STARTS_AT) - Date.now();
    if (remaining > 0) timer = setTimeout(check, Math.min(remaining, 2_147_483_647));
  };
  const visible = () => { if (!document.hidden) check(); };
  timer = setTimeout(check, Math.min(Date.parse(GROUP_LAUNCH_STARTS_AT) - Date.now(), 2_147_483_647));
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", visible);
  return () => {
    clearTimeout(timer);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", visible);
  };
}
const clientSnapshot = () => groupStudyAvailable();
const serverSnapshot = () => GROUP_STUDY_ENABLED;
export function useGroupStudyEnabled(): boolean {
  return useSyncExternalStore(subscribeGroupStudyLaunch, clientSnapshot, serverSnapshot);
}
