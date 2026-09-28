"use client";

// GpaCheckNudge — a small button beside the notifications bell on the
// dashboard, with the same pulsing dot, for students who haven't compared our
// GPA with their university portal yet. Tapping it opens Profile → "Check
// your GPA's accuracy".
//
// It goes away once the student has done any check (a past term, or this
// term's check). A student who opened it once and has nothing to check yet
// (a first term) isn't nudged again on this device.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/i18n";
import { useStore } from "@/store";

const SEEN_KEY = "haven-gpa-nudge-seen";

/** True once the student has compared our GPA with the portal at least once. */
export function useGpaChecked(): boolean {
  const { pastTerms, termCheck } = useStore();
  return pastTerms.length > 0 || !!termCheck?.answer || !!termCheck?.cum;
}

export function GpaCheckNudge() {
  const { t } = useT();
  const router = useRouter();
  const checked = useGpaChecked();
  // null = still deciding on mount (render nothing to avoid a hydration flash).
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setSeen(localStorage.getItem(SEEN_KEY) === "1");
    } catch {
      setSeen(false);
    }
  }, []);

  if (checked || seen !== false) return null;

  const open = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    router.push("/profile/#gpa-accuracy");
  };

  return (
    <button
      type="button"
      onClick={open}
      aria-label={t("acc_title")}
      title={t("acc_title")}
      className="relative shrink-0 inline-flex items-center justify-center h-[52px] w-[52px] rounded-2xl transition-colors"
      style={{
        background: "var(--color-brass-soft, var(--color-primary-soft))",
        color: "var(--color-brass)",
        border: "1px solid color-mix(in srgb, var(--color-brass) 28%, transparent)",
      }}
    >
      <ShieldCheck size={20} />
      <span className="absolute top-2 end-2 w-2.5 h-2.5 rounded-full animate-ping" style={{ background: "var(--color-brass)" }} />
      <span className="absolute top-2 end-2 w-2.5 h-2.5 rounded-full" style={{ background: "var(--color-brass)" }} />
    </button>
  );
}
