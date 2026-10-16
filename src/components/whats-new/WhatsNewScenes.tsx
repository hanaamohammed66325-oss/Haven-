"use client";
import { InteractionButton } from "@/components/motion/Interaction";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Pause, Play, RotateCcw } from "@/components/motion/icons";
import { useT } from "@/i18n";
import { AMBASSADOR_BADGES, AMBASSADOR_RUNGS } from "@/lib/ambassadorRewards";
import { paintCompanion } from "@/lib/haviCompanionArt";
import HaviShowcase from "../HaviShowcase";
import { PRESS } from "../motion/springs";
import { GroupLakeFilm } from "./GroupLakeFilm";
import css from "./journey.module.css";

/** Local sample data and original artwork; no account, group controller or network. */
export function WhatsNewScenes({ kind }: { kind: "referrals" | "groups" }) {
  const { t } = useT();
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [replay, setReplay] = useState(0);
  const playing = !paused && !reduced;
  return <div className={`${css.scene} ${kind === "referrals" ? css.rewardsScene : css.lakeScene}`} role="group" aria-label={t(`whatsnew_${kind}_demo`)}>
    {kind === "groups" ? <GroupLakeFilm paused={!playing} replay={replay} /> : <RewardMiniScene paused={!playing} replay={replay} />}
    <div className={css.sceneTools}>
      <motion.button type="button" className={css.sceneButton} onClick={() => setPaused(v => !v)} disabled={!!reduced}
        aria-label={playing ? t("whatsnew_pauseDemo") : t("whatsnew_playDemo")} whileTap={{ scale: .9 }} transition={PRESS}>
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </motion.button>
      <motion.button type="button" className={css.sceneButton} onClick={() => { setReplay(v => v + 1); setPaused(false); }}
        aria-label={t("whatsnew_replayDemo")} whileTap={{ scale: .9 }} transition={PRESS}><RotateCcw size={13} /></motion.button>
    </div>
  </div>;
}

const featuredRewards = AMBASSADOR_RUNGS.filter(rung => rung.count === 6 || rung.count === 8);

function RewardMiniScene({ paused, replay }: { paused: boolean; replay: number }) {
  const { t, lang } = useT();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => { setStep(0); }, [replay]);
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => { if (!document.hidden) setStep(v => (v + 1) % featuredRewards.length); }, 4600);
    return () => clearInterval(timer);
  }, [paused, replay]);
  const reward = featuredRewards[step];
  return <>
    <div className={css.rewardMilestones}>
      {featuredRewards.map((rung, index) => <InteractionButton key={rung.count} type="button" aria-pressed={step === index}
        onClick={() => setStep(index)}>{t("whatsnew_rewardInvites", { n: rung.count })}</InteractionButton>)}
    </div>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={reward.count} className={css.rewardStage}
        initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : -5 }} transition={{ duration: reduced ? 0 : .24 }}>
        <div className={css.rewardTile}>
          <div className={css.outfitPair}>{reward.outfits.map(outfit => <HaviShowcase key={outfit} outfit={outfit} />)}</div>
          <small>{t("whatsnew_rewardOutfits")}</small>
        </div>
        <div className={css.rewardTile}>
          <BadgeStill id={reward.badge!} />
          <small>{lang === "ar" ? reward.ar : reward.en}</small>
        </div>
        <div className={css.rewardTile}>
          {reward.companion ? <><CompanionStill /><small>{lang === "ar" ? reward.companion.ar : reward.companion.en}</small></>
            : <><div className={css.miniTheme} style={{ background: "linear-gradient(140deg,#4d557a,#a16077)" }}><b /><i /></div>
              <small>{lang === "ar" ? `سمة ${reward.theme!.ar}` : `${reward.theme!.en} theme`}</small></>}
        </div>
      </motion.div>
    </AnimatePresence>
    <span className={css.sceneCaption}>{reward.xp ? t("whatsnew_rewardXp", { n: reward.xp }) : t("whatsnew_rewardDemoCaption")}</span>
  </>;
}

function CompanionStill() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) { ctx.clearRect(0, 0, 100, 66); paintCompanion(ctx, "fox", 4, 24, 48); }
  }, []);
  return <canvas ref={canvasRef} width={100} height={66} aria-hidden />;
}

function BadgeStill({ id }: { id: string }) {
  const instance = useId().replace(/:/g, "");
  const badge = AMBASSADOR_BADGES.find(item => item.id === id);
  if (!badge) return null;
  const svg = badge.svg.replace(/id="(am\d+)"/g, `id="$1-${instance}"`).replace(/url\(#(am\d+)\)/g, `url(#$1-${instance})`);
  return <span className={css.rewardBadge} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}
