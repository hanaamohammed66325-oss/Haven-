"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import { Loader2, Sparkles, ShieldCheck, ChevronDown } from "lucide-react";
import { useT, usePageTitle } from "@/i18n";
import { Card } from "@/components/Card";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase";
import { useSubscription } from "@/lib/subscription";
import { PLANS, DEFAULT_PLAN_CYCLE } from "@/lib/premium";
import type { TranslationKey } from "@/i18n/translations/en";

// UI payments mode. 'mock' (default) shows the test banner and a simulated card
// form; no real Tap SDK is loaded and no real charge happens. Flipping
// NEXT_PUBLIC_PAYMENTS_MODE to 'live' mounts the real Tap Card Web SDK below.
// NOTE: this is a SEPARATE toggle from the Edge Functions' own server-side
// PAYMENTS_MODE secret (Supabase) — both need to be 'live' for a real charge
// flow to run end to end.
const PAYMENTS_MODE = (process.env.NEXT_PUBLIC_PAYMENTS_MODE ?? "mock").toLowerCase();
const IS_MOCK = PAYMENTS_MODE !== "live";

const CREATE_SUBSCRIPTION_URL = `${SUPABASE_URL}/functions/v1/create-subscription`;
const TAP_CONFIRM_3DS_URL = `${SUPABASE_URL}/functions/v1/tap-confirm-3ds`;
const VALIDATE_COUPON_URL = `${SUPABASE_URL}/functions/v1/validate-coupon`;

// ---------------------------------------------------------------------------
// Tap Card Web SDK v2 — confirmed against Tap's live docs
// (https://developers.tap.company/docs/card-sdk-web-v2) on integration date.
// Script exposes `window.CardSDK` with `renderTapCard(containerId, config)`,
// which mounts Tap's own hosted card fields and returns `{ unmount }`.
// Tokenization is triggered by calling `window.CardSDK.tokenize()`; the
// result comes back via the `onSuccess`/`onError` callbacks passed at init —
// NOT as a promise — so the actual subscribe flow has to live inside those
// callbacks rather than a linear async function.
// ---------------------------------------------------------------------------
const TAP_SDK_SRC = "https://tap-sdks.b-cdn.net/card/1.0.2/index.js";
const TAP_CONTAINER_ID = "tap-card-element";
const TAP_PUBLIC_KEY = process.env.NEXT_PUBLIC_TAP_PUBLIC_KEY ?? "";
// Tap's docs list `merchant.id` as optional, but the hosted card page the SDK
// loads (sdk.tap.company/v2/card/index.html) is built with an empty `mid=`
// query param when it's omitted and rejects the request with 400 — same
// documented-optional-but-actually-required pattern as `addons`/`fields`
// below (confirmed live: rendering with vs without merchant.id produces
// `mid=` vs `mid=<value>` in the iframe src the SDK builds).
const TAP_MERCHANT_ID = process.env.NEXT_PUBLIC_TAP_MERCHANT_ID ?? "";
// Tap's own convention: test keys are always prefixed pk_test_, live keys
// pk_live_ — so the sandbox banner/test-card helper disappear automatically
// once a real pk_live_ key is configured, with no code change needed.
const IS_TAP_TEST_MODE = TAP_PUBLIC_KEY.startsWith("pk_test_");

// Verified test cards (https://developers.tap.company/reference/testing-cards,
// fetched live) — a non-3DS and a 3DS-triggering card per brand, so both
// checkout paths can be exercised. Any future expiry date; CVV 100.
const TEST_CARDS: { brand: string; number: string; threeDS: boolean }[] = [
  { brand: "Visa", number: "4012 0000 3333 0026", threeDS: false },
  { brand: "Visa", number: "4508 7500 1574 1019", threeDS: true },
  { brand: "Mastercard", number: "5111 1111 1111 1118", threeDS: false },
  { brand: "Mastercard", number: "5123 4500 0000 0008", threeDS: true },
];

