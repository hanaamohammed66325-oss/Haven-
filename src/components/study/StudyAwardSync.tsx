"use client";
import { useGroupStudyEnabled } from "@/components/useGroupStudyEnabled";
import { InteractionButton } from "@/components/motion/Interaction";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { createPortal } from "react-dom";
import { activeRoomSnapshot, activeRoomServerSnapshot, subscribeActiveRoom } from "@/lib/study/activeRoom";
import { useStudyNotice } from "./useStudyNotice";
/** No timer-derived credit: only pending awards recorded by the server. */
export function StudyAwardSync() {
  const groupsAvailable = useGroupStudyEnabled();
  const { accountId, hydrated, syncStudyAwards } = useStore();
  return groupsAvailable && accountId && hydrated ? <AccountAwards key={accountId} sync={syncStudyAwards} /> : null;
}
function AccountAwards({ sync }: { sync: () => Promise<boolean> }) {
  const { t } = useT();
  const { accountId } = useStore();
  const pathname = usePathname();
  const room = useSyncExternalStore(subscribeActiveRoom, activeRoomSnapshot, activeRoomServerSnapshot);
  const showWarning = (pathname === "/study" || pathname === "/study/") && room?.account === accountId;
  const [failed, setFailed] = useStudyNotice(false);
  const request = useRef(0);
  const check = useCallback(async () => {
    if (document.hidden) return;
    const mine = ++request.current;
    setFailed(false);
    try {
      const ok = await sync();
      if (mine === request.current) setFailed(!ok);
    } catch { if (mine === request.current) setFailed(true); }
  }, [sync, setFailed]);
  useEffect(() => {
    void check();
    window.addEventListener("online", check);
    window.addEventListener("study-round-settled", check);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 120_000);
    return () => { ++request.current; window.clearInterval(timer); window.removeEventListener("online", check); window.removeEventListener("study-round-settled", check); document.removeEventListener("visibilitychange", check); };
  }, [check]);
  return failed && showWarning ? createPortal(<p role="status" className="fixed bottom-3 end-3 z-40 max-w-sm rounded-xl bg-[var(--color-surface)] p-3 text-sm shadow">
    {t("study_awardRetry")} <InteractionButton className="underline" onClick={() => void check()}>{t("study_retry")}</InteractionButton>
  </p>, document.body) : null;
}
