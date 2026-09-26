"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ShieldCheck, AlertTriangle, XCircle, CalendarX2, ArrowLeft } from "lucide-react";
import { fmtPct } from "@/lib/format";

// Standalone, no-login absence / حرمان calculator for /tools/absence-calculator.
// Tells a student how many lectures they can still miss before hitting their
// university's denial (حرمان) threshold. Self-contained (no store/i18n), Arabic,
// RTL, themed — renders instantly for a visitor arriving from search.

type Preset = "25" | "20" | "custom";

export function AbsenceCalculatorTool() {
  const [perWeek, setPerWeek] = useState("3"); // lectures per week
  const [weeks, setWeeks] = useState("15"); // teaching weeks
  const [missed, setMissed] = useState("0"); // lectures missed so far
  const [preset, setPreset] = useState<Preset>("25");
  const [customPct, setCustomPct] = useState("25");

  const thresholdPct = preset === "custom" ? Number(customPct) : Number(preset);

  const result = useMemo(() => {
    const pw = Number(perWeek);
    const wk = Number(weeks);
    const ms = Number(missed);
    const th = thresholdPct;
    const total = pw > 0 && wk > 0 ? pw * wk : 0;
    if (total <= 0 || !Number.isFinite(th) || th <= 0) return null;

    // Allowed absences before denial: denial is only when absence goes ABOVE the
    // threshold (CUA unified regulation Art. 14 — attendance falling below the
    // required %), so reaching it exactly is still allowed: floor(total*th).
    // The epsilon keeps float noise (e.g. 60 × 0.25) from dropping one.
    const limitExact = (total * th) / 100;
    const allowed = Math.max(0, Math.floor(limitExact + 1e-9));
    const usedPct = total > 0 ? (ms / total) * 100 : 0;
    const remaining = allowed - ms;

    let status: "ok" | "warn" | "danger";
    if (ms > allowed) status = "danger";
    else if (remaining <= 1) status = "warn";
    else status = "ok";

    return { total, allowed, remaining, usedPct, status };
  }, [perWeek, weeks, missed, thresholdPct]);

  const num = (
    label: string,
    value: string,
    set: (v: string) => void,
    min = "0",
    hint?: string,
  ) => (
    <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--color-ink)" }}>
      {label}
      <input
        type="number"
        min={min}
        inputMode="numeric"
        value={value}
        onChange={(e) => set(e.target.value)}
        className="rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
      />
      {hint && <span className="text-xs" style={{ color: "var(--color-muted)" }}>{hint}</span>}
    </label>
  );

  const STATUS = {
    ok: { color: "var(--color-success)", icon: <ShieldCheck size={22} />, label: "وضعك آمن" },
    warn: { color: "#C77E2E", icon: <AlertTriangle size={22} />, label: "قربت من الحد — خلّك حذر" },
    danger: { color: "var(--color-danger)", icon: <XCircle size={22} />, label: "تجاوزت الحد — خطر الحرمان" },
  } as const;

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {num("عدد المحاضرات أسبوعياً", perWeek, setPerWeek, "1")}
        {num("عدد أسابيع الفصل", weeks, setWeeks, "1")}
        {num("عدد غياباتك حتى الآن", missed, setMissed, "0")}
      </div>

      {/* Denial threshold */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>
          نسبة الحرمان في جامعتك:
        </span>
        <div className="inline-flex rounded-xl p-1" style={{ background: "var(--color-primary-soft)" }}>
          {(["25", "20", "custom"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              aria-pressed={preset === p}
              className="rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors"
              style={
                preset === p
                  ? { background: "var(--color-surface)", color: "var(--color-primary)", boxShadow: "var(--shadow-card)" }
                  : { color: "var(--color-muted)" }
              }
            >
              {p === "custom" ? "أخرى" : `${p}٪`}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <input
            type="number"
            min="1"
            max="100"
            inputMode="numeric"
            value={customPct}
            onChange={(e) => setCustomPct(e.target.value)}
            aria-label="نسبة الحرمان المخصّصة"
            className="w-20 rounded-xl border px-3 py-2 text-sm text-center outline-none focus:border-[var(--color-primary)]"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
          />
        )}
      </div>

      {/* Result */}
      {result && (
        <div className="rounded-2xl p-5" style={{ background: "var(--color-primary-soft)" }}>
          <div className="flex items-center gap-2 mb-4" style={{ color: STATUS[result.status].color }}>
            {STATUS[result.status].icon}
            <span className="font-semibold">
              {result.status === "warn" && result.remaining === 0
                ? "وصلت الحد بالضبط — أي غياب إضافي يعني الحرمان"
                : STATUS[result.status].label}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="محاضرات المادة" value={String(result.total)} />
            <Stat label="المسموح غيابه" value={String(result.allowed)} />
            <Stat
              label="المتبقّي لك"
              value={result.remaining >= 0 ? String(result.remaining) : "0"}
              color={STATUS[result.status].color}
            />
            <Stat label="نسبة غيابك" value={`${fmtPct(result.usedPct)}٪`} />
          </div>
        </div>
      )}

      {/* Conversion CTA */}
      <div
        className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <div className="flex items-start gap-3">
          <span
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
          >
            <CalendarX2 size={20} />
          </span>
          <div>
            <div className="font-semibold text-sm" style={{ color: "var(--color-ink)" }}>
              تابع غيابك تلقائياً لكل مادة
            </div>
            <div className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
              مع Haven سجّل كل مادة مرة وحدة، وينبّهك قبل ما تقرب من الحرمان — مجاناً.
            </div>
          </div>
        </div>
        <Link
          href="/signup/"
          className="haven-btn shrink-0 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
        >
          ابدأ مجاناً
          <ArrowLeft size={16} />
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-xs" style={{ color: "var(--color-muted)" }}>
        {label}
      </div>
      <div className="font-display text-2xl mt-0.5" style={{ color: color ?? "var(--color-ink)" }}>
        {value}
      </div>
    </div>
  );
}