// The plan cycle and Tap's authorize_id both survive the full-page redirect
// to Tap's 3DS challenge (and back) via sessionStorage — component state and
// the ?plan= query param are both lost on that round trip otherwise, and
// authorize_id is never in any URL param Tap sends back to us.
const PENDING_CYCLE_KEY = "haven_checkout_pending_cycle";
const PENDING_AUTHORIZE_ID_KEY = "haven_checkout_pending_authorize_id";

// How many times to re-call tap-confirm-3ds while it still reports "pending"
// before giving up silent retries and showing "still verifying" with a
// manual "check again" button instead.
const VERIFY_POLL_ATTEMPTS = 5;
const VERIFY_POLL_DELAY_MS = 2000;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function CheckoutInner() {
  const { t, lang, dir } = useT();
  usePageTitle("checkoutTitle");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useSubscription();

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
  const [testCardsOpen, setTestCardsOpen] = useState(false);

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percentOff: number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");

  // 3DS return-flow state: shown instead of the normal form while we confirm
  // the subscription actually landed after the redirect back from Tap.
  // - verifying: tap-confirm-3ds call(s) in flight (including the silent
  //   pending-status retry loop).
  // - verifyTimedOut: still "pending" after all retries — recoverable via
  //   the manual "check again" button (calls runVerification again).
  // - verifyOutcome: a terminal, non-retriable-the-same-way result —
  //   "declined" (card failed 3DS, offer to pick a different card/plan) or
  //   "error" (request/network failure, offer a manual retry).
  const [verifying, setVerifying] = useState(false);
  const [verifyTimedOut, setVerifyTimedOut] = useState(false);
  const [verifyOutcome, setVerifyOutcome] = useState<"declined" | "error" | null>(null);
  const [verifyAttempt, setVerifyAttempt] = useState(0);

  // Tap SDK mount state.
  const [tapScriptLoaded, setTapScriptLoaded] = useState(false);
  const [tapReady, setTapReady] = useState(false);
  const tapInitRef = useRef(false); // guards against a double init (StrictMode)
  const tapUnmountRef = useRef<(() => void) | null>(null);

  // ---- Shared "create the trial subscription" call, used by both mock and
  // live paths once a token is in hand. ----
  const completeSubscription = useCallback(
    async (token: string) => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          setError(t("checkoutErrSession"));
          setBusy(false);
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
            token,
            ...(appliedCoupon ? { coupon_code: appliedCoupon.code } : {}),
          }),
        });
        const json = await res.json().catch(() => ({} as Record<string, unknown>));

        // 3D Secure required: create-subscription returns 200 with
        // requires_3ds instead of completing — no subscription row exists yet.
        // Send the browser to Tap's hosted challenge; it redirects back here.
        if (json?.requires_3ds && typeof json?.redirect_url === "string") {
          try {
            sessionStorage.setItem(PENDING_CYCLE_KEY, cycle);
            if (typeof json.authorize_id === "string") {
              sessionStorage.setItem(PENDING_AUTHORIZE_ID_KEY, json.authorize_id);
            }
          } catch {
            /* ignore */
          }
          window.location.href = json.redirect_url as string;
          return;
        }

        if (!res.ok || !json?.ok) {
          setError(t(errorKeyFor(res.status, String(json?.error ?? ""))));
          setBusy(false);
          return;
        }

        // Success — refresh access state now so premium UI is fresh on arrival
        // (the profile page also refreshes as a fallback), then redirect.
        await refresh();
        router.push("/profile?subscribed=1");
      } catch {
        setError(t("checkoutErrGeneric"));
        setBusy(false);
      }
    },
    [appliedCoupon, cycle, refresh, router, t]
  );

  // ---- Coupon apply / remove ----
  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponError("");
    setCouponLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
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
      if (json?.valid) {
        setAppliedCoupon({ code, percentOff: json.percent_off as number });
        setCouponCode("");
      } else {
        setCouponError(t("checkoutCouponInvalid"));
      }
    } catch {
      setCouponError(t("checkoutErrGeneric"));
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  };

  // ---- Tap SDK init (live mode only) ----
  const initTapCard = useCallback(() => {
    if (tapInitRef.current) return;
    const CardSDK = (window as unknown as { CardSDK?: Record<string, unknown> }).CardSDK;
    if (!CardSDK || typeof CardSDK.renderTapCard !== "function") return;
    if (!document.getElementById(TAP_CONTAINER_ID)) return;
    if (!TAP_PUBLIC_KEY || !TAP_MERCHANT_ID) {
      setError(t("checkoutErrGeneric"));
      return;
    }
    tapInitRef.current = true;

    const { renderTapCard, Currencies, Direction, Locale, Theme, Edges } = CardSDK as {
      renderTapCard: (id: string, config: Record<string, unknown>) => { unmount: () => void };
      Currencies: Record<string, unknown>;
      Direction: Record<string, unknown>;
      Locale: Record<string, unknown>;
      Theme: Record<string, unknown>;
      Edges: Record<string, unknown>;
    };

    try {
      const { unmount } = renderTapCard(TAP_CONTAINER_ID, {
        publicKey: TAP_PUBLIC_KEY,
        merchant: { id: TAP_MERCHANT_ID },
        // Matches the 1 SAR authorize-then-void amount create-subscription
        // actually uses to save the card (see that function's comments) — NOT
        // the plan's real price, since no money moves at this step either way.
        transaction: { amount: 1, currency: Currencies.SAR },
        // Tap's docs list `addons`/`fields` as optional, but the SDK's own
        // bundle reads addons.loader and fields.cardHolder without guarding
        // an absent object — omitting either throws "Cannot read properties
        // of undefined" from inside index.js (confirmed by reproducing both
        // live against the real SDK bundle: addons.loader threw and stopped
        // the widget from rendering at all; fields.cardHolder threw but
        // non-fatally). Passing both explicitly eliminates all of it. saveCard
        // is off (our backend always saves the card server-side — see
        // create-subscription — so an extra "save this card" checkbox in the
        // widget would just be confusing/redundant).
        addons: { loader: true, saveCard: false, displayPaymentBrands: true },
        fields: { cardHolder: true },
        interface: {
          locale: lang === "ar" ? Locale.AR : Locale.EN,
          direction: dir === "rtl" ? Direction.RTL : Direction.LTR,
          theme: Theme.LIGHT,
          edges: Edges.CURVED,
        },
        onReady: () => setTapReady(true),
        onSuccess: (data: { id: string }) => {
          void completeSubscription(data.id);
        },
        onError: () => {
          setError(t("checkoutErrTokenize"));
          setBusy(false);
        },
      });
      tapUnmountRef.current = unmount;
    } catch (e) {
      console.error("Haven: failed to mount Tap card element", e);
      tapInitRef.current = false;
      setError(t("checkoutErrGeneric"));
    }
  }, [completeSubscription, dir, lang, t]);

  useEffect(() => {
    if (IS_MOCK || !tapScriptLoaded) return;
    initTapCard();
    return () => {
      tapUnmountRef.current?.();
      tapUnmountRef.current = null;
      tapInitRef.current = false;
      setTapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tapScriptLoaded]);

  // ---- 3DS return flow: ?tap_status=complete means the user is back from
  // Tap's hosted challenge. create-subscription doesn't run again on this
  // leg, so we call tap-confirm-3ds directly with the authorize_id saved
  // before the redirect — it confirms the authorization with Tap and
  // finalizes the trial subscription synchronously, instead of waiting on
  // Tap's server-to-server webhook (which can only UPDATE an existing
  // subscription row and so never completes a first-time signup on its own).
  // runVerification is a plain callback (not tied to the effect) so the
  // manual "check again" retry button can re-run the exact same logic
  // without any router-navigation trick to re-trigger an effect.
  const verifyCancelledRef = useRef(false);

  // Strips ?tap_status=complete from the URL (keeping any other params, e.g.
  // ?plan=) so a refresh after this page has already handled the return
  // doesn't re-trigger the effect below and start verification over.
  const clearTapStatusParam = useCallback(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("tap_status")) return;
      params.delete("tap_status");
      const qs = params.toString();
      router.replace(qs ? `/checkout?${qs}` : "/checkout");
    } catch {
      /* ignore */
    }
  }, [router]);

  const runVerification = useCallback(async () => {
    verifyCancelledRef.current = false;
    setVerifying(true);
    setVerifyTimedOut(false);
    setVerifyOutcome(null);

    // Reached a terminal (non-success) state: commit the UI state first,
    // THEN clean the URL. clearTapStatusParam() changes searchParams, which
    // re-fires the effect below and its cleanup (setting verifyCancelledRef
    // = true) — doing the state commit first means that race can't swallow
    // the outcome we just decided.
    const finish = (outcome: "declined" | "error" | "timeout") => {
      if (verifyCancelledRef.current) return;
      setVerifying(false);
      if (outcome === "timeout") setVerifyTimedOut(true);
      else setVerifyOutcome(outcome);
      clearTapStatusParam();
    };

    let authorizeId: string | null = null;
    try {
      const savedCycle = sessionStorage.getItem(PENDING_CYCLE_KEY);
      if (savedCycle && planForCycle(savedCycle)) setCycle(savedCycle);
      authorizeId = sessionStorage.getItem(PENDING_AUTHORIZE_ID_KEY);
    } catch {
      /* ignore */
    }

    const clearPending = () => {
      try {
        sessionStorage.removeItem(PENDING_CYCLE_KEY);
        sessionStorage.removeItem(PENDING_AUTHORIZE_ID_KEY);
      } catch {
        /* ignore */
      }
    };

    // No authorize_id survived the round trip (cleared storage, a different
    // tab, or a stale link) — there's nothing to confirm.
    if (!authorizeId) {
      finish("error");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      finish("error");
      return;
    }

    for (let attempt = 1; attempt <= VERIFY_POLL_ATTEMPTS; attempt++) {
      if (verifyCancelledRef.current) return;
      setVerifyAttempt(attempt);

      let json: Record<string, unknown> = {};
      try {
        const res = await fetch(TAP_CONFIRM_3DS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ authorize_id: authorizeId }),
        });
        json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok || json.error) {
          finish("error");
          return;
        }
      } catch {
        // Network/fetch failure — surface immediately with a manual retry
        // rather than silently looping on an unreachable endpoint.
        finish("error");
        return;
      }

      if (json.status === "trial" || json.already_finalized) {
        clearPending();
        await refresh();
        if (!verifyCancelledRef.current) {
          clearTapStatusParam();
          router.push("/profile?subscribed=1");
        }
        return;
      }

      if (json.status === "failed") {
        clearPending();
        finish("declined");
        return;
      }

      // status === "pending" — Tap hasn't finished settling yet; retry.
      if (attempt < VERIFY_POLL_ATTEMPTS) await sleep(VERIFY_POLL_DELAY_MS);
    }
    finish("timeout");
  }, [clearTapStatusParam, refresh, router]);

  useEffect(() => {
    if (searchParams.get("tap_status") !== "complete") return;
    void runVerification();
    return () => {
      verifyCancelledRef.current = true;
    };
    // Runs once for the mount that arrives with this query param; the retry
    // button re-invokes runVerification directly, so this intentionally
    // doesn't depend on runVerification's own identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const onSubscribe = async () => {
    setError("");
    setBusy(true);

    if (IS_MOCK) {
      // Mock: no gateway. A fake token stands in for Tap tokenization.
      const token = `tok_mock_${crypto.randomUUID()}`;
      await completeSubscription(token);
      return;
    }

    // Live: hand off to the Tap SDK. It validates the entered card fields and
    // calls onSuccess/onError above; completeSubscription runs from there.
    const CardSDK = (window as unknown as { CardSDK?: { tokenize?: () => void } }).CardSDK;
    if (!tapReady || !CardSDK?.tokenize) {
      setError(t("checkoutErrTokenize"));
      setBusy(false);
      return;
    }
    CardSDK.tokenize();
  };

  // Declined card: not retriable with the same authorize_id, so send the
  // user back to a clean plan-selection state (strips ?plan= and ?tap_status
  // both) rather than offering "check again".
  const backToPlanSelection = () => {
    setVerifyOutcome(null);
    router.replace("/checkout");
  };

  // ---- 3DS return-flow states — replace the whole form while resolving ----
  if (verifying || verifyTimedOut || verifyOutcome) {
    return (
      <div className="haven-fade-in max-w-lg mx-auto text-center py-12">
        <Card padding="p-8">
          {verifying ? (
            <>
              <Loader2 size={28} className="animate-spin mx-auto mb-4" style={{ color: "var(--color-primary)" }} />
              <p className="text-[15px] font-medium" style={{ color: "var(--color-ink)" }}>
                {t("checkout3dsVerifying")}
              </p>
              <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>
                {t("checkout3dsVerifyingHint", { n: verifyAttempt, total: VERIFY_POLL_ATTEMPTS })}
              </p>
            </>
          ) : verifyTimedOut ? (
            <>
              <p className="text-[15px] font-medium" style={{ color: "var(--color-ink)" }}>
                {t("checkout3dsTimeout")}
              </p>
              <button
                type="button"
                onClick={() => void runVerification()}
                className="haven-btn mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
              >
                {t("checkout3dsRetry")}
              </button>
            </>
          ) : verifyOutcome === "declined" ? (
            <>
              <p className="text-[15px] font-medium" style={{ color: "var(--color-danger)" }}>
                {t("checkout3dsDeclined")}
              </p>
              <button
                type="button"
                onClick={backToPlanSelection}
                className="haven-btn mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
              >
                {t("checkout3dsBackToPlans")}
              </button>
            </>
          ) : (
            <>
              <p className="text-[15px] font-medium" style={{ color: "var(--color-danger)" }}>
                {t("checkout3dsError")}
              </p>
              <button
                type="button"
                onClick={() => void runVerification()}
                className="haven-btn mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
              >
                {t("checkout3dsRetry")}
              </button>
            </>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="haven-fade-in max-w-lg mx-auto">
      {/* Header */}
      <h1 className="font-display text-[28px] leading-tight" style={{ color: "var(--color-ink)" }}>
        {t("checkoutTitle")}
      </h1>

      {/* Test-mode banners: the mock banner while NEXT_PUBLIC_PAYMENTS_MODE
          isn't 'live', or the Tap sandbox banner once it is but Tap's own
          public key is still a pk_test_ one. Neither shows once both are
          switched to real live values. */}
      {IS_MOCK ? (
        <div
          className="mt-5 rounded-xl px-4 py-3 text-[13px] font-medium"
          style={{ background: "rgba(245, 158, 11, 0.12)", color: "#92600a", border: "1px solid rgba(245, 158, 11, 0.4)" }}
          role="status"
        >
          {t("checkoutMockBanner")}
        </div>
      ) : (
        IS_TAP_TEST_MODE && (
          <div
            className="mt-5 rounded-xl px-4 py-3 text-[13px] font-medium"
            style={{ background: "rgba(245, 158, 11, 0.12)", color: "#92600a", border: "1px solid rgba(245, 158, 11, 0.4)" }}
            role="status"
          >
            {t("checkoutTapTestBanner")}
          </div>
        )
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
          <div className="text-end">
            {appliedCoupon ? (
              <>
                <div
                  className="text-[13px] line-through"
                  style={{ color: "var(--color-muted)" }}
                >
                  {t(plan.priceKey as TranslationKey)}
                </div>
                <div className="font-display text-[24px] leading-none" style={{ color: "var(--color-primary)" }}>
                  {Math.round(plan.priceSar * (1 - appliedCoupon.percentOff / 100))} SAR
                </div>
              </>
            ) : (
              <div className="font-display text-[24px] leading-none" style={{ color: "var(--color-ink)" }}>
                {t(plan.priceKey as TranslationKey)}
              </div>
            )}
          </div>
        </div>
        {appliedCoupon && (
          <div
            className="mt-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium flex items-center gap-2"
            style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)", color: "var(--color-primary)" }}
          >
            <span className="flex-1">
              {t("checkoutCouponApplied", { percent: String(appliedCoupon.percentOff) })}
            </span>
            <button type="button" onClick={removeCoupon} className="underline text-[12px] shrink-0">
              {t("checkoutCouponRemove")}
            </button>
          </div>
        )}
        <p
          className="mt-4 rounded-xl px-3.5 py-3 text-[13px] leading-relaxed"
          style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
        >
          {t("checkoutFreeTrialLine")}
        </p>
      </Card>

      {/* Coupon code */}
      {!appliedCoupon && (
        <Card padding="p-4" className="mt-4">
          <div className="haven-label mb-2">{t("checkoutCouponLabel")}</div>
          <div className="flex gap-2">
            <input
              className={`${fieldBase} flex-1`}
              style={{ borderColor: "var(--color-border)" }}
              type="text"
              dir="ltr"
              placeholder={t("checkoutCouponPlaceholder")}
              value={couponCode}
              onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") void applyCoupon(); }}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => void applyCoupon()}
              disabled={!couponCode.trim() || couponLoading}
              className="haven-btn shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {couponLoading ? "…" : t("checkoutCouponApply")}
            </button>
          </div>
          {couponError && (
            <p className="mt-2 text-[12px]" style={{ color: "var(--color-danger)" }}>
              {couponError}
            </p>
          )}
        </Card>
      )}

      {/* Card form */}
      <Card padding="p-5" className="mt-5">
        {IS_MOCK ? (
          // Simulated form: visually complete, accepts input, never calls Tap.
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
          <div className="flex flex-col gap-3">
            {/* Tap mounts its own hosted card fields into this container. */}
            <div id={TAP_CONTAINER_ID} className="min-h-[120px]" />
            {!tapReady && (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-muted)" }} />
              </div>
            )}

            {IS_TAP_TEST_MODE && (
              <details
                className="mt-1 rounded-xl border p-3 text-xs"
                style={{ borderColor: "var(--color-border)" }}
                open={testCardsOpen}
                onToggle={(e) => setTestCardsOpen(e.currentTarget.open)}
              >
                <summary className="cursor-pointer font-medium inline-flex items-center gap-1.5" style={{ color: "var(--color-muted)" }}>
                  <ChevronDown size={13} className={testCardsOpen ? "rotate-180 transition-transform" : "transition-transform"} />
                  {t("checkoutTestCardsTitle")}
                </summary>
                <div className="mt-3 flex flex-col gap-1.5" dir="ltr">
                  {TEST_CARDS.map((c) => (
                    <div key={c.number} className="flex items-center justify-between gap-2">
                      <span style={{ color: "var(--color-ink)" }}>
                        {c.brand} — <span style={{ fontFamily: "monospace" }}>{c.number}</span>
                      </span>
                      <span style={{ color: "var(--color-muted)" }}>
                        {c.threeDS ? t("checkoutTestCard3ds") : t("checkoutTestCardNo3ds")}
                      </span>
                    </div>
                  ))}
                  <span className="mt-1" style={{ color: "var(--color-muted)" }}>
                    {t("checkoutTestCardsHint")}
                  </span>
                </div>
              </details>
            )}
          </div>
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
        disabled={busy || (!IS_MOCK && !tapReady)}
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

      {/* Tap Card Web SDK — page-scoped only (not loaded globally), client-side
          only. afterInteractive: this page is the ONLY consumer, and the card
          form only needs to be interactive once the page itself already is. */}
      {!IS_MOCK && (
        <Script src={TAP_SDK_SRC} strategy="afterInteractive" onLoad={() => setTapScriptLoaded(true)} />
      )}
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
