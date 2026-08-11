"use client";

import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { useT, usePageTitle } from "@/i18n";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { Footer } from "@/components/Footer";
import { useSubscription } from "@/lib/subscription";
import { PLANS, FEATURES, PREMIUM_LIST, isVip, isActiveSubscriber, hasActiveAccess } from "@/lib/premium";
import type { TranslationKey } from "@/i18n/translations/en";

// The recommended / default plan that visually stands out.
const RECOMMENDED_PLAN_ID = "6";

// "Included with subscription" — sourced from premium.js (single source of
// truth) so it can't drift from the gates/marketing card, plus themes (which
// aren't a PREMIUM_LIST feature key).
const INCLUDED_KEYS: TranslationKey[] = [
  ...PREMIUM_LIST.map(
    (key: string) => (FEATURES as Record<string, { labelKey?: string }>)[key]?.labelKey as TranslationKey
  ).filter(Boolean),
  "premiumIncludeThemes",
];

export default function PremiumPage() {
  const { t } = useT();
  usePageTitle("premiumPageTitle");
  const { sub, profile } = useSubscription();
  const [modalOpen, setModalOpen] = useState(false);
  const [accessNote, setAccessNote] = useState(false);

  // Access state drives what each card shows.
  const vip = isVip(profile);
  const activeSubscriber = isActiveSubscriber(sub);
  const hasAccess = hasActiveAccess(profile, sub); // vip || trial || active

  // Auto-dismiss the "you already have access" note.
  useEffect(() => {
    if (!accessNote) return;
    const id = window.setTimeout(() => setAccessNote(false), 2600);
    return () => window.clearTimeout(id);
  }, [accessNote]);

  // Placeholder subscribe action (real Moyasar checkout comes later). VIP / trial
  // / active users already have everything — just tell them; everyone else sees
  // the "coming soon" modal.
  const onSubscribe = () => {
    if (hasAccess) setAccessNote(true);
    else setModalOpen(true);
  };

  return (
    <div className="haven-fade-in max-w-4xl mx-auto">
      {/* Hero */}
      <div className="text-center">
        <h1 className="font-display text-[34px] leading-tight" style={{ color: "var(--color-ink)" }}>
          {t("premiumPageTitle")}
        </h1>
        <p className="text-[15px] mt-3" style={{ color: "var(--color-muted)" }}>
          {t("premiumPageSubtitle")}
        </p>
      </div>

      {/* Plan cards */}
      <div className="grid gap-5 sm:grid-cols-3 mt-10 items-stretch">
        {PLANS.map((p) => {
          const recommended = p.id === RECOMMENDED_PLAN_ID;
          return (
            <Card
              key={p.id}
              padding="p-6"
              className="relative flex flex-col"
              style={
                recommended
                  ? { outline: "2px solid var(--color-primary)", outlineOffset: 2 }
                  : undefined
              }
            >
              {recommended && (
                <span
                  className="absolute -top-3 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 rounded-full px-3 py-0.5 text-[11px] font-semibold text-white whitespace-nowrap"
                  style={{ background: "var(--color-primary)" }}
                >
                  {t("premiumRecommended")}
                </span>
              )}

              <div className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>
                {t(p.labelKey as TranslationKey)}
              </div>

              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-[30px] leading-none" style={{ color: "var(--color-ink)" }}>
                  {t(p.priceKey as TranslationKey)}
                </span>
              </div>
              <div className="mt-1 text-[13px]" style={{ color: "var(--color-muted)" }}>
                {t(p.perMonthKey as TranslationKey)}
              </div>

              {p.tagKey && (
                <span
                  className="mt-3 inline-block self-start rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: "var(--color-brass)", color: "#1a1410" }}
                >
                  {t(p.tagKey as TranslationKey)}
                </span>
              )}

              {/* Action area, driven by access state */}
              <div className="mt-6 pt-4 border-t" style={{ borderColor: "var(--color-border)" }}>
                {vip ? (
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-xl py-2.5 text-sm font-semibold cursor-not-allowed"
                    style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)", opacity: 0.85 }}
                  >
                    {t("premiumPermanentPlan")}
                  </button>
                ) : activeSubscriber ? (
                  <div
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold"
                    style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
                  >
                    <Check size={15} strokeWidth={3} />
                    {t("premiumCurrentPlan")}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onSubscribe}
                    className="haven-btn w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold"
                  >
                    <Sparkles size={16} />
                    {t("premiumStartFree")}
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Included with subscription */}
      <div className="mt-12">
        <h2 className="haven-label mb-4 text-center">{t("premiumIncludedTitle")}</h2>
        <Card padding="p-6" className="max-w-md mx-auto">
          <ul className="flex flex-col gap-3">
            {INCLUDED_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-2.5 text-sm" style={{ color: "var(--color-ink)" }}>
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
                >
                  <Check size={12} strokeWidth={3} />
                </span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Trust footer */}
      <p className="mt-8 text-center text-[13px]" style={{ color: "var(--color-muted)" }}>
        {t("premiumTrustFooter")}
      </p>

      {/* Already-have-access note (VIP / trial / active) */}
      {accessNote && (
        <div
          className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit max-w-[90%] rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg"
          style={{ background: "var(--color-ink)", color: "#fff" }}
          role="status"
        >
          {t("premiumHaveAccessNote")}
        </div>
      )}

      {/* Placeholder "coming soon" modal (replaced by real checkout later) */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("premiumComingSoonTitle")}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {t("premiumComingSoonBody")}
        </p>
        <div className="flex justify-end mt-6">
          <button
            onClick={() => setModalOpen(false)}
            className="haven-btn px-5 py-2 rounded-xl text-sm font-medium"
          >
            {t("close")}
          </button>
        </div>
      </Modal>

      <Footer />
    </div>
  );
}
