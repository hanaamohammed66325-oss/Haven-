"use client";

// Versioned announcements are saved per account across devices.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BellRing, Calculator, CalendarDays, ClipboardCheck, Globe, ListChecks, Map as MapIcon, Maximize2, Sparkles, Timer } from "lucide-react";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { hasSeenWhatsNew, WHATS_NEW_VERSION } from "@/lib/whatsNew";

export function WhatsNewModal({ preview = false }: { preview?: boolean } = {}) {
  const { t } = useT();
  const { hydrated, onboardingSeen, accountId, whatsNewSeen = {}, markWhatsNewSeen } = useStore();
  const [pendingAccount, setPendingAccount] = useState<string | null>(null);
  const [dismissedAccount, setDismissedAccount] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [sawPrev, setSawPrev] = useState(false);
  const [sawLast, setSawLast] = useState(false);

  const seen = hasSeenWhatsNew(whatsNewSeen);
  useEffect(() => {
    setOpen(false);
    if (!hydrated) return;
    if (preview) { setSawLast(true); setOpen(true); return; }
    if (!accountId) return;
    setSawPrev(hasSeenWhatsNew(whatsNewSeen, 3));
    setSawLast(hasSeenWhatsNew(whatsNewSeen, 4));
    if (seen || dismissedAccount === accountId) return;
    if (!onboardingSeen) { setPendingAccount(accountId); return; }
    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, [hydrated, preview, accountId, onboardingSeen, seen, dismissedAccount]);

  useEffect(() => {
    if (preview || !pendingAccount || pendingAccount !== accountId || seen) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = async () => {
      if (cancelled) return;
      const saved = await markWhatsNewSeen(WHATS_NEW_VERSION);
      if (cancelled) return;
      if (saved) setPendingAccount(null);
      else timer = setTimeout(save, 5000);
    };
    void save();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [preview, pendingAccount, accountId, seen, markWhatsNewSeen]);

  const close = () => {
    setOpen(false);
    if (preview || !accountId) return;
    setDismissedAccount(accountId);
    setPendingAccount(accountId);
  };

  if (!open || typeof document === "undefined") return null;

  const previousItems = sawLast ? [] : sawPrev
    ? [
        { icon: <MapIcon size={20} />, title: t("whatsnew_lakemap_title"), body: t("whatsnew_lakemap_body") },
        { icon: <Maximize2 size={20} />, title: t("whatsnew_scene_title"), body: t("whatsnew_scene_body") },
        { icon: <ListChecks size={20} />, title: t("whatsnew_tasks_title"), body: t("whatsnew_tasks_body") },
      ]
    : [
        { icon: <Timer size={20} />, title: t("whatsnew_pomodoro_title"), body: t("whatsnew_pomodoro_body") },
        { icon: <CalendarDays size={20} />, title: t("whatsnew_term_title"), body: t("whatsnew_term_body") },
        { icon: <Globe size={20} />, title: t("whatsnew_abroad_title"), body: t("whatsnew_abroad_body") },
        { icon: <ClipboardCheck size={20} />, title: t("whatsnew_rule_title"), body: t("whatsnew_rule_body") },
        { icon: <Calculator size={20} />, title: t("whatsnew_gpa_title"), body: t("whatsnew_gpa_body") },
        { icon: <BellRing size={20} />, title: t("whatsnew_reminders_title"), body: t("whatsnew_reminders_body") },
      ];
  const items = [
    { icon: <Calculator size={20} />, title: t("whatsnew_curve_title"), body: t("whatsnew_curve_body") },
    ...previousItems,
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
          {t("whatsnew_sinceSubtitle")}
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

        {/* Scope note — dates, holidays and the grade table follow the university;
            the student corrects what differs. Only with the university round. */}
        {!sawLast && !sawPrev && (
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
        )}

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
