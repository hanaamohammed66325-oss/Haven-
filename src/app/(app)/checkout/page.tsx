"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { useT, usePageTitle } from "@/i18n";
import { Card } from "@/components/Card";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase";
import { PLANS, DEFAULT_PLAN_CYCLE } from "@/lib/premium";
import type { TranslationKey } from "@/i18n/translations/en";

// UI payments mode. 'mock' (default) shows the test banner and a simulated card
// form; no real Moyasar SDK is loaded and no real charge happens. Flipping
// NEXT_PUBLIC_PAYMENTS_MODE to 'live' (later) mounts the real Moyasar form.
const PAYMENTS_MODE = (process.env.NEXT_PUBLIC_PAYMENTS_MODE ?? "mock").toLowerCase();
const IS_MOCK = PAYMENTS_MODE !== "live";

const CREATE_SUBSCRIPTION_URL = `${SUPABASE_URL}/functions/v1/create-subscription`;

const fieldBase =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

// Resolve the incoming ?plan= (a billing-cycle slug: 4months | 6months | yearly)
// to a plan from the pricing catalogue. Unknown/missing → null (caller defaults).
function planForCycle(cycle: string | null) {
  return PLANS.find((p) => p.cycle === cycle) ?? null;
}

// Map the Edge Function's error response to a localized, user-facing message.
function errorKeyFor(status: number, message: string): TranslationKey {
  const m = message.toLowerCase();
  if (status === 409 && m.includes("already have")) return "checkoutErrActive";
  if (m.includes("not eligible")) return "checkoutErrIneligible";
  return "checkoutErrGeneric";
}

