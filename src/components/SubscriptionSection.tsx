"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, Loader2, Check } from "lucide-react";
import { useT } from "@/i18n";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase";
import { useSubscription } from "@/lib/subscription";
import {
  PLANS,
  isVip,
  isInTrial,
  isActiveSubscriber,
  daysUntilTrialEnds,
} from "@/lib/premium";
import { changePlan, type PlanCycle } from "@/lib/changePlan";
import { formatLongDate } from "@/lib/dates";
import type { TranslationKey } from "@/i18n/translations/en";

const CANCEL_URL = `${SUPABASE_URL}/functions/v1/cancel-subscription`;

// Plan display name from the billing-cycle slug ('4months'|'6months'|'yearly').
function planLabelKey(cycle: string | null): TranslationKey | null {
  const p = PLANS.find((x) => x.cycle === cycle);
  return p ? (p.labelKey as TranslationKey) : null;
}

// Locale-aware "40 SAR" / "٤٠ ريال".
function money(amount: number | null, lang: "en" | "ar"): string {
  if (amount == null) return "";
  const n = new Intl.NumberFormat(lang === "ar" ? "ar" : "en").format(amount);
  return lang === "ar" ? `${n} ريال` : `${n} SAR`;
}

const secondaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border transition-colors hover:bg-black/[0.03]";

function Badge({
  children,
  tone = "primary",
}: {
  children: React.ReactNode;
  tone?: "primary" | "brass" | "muted";
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "var(--color-primary-soft)", color: "var(--color-primary)" },
    brass: { background: "var(--color-brass)", color: "#1a1410" },
    muted: { background: "var(--color-border)", color: "var(--color-muted)" },
  };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
      style={styles[tone]}
    >
      {children}
    </span>
  );
}

