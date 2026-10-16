"use client";
import { InteractionButton } from "@/components/motion/Interaction";

/**
 * AmbassadorPanel — the whole referral / "Ambassador" reward system shown on the
 * Profile page. All rewards can be previewed; use is owned by earned thresholds. The
 * exclusive THEMES live on the Settings page with the other themes; here we cover
 * the code, the reward ladder, the badges and Havi's outfits.
 */
import { useId, useState } from "react";
import { Crown, Copy, Check, Share2, ChevronDown, Paintbrush, PawPrint } from "@/components/motion/icons";
import { SITE_URL } from "@/lib/supabase";
import { canUseReferralReward, referralUnlockHint } from "@/lib/referralRewards";
import { referralInviteUrl } from "@/lib/referralInvite";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Card } from "@/components/Card";
import HaviShowcase from "@/components/HaviShowcase";
import { COSMETIC_ORDER, cosmeticLabel, conflictsWith } from "@/lib/haviCosmetics";
import type { CompanionKind } from "@/types";
import { AmbassadorBadge } from "@/components/AmbassadorBadge";
import { CollapseBody, CollapseToggle, useCardCollapse } from "@/components/Collapsible";
import { AMBASSADOR_RUNGS, AMBASSADOR_BADGES, type AmbassadorRung } from "@/lib/ambassadorRewards";
import { plural } from "@/lib/format";
import styles from "./AmbassadorPanel.module.css";
import { ReferralSourceForm } from "./ReferralSourceForm";
import { useReferralProgram } from "./useReferralProgram";

function countText(n: number, ar: boolean, xp = false) {
  const forms = xp
    ? ar ? ["نقطة خبرة واحدة", "نقطتا خبرة", "# نقاط خبرة", "# نقطة خبرة"] : ["# XP", "# XP"]
    : ar ? ["دعوة محتسبة", "دعوتان محتسبتان", "# دعوات محتسبة", "# دعوة محتسبة"] : ["# counted referral", "# counted referrals"];
  return plural(n, forms).replace(String(n), new Intl.NumberFormat(ar ? "ar-SA" : "en-US").format(n));
}

function RewardRung({ rung, lang }: { rung: AmbassadorRung; lang: "ar" | "en" }) {
  const ar = lang === "ar", title = ar ? rung.ar : rung.en;
  const badge = AMBASSADOR_BADGES.find(b => b.id === rung.badge);
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className={`${styles.rung} ${open ? styles.open : ""}`}
      onKeyDown={e => { if (e.key === "Escape") { setOpen(false); e.stopPropagation(); } }}>
      <InteractionButton type="button" className={styles.trigger} aria-expanded={open} aria-controls={id}
        onClick={() => setOpen(v => !v)}>
        <span className={styles.number} aria-hidden>{new Intl.NumberFormat(ar ? "ar-SA" : "en-US").format(rung.count)}</span>
        <span className={styles.heading}>
          <span className={styles.name}>{title}</span>
          <span className={styles.threshold}>{countText(rung.count, ar)}</span>
        </span>
        <ChevronDown size={17} className={styles.chevron} aria-hidden />
      </InteractionButton>
      <div id={id}>
        <CollapseBody open={open}>
          <div className={styles.content}>
            {(rung.outfits.length > 0 || badge) && <div className={styles.visuals}>
              {rung.outfits.map(outfit => <figure key={outfit} className={styles.visual}>
                <div className={styles.art}><HaviShowcase outfit={outfit} /></div>
                <figcaption className={styles.caption}>{cosmeticLabel(outfit, lang)}</figcaption>
              </figure>)}
              {badge && <figure className={styles.visual}>
                <div className={styles.art}><AmbassadorBadge id={badge.id} size={56} /></div>
                <figcaption className={styles.caption}>{ar ? badge.ar : badge.en}</figcaption>
              </figure>}
            </div>}
            <div className={styles.extras}>
              {rung.theme && <span className={styles.extra}><Paintbrush size={14} aria-hidden />{ar ? "سمة " + rung.theme.ar : rung.theme.en + " theme"}</span>}
              {rung.companion && <span className={styles.extra}><PawPrint size={14} aria-hidden />{ar ? "الرفيق " + rung.companion.ar : rung.companion.en + " companion"}</span>}
            </div>
            {rung.xp && <p className={styles.xp}>{countText(rung.xp, ar, true)}</p>}
          </div>
        </CollapseBody>
      </div>
    </li>
  );
}

