"use client";

import { X } from "lucide-react";
import { useT } from "@/i18n";
import { formatTime } from "@/lib/dates";

// A clear 12-hour time picker with an explicit AM/PM (ص/م) selector. It stores
// and returns "HH:MM" in 24-hour form (what planner_items.due_time requires),
// but the UI is always unambiguous about morning vs evening. Passing an empty
// hour clears the time (→ null = all-day).

const pad = (n: number) => String(n).padStart(2, "0");

function parse(value: string | null): { h12: string; minute: string; pm: boolean } {
  const m = value ? /^(\d{1,2}):(\d{2})$/.exec(value) : null;
  if (!m) return { h12: "", minute: "00", pm: false };
  const h24 = Number(m[1]);
  return { h12: String(((h24 + 11) % 12) + 1), minute: m[2], pm: h24 >= 12 };
}

function build(h12: string, minute: string, pm: boolean): string | null {
  if (h12 === "") return null;
  let h = Number(h12) % 12; // 12 → 0
  if (pm) h += 12; // PM 12 stays 12; PM 1..11 → 13..23
  return `${pad(h)}:${minute}`;
}

const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

export function TimeField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const { t, lang } = useT();
  const { h12, minute, pm } = parse(value);
  const minuteOptions = MINUTES.includes(minute) ? MINUTES : [minute, ...MINUTES];

  const selectCls =
    "rounded-lg border px-1.5 py-1 text-xs outline-none transition-colors focus:border-[var(--color-primary)]";
  const border = { borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select
        aria-label={t("timeHour")}
        value={h12}
        onChange={(e) => onChange(build(e.target.value, minute, pm))}
        className={selectCls}
        style={border}
      >
        <option value="">—</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-xs" style={{ color: "var(--color-muted)" }}>:</span>
      <select
        aria-label={t("timeMinute")}
        value={minute}
        onChange={(e) => onChange(build(h12 || "12", e.target.value, pm))}
        className={selectCls}
        style={border}
      >
        {minuteOptions.map((mm) => (
          <option key={mm} value={mm}>{mm}</option>
        ))}
      </select>

      {/* AM / PM (ص / م) toggle */}
      <div className="inline-flex rounded-lg p-0.5" style={{ background: "var(--color-primary-soft)" }}>
        {([false, true] as const).map((isPm) => (
          <button
            key={isPm ? "pm" : "am"}
            type="button"
            aria-pressed={pm === isPm}
            onClick={() => onChange(build(h12 || "12", minute, isPm))}
            className="rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors"
            style={
              pm === isPm
                ? { background: "var(--color-surface)", color: "var(--color-primary)", boxShadow: "var(--shadow-card)" }
                : { color: "var(--color-muted)" }
            }
          >
            {isPm ? t("timePM") : t("timeAM")}
          </button>
        ))}
      </div>

      {value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={t("timeClear")}
          title={t("timeClear")}
          className="inline-flex items-center justify-center rounded-md p-1 transition-colors hover:bg-black/5"
        >
          <X size={12} style={{ color: "var(--color-muted)" }} />
        </button>
      ) : (
        <span className="text-[11px]" style={{ color: "var(--color-muted)" }}>{t("timeNotSet")}</span>
      )}

      {/* Resolved 12-hour value, so it's never ambiguous */}
      {value && (
        <span className="text-[11px] font-medium" style={{ color: "var(--color-primary)" }}>
          {formatTime(value, lang)}
        </span>
      )}
    </div>
  );
}
