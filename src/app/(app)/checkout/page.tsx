"use client";

// ---------------------------------------------------------------------------
// Checkout — SIMULATED (no payment gateway connected).
//
// Haven currently has no live payment processor. This page runs a mock card
// form: nothing is tokenized, no network call reaches a gateway, and no money
// moves. Submitting simply starts the user's 30-day free trial by calling the
// create-subscription Edge Function, which records the plan and trial window.
//
// When a real gateway is chosen, the work is confined to:
//   1. this file (swap the mock form for the provider's SDK/fields), and
//   2. the create-subscription Edge Function (attach a real charge/agreement).
// Everything else — plans, coupons, trial dates, the subscription record —
// already works and is provider-agnostic.
// ---------------------------------------------------------------------------

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { useT, usePageTitle } from "@/i18n";
import { Card } from "@/components/Card";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase";
import { useSubscription } from "@/lib/subscription";
import { PLANS, DEFAULT_PLAN_CYCLE } from "@/lib/premium";
import type { TranslationKey } from "@/i18n/translations/en";

const CREATE_SUBSCRIPTION_URL = `${SUPABASE_URL}/functions/v1/create-subscription`;
const VALIDATE_COUPON_URL = `${SUPABASE_URL}/functions/v1/validate-coupon`;

const fieldBase =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

/** Resolve the incoming ?plan= (4months | 6months | yearly) to a catalogue plan. */
function planForCycle(cycle: string | null) {
  if (!cycle) return null;
  return PLANS.find((p) => p.cycle === cycle) ?? null;
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="h-40" />}>
      <CheckoutInner />
    </Suspense>
  );
}

