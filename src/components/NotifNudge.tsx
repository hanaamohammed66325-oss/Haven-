"use client";

// NotifNudge — a small, obvious bell button that sits next to "Add course" on
// the dashboard and shows ONLY to users who haven't turned notifications on.
//
// Tapping it opens a short modal:
//   • Not installed (browser tab, not a Home-Screen app) → tell them they must
//     install Haven first, then try again, with a shortcut to the install guide.
//     iOS web push simply cannot work until the app is installed.
//   • Installed but notifications still off → send them straight to
//     Settings → Notifications to enable.
//
// "Enabled" is read from the same signals the push layer uses (granted browser
// permission + this device's opt-in flag), so the button quietly disappears the
// moment notifications are on. Self-contained; the modal portals to <body> to
// stay clear of the dashboard's fade-in transform (which breaks fixed layout).

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { useT } from "@/i18n";
import { PUSH_ENABLED_KEY } from "@/lib/pushHealthCheck";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

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
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setEnabled(notifsEnabled());
  }, []);

  const openModal = useCallback(() => {
    setInstalled(isStandalone());
    setOpen(true);
  }, []);

  const showInstallGuide = useCallback(() => {
    window.dispatchEvent(new Event("haven:install-guide"));
    setOpen(false);
  }, []);

  const goEnable = useCallback(() => {
    // Let Settings scroll straight to the Notifications section on arrival.
    try {
      sessionStorage.setItem("haven-focus-notif", "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
    router.push("/settings");
  }, [router]);

  if (enabled !== false) return null;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
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

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 90,
              background: "rgba(15,20,28,.55)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="haven-fade-up"
              style={{
                width: "100%",
                maxWidth: 420,
                background: "var(--color-surface)",
                color: "var(--color-ink)",
                borderRadius: 20,
                border: "1px solid var(--color-border)",
                boxShadow: "0 18px 60px rgba(0,0,0,.30)",
                padding: 22,
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="shrink-0 inline-flex items-center justify-center rounded-2xl"
                  style={{
                    width: 44,
                    height: 44,
                    background: "var(--color-brass-soft, var(--color-primary-soft))",
                    color: "var(--color-brass)",
                  }}
                >
                  <Bell size={22} />
                </span>
                <div className="flex-1 min-w-0">
                  <h2
                    className="font-display text-lg"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {t(installed ? "notifNudge_enableTitle" : "notifNudge_installTitle")}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("notifNudge_later")}
                  className="shrink-0 inline-flex items-center justify-center rounded-full transition-colors"
                  style={{
                    width: 30,
                    height: 30,
                    background: "var(--color-surface-alt)",
                    color: "var(--color-muted)",
                  }}
                >
                  <X size={15} />
                </button>
              </div>

              <p
                className="text-sm mt-3 leading-relaxed"
                style={{ color: "var(--color-muted)" }}
              >
                {t(installed ? "notifNudge_enableBody" : "notifNudge_installBody")}
              </p>

              <div className="flex items-center gap-2.5 mt-5">
                {installed ? (
                  <button
                    type="button"
                    onClick={goEnable}
                    className="haven-btn flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium"
                  >
                    <Bell size={16} />
                    {t("notifNudge_enableCta")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={showInstallGuide}
                    className="haven-btn flex-1 inline-flex items-center justify-center px-4 py-3 rounded-xl text-sm font-medium"
                  >
                    {t("notifNudge_installCta")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                  style={{
                    background: "var(--color-surface-alt)",
                    color: "var(--color-muted)",
                  }}
                >
                  {t("notifNudge_later")}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