export default function AmbassadorPanel() {
  const { lang } = useT();
  const ar = lang === "ar";
  const programFold = useCardCollapse("profile-ambassador", "profile-ambassador");
  const { haviCosmetics, setHaviCosmetics, haviCompanions, setHaviCompanions } = useStore();
  const program = useReferralProgram();
  const [copied, setCopied] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  // Note shown when two outfits can't be worn together (they'd overlap).
  const [outfitNote, setOutfitNote] = useState<string | null>(null);

  const equipped = haviCosmetics || [];
  const pets = haviCompanions || [];

  // Toggle a companion pet on/off. Keep one, both, or none.
  const togglePet = (id: CompanionKind) => {
    if (!canUseReferralReward(program.profile, "companion", id)) return;
    if (pets.includes(id)) setHaviCompanions(pets.filter((p) => p !== id));
    else setHaviCompanions([...pets, id]);
  };
  const PETS: { id: CompanionKind; ar: string; en: string }[] = [
    { id: "fox", ar: "الثعلب", en: "Fox" },
    { id: "tiger", ar: "النمر", en: "Tiger" },
  ];

  // Toggle an outfit. "none" clears everything. Otherwise: remove if already on,
  // else add — but block it (with a note) if it would overlap an equipped piece.
  const toggleOutfit = (id: string) => {
    if (!canUseReferralReward(program.profile, "outfit", id)) return;
    setOutfitNote(null);
    if (id === "none") { setHaviCosmetics([]); return; }
    if (equipped.includes(id)) {
      setHaviCosmetics(equipped.filter((e) => e !== id));
      return;
    }
    const clash = conflictsWith(id, equipped);
    if (clash.length) {
      const names = clash.map((c: string) => cosmeticLabel(c, lang)).join(ar ? "، " : ", ");
      setOutfitNote(
        ar
          ? `لا يمكن الجمع بين هذه القطعة و${names} بسبب تداخل مواضعها.`
          : `This piece overlaps with ${names} and cannot be worn with it.`
      );
      return;
    }
    setHaviCosmetics([...equipped, id]);
  };

  const code = program.profile?.available ? program.profile.code : null;

  const inviteUrl = code ? referralInviteUrl(SITE_URL, code) : null;
  const shareText = ar
    ? `جرّب Haven لتنظيم دراستك وحساب المعدّل. استخدم رمز الإحالة: ${code}\n${inviteUrl || ""}`
    : `Try Haven to organize your studies and track your GPA — use my code: ${code}\n${inviteUrl || ""}`;

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const share = async () => {
    if (!code) return;
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) {
      try { await nav.share({ text: shareText }); return; } catch { /* cancelled */ }
    }
    copyCode();
  };

  return (
    <div id="profile-ambassador" className="mt-8 scroll-mt-24">
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: programFold.open ? "1rem" : 0, transition: "margin-bottom 0.35s ease" }}>
        <h2 className="font-display text-lg flex items-center gap-2" style={{ color: "var(--color-ink)" }}>
          <Crown size={20} style={{ color: "var(--color-brass)" }} />
          {ar ? "برنامج السفير" : "Ambassador program"}
        </h2>
        <CollapseToggle open={programFold.open} onToggle={programFold.toggle} label={ar ? "برنامج السفير" : "Ambassador program"} />
      </div>

      <CollapseBody open={programFold.open}>
      <Card padding="p-5 sm:p-8" className="haven-stagger">
        {/* Code + share */}
        <div className="rounded-2xl border p-4 mb-6" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-alt, var(--color-primary-soft))" }}>
          <div className="text-xs mb-1.5" style={{ color: "var(--color-muted)" }}>
            {ar ? "رمز الإحالة" : "Referral code"}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-2xl tracking-wide" style={{ color: "var(--color-ink)" }} dir="ltr">
              {code || (program.phase === "loading" ? "…" : "—")}
            </span>
            <div className="flex items-center gap-2 ms-auto">
              <InteractionButton
                disabled={!code}
                onClick={copyCode}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? (ar ? "تم النسخ" : "Copied") : (ar ? "نسخ" : "Copy")}
              </InteractionButton>
              <InteractionButton
                disabled={!code}
                onClick={share}
                className="haven-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
              >
                <Share2 size={15} />
                {ar ? "مشاركة" : "Share"}
              </InteractionButton>
            </div>
          </div>

          <p className="text-xs mt-3" style={{ color: "var(--color-muted)" }}>{code && program.profile
            ? <span className="flex flex-wrap gap-x-4 gap-y-1">{[[ar ? "احتُسبت" : "Counted", program.profile.activatedCount], [ar ? "قيد التفعيل" : "Pending", program.profile.pendingCount], [ar ? "لم تكتمل" : "Not completed", program.profile.expiredCount]].map(([label, n]) => <span key={String(label)}>{label}: {new Intl.NumberFormat(ar ? "ar-SA" : "en-US").format(Number(n))}</span>)}</span>
            : ar ? "سيظهر رمزك عند تفعيل برنامج الإحالة." : "Your code will appear when the referral program is enabled."}</p>
        </div>

        <div className="rounded-2xl border p-4 mb-6" style={{ borderColor: "var(--color-border)" }}>
          <ReferralSourceForm program={program} />
        </div>

        <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--color-ink)" }}>
          {ar ? "سلّم المكافآت" : "Reward ladder"}
        </h3>
        <ol className={styles.ladder}>
          {AMBASSADOR_RUNGS.map(rung => <RewardRung key={rung.count} rung={rung} lang={lang} />)}
        </ol>
        <p className={styles.note}>
          {ar
            ? "تُحتسب كل دعوة عند تفاعل صديقك مع Haven، وتُفتح المكافآت بحسب عدد الدعوات المحتسبة."
            : "Each referral counts once your friend engages with Haven; rewards unlock by the number of counted referrals."}
        </p>

        <div className={styles.controls}>
          <InteractionButton type="button" className={styles.controlHeading} style={{ width: "100%", minHeight: 44, color: "var(--color-ink)", fontSize: 14, fontWeight: 600 }}
            aria-expanded={customizing} aria-controls="ambassador-customization" onClick={() => setCustomizing(v => !v)}>
            {ar ? "تخصيص Havi ورفاقه" : "Customize Havi and companions"}
            <ChevronDown size={17} style={{ transform: customizing ? "rotate(180deg)" : undefined, color: "var(--color-muted)" }} aria-hidden />
          </InteractionButton>
          <div id="ambassador-customization"><CollapseBody open={customizing}><div className={styles.controlBody}>
              {/* Havi outfits */}
              <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
                {ar ? "أزياء Havi" : "Havi outfits"}
              </h3>
              <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
                {ar
                  ? "يمكن الجمع بين أزياء Havi ما دامت القطع لا تتداخل."
                  : "Combine Havi outfits as long as the pieces do not overlap."}
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {COSMETIC_ORDER.map((id) => {
                  const active = id === "none" ? equipped.length === 0 : equipped.includes(id);
                  const locked = !canUseReferralReward(program.profile, "outfit", id);
                  return (
                    <InteractionButton
                      key={id}
                      disabled={locked}
                      onClick={() => toggleOutfit(id)}
                      aria-pressed={active}
                      className="min-h-11 rounded-xl px-3 py-2 text-sm font-medium border transition-colors"
                      style={
                        active
                          ? { background: "var(--color-primary-soft)", color: "var(--color-primary)", borderColor: "var(--color-primary)" }
                          : { color: "var(--color-muted)", borderColor: "var(--color-border)" }
                      }
                    >
                      <span className="block">{cosmeticLabel(id, lang)}</span>
                      {locked && <span className="block text-[11px] mt-1">{referralUnlockHint("outfit", id, ar)}</span>}
                    </InteractionButton>
                  );
                })}
              </div>
              {outfitNote && (
                <p className="text-xs mb-6" style={{ color: "var(--color-danger, #c0563f)" }} role="status">
                  {outfitNote}
                </p>
              )}
              {!outfitNote && <div className="mb-6" />}

              {/* Companion pets */}
              <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
                {ar ? "رفاق Havi" : "Havi's companions"}
              </h3>
              <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
                {ar
                  ? "اختر رفاق Havi. يمكن تفعيل رفيق واحد أو كليهما، وإيقافهما في أي وقت."
                  : "Choose one or both of Havi’s companions, or turn them off at any time."}
              </p>
              <div className="flex flex-wrap gap-2 mb-6">
                {PETS.map((pet) => {
                  const active = pets.includes(pet.id);
                  const locked = !canUseReferralReward(program.profile, "companion", pet.id);
                  return (
                    <InteractionButton
                      key={pet.id}
                      disabled={locked}
                      onClick={() => togglePet(pet.id)}
                      aria-pressed={active}
                      className="min-h-11 rounded-xl px-3 py-2 text-sm font-medium border transition-colors"
                      style={
                        active
                          ? { background: "var(--color-primary-soft)", color: "var(--color-primary)", borderColor: "var(--color-primary)" }
                          : { color: "var(--color-muted)", borderColor: "var(--color-border)" }
                      }
                    >
                      <span className="block">{ar ? pet.ar : pet.en}</span>
                      {locked && <span className="block text-[11px] mt-1">{referralUnlockHint("companion", pet.id, ar)}</span>}
                    </InteractionButton>
                  );
                })}
              </div>

          </div></CollapseBody></div>
        </div>

        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          {ar
            ? "السمات الحصرية — بلور وغسق وكهرمان — متاحة في الإعدادات."
            : "The exclusive Crystal, Dusk and Amber themes are available in Settings."}
        </p>
      </Card>
      </CollapseBody>
    </div>
  );
}
