"use client";

// WhatsNewModal — a one-time "what's new" popup shown ONLY inside the installed
// app (standalone / Home-Screen), never in a plain browser tab. It announces the
// latest round of changes (undo, the notifications nudge, reminder fixes) once
// per device, then never nags again.
//
// Why installed-only: these are quality-of-life notes that matter most to people
// who actually live in the app; browser visitors get the install guide instead.
// The "seen" flag is versioned (…_v1) so a future update can bump the key and
// resurface a fresh set without disturbing this one.
//
// Self-contained and portals to <body> so the dashboard's fade-in transform
// can't break its fixed positioning (see the modal-portal note in memory).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Undo2, Bell, Sparkles } from "lucide-react";
import { useT } from "@/i18n";

const SEEN_KEY = "haven_whatsnew_seen_v1";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function WhatsNewModal() {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isStandalone() && !/[?&]whatsnew=1/.test(window.location.search)) return; // installed app only (localhost preview: ?whatsnew=1)

    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (seen) return;

    // Let the app paint first — feels like a welcome note, not a wall.
    const id = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(id);
  }, []);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!open || typeof document === "undefined") return null;

  const items = [
    { icon: <Undo2 size={20} />, title: t("whatsnew_undo_title"), body: t("whatsnew_undo_body") },
    { icon: <Bell size={20} />, title: t("whatsnew_notif_title"), body: t("whatsnew_notif_body") },
    { icon: <Sparkles size={20} />, title: t("whatsnew_fixes_title"), body: t("whatsnew_fixes_body") },
  ];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("whatsnew_title")}
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 95,
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
          maxWidth: 440,
          maxHeight: "90dvh",
          overflowY: "auto",
          background: "var(--color-surface)",
          color: "var(--color-ink)",
          borderRadius: 22,
          border: "1px solid var(--color-border)",
          boxShadow: "0 18px 60px rgba(0,0,0,.30)",
          padding: "24px 22px calc(20px + env(safe-area-inset-bottom))",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-1.5">
          <span
            className="shrink-0 inline-flex items-center justify-center rounded-2xl"
            style={{
              width: 44,
              height: 44,
              background: "var(--color-brass-soft, var(--color-primary-soft))",
              color: "var(--color-brass)",
            }}
          >
            <Sparkles size={22} />
          </span>
          <h2 className="font-display text-xl" style={{ color: "var(--color-ink)" }}>
            {t("whatsnew_title")}
          </h2>
        </div>
        <p className="text-sm mb-5" style={{ color: "var(--color-muted)" }}>
          {t("whatsnew_subtitle")}
        </p>

        {/* Items */}
        <div className="flex flex-col gap-4">
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-3.5">
              <span
                className="shrink-0 inline-flex items-center justify-center rounded-xl"
                style={{
                  width: 40,
                  height: 40,
                  background: "var(--color-primary-soft)",
                  color: "var(--color-primary)",
                }}
              >
                {it.icon}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold" style={{ color: "var(--color-ink)" }}>
                  {it.title}
                </h3>
                <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  {it.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={close}
          className="haven-btn w-full mt-6 inline-flex items-center justify-center px-4 py-3 rounded-xl text-sm font-semibold"
        >
          {t("whatsnew_cta")}
        </button>
      </div>
    </div>,
    document.body
  );
}
