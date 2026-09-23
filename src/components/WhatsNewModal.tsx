"use client";

// WhatsNewModal — a one-time "what's new" popup that announces the latest round
// of changes once per device (in the browser and the installed app alike), then
// never nags again.
//
// The "seen" flag is versioned (…_v1) so a future update can bump the key and
// resurface a fresh set without disturbing this one.
//
// Self-contained and portals to <body> so the dashboard's fade-in transform
// can't break its fixed positioning (see the modal-portal note in memory).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GraduationCap, Calculator, CalendarDays, ClipboardCheck, Sparkles } from "lucide-react";
import { useT } from "@/i18n";

const SEEN_KEY = "haven_whatsnew_seen_v2";

export function WhatsNewModal() {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
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
    { icon: <GraduationCap size={20} />, title: t("whatsnew_academic_title"), body: t("whatsnew_academic_body") },
    { icon: <Calculator size={20} />, title: t("whatsnew_gpa_title"), body: t("whatsnew_gpa_body") },
    { icon: <CalendarDays size={20} />, title: t("whatsnew_holidays_title"), body: t("whatsnew_holidays_body") },
    { icon: <ClipboardCheck size={20} />, title: t("whatsnew_attendance_title"), body: t("whatsnew_attendance_body") },
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

        {/* Scope note — auto-detection + holidays are Saudi-only for now. */}
        <div
          className="mt-5 rounded-xl px-3.5 py-3 text-[12px] leading-relaxed"
          style={{
            background: "var(--color-brass-soft, var(--color-primary-soft))",
            color: "var(--color-ink)",
            border: "1px solid var(--color-border)",
          }}
        >
          {t("whatsnew_scope_note")}
        </div>

        <p className="text-[12px] mt-4 leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {t("whatsnew_general_fixes")}
        </p>

        <button
          type="button"
          onClick={close}
          className="haven-btn w-full mt-5 inline-flex items-center justify-center px-4 py-3 rounded-xl text-sm font-semibold"
        >
          {t("whatsnew_cta")}
        </button>
      </div>
    </div>,
    document.body
  );
}
