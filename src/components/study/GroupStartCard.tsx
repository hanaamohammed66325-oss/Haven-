"use client";
import { useGroupStudyEnabled } from "@/components/useGroupStudyEnabled";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { EASE_COLOURS, MotionRoot, Press, PressLink } from "@/components/motion/Press";
import { EXIT, SURFACE } from "@/components/motion/springs";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { watchMyStudyGroups } from "@/lib/study/client";
import type { StudyGroupSummary } from "@/lib/study/types";
import { soloStudyActive } from "@/lib/study/solo";
export function GroupStartCard() {
  const groupsAvailable = useGroupStudyEnabled();
  const { accountId, hydrated, loadFailed } = useStore();
  return groupsAvailable && accountId && hydrated && !loadFailed ? <AccountCard key={accountId} account={accountId} /> : null;
}
function AccountCard({ account }: { account: string }) {
  const { t } = useT();
  const pathname = usePathname();
  const [groups, setGroups] = useState<StudyGroupSummary[]>([]);
  const [soloBlocked, setSoloBlocked] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { const raw = JSON.parse(sessionStorage.getItem(`study-dismissed:${account}`) ?? "[]"); return Array.isArray(raw) ? raw.filter((s) => typeof s === "string").slice(-100) : []; } catch { return []; }
  });
  useEffect(() => watchMyStudyGroups((next) => setGroups(next.available ? next.groups : []), 120_000), []);
  const group = groups.find((g) => g.sitting && !g.sitting.inRound && g.sitting.startedBy !== account && !dismissed.includes(g.sitting.id) && Date.now() - g.sitting.startedAt < 30 * 60_000);
  const shown = !!group?.sitting && pathname !== "/study" && pathname !== "/study/";
  const dismiss = () => {
    if (!group?.sitting) return;
    const next = [...dismissed, group.sitting.id].slice(-100);
    setDismissed(next);
    try { sessionStorage.setItem(`study-dismissed:${account}`, JSON.stringify(next)); } catch { /* In-memory dismissal still works. */ }
  };
  // The card rises from its corner, and sinks back when dismissed or entered.
  return createPortal(<MotionRoot><AnimatePresence>{shown && group?.sitting && (
    <motion.aside key={group.sitting.id} role="status" className="haven-card fixed bottom-5 start-5 z-40 max-w-sm rounded-2xl border p-4 shadow-lg"
      style={{ transition: EASE_COLOURS }} transition={SURFACE}
      initial={{ opacity: 0, y: 28, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97, transition: EXIT }}>
      <p className="text-sm">{t("study_startedCard", { name: group.sitting.startedByName || t("study_formerMember"), group: group.name })}</p>
      {soloBlocked && <p className="mt-2 text-xs" role="alert">{t("study_soloActive")}</p>}
      <div className="mt-3 flex gap-4"><PressLink lift="none" href={`/study/?g=${group.id}`} onClick={(e) => { if (soloStudyActive()) { e.preventDefault(); setSoloBlocked(true); } else dismiss(); }} className="font-medium underline">{t("study_enter")}</PressLink><Press lift="none" onClick={dismiss}>{t("study_inviteCancel")}</Press></div>
    </motion.aside>
  )}</AnimatePresence></MotionRoot>, document.body);
}
