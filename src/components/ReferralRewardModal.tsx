"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { useReferralProgram } from "./useReferralProgram";
import { ReferralRewardDialog } from "./ReferralRewardDialog";
import { expandCard } from "./Collapsible";
import { claimReferralRewardNotices } from "@/lib/referralRewardNoticeClient";
import type { AmbassadorRung } from "@/lib/ambassadorRewards";

/** One server claim per earned milestone, shared across devices and tabs. */
export function ReferralRewardModal() {
  const program = useReferralProgram(), { onboardingSeen } = useStore();
  const { lang } = useT(), router = useRouter(), path = usePathname();
  const [notice, setNotice] = useState<{ account: string; rewards: AmbassadorRung[] } | null>(null);
  const requests = useRef(new Map<string, Promise<AmbassadorRung[]>>());
  const displayed = useRef(new Set<string>());
  const active = useRef(program.accountId); active.current = program.accountId;
  const account = program.accountId, profile = program.profile;
  useEffect(() => {
    if (!account || profile?.accountId !== account || !onboardingSeen || /^\/(study|pomodoro)(\/|$)/.test(path || "")) return;
    if (profile.activatedCount < 1) return;
    const requestKey = account + ":" + profile.activatedCount;
    if (displayed.current.has(requestKey)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (cancelled || displayed.current.has(requestKey)) return;
        const blocked = document.hidden || Array.from(document.querySelectorAll('[role="dialog"],dialog[open]')).some(el => el.getBoundingClientRect().width > 0 && !el.closest('[aria-hidden="true"]'));
        if (blocked || active.current !== account) return;
        let request = requests.current.get(requestKey);
        if (!request) { request = claimReferralRewardNotices(account); requests.current.set(requestKey, request); }
        try {
          const rewards = await request;
          if (cancelled || active.current !== account) return;
          if (document.hidden || Array.from(document.querySelectorAll('[role="dialog"],dialog[open]')).some(el => el.getBoundingClientRect().width > 0 && !el.closest('[aria-hidden="true"]'))) return;
          displayed.current.add(requestKey);
          if (rewards.length) setNotice(current => current?.account === account ? { account, rewards: [...current.rewards, ...rewards.filter(r => !current.rewards.some(c => c.count === r.count))] } : { account, rewards });
        } catch { requests.current.delete(requestKey); /* Retry on the next validated account refresh. */ }
      }, 500);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("visibilitychange", schedule); schedule();
    return () => { cancelled = true; clearTimeout(timer); observer.disconnect(); document.removeEventListener("visibilitychange", schedule); };
  }, [account, profile, onboardingSeen, path]);
  const visible = notice?.account === account ? notice : null;
  const close = () => {
    if (!visible) return;
    setNotice(null);
  };
  return <ReferralRewardDialog open={!!visible} rewards={visible?.rewards || []} lang={lang} onClose={close}
    onNavigate={destination => { close(); expandCard(destination.includes("/profile/") ? "profile-ambassador" : "settings-theme"); router.push(destination); }} />;
}
