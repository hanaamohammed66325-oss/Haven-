"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/i18n";
import { addDays, hijriParts, hijriMonthStart, hijriDaysInMonth } from "@/lib/dates";
import type { CalendarType } from "@/types";

const WEEKDAYS: Record<"en" | "ar", string[]> = {
  en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
  ar: ["ح", "ن", "ث", "ر", "خ", "ج", "س"],
};

export function MiniCalendar({ calendar = "gregorian" }: { calendar?: CalendarType }) {
  const { lang } = useT();
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isHijri = calendar === "hijri";

  const [view, setView] = useState<Date>(() =>
    isHijri ? hijriMonthStart(todayMid) : new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const base = lang === "ar" ? "ar" : "en-US";
  const locale = isHijri ? `${base}-u-ca-islamic-umalqura` : base;
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(view);

  let firstWeekday: number;
  let daysInMonth: number;
  let todayInView: boolean;
  let todayDay: number;

  if (isHijri) {
    const vp = hijriParts(view);
    daysInMonth = hijriDaysInMonth(view);
    firstWeekday = view.getDay();
    const tp = hijriParts(todayMid);
    todayInView = tp.month === vp.month && tp.year === vp.year;
    todayDay = tp.day;
  } else {
    const y = view.getFullYear();
    const m = view.getMonth();
    firstWeekday = new Date(y, m, 1).getDay();
    daysInMonth = new Date(y, m + 1, 0).getDate();
    todayInView = today.getFullYear() === y && today.getMonth() === m;
    todayDay = today.getDate();
  }

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const headers = WEEKDAYS[lang === "ar" ? "ar" : "en"];

  const goPrev = () =>
    setView((v) => (isHijri ? hijriMonthStart(addDays(v, -1)) : new Date(v.getFullYear(), v.getMonth() - 1, 1)));
  const goNext = () =>
    setView((v) => (isHijri ? addDays(v, daysInMonth) : new Date(v.getFullYear(), v.getMonth() + 1, 1)));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <span className="font-display text-base" style={{ color: "var(--color-ink)" }}>
          {monthLabel}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={goPrev} className="rounded-lg p-1.5 transition-colors hover:bg-black/5" aria-label="Previous month">
            <ChevronLeft size={16} className="rtl:rotate-180" style={{ color: "var(--color-muted)" }} />
          </button>
          <button onClick={goNext} className="rounded-lg p-1.5 transition-colors hover:bg-black/5" aria-label="Next month">
            <ChevronRight size={16} className="rtl:rotate-180" style={{ color: "var(--color-muted)" }} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {headers.map((w, i) => (
          <span key={i} className="text-[11px] font-medium pb-1" style={{ color: "var(--color-muted)" }}>
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          const isToday = todayInView && d === todayDay;
          return (
            <div key={i} className="flex items-center justify-center">
              {d == null ? (
                <span />
              ) : (
                <span
                  className="flex items-center justify-center text-[13px] rounded-full transition-colors"
                  style={{
                    width: 32,
                    height: 32,
                    background: isToday ? "var(--color-primary)" : "transparent",
                    color: isToday ? "#fff" : "var(--color-ink)",
                    fontWeight: isToday ? 600 : 400,
                    boxShadow: isToday ? "0 4px 12px rgba(71,118,128,0.35)" : "none",
                  }}
                >
                  {d}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
