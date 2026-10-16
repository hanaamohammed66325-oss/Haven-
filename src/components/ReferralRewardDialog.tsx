"use client";
import { InteractionButton } from "@/components/motion/Interaction";

import { useEffect, useRef } from "react";
import { ArrowUpRight, Check, Paintbrush } from "@/components/motion/icons";
import { paintCompanion } from "@/lib/haviCompanionArt";
import { MotionModal } from "./motion/MotionModal";
import HaviShowcase from "./HaviShowcase";
import { AmbassadorBadge } from "./AmbassadorBadge";
import { AMBASSADOR_BADGES, type AmbassadorRung } from "@/lib/ambassadorRewards";
import { cosmeticLabel } from "@/lib/haviCosmetics";
import styles from "./ReferralRewardDialog.module.css";

function CompanionPreview({ kind }: { kind: "fox" | "tiger" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const canvas = ref.current, ctx = canvas?.getContext("2d"); if (canvas && ctx) { ctx.clearRect(0,0,canvas.width,canvas.height); paintCompanion(ctx,kind,4,8,37); } }, [kind]);
  return <canvas ref={ref} width={68} height={44} aria-hidden style={{ width: 68, height: 44, imageRendering: "pixelated" }} />;
}

/** Presentation only: a preview cannot grant or equip account rewards. */
export function ReferralRewardDialog({ open, rewards, lang, onClose, onNavigate }: {
  open: boolean; rewards: readonly AmbassadorRung[]; lang: string;
  onClose: () => void; onNavigate: (path: string) => void;
}) {
  const ar = lang === "ar", number = (n: number) => new Intl.NumberFormat(ar ? "ar-SA" : "en-US").format(n);
  const xp = rewards.reduce((sum, rung) => sum + (rung.xp || 0), 0);
  const outfit = rewards.at(-1)?.outfits[0] || "none";
  const hasProfile = rewards.some(r => r.outfits.length || r.badge || r.companion);
  const hasTheme = rewards.some(r => r.theme);
  return <MotionModal open={open} onClose={onClose} title={ar ? "مكافآت جديدة لك" : "New rewards for you"}
    footer={<div className={styles.actions} dir={ar ? "rtl" : "ltr"}>
      {hasProfile && <InteractionButton className={styles.primary} onClick={() => onNavigate("/profile/#profile-ambassador")}>
        {ar ? "تفعيل مكافآت Havi" : "Equip Havi rewards"}<ArrowUpRight size={16} aria-hidden />
      </InteractionButton>}
      {hasTheme && <InteractionButton className={styles.secondary} onClick={() => onNavigate("/settings/#settings-theme")}>
        {ar ? "اختيار السمة" : "Choose theme"}<Paintbrush size={16} aria-hidden />
      </InteractionButton>}
      <InteractionButton className={styles.later} onClick={onClose}>{ar ? "لاحقًا" : "Later"}</InteractionButton>
    </div>}>
    <div className={styles.body} dir={ar ? "rtl" : "ltr"}>
      <div className={styles.hero}>
        <span className={styles.orbit} aria-hidden /><span className={styles.orbitTwo} aria-hidden />
        <div className={styles.mascot}><HaviShowcase outfit={outfit} celebrate /></div>
        <span className={styles.unlocked}><Check size={13} aria-hidden />{ar ? "فُتحت الآن" : "Just unlocked"}</span>
      </div>
      <h3 className={styles.title}>{ar ? "دعوتك صنعت فرقًا" : "Your invitation made a difference"}</h3>
      <p className={styles.intro}>{ar ? "احتُسبت إحالتك، وأصبحت هذه المكافآت متاحة لك." : "Your referral counted. These rewards are now yours."}</p>
      <div className={styles.rewards}>
        {rewards.map(rung => <section key={rung.count} className={styles.rung} aria-label={ar ? rung.ar : rung.en}>
          <div className={styles.rungTitle}><span>{ar ? rung.ar : rung.en}</span><span className={styles.check}><Check size={14} aria-hidden /></span></div>
          <div className={styles.visuals}>
            {rung.outfits.map(id => <figure key={id} className={styles.item}>
              <div className={styles.art}><HaviShowcase outfit={id} /></div><figcaption>{cosmeticLabel(id, lang)}</figcaption>
            </figure>)}
            {rung.badge && <figure className={styles.item}><div className={styles.art}><AmbassadorBadge id={rung.badge} size={48} /></div>
              <figcaption>{AMBASSADOR_BADGES.find(b => b.id === rung.badge)?.[ar ? "ar" : "en"]}</figcaption></figure>}
            {rung.theme && <figure className={styles.item}><div className={styles.art}>
              <span className={`${styles.swatch} ${styles[rung.theme.id]}`} aria-hidden><Paintbrush size={20} /></span>
            </div><figcaption>{ar ? "سمة " + rung.theme.ar : rung.theme.en + " theme"}</figcaption></figure>}
            {rung.companion && <figure className={styles.item}><div className={styles.art}><CompanionPreview kind={rung.companion.id} /></div><figcaption>{ar ? rung.companion.ar : rung.companion.en}</figcaption></figure>}
          </div>
        </section>)}
      </div>
      {xp > 0 && <p className={styles.xp}>+{number(xp)} <span>XP</span><small>{ar ? "أُضيفت إلى رصيدك" : "Added to your balance"}</small></p>}
      <p className={styles.hint}>{ar ? "أزياء Havi ورفاقه في الملف الشخصي ضمن «برنامج السفير»، والسمات في الإعدادات. تظهر الشارة تلقائيًا." : "Find Havi outfits and companions in Profile → Ambassador program, and themes in Settings. Your badge appears automatically."}</p>
    </div>
  </MotionModal>;
}
