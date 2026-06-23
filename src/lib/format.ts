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
