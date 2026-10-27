"use client";
import { openingDateLabel } from "@/lib/featureFlags";
import { useGroupStudyEnabled } from "./useGroupStudyEnabled";
import { InteractionButton } from "@/components/motion/Interaction";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, BellRing, CalendarDays, Calculator, Check, Globe, ListChecks, Map, Timer, Upload, Volume2 } from "@/components/motion/icons";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/translations/en";
import { useStore } from "@/store";
import { hasSeenWhatsNew, whatsNewVersion } from "@/lib/whatsNew";
import { whatsNewPages, type WhatsNewPage } from "@/lib/whatsNewJourney";
import { MotionModal } from "./motion/MotionModal";
import { PRESS } from "./motion/springs";
import { deferWhatsNew, whatsNewDeferred } from "./useWhatsNewReady";
import { WhatsNewScenes } from "./whats-new/WhatsNewScenes";
import css from "./whats-new/journey.module.css";
import { GroupLaunchScene, GroupLaunchStep } from "./whats-new/GroupLaunchStep";
import { groupLaunchCopy, type GroupLaunchStepId } from "../../supabase/functions/_shared/groupLaunch";

const icons = { term: CalendarDays, abroad: Globe, gpa: Calculator, pomodoro: Timer, reminders: CalendarDays, lakemap: Map, scene: Map, tasks: ListChecks, curve: Calculator,
  audioLibrary: Volume2, audioPersonal: Upload, audioAlert: BellRing };