function CheckoutInner() {
  const { t } = useT();
  usePageTitle("checkoutTitle");
  const router = useRouter();
  const searchParams = useSearchParams();

  // The plan the page opened with. If it's missing/invalid we fall back to the
  // recommended cycle AND surface the plan selector so the user can pick.
  const initial = useMemo(() => planForCycle(searchParams.get("plan")), [searchParams]);
  const [cycle, setCycle] = useState<string>(initial?.cycle ?? DEFAULT_PLAN_CYCLE);
  const showSelector = initial === null;

  const plan = planForCycle(cycle)!; // cycle always comes from PLANS, so never null

  // Simulated card fields (mock mode only). Accepted but never validated or sent.
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [cardName, setCardName] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const onSubscribe = async () => {
    setError("");
    setBusy(true);
    try {
      // 1. Obtain the payment token.
      let token: string;
      if (IS_MOCK) {
        // Mock: no gateway. A fake token stands in for Moyasar tokenization.
        token = `tok_mock_${crypto.randomUUID()}`;
      } else {
        // LIVE (future): the real card token comes from Moyasar's tokenization
        // callback (save_only flow) captured in #moyasar-form. Until the SDK is
        // wired up there is no token to send.
        // TODO(live): token = <token from Moyasar.init save_only callback>
        setError(t("checkoutErrGeneric"));
        setBusy(false);
        return;
      }

      // 2. Authenticate: the create-subscription function needs the user's JWT.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError(t("checkoutErrSession"));
        setBusy(false);
        return;
      }

      // 3. Create the trial subscription.
      const res = await fetch(CREATE_SUBSCRIPTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ plan: cycle, token }),
      });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));

      if (!res.ok || !json?.ok) {
        setError(t(errorKeyFor(res.status, String(json?.error ?? ""))));
        setBusy(false);
        return;
      }

      // 4. Success — the profile subscription section shows the toast.
      router.push("/profile?subscribed=1");
    } catch {
      setError(t("checkoutErrGeneric"));
      setBusy(false);
    }
  };

  return (
    <div className="haven-fade-in max-w-lg mx-auto">
      {/* Header */}
      <h1 className="font-display text-[28px] leading-tight" style={{ color: "var(--color-ink)" }}>
        {t("checkoutTitle")}
      </h1>

      {/* Test-mode banner (mock only) */}
      {IS_MOCK && (
        <div
          className="mt-5 rounded-xl px-4 py-3 text-[13px] font-medium"
          style={{
            background: "rgba(245, 158, 11, 0.12)",
            color: "#92600a",
            border: "1px solid rgba(245, 158, 11, 0.4)",
          }}
          role="status"
        >
          {t("checkoutMockBanner")}
        </div>
      )}

      {/* Optional plan selector — only when the URL plan was missing/invalid */}
      {showSelector && (
        <div className="mt-6">
          <h2 className="haven-label mb-2">{t("checkoutChoosePlan")}</h2>
          <div className="grid grid-cols-3 gap-2.5">
            {PLANS.map((p) => {
              const active = p.cycle === cycle;
              return (
                <button
                  key={p.cycle}
                  type="button"
                  onClick={() => setCycle(p.cycle)}
                  className="rounded-xl border px-2 py-3 text-center transition-colors"
                  style={{
                    borderColor: active ? "var(--color-primary)" : "var(--color-border)",
                    background: active ? "var(--color-primary-soft)" : "transparent",
                  }}
                  aria-pressed={active}
                >
                  <span
                    className="block text-[13px] font-semibold"
                    style={{ color: active ? "var(--color-primary)" : "var(--color-ink)" }}
                  >
                    {t(p.labelKey as TranslationKey)}
                  </span>
                  <span className="mt-0.5 block text-[12px]" style={{ color: "var(--color-muted)" }}>
                    {t(p.priceKey as TranslationKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Plan summary */}
      <Card padding="p-5" className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="haven-label">{t("checkoutPlanSummary")}</div>
            <div className="mt-1 text-[15px] font-semibold" style={{ color: "var(--color-ink)" }}>
              {t(plan.labelKey as TranslationKey)}
            </div>
          </div>
          <div className="font-display text-[24px] leading-none" style={{ color: "var(--color-ink)" }}>
            {t(plan.priceKey as TranslationKey)}
          </div>
        </div>
        <p
          className="mt-4 rounded-xl px-3.5 py-3 text-[13px] leading-relaxed"
          style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
        >
          {t("checkoutFreeTrialLine")}
        </p>
      </Card>

      {/* Card form */}
      <Card padding="p-5" className="mt-5">
        {IS_MOCK ? (
          // Simulated form: visually complete, accepts input, never calls Moyasar.
          <div className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                {t("checkoutCardNumber")}
              </span>
              <input
                className={fieldBase}
                style={{ borderColor: "var(--color-border)" }}
                type="text"
                inputMode="numeric"
                dir="ltr"
                placeholder="4111 1111 1111 1111"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                autoComplete="off"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                  {t("checkoutExpiry")}
                </span>
                <input
                  className={fieldBase}
                  style={{ borderColor: "var(--color-border)" }}
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="MM / YY"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                  {t("checkoutCvc")}
                </span>
                <input
                  className={fieldBase}
                  style={{ borderColor: "var(--color-border)" }}
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="123"
                  value={cvc}
                  onChange={(e) => setCvc(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                {t("checkoutCardName")}
              </span>
              <input
                className={fieldBase}
                style={{ borderColor: "var(--color-border)" }}
                type="text"
                placeholder={t("checkoutCardNamePlaceholder")}
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                autoComplete="off"
              />
            </label>

            <p className="text-[12px]" style={{ color: "var(--color-muted)" }}>
              {t("checkoutFieldsSimulated")}
            </p>
          </div>
        ) : (
          // LIVE mode (future): the real Moyasar.js form mounts here. To enable:
          //   1. Load the Moyasar SDK (script + CSS) when IS_MOCK is false.
          //   2. Moyasar.init({ element: '#moyasar-form', amount, currency: 'SAR',
          //        save_only: true, ...publishable_api_key, on_completed: cb }).
          //   3. In on_completed, capture the returned card token and feed it to
          //      onSubscribe() instead of the mock token above.
          // Keep this the ONLY place that changes when going live.
          // TODO(live): mount Moyasar here (save_only tokenization).
          <div id="moyasar-form" />
        )}
      </Card>

      {/* Error */}
      {error && (
        <p className="mt-4 text-sm" style={{ color: "var(--color-danger)" }} role="alert">
          {error}
        </p>
      )}

      {/* Subscribe */}
      <button
        type="button"
        onClick={onSubscribe}
        disabled={busy}
        className="haven-btn mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
      >
        {busy ? (
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

      {/* Trust line */}
      <p
        className="mt-4 inline-flex items-center justify-center gap-1.5 w-full text-center text-[12px]"
        style={{ color: "var(--color-muted)" }}
      >
        <ShieldCheck size={14} />
        {t("premiumTrustFooter")}
      </p>
    </div>
  );
}

export default function CheckoutPage() {
  // useSearchParams needs a Suspense boundary under static export.
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}
