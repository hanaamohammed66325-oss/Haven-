"use client";

// NotifNudge — a small, obvious bell button that sits next to "Add course" on
// the dashboard and shows ONLY to users who haven't turned notifications on.
//
// Tapping it takes the user straight to Settings → Notifications, scrolled to the
// enable button. That section already handles every case on arrival (needs
// install, blocked, unsupported, or ready to enable), so no intermediate step is
// needed here.
//
// "Enabled" is read from the same signals the push layer uses (granted browser
// permission + this device's opt-in flag), so the button quietly disappears the
// moment notifications are on.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useT } from "@/i18n";
import { PUSH_ENABLED_KEY } from "@/lib/pushHealthCheck";

/** Notifications are considered ON when this device both has browser permission
 *  and recorded its own opt-in — exactly what the push auto-heal keys off. */
function notifsEnabled(): boolean {
  if (typeof window === "undefined") return true; // don't flash on SSR
  try {
    const granted =
      "Notification" in window && Notification.permission === "granted";
    const optedIn = localStorage.getItem(PUSH_ENABLED_KEY) === "1";
    return granted && optedIn;
  } catch {
    return false;
  }
}

export function NotifNudge() {
  const { t } = useT();
  const router = useRouter();
  // null = still deciding on mount (render nothing to avoid a hydration flash).
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    setEnabled(notifsEnabled());
  }, []);

  const goToNotifications = useCallback(() => {
    // Let Settings scroll straight to the Notifications section on arrival.
    try {
      sessionStorage.setItem("haven-focus-notif", "1");
    } catch {
      /* ignore */
    }
    router.push("/settings/");
  }, [router]);

  if (enabled !== false) return null;

  return (
    <button
      type="button"
      onClick={goToNotifications}
      aria-label={t("notifNudge_button")}
      title={t("notifNudge_button")}
      className="relative shrink-0 inline-flex items-center justify-center h-[52px] w-[52px] rounded-2xl transition-colors"
      style={{
        background: "var(--color-brass-soft, var(--color-primary-soft))",
        color: "var(--color-brass)",
        border: "1px solid color-mix(in srgb, var(--color-brass) 28%, transparent)",
      }}
    >
      <Bell size={20} />
      <span
        className="absolute top-2 end-2 w-2.5 h-2.5 rounded-full animate-ping"
        style={{ background: "var(--color-brass)" }}
      />
      <span
        className="absolute top-2 end-2 w-2.5 h-2.5 rounded-full"
        style={{ background: "var(--color-brass)" }}
      />
    </button>
  );
}
