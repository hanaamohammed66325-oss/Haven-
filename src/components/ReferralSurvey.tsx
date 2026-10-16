"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Modal } from "./Modal";
import { ReferralSourceForm } from "./ReferralSourceForm";
import { useReferralProgram } from "./useReferralProgram";

function hasOpenDialog() {
  return Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).some(el => !el.closest('[aria-hidden="true"]') && el.getBoundingClientRect().width > 0);
}

/** First-run survey waits for the tour and other account dialogs to finish. */
export function ReferralSurvey() {
  const { onboardingSeen, courses } = useStore(), { lang } = useT();
  const program = useReferralProgram();
  const pathname = usePathname();
  const [openFor, setOpenFor] = useState<string | null>(null), [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const eligible = !!(program.phase === "ready" && program.profile?.eligible && !program.profile.answered && onboardingSeen && !/^\/(study|pomodoro)(\/|$)/.test(pathname || ""));
  const open = !!program.accountId && openFor === program.accountId && eligible;
  useEffect(() => {
    if (!eligible || !program.accountId || open || dismissedFor === program.accountId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (timer) clearTimeout(timer);
      if (document.hidden || /^\/(study|pomodoro)(\/|$)/.test(location.pathname) || hasOpenDialog()) return;
      timer = setTimeout(() => { if (!hasOpenDialog() && !document.hidden) setOpenFor(program.accountId); }, 1400);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-hidden"] });
    document.addEventListener("visibilitychange", check); check();
    return () => { observer.disconnect(); if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", check); };
  }, [eligible, program.accountId, open, dismissedFor]);
  useEffect(() => {
    if (program.profile?.status !== "pending" || !courses.length) return;
    const timer = setTimeout(() => void program.controller?.load(), 1500);
    return () => clearTimeout(timer);
  }, [program.controller, courses.length, program.profile?.status]);
  const dismiss = () => {
    setDismissedFor(program.accountId); setOpenFor(null);
  };
  return <Modal open={open} onClose={dismiss} title={lang === "ar" ? "كيف عرفت Haven؟" : "How did you hear about Haven?"}>
    <ReferralSourceForm program={program} autoFocus onSaved={() => setOpenFor(null)} onSkip={dismiss} />
  </Modal>;
}