function CheckoutInner() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useSubscription();
  usePageTitle("checkoutTitle");

  const cycle = useMemo(() => {
    const requested = searchParams.get("plan");
    return planForCycle(requested)?.cycle ?? DEFAULT_PLAN_CYCLE;
  }, [searchParams]);

  const plan = useMemo(
    () => PLANS.find((p) => p.cycle === cycle) ?? PLANS[0],
    [cycle]
  );

  // ---- Simulated card fields (never leave the browser) ----
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");

  // ---- Coupon ----
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percentOff: number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");

  // ---- Submit ----
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const applyCoupon = useCallback(async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponError("");
    setCouponLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setCouponError(t("checkoutErrSession"));
        setCouponLoading(false);
        return;
      }
      const res = await fetch(VALIDATE_COUPON_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.valid) {
        setAppliedCoupon({ code: json.code ?? code, percentOff: Number(json.percent_off) || 0 });
        setCouponCode("");
      } else {
        setCouponError(t("checkoutCouponInvalid"));
      }
    } catch {
      setCouponError(t("checkoutCouponInvalid"));
    }
    setCouponLoading(false);
  }, [couponCode, t]);

  const removeCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setCouponError("");
  }, []);

  /**
   * Start the trial. No gateway is contacted — the simulated card fields are
   * discarded and only the plan (and coupon, if any) is sent.
   */
  const startTrial = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setSubmitting(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError(t("checkoutErrSession"));
          setSubmitting(false);
          return;
        }
        const res = await fetch(CREATE_SUBSCRIPTION_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            plan: cycle,
            ...(appliedCoupon ? { coupon_code: appliedCoupon.code } : {}),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.ok) {
          await refresh();
          router.replace("/profile?subscribed=1");
          return;
        }
        setError(json?.error ? String(json.error) : t("checkoutErrGeneric"));
      } catch {
        setError(t("checkoutErrGeneric"));
      }
      setSubmitting(false);
    },
    [cycle, appliedCoupon, refresh, router, t]
  );

  const discounted = appliedCoupon
    ? Math.round(plan.priceSar * (1 - appliedCoupon.percentOff / 100))
    : null;

  const border = { borderColor: "var(--color-border)" };

  return (
    <div className="haven-fade-in max-w-xl">
      <h1 className="font-display text-[32px] leading-tight" style={{ color: "var(--color-ink)" }}>
        {t("checkoutTitle")}
      </h1>

      {/* Simulation notice — this build has no payment processor connected. */}
      <div
        className="mt-5 rounded-xl px-4 py-3 text-[13px] leading-relaxed"
        style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
      >
        {t("checkoutMockBanner")}
      </div>

      {/* Plan summary */}
      <Card padding="p-5 sm:p-6" className="mt-6">
        <div className="text-xs font-medium mb-3" style={{ color: "var(--color-muted)" }}>
          {t("checkoutPlanSummary")}
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-medium" style={{ color: "var(--color-ink)" }}>
            {t(plan.labelKey as TranslationKey)}
          </span>
          {discounted != null ? (
            <span className="flex items-baseline gap-2">
              <span
                className="text-[14px] line-through"
                style={{ color: "var(--color-muted)" }}
              >
                {plan.priceSar} SAR
              </span>
              <span className="text-[18px] font-semibold" style={{ color: "var(--color-primary)" }}>
                {discounted} SAR
              </span>
            </span>
          ) : (
            <span className="text-[18px] font-semibold" style={{ color: "var(--color-ink)" }}>
              {plan.priceSar} SAR
            </span>
          )}
        </div>
        <p className="text-[13px] mt-3" style={{ color: "var(--color-muted)" }}>
          {t("checkoutFreeTrialLine")}
        </p>

        {appliedCoupon && (
          <div
            className="mt-4 flex items-center justify-between gap-3 rounded-lg px-3 py-2"
            style={{ background: "var(--color-primary-soft)" }}
          >
            <span className="text-[13px] font-medium" style={{ color: "var(--color-primary)" }}>
              {t("checkoutCouponApplied", { percent: appliedCoupon.percentOff })}
            </span>
            <button
              type="button"
              onClick={removeCoupon}
              className="text-[12px] font-medium underline"
              style={{ color: "var(--color-primary)" }}
            >
              {t("checkoutCouponRemove")}
            </button>
          </div>
        )}
      </Card>

      {/* Coupon entry */}
      {!appliedCoupon && (
        <Card padding="p-5 sm:p-6" className="mt-4">
          <label className="block text-xs font-medium mb-2" style={{ color: "var(--color-muted)" }}>
            {t("checkoutCouponLabel")}
          </label>
          <div className="flex gap-2">
            <input
              className={fieldBase}
              style={border}
              value={couponCode}
              placeholder={t("checkoutCouponPlaceholder")}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void applyCoupon(); }
              }}
            />
            <button
              type="button"
              onClick={() => void applyCoupon()}
              disabled={couponLoading || !couponCode.trim()}
              className="haven-btn shrink-0 rounded-xl px-5 text-sm font-medium"
              style={{ opacity: couponLoading || !couponCode.trim() ? 0.5 : 1 }}
            >
              {couponLoading ? "…" : t("checkoutCouponApply")}
            </button>
          </div>
          {couponError && (
            <p className="text-[12px] mt-2" style={{ color: "#c0392b" }}>{couponError}</p>
          )}
        </Card>
      )}

      {/* Simulated card form */}
      <form onSubmit={startTrial}>
        <Card padding="p-5 sm:p-6" className="mt-4">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={15} style={{ color: "var(--color-muted)" }} />
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              {t("checkoutFieldsSimulated")}
            </span>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                {t("checkoutCardName")}
              </label>
              <input
                className={fieldBase}
                style={border}
                value={cardName}
                placeholder={t("checkoutCardNamePlaceholder")}
                onChange={(e) => setCardName(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                {t("checkoutCardNumber")}
              </label>
              <input
                className={fieldBase}
                style={border}
                value={cardNumber}
                placeholder="4242 4242 4242 4242"
                inputMode="numeric"
                onChange={(e) => setCardNumber(e.target.value)}
                autoComplete="off"
                dir="ltr"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                  {t("checkoutExpiry")}
                </label>
                <input
                  className={fieldBase}
                  style={border}
                  value={expiry}
                  placeholder="12 / 30"
                  onChange={(e) => setExpiry(e.target.value)}
                  autoComplete="off"
                  dir="ltr"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                  {t("checkoutCvc")}
                </label>
                <input
                  className={fieldBase}
                  style={border}
                  value={cvc}
                  placeholder="123"
                  inputMode="numeric"
                  onChange={(e) => setCvc(e.target.value)}
                  autoComplete="off"
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="text-[13px] mt-4" style={{ color: "#c0392b" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="haven-btn mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold"
            style={{ opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t("checkoutProcessing")}
              </>
            ) : (
              <>
                <Sparkles size={16} />
                {t("checkoutStartTrial")}
              </>
            )}
          </button>

          <p className="text-[12px] mt-4 text-center" style={{ color: "var(--color-muted)" }}>
            {t("premiumTrustFooter")}
          </p>
        </Card>
      </form>
    </div>
  );
}
