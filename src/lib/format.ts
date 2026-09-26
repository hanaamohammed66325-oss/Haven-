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

/** A counted noun in the form its number takes, "#" standing for the number.
 *  Four forms follow Arabic: 1, 2, 3–10, then 11+ (and 100, 101…) —
 *  plural(3, ["درجة وحدة", "درجتين", "# درجات", "# درجة"]) → "3 درجات".
 *  Two forms follow English: 1, then the rest. A fraction or a non-number
 *  takes the last form ("2.5 ساعة"). */
export function plural(n: number | string, forms: string[]): string {
  const v = Number(n);
  const last = forms.length - 1;
  let i = last;
  if (Number.isInteger(v)) {
    if (forms.length === 2) i = v === 1 ? 0 : 1;
    else if (v === 1) i = 0;
    else if (v === 2) i = 1;
    else if (v === 0 || (v % 100 >= 3 && v % 100 <= 10)) i = 2;
  }
  return forms[i].replace(/#/g, String(n));
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

/** An absence percentage as university portals show it: up to two decimals,
 *  no trailing zeros (1 of 15 lectures → "6.67", 25 → "25"). */
export function fmtPct(n: number): string {
  return String(Number((Number.isFinite(n) ? n : 0).toFixed(2)));
}
