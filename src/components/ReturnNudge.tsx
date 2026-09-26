"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Modal } from "./Modal";
import { pendingSetupSteps } from "./SetupCheck";

// A gentle, single-focus re-engagement / onboarding nudge shown once a returning
// user lands in the app. It self-suppresses for a complete, active user (courses
// + grades + reminders on) and only surfaces the ONE most useful missing step.
//
// Two ways it fires:
//   • Proactively on app open when something is missing — throttled to at most
//     once every few days so it never nags.
//   • Immediately when the user arrives from a re-engagement push/email
//     (`?reengage=1`) — that click is an explicit "I'm back", so we always honor
//     it and strip the flag so a refresh doesn't repeat the modal.

type Reason = "courses" | "grades" | "notif" | "back";

const SEEN_KEY = "haven-nudge-seen-at";
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // min gap between proactive nudges

/** True only when notifications are supported and still un-decided (so a prompt
 *  can actually help). 'denied' → we can't enable them, so we don't nudge. */
function notificationsCanBeEnabled(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    );
  } catch {
    return false;
  }
}

const REASONS = {
  courses: { title: "nudge_titleCourses", body: "nudge_bodyCourses", cta: "nudge_ctaCourses", href: "/courses" },
  grades: { title: "nudge_titleGrades", body: "nudge_bodyGrades", cta: "nudge_ctaGrades", href: "/courses" },
  notif: { title: "nudge_titleNotif", body: "nudge_bodyNotif", cta: "nudge_ctaNotif", href: "/settings" },
  back: { title: "nudge_titleBack", body: "nudge_bodyBack", cta: "nudge_ctaOpen", href: "/dashboard" },
} as const;

type Key = Parameters<ReturnType<typeof useT>["t"]>[0];

export function ReturnNudge() {
  const store = useStore();
  const { hydrated, courses, onboardingSeen } = store;
  const { t } = useT();
  const router = useRouter();
  const [reason, setReason] = useState<Reason | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    // The first-run onboarding tour owns a brand-new user's first session;
    // don't stack a nudge on top of it. Once the tour is done, nudges resume.
    if (!onboardingSeen) return;
    // Missing essential settings come first — SetupCheck asks for them; a
    // second popup in the same session would just be noise.
    if (pendingSetupSteps(store).length) return;

    // Read (window, not useSearchParams — keeps this off the Suspense path that
    // static export otherwise requires) and clear the re-engage flag.
    let fromReengage = false;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("reengage") === "1") {
        fromReengage = true;
        params.delete("reengage");
        const qs = params.toString();
        router.replace(window.location.pathname + (qs ? `?${qs}` : ""));
      }
    } catch {
      /* ignore */
    }

    // Proactive nudges respect the cooldown; an explicit re-engage click doesn't.
    if (!fromReengage) {
      try {
        const seen = Number(localStorage.getItem(SEEN_KEY) || 0);
        if (Date.now() - seen < COOLDOWN_MS) return;
      } catch {
        /* ignore */
      }
    }

    const hasCourses = courses.length > 0;
    const hasGrades = courses.some((c) =>
      (c.components ?? []).some((g) => g.score !== null && g.score !== undefined)
    );

    let next: Reason | null = null;
    if (!hasCourses) next = "courses";
    else if (!hasGrades) next = "grades";
    else if (notificationsCanBeEnabled()) next = "notif";
    else if (fromReengage) next = "back";

    if (next) setReason(next);
    // Fire once per app session — depends only on hydration flipping true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (!reason) return null;

  const cfg = REASONS[reason];
  const stamp = () => {
    try {
      localStorage.setItem(SEEN_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };
  const close = () => {
    stamp();
    setReason(null);
  };
  const act = () => {
    stamp();
    setReason(null);
    router.push(cfg.href);
  };

  return (
    <Modal open onClose={close} title={t(cfg.title as Key)}>
      <p style={{ color: "var(--color-ink)", fontSize: 15, lineHeight: 1.7 }}>{t(cfg.body as Key)}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={close}
          className="rounded-xl px-4 py-2 text-sm font-medium"
          style={{ color: "var(--color-muted)" }}
        >
          {t("nudge_later" as Key)}
        </button>
        <button type="button" onClick={act} className="haven-btn rounded-xl px-5 py-2 text-sm font-semibold">
          {t(cfg.cta as Key)}
        </button>
      </div>
    </Modal>
  );
}
