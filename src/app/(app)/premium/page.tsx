"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles, Loader2, FlaskConical } from "lucide-react";
import { useT, usePageTitle } from "@/i18n";
import { Card } from "@/components/Card";
import { Footer } from "@/components/Footer";
import { useSubscription } from "@/lib/subscription";
import { PLANS, FEATURES, PREMIUM_LIST, isVip, isBetaTester, isInTrial, isActiveSubscriber, hasActiveAccess } from "@/lib/premium";
import { activateBetaCode } from "@/lib/db";
import { changePlan, planLabelKeyFor, type PlanCycle } from "@/lib/changePlan";
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
  const router = useRouter();
  const { sub, profile, refresh } = useSubscription();

  // Access state drives what each card shows.
  const vip = isVip(profile);
  // Non-VIP users with a live subscription (trial, active, or cancelled but still
  // in-period) can switch plans in place; the card matching their billing_cycle
  // is their current plan. Everyone else starts a fresh trial via /checkout.
  const canSwitch = !vip && (isInTrial(sub) || isActiveSubscriber(sub));
  const currentCycle = sub?.billing_cycle ?? null;

  const beta = isBetaTester(profile);
  const premium = hasActiveAccess(profile, sub);

  const [toast, setToast] = useState("");
  const [toastErr, setToastErr] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [pendingCycle, setPendingCycle] = useState<string | null>(null);

  const [betaCode, setBetaCode] = useState("");
  const [betaLoading, setBetaLoading] = useState(false);
  const [betaError, setBetaError] = useState("");

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Fresh-trial path (expired / no subscription): go through checkout.
  const onSubscribe = (cycle: string) => router.push(`/checkout?plan=${cycle}`);

  // In-place plan switch for trial / active / cancelled users.
  const onSwitch = async (cycle: PlanCycle) => {
    setToast("");
    setSwitching(true);
    setPendingCycle(cycle);
    const res = await changePlan(cycle);
    setSwitching(false);
    setPendingCycle(null);
    if (!res.ok) {
      setToastErr(true);
      setToast(
        res.code === "NO_SESSION"
          ? t("checkoutErrSession")
          : res.code === "NO_SUBSCRIPTION"
          ? t("subNoSubError")
          : t("subChangeError")
      );
      return;
    }
    await refresh();
    const key = planLabelKeyFor(cycle);
    setToastErr(false);
    setToast(t("subPlanChangedToast", { plan: key ? t(key as TranslationKey) : cycle }));
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
                ) : canSwitch ? (
                  p.cycle === currentCycle ? (
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
                      onClick={() => onSwitch(p.cycle as PlanCycle)}
                      disabled={switching}
                      className="haven-btn w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
                    >
                      {pendingCycle === p.cycle ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Sparkles size={16} />
                      )}
                      {pendingCycle === p.cycle ? t("subUpdating") : t("subSwitchToPlan")}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => onSubscribe(p.cycle)}
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

      {/* Beta tester banner */}
      {beta && (
        <Card padding="p-5" className="mt-8 max-w-md mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <FlaskConical size={18} style={{ color: "var(--color-primary)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              {t("betaActiveTitle")}
            </span>
          </div>
          <p className="text-[13px]" style={{ color: "var(--color-muted)" }}>
            {t("betaActiveDesc")}
          </p>
        </Card>
      )}

      {/* Beta code entry — only for users without active access */}
      {!premium && (
        <Card padding="p-5" className="mt-8 max-w-md mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical size={16} style={{ color: "var(--color-primary)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              {t("betaCodeTitle")}
            </span>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBetaError("");
              setBetaLoading(true);
              const res = await activateBetaCode(betaCode);
              setBetaLoading(false);
              if (res.ok) {
                setBetaCode("");
                await refresh();
                setToastErr(false);
                setToast(t("betaActivated"));
              } else {
                const errKey = `betaErr_${res.error}` as TranslationKey;
                setBetaError(t(errKey) !== errKey ? t(errKey) : t("betaErrGeneric"));
              }
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              required
              placeholder="HVN-XXXX-XXXX"
              value={betaCode}
              onChange={(e) => setBetaCode(e.target.value.toUpperCase())}
              className="haven-input flex-1 text-center tracking-widest font-mono"
              style={{ letterSpacing: "0.1em" }}
              dir="ltr"
            />
            <button
              type="submit"
              disabled={betaLoading || !betaCode.trim()}
              className="haven-btn rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {betaLoading ? <Loader2 size={16} className="animate-spin" /> : t("betaActivate")}
            </button>
          </form>
          {betaError && (
            <p className="text-[12px] mt-2" style={{ color: "var(--color-danger)" }}>{betaError}</p>
          )}
        </Card>
      )}

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

      {/* Plan-switch toast (success or error) */}
      {toast && (
        <div
          className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[90%] items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg"
          style={{ background: toastErr ? "var(--color-danger)" : "var(--color-ink)", color: "#fff" }}
          role="status"
        >
          {!toastErr && <Check size={16} strokeWidth={3} style={{ color: "var(--color-brass)" }} />}
          {toast}
        </div>
      )}

      <Footer />
    </div>
  );
}
