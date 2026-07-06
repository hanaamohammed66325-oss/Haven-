import type { CalendarType } from "@/types";

// Locale string honoring language + calendar (Umm al-Qura for Hijri).
function localeFor(lang: "en" | "ar", calendar: CalendarType): string {
  const base = lang === "ar" ? "ar" : "en";
  return calendar === "hijri" ? `${base}-u-ca-islamic-umalqura` : base;
}

// ---- Shared date helpers (also power the Hijri calendar + picker) ----

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Local-time ISO date (YYYY-MM-DD) without timezone drift. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Hijri (Umm al-Qura) day/month/year for a Gregorian date. */
export function hijriParts(d: Date): { day: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { day: get("day"), month: get("month"), year: get("year") };
}

/** Gregorian date of the 1st of the Hijri month that `d` falls in. */
export function hijriMonthStart(d: Date): Date {
  return addDays(d, -(hijriParts(d).day - 1));
}

/** Number of days (29 or 30) in the Hijri month beginning at `monthStart`. */
export function hijriDaysInMonth(monthStart: Date): number {
  return hijriParts(addDays(monthStart, 29)).month === hijriParts(monthStart).month ? 30 : 29;
}

// Short date (e.g. "20 Jul" / "٥ ذو الحجة"), in the active calendar.
export function formatShortDate(
  iso: string,
  lang: "en" | "ar",
  calendar: CalendarType = "gregorian"
): string {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return new Intl.DateTimeFormat(localeFor(lang, calendar), {
    day: "numeric",
    month: "short",
  }).format(d);
}

// Time "HH:MM" (24h) → locale 12h string, e.g. "8:00 PM" / "٨:٠٠ م".
// Calendar mode is irrelevant to time; only the language affects formatting.
export function formatTime(hhmm: string, lang: "en" | "ar"): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

// Full date with year (used for the Hijri caption under the date fields).
export function formatLongDate(
  iso: string,
  lang: "en" | "ar",
  calendar: CalendarType = "gregorian"
): string {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return new Intl.DateTimeFormat(localeFor(lang, calendar), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
