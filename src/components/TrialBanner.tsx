"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useT } from "@/i18n";
import { useSubscription } from "@/lib/subscription";
import { isInTrial, isVip, daysUntilTrialEnds } from "@/lib/premium";

// Slim, dismissible banner shown only while the current user is in trial.
// Not shown for VIP or active/paid subscribers (isInTrial already excludes
// non-'trial' statuses). Dismissal is session-only state — never persisted.
export function TrialBanner() {
  const { lang } = useT();
  const { sub, profile, loading } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  if (loading || dismissed) return null;
  if (isVip(profile) || !isInTrial(sub)) return null;

  const n = daysUntilTrialEnds(sub);
  if (n == null) return null;

  const seePlans = lang === "ar" ? "عرض الخطط" : "See plans";
  const message =
    lang === "ar"
      ? `تنتهي التجربة المجانية خلال ${n} يوم.`
      : `Free trial ends in ${n} ${n === 1 ? "day" : "days"}.`;

  return (
    <div
      className="mb-6 flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm"
      style={{ background: "var(--color-primary-soft)", color: "var(--color-ink)" }}
      role="status"
    >
      <span className="flex-1 min-w-0">
        {message}{" "}
        <Link href="/premium" className="font-semibold underline" style={{ color: "var(--color-primary)" }}>
          {seePlans}
        </Link>
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={lang === "ar" ? "إغلاق" : "Close"}
        className="shrink-0 rounded-full p-1 transition-colors hover:bg-black/5"
      >
        <X size={15} style={{ color: "var(--color-muted)" }} />
      </button>
    </div>
  );
}