export function WhatsNewModal({ preview = false }: { preview?: boolean } = {}) {
  const groupsAvailable = useGroupStudyEnabled();
  const WHATS_NEW_VERSION = whatsNewVersion(groupsAvailable);
  const currentRelease = useRef(WHATS_NEW_VERSION);
  currentRelease.current = WHATS_NEW_VERSION;
  const router = useRouter();
  const { t, lang } = useT();
  const { hydrated, onboardingSeen, accountId, whatsNewSeen = {}, markWhatsNewSeen } = useStore();
  const [journey, setJourney] = useState<{ account: string | null; pages: WhatsNewPage[] } | null>(null);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [deferredAccount, setDeferredAccount] = useState<string | null>(null);
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;
  const seen = hasSeenWhatsNew(whatsNewSeen, WHATS_NEW_VERSION);
  const reduced = useReducedMotion();
  const ar = lang === "ar";

  useEffect(() => {
    setJourney(null); setIndex(0); setBusy(false); setError(false);
    if (!hydrated || (!preview && (!accountId || !onboardingSeen || seen || deferredAccount === `${WHATS_NEW_VERSION}:${accountId}` || whatsNewDeferred(accountId, WHATS_NEW_VERSION)))) return;
    const pages = whatsNewPages(whatsNewSeen, WHATS_NEW_VERSION);
    if (!pages.length) { if (!preview) void markWhatsNewSeen(WHATS_NEW_VERSION); return; }
    const timer = window.setTimeout(() => setJourney({ account: accountId ?? null, pages }), preview ? 0 : 700);
    return () => clearTimeout(timer);
    // Snapshot on opening: acknowledging a page must not reshuffle the journey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, preview, accountId, onboardingSeen, seen, deferredAccount, WHATS_NEW_VERSION]);

  const open = !!journey && (preview || journey.account === accountId);
  const pages = journey?.pages ?? [];
  const page = pages[index];
  const last = index === pages.length - 1;
  const count = (n: number) => new Intl.NumberFormat(ar ? "ar-SA" : "en-US").format(n);
  const close = () => {
    setJourney(null); setError(false);
    if (!preview && accountId) { setDeferredAccount(`${WHATS_NEW_VERSION}:${accountId}`); deferWhatsNew(accountId, WHATS_NEW_VERSION); }
  };
  const next = async () => {
    if (!page || busy) return;
    const owner = accountId;
    const release = WHATS_NEW_VERSION;
    setBusy(true); setError(false);
    const saved = preview || await markWhatsNewSeen(WHATS_NEW_VERSION, page.id);
    if (currentAccount.current !== owner || currentRelease.current !== release) return;
    if (!saved) { setBusy(false); setError(true); return; }
    if (last) {
      const complete = preview || await markWhatsNewSeen(WHATS_NEW_VERSION);
      if (currentAccount.current !== owner || currentRelease.current !== release) return;
      setBusy(false);
      if (complete) { close(); if (page.kind === "launch" && !preview) router.push("/study/"); } else setError(true);
    } else { setDirection(1); setIndex(i => i + 1); setBusy(false); }
  };
  const previous = () => { if (!busy && index > 0) { setDirection(-1); setIndex(i => i - 1); setError(false); } };
  const Forward = ar ? ArrowLeft : ArrowRight;
  const Back = ar ? ArrowRight : ArrowLeft;
  const launch = page?.kind === "launch";
  const launchCopy = groupLaunchCopy[lang];
  return <MotionModal compact wide={launch} open={open} onClose={close} title={launch ? launchCopy.modalTitle : t("whatsnew_title")} footer={page && <div dir={ar ? "rtl" : "ltr"}>
    {error && <p role="alert" className={css.error}>{t("whatsnew_saveError")}</p>}
    <div className={css.actions}>
      {index > 0 ? <motion.button type="button" onClick={previous} disabled={busy} className={css.back} whileTap={{ scale: .95 }} transition={PRESS}><Back size={16} />{t("whatsnew_back")}</motion.button>
        : <InteractionButton type="button" className={css.back} onClick={close}>{t("whatsnew_later")}</InteractionButton>}
      <motion.button type="button" onClick={() => void next()} disabled={busy} className={css.next} whileTap={{ scale: .96 }} transition={PRESS}>
        {busy ? t("whatsnew_saving") : launch ? last ? launchCopy.start : index === 0 ? launchCopy.first : launchCopy.next : last ? t("whatsnew_done") : t("whatsnew_next")}{last ? <Check size={17} /> : <Forward size={17} />}
      </motion.button>
    </div>
  </div>}>
    {page && <div dir={ar ? "rtl" : "ltr"} className={css.journey}>
      <div className={css.progress}>
        <span className={css.counter} aria-live="polite">{t("whatsnew_pageCounter", { current: count(index + 1), total: count(pages.length) })}</span>
        <span className={css.dots} aria-hidden>{pages.map((p, i) => <span key={p.id} className={i === index ? css.activeDot : css.dot} />)}</span>
      </div>
      {launch && <GroupLaunchScene />}
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.section key={page.id} className={css.page} custom={direction}
          variants={{ enter: (d: number) => ({ opacity: 0, x: reduced ? 0 : d * (ar ? -18 : 18) }), visible: { opacity: 1, x: 0 }, leave: (d: number) => ({ opacity: 0, x: reduced ? 0 : d * (ar ? 12 : -12) }) }}
          initial="enter" animate="visible" exit="leave" transition={{ duration: .18 }}>
          {page.kind === "launch" ? <GroupLaunchStep id={page.id as GroupLaunchStepId} /> : page.kind === "text" ? <>
            <h3 className={css.title}>{t(`whatsnew_page_${page.id}` as TranslationKey)}</h3>
            <p className={css.subtitle}>{t("whatsnew_textIntro")}</p>
            <div className={css.notes}>{page.items.map(item => {
              const Icon = icons[item as keyof typeof icons];
              return <article className={css.note} key={item}><span className={css.noteIcon}><Icon size={18} /></span><div>
                <h4>{t(`whatsnew_${item}_title` as TranslationKey)}</h4><p>{t(`whatsnew_${item}_body` as TranslationKey)}</p>
              </div></article>;
            })}</div>
            {page.id === "audio" && <p className={css.subtitle}>{t("whatsnew_general_fixes")}</p>}
          </> : <>
            <WhatsNewScenes kind={page.kind} />
            <div className={css.featureCopy}><span className={css.eyebrow}>{t(`whatsnew_${page.kind}_eyebrow` as TranslationKey)}</span>
              <h3 className={css.title}>{t(`whatsnew_${page.kind}_title` as TranslationKey)}</h3>
              <p className={css.description}>{t(`whatsnew_${page.kind}_body` as TranslationKey)}{page.kind === "groups" && !groupsAvailable ? ` ${t("whatsnew_soon", { date: openingDateLabel(lang) })}` : ""}</p>
            </div>
          </>}
        </motion.section>
      </AnimatePresence>
    </div>}
  </MotionModal>;
}