export function SubscriptionSection() {
  const { t, lang } = useT();
  const router = useRouter();
  const { sub, profile, loading, refresh } = useSubscription();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // Change-plan / resubscribe state.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [pendingCycle, setPendingCycle] = useState<string | null>(null);
  const [changeError, setChangeError] = useState("");

  // Auto-dismiss the success toast.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const openConfirm = () => {
    setError("");
    setConfirmOpen(true);
  };

  const openPicker = () => {
    setChangeError("");
    setPickerOpen(true);
  };

  // Call change-plan for `cycle`. `resubscribe` = reactivating the same plan
  // (no plan change), which uses a different confirmation toast.
  const doChangePlan = async (cycle: PlanCycle, opts?: { resubscribe?: boolean }) => {
    setChangeError("");
    setChanging(true);
    setPendingCycle(cycle);
    const res = await changePlan(cycle);
    setChanging(false);
    setPendingCycle(null);
    if (!res.ok) {
      setChangeError(
        res.code === "NO_SESSION"
          ? t("checkoutErrSession")
          : res.code === "NO_SUBSCRIPTION"
          ? t("subNoSubError")
          : t("subChangeError")
      );
      return;
    }
    // Reflect the new plan/status without a re-login.
    await refresh();
    setPickerOpen(false);
    const key = planLabelKey(cycle);
    const planName = key ? t(key) : cycle;
    setToast(
      opts?.resubscribe && !res.plan_changed
        ? t("subResubscribedToast")
        : t("subPlanChangedToast", { plan: planName })
    );
  };

  const onCancel = async () => {
    setError("");
    setBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError(t("checkoutErrSession"));
        setBusy(false);
        return;
      }
      const res = await fetch(CANCEL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || !json?.ok) {
        setError(t("subCancelError"));
        setBusy(false);
        return;
      }
      // Re-read so the section reflects 'cancelled' without a re-login.
      await refresh();
      const until = json.access_until ? formatLongDate(String(json.access_until), lang) : "";
      setConfirmOpen(false);
      setBusy(false);
      setToast(t("subCancelledToast", { date: until }));
    } catch {
      setError(t("subCancelError"));
      setBusy(false);
    }
  };

  // Shared card shell so the title stays put across every state.
  const shell = (body: React.ReactNode) => (
    <Card padding="p-5 sm:p-8" className="mt-8">
      <h2 className="font-display text-xl" style={{ color: "var(--color-ink)" }}>
        {t("subscriptionTitle")}
      </h2>
      <div className="mt-4">{body}</div>
    </Card>
  );

  if (loading) {
    return shell(
      <div
        className="h-4 w-44 rounded animate-pulse"
        style={{ background: "var(--color-border)" }}
        aria-hidden
      />
    );
  }

  const planKey = planLabelKey(sub?.billing_cycle ?? null);
  const amountText = money(sub?.amount_sar ?? null, lang);
  const planLine = [planKey ? t(planKey) : null, amountText].filter(Boolean).join(" · ");

  // Manage buttons (Change plan + Cancel), shared by trial + active states.
  const manageButtons = (
    <div className="mt-5 flex flex-wrap gap-3">
      <button
        type="button"
        onClick={openPicker}
        className={secondaryBtn}
        style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
      >
        {t("subChangePlan")}
      </button>
      <button
        type="button"
        onClick={openConfirm}
        className={secondaryBtn}
        style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}
      >
        {t("subCancel")}
      </button>
    </div>
  );

  let body: React.ReactNode;

  if (isVip(profile)) {
    // VIP — permanent access, no subscription to manage.
    body = (
      <>
        <Badge tone="brass">
          <Crown size={13} />
          {t("subVipBadge")}
        </Badge>
        <p className="mt-3 text-sm" style={{ color: "var(--color-muted)" }}>
          {t("subVipText")}
        </p>
      </>
    );
  } else if (isInTrial(sub)) {
    // Free trial in progress.
    const n = daysUntilTrialEnds(sub) ?? 0;
    const endDate = sub?.trial_ends_at ? formatLongDate(sub.trial_ends_at, lang) : "";
    body = (
      <>
        <Badge tone="primary">{t("subTrialBadge")}</Badge>
        <p className="mt-3 text-sm" style={{ color: "var(--color-ink)" }}>
          {t("subTrialEnds", {
            n,
            unit: n === 1 ? t("subTrialDay") : t("subTrialDays"),
            date: endDate,
          })}
        </p>
        {planLine && (
          <p className="mt-1.5 text-sm" style={{ color: "var(--color-muted)" }}>
            {planLine} — {t("subBillingAfterTrial")}
          </p>
        )}
        {manageButtons}
      </>
    );
  } else if (isActiveSubscriber(sub) && sub?.status === "active") {
    // Paid, active subscriber.
    const renewIso = sub?.next_billing_at ?? sub?.expires_at ?? null;
    const renewDate = renewIso ? formatLongDate(renewIso, lang) : "";
    body = (
      <>
        <Badge tone="primary">{t("subSubscribedBadge")}</Badge>
        {planLine && (
          <p className="mt-3 text-sm" style={{ color: "var(--color-ink)" }}>
            {planLine}
          </p>
        )}
        {renewDate && (
          <p className="mt-1.5 text-sm" style={{ color: "var(--color-muted)" }}>
            {t("subNextRenewal", { date: renewDate })}
          </p>
        )}
        {manageButtons}
      </>
    );
  } else if (
    sub?.status === "cancelled" &&
    sub?.expires_at &&
    new Date(sub.expires_at) > new Date()
  ) {
    // Cancelled but still inside the paid period.
    const accessDate = formatLongDate(sub.expires_at, lang);
    body = (
      <>
        <Badge tone="muted">{t("subCancelledBadge")}</Badge>
        <p className="mt-3 text-sm" style={{ color: "var(--color-ink)" }}>
          {t("subAccessUntil", { date: accessDate })}
        </p>
        <p className="mt-1.5 text-sm" style={{ color: "var(--color-muted)" }}>
          {t("subNoFurtherCharges")}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={changing}
              onClick={() => {
                const cur = PLANS.find((p) => p.cycle === sub?.billing_cycle);
                if (cur) doChangePlan(cur.cycle as PlanCycle, { resubscribe: true });
                else openPicker();
              }}
              className="haven-btn inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {changing && <Loader2 size={15} className="animate-spin" />}
              {changing ? t("subUpdating") : t("subResubscribe")}
            </button>
            <button
              type="button"
              onClick={openPicker}
              disabled={changing}
              className="text-sm font-medium underline disabled:opacity-60"
              style={{ color: "var(--color-primary)" }}
            >
              {t("subChangePlanInstead")}
            </button>
          </div>
          {changeError && (
            <p className="text-sm" style={{ color: "var(--color-danger)" }} role="alert">
              {changeError}
            </p>
          )}
        </div>
      </>
    );
  } else {
    // Expired / no subscription (and not VIP).
    body = (
      <>
        <Badge tone="muted">{t("subNoneBadge")}</Badge>
        <p className="mt-3 text-sm" style={{ color: "var(--color-muted)" }}>
          {t("subNoneText")}
        </p>
        <div className="mt-5">
          <button
            type="button"
            onClick={() => router.push("/premium")}
            className="haven-btn inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            {t("subSeePlans")}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {shell(body)}

      {/* Cancel confirmation */}
      <Modal
        open={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        title={t("subCancelConfirmTitle")}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={busy}
              className={`${secondaryBtn} disabled:opacity-60`}
              style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
            >
              {t("subCancelConfirmNo")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--color-danger)" }}
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              {busy ? t("subCancelling") : t("subCancelConfirmYes")}
            </button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {t("subCancelConfirmBody")}
        </p>
        {error && (
          <p className="mt-3 text-sm" style={{ color: "var(--color-danger)" }} role="alert">
            {error}
          </p>
        )}
      </Modal>

      {/* Change-plan picker */}
      <Modal
        open={pickerOpen}
        onClose={() => !changing && setPickerOpen(false)}
        title={t("subChangePlanTitle")}
      >
        <p className="text-sm mb-4" style={{ color: "var(--color-muted)" }}>
          {t("subChangePlanSubtitle")}
        </p>
        <div className="flex flex-col gap-2.5">
          {PLANS.map((p) => {
            const isCurrent = p.cycle === sub?.billing_cycle;
            const pending = pendingCycle === p.cycle;
            return (
              <button
                key={p.cycle}
                type="button"
                disabled={isCurrent || changing}
                onClick={() => doChangePlan(p.cycle as PlanCycle)}
                className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-start transition-colors enabled:hover:bg-black/[0.03] disabled:cursor-not-allowed"
                style={{
                  borderColor: isCurrent ? "var(--color-primary)" : "var(--color-border)",
                  opacity: !isCurrent && changing && !pending ? 0.6 : 1,
                }}
                aria-current={isCurrent}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                    {t(p.labelKey as TranslationKey)}
                  </span>
                  <span className="block text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                    {t(p.priceKey as TranslationKey)} · {t(p.perMonthKey as TranslationKey)}
                  </span>
                </span>
                {isCurrent ? (
                  <Badge tone="primary">{t("subCurrentPlanBadge")}</Badge>
                ) : pending ? (
                  <Loader2
                    size={16}
                    className="animate-spin shrink-0"
                    style={{ color: "var(--color-primary)" }}
                  />
                ) : (
                  <span
                    className="shrink-0 text-sm font-semibold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {t("subSwitchToPlan")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {changeError && (
          <p className="mt-3 text-sm" style={{ color: "var(--color-danger)" }} role="alert">
            {changeError}
          </p>
        )}
      </Modal>

      {/* Success toast */}
      {toast && (
        <div
          className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[90%] items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg"
          style={{ background: "var(--color-ink)", color: "#fff" }}
          role="status"
        >
          <Check size={16} strokeWidth={3} style={{ color: "var(--color-brass)" }} />
          {toast}
        </div>
      )}
    </>
  );
}
