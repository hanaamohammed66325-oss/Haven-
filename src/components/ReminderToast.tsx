"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, X } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";

// One combined toast, shown once per app open, listing every dated item
// (tasks / exams / assignments) due between today and today + reminderDays.
// Auto-dismisses after ~10s; manual close; portaled to <body> so a transformed
// ancestor can't break its fixed positioning. Day math is calendar-independent.
const AUTO_DISMISS_MS = 10000;

export function ReminderToast() {
  const { t } = useT();
  const { hydrated, courses, reminderDays } = useStore();
  const [lines, setLines] = useState<string[] | null>(null);
  const [mounted, setMounted] = useState(false);
  const firedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    // Fire once per mount (= once per app open), after the cloud data loads.
    if (!hydrated || firedRef.current) return;
    firedRef.current = true;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.max(1, Math.round(Number(reminderDays) || 2));

    const items: { diff: number; title: string }[] = [];
    for (const c of courses) {
      for (const comp of c.components) {
        if (!comp.date) continue;
        const due = new Date(`${comp.date}T00:00:00`); // local midnight, TZ-stable
        if (Number.isNaN(+due)) continue;
        const diff = Math.round((+due - +today) / 86400000);
        if (diff >= 0 && diff <= days) items.push({ diff, title: comp.name });
      }
    }
    if (!items.length) return;

    items.sort((a, b) => a.diff - b.diff);
    setLines(
      items.map((it) =>
        it.diff === 0
          ? t("reminderToday", { title: it.title })
          : it.diff === 1
          ? t("reminderTomorrow", { title: it.title })
          : t("reminderInDays", { n: it.diff, title: it.title })
      )
    );
    timerRef.current = setTimeout(() => setLines(null), AUTO_DISMISS_MS);
  }, [hydrated, courses, reminderDays, t]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  if (!mounted || !lines) return null;

  const close = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLines(null);
  };

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="surface-card fixed bottom-5 end-5 z-[70] w-[320px] max-w-[calc(100vw-2.5rem)] rounded-2xl p-4"
      style={{ boxShadow: "var(--shadow-card-hover)", borderInlineStart: "3px solid var(--color-primary)" }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Bell size={15} style={{ color: "var(--color-primary)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            {t("reminderToastTitle")}
          </span>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={t("close")}
          className="rounded-lg p-1 -m-1 transition-colors hover:bg-black/5"
        >
          <X size={15} style={{ color: "var(--color-muted)" }} />
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {lines.map((line, i) => (
          <li key={i} className="text-[13px] leading-snug" style={{ color: "var(--color-muted)" }}>
            {line}
          </li>
        ))}
      </ul>
    </div>,
    document.body
  );
}
