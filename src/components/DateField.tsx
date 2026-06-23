"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/i18n";
import {
  addDays,
  toISODate,
  hijriParts,
  hijriMonthStart,
  hijriDaysInMonth,
  formatLongDate,
} from "@/lib/dates";
import type { CalendarType } from "@/types";

const WEEKDAYS: Record<"en" | "ar", string[]> = {
  en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
  ar: ["ح", "ن", "ث", "ر", "خ", "ج", "س"],
};

interface DateFieldProps {
  value: string;
  onChange: (iso: string) => void;
  calendar: CalendarType;
  className?: string;
  style?: React.CSSProperties;
}

export function DateField({ value, onChange, calendar, className, style }: DateFieldProps) {
  if (calendar !== "hijri") {
    return (
      <input
        type="date"
        className={className}
        style={style}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return <HijriField value={value} onChange={onChange} className={className} style={style} />;
}

function HijriField({
  value,
  onChange,
  className,
  style,
}: {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { lang } = useT();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const selected = value ? new Date(value) : null;
  // The Gregorian date of the 1st of the currently viewed Hijri month.
  const [monthStart, setMonthStart] = useState<Date>(() =>
    hijriMonthStart(selected ?? new Date())
  );

  useEffect(() => {
    if (open) setMonthStart(hijriMonthStart(selected ?? new Date()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    };
    place();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onMove = () => setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  const locale = `${lang === "ar" ? "ar" : "en-US"}-u-ca-islamic-umalqura`;
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(monthStart);
  const daysInMonth = hijriDaysInMonth(monthStart);
  const firstWeekday = monthStart.getDay();
  const headers = WEEKDAYS[lang === "ar" ? "ar" : "en"];

  const vp = hijriParts(monthStart);
  const selParts = selected ? hijriParts(selected) : null;
  const selectedInView = selParts != null && selParts.month === vp.month && selParts.year === vp.year;

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const pick = (day: number) => {
    onChange(toISODate(addDays(monthStart, day - 1)));
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${className ?? ""} inline-flex items-center justify-between gap-2 text-start`}
        style={style}
      >
        <span style={{ color: value ? "var(--color-ink)" : "var(--color-muted)" }}>
          {value ? formatLongDate(value, lang, "hijri") : "—"}
        </span>
        <Calendar size={15} style={{ color: "var(--color-muted)" }} />
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            className="haven-pop fixed z-[100] rounded-2xl p-4"
            style={{
              top: pos.top,
              left: pos.left,
              width: Math.max(268, pos.width),
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              boxShadow: "var(--shadow-card-hover)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-display text-sm" style={{ color: "var(--color-ink)" }}>{monthLabel}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMonthStart((m) => hijriMonthStart(addDays(m, -1)))}
                  className="rounded-lg p-1.5 transition-colors hover:bg-black/5"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={16} className="rtl:rotate-180" style={{ color: "var(--color-muted)" }} />
                </button>
                <button
                  type="button"
                  onClick={() => setMonthStart((m) => addDays(m, hijriDaysInMonth(m)))}
                  className="rounded-lg p-1.5 transition-colors hover:bg-black/5"
                  aria-label="Next month"
                >
                  <ChevronRight size={16} className="rtl:rotate-180" style={{ color: "var(--color-muted)" }} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-y-1 text-center">
              {headers.map((w, i) => (
                <span key={i} className="text-[11px] font-medium pb-1" style={{ color: "var(--color-muted)" }}>{w}</span>
              ))}
              {cells.map((d, i) => {
                const isSel = selectedInView && d === selParts!.day;
                return (
                  <div key={i} className="flex items-center justify-center">
                    {d == null ? (
                      <span />
                    ) : (
                      <button
                        type="button"
                        onClick={() => pick(d)}
                        className="flex items-center justify-center text-[13px] rounded-full transition-colors hover:bg-[var(--color-primary-soft)]"
                        style={{
                          width: 30,
                          height: 30,
                          background: isSel ? "var(--color-primary)" : "transparent",
                          color: isSel ? "#fff" : "var(--color-ink)",
                          fontWeight: isSel ? 600 : 400,
                        }}
                      >
                        {d}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
