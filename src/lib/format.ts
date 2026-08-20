// Credit-hours label with Arabic plural rules (1 ساعة، 2 ساعتان، 3–10 ساعات، 11+ ساعة).
export function creditHoursLabel(n: number, lang: "en" | "ar"): string {
  if (lang === "ar") {
    if (n === 1) return "ساعة واحدة";
    if (n === 2) return "ساعتان";
    if (n >= 3 && n <= 10) return `${n} ساعات`;
    return `${n} ساعة`;
  }
  return `${n} cr`;
}

// Friendly duration from minutes, e.g. 90 → "1h 30m" / "1س 30د".
export function formatDuration(minutes: number, hUnit: string, mUnit: string): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}${hUnit} ${m}${mUnit}`;
  if (h) return `${h}${hUnit}`;
  return `${m}${mUnit}`;
}

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
/** Replace ASCII digits in a string (e.g. a "08:00" time) with Arabic-Indic
 *  digits for Arabic display. English strings pass through unchanged. */
export function localizeDigits(s: string, lang: "en" | "ar"): string {
  return lang === "ar" ? s.replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]) : s;
}

// Add whole minutes to an "HH:MM" (24h) time string, wrapping past midnight.
// Used to backfill a lecture's end time from its stored duration.
export function addMinutesToTime(hhmm: string, minutes: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const total = (((Number(m[1]) * 60 + Number(m[2]) + minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const mi = total % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}
