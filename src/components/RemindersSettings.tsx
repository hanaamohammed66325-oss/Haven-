"use client";

// ---------------------------------------------------------------------------
// Reminders — customizable notification preferences (profiles.preferences.
// notifPrefs). UI + validation only; the store persists the whole notifPrefs
// object (see setNotifPrefs) and server-side scheduling reads it separately.
//
// Shape / defaults / bounds / the read-normalize helper live in
// src/lib/notifPrefs.ts. This file never talks to Supabase directly.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import type { NotifPrefs } from "@/types";
import {
  EXAM_DAYS_MIN,
  EXAM_DAYS_MAX,
  TASK_HOURS_MIN,
  TASK_HOURS_MAX,
  DAILY_HOUR_MIN,
  DAILY_HOUR_MAX,
  LECTURE_MINUTES_MIN,
  LECTURE_MINUTES_MAX,
} from "@/lib/notifPrefs";

const numField =
  "w-20 rounded-xl border px-3 py-2 text-sm text-center outline-none transition-colors focus:border-[var(--color-primary)]";
const border = { borderColor: "var(--color-border)" };

/** Accessible on/off switch; the knob mirrors correctly under RTL. */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const { dir } = useT();
  // Travel = track (44) − padding (4) − knob (20) = 20px, toward the inline-end.
  const travel = dir === "rtl" ? -20 : 20;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors"
      style={{ background: checked ? "var(--color-primary)" : "var(--color-border)" }}
    >
      <span
        className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
        style={{
          transform: `translateX(${checked ? travel : 0}px)`,
          boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
        }}
      />
    </button>
  );
}

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
function toLocaleDigits(n: number, lang: "en" | "ar"): string {
  const s = String(n);
  return lang === "ar" ? s.replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]) : s;
}

/**
 * Two number inputs ("First reminder" / "Second reminder") with validation:
 *  - each must be a whole number within [min, max]
 *  - the second is optional (empty → a single reminder)
 *  - when both are set, the second must be smaller than the first
 * Only fully-valid pairs are committed; on blur, out-of-range / mis-ordered
 * values snap back into a valid state so the store never holds an error.
 */
function ReminderPair({
  values,
  min,
  max,
  unit,
  onCommit,
}: {
  values: number[];
  min: number;
  max: number;
  unit: string;
  onCommit: (vals: number[]) => void;
}) {
  const { t, lang } = useT();
  const [first, setFirst] = useState(String(values[0] ?? ""));
  const [second, setSecond] = useState(values[1] != null ? String(values[1]) : "");
  const [firstErr, setFirstErr] = useState<string | null>(null);
  const [secondErr, setSecondErr] = useState<string | null>(null);

  // Re-sync drafts only when the stored VALUES actually change (load / reset /
  // account switch). Keyed by the values themselves — not the array reference —
  // so a defensive re-normalize that yields the same numbers, or an unrelated
  // notifPrefs write, never clobbers what's being typed here.
  const key = values.join("-");
  useEffect(() => {
    setFirst(String(values[0] ?? ""));
    setSecond(values[1] != null ? String(values[1]) : "");
    setFirstErr(null);
    setSecondErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const isInt = (s: string) => /^\d+$/.test(s.trim());
  // Localize the bound digits so the Arabic hint reads "من ١ إلى ٣٠", not "من 1".
  const range = () =>
    t("remRangeHint", { min: toLocaleDigits(min, lang), max: toLocaleDigits(max, lang) });

  // Live validation: show hints, and commit only when the whole pair is valid.
  const validate = (fRaw: string, sRaw: string) => {
    let fErr: string | null = null;
    let fVal: number | null = null;
    if (!isInt(fRaw)) fErr = range();
    else {
      fVal = Number(fRaw);
      if (fVal < min || fVal > max) fErr = range();
    }

    let sErr: string | null = null;
    let sVal: number | null = null;
    const sTrim = sRaw.trim();
    if (sTrim !== "") {
      if (!isInt(sRaw)) sErr = range();
      else {
        sVal = Number(sRaw);
        if (sVal < min || sVal > max) sErr = range();
        else if (fErr === null && fVal !== null && sVal >= fVal) sErr = t("remSmallerHint");
      }
    }

    setFirstErr(fErr);
    setSecondErr(sErr);
    if (fErr === null && sErr === null && fVal !== null) {
      onCommit(sTrim === "" ? [fVal] : [fVal, sVal as number]);
    }
  };

  const onFirst = (v: string) => {
    setFirst(v);
    validate(v, second);
  };
  const onSecond = (v: string) => {
    setSecond(v);
    validate(first, v);
  };

  // Snap anything invalid back into range (and enforce second < first) on blur.
  const onBlur = () => {
    const clamp = (raw: string, fb: number): number => {
      const n = Number(raw);
      if (!Number.isFinite(n)) return fb;
      return Math.min(max, Math.max(min, Math.round(n)));
    };
    const f = clamp(first, values[0] ?? min);
    let s: number | null = null;
    if (second.trim() !== "") {
      let sv = clamp(second, f);
      if (sv >= f) sv = f > min ? f - 1 : NaN; // can't be smaller than the minimum → drop it
      s = Number.isNaN(sv) ? null : sv;
    }
    setFirst(String(f));
    setSecond(s == null ? "" : String(s));
    setFirstErr(null);
    setSecondErr(null);
    onCommit(s == null ? [f] : [f, s]);
  };

  const common = {
    type: "text" as const,
    inputMode: "numeric" as const,
    pattern: "[0-9]*",
    maxLength: 3,
    className: numField,
    onBlur,
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
            {t("remFirst")} <span className="opacity-70">({unit})</span>
          </span>
          <input
            {...common}
            aria-label={`${t("remFirst")} (${unit})`}
            aria-invalid={firstErr ? true : undefined}
            value={first}
            onChange={(e) => onFirst(e.target.value)}
            style={firstErr ? { ...border, borderColor: "var(--color-danger)" } : border}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
            {t("remSecond")} <span className="opacity-70">({t("remOptional")})</span>
          </span>
          <input
            {...common}
            aria-label={`${t("remSecond")} (${unit})`}
            aria-invalid={secondErr ? true : undefined}
            value={second}
            onChange={(e) => onSecond(e.target.value)}
            style={secondErr ? { ...border, borderColor: "var(--color-danger)" } : border}
          />
        </label>
      </div>
      {(firstErr || secondErr) && (
        <span className="text-[11px] leading-tight" style={{ color: "var(--color-danger)" }}>
          {firstErr || secondErr}
        </span>
      )}
    </div>
  );
}

/**
 * A single whole-number input bounded to [min, max] (e.g. lecture lead time).
 * Live typing shows a gentle range hint when out of range / not an integer, and
 * commits only valid values; on blur, anything invalid snaps back into range
 * (decimals round, negatives/too-small → min, too-large → max, empty → previous)
 * so the store never holds an out-of-range value.
 */
function SingleNumber({
  value,
  min,
  max,
  label,
  unit,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  unit: string;
  onCommit: (v: number) => void;
}) {
  const { t, lang } = useT();
  const [draft, setDraft] = useState(String(value));
  const [err, setErr] = useState<string | null>(null);

  // Re-sync the draft only when the stored value actually changes (load / reset /
  // account switch), never while the user is mid-edit.
  useEffect(() => {
    setDraft(String(value));
    setErr(null);
  }, [value]);

  const isInt = (s: string) => /^\d+$/.test(s.trim());
  const range = () =>
    t("remRangeHint", { min: toLocaleDigits(min, lang), max: toLocaleDigits(max, lang) });

  const onChange = (v: string) => {
    setDraft(v);
    if (!isInt(v)) {
      setErr(range());
      return;
    }
    const n = Number(v);
    if (n < min || n > max) {
      setErr(range());
      return;
    }
    setErr(null);
    onCommit(n);
  };

  const onBlur = () => {
    const raw = draft.trim();
    if (raw === "") {
      // Empty → revert to the last committed value rather than forcing a number.
      setDraft(String(value));
      setErr(null);
      return;
    }
    const n = Number(raw);
    const clamped = Number.isFinite(n)
      ? Math.min(max, Math.max(min, Math.round(n)))
      : value;
    setDraft(String(clamped));
    setErr(null);
    onCommit(clamped);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
          {label} <span className="opacity-70">({unit})</span>
        </span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          className={numField}
          aria-label={`${label} (${unit})`}
          aria-invalid={err ? true : undefined}
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          style={err ? { ...border, borderColor: "var(--color-danger)" } : border}
        />
      </label>
      {err && (
        <span className="text-[11px] leading-tight" style={{ color: "var(--color-danger)" }}>
          {err}
        </span>
      )}
    </div>
  );
}

export function RemindersSettings() {
  const { t, lang } = useT();
  const { notifPrefs: np, setNotifPrefs } = useStore();

  // Immutably patch one branch; untouched branches keep their references.
  const update = (patch: Partial<NotifPrefs>) => setNotifPrefs({ ...np, ...patch });

  const hourLabel = (h: number) => {
    const period = h < 12 ? t("remAM") : t("remPM");
    const h12 = h % 12 || 12;
    return `${toLocaleDigits(h12, lang)} ${period}`;
  };

  const rowCls = "border-t first:border-t-0 py-6 first:pt-0 last:pb-0 flex flex-col gap-3";
  const titleCls = "text-sm font-medium";
  const helpCls = "text-xs leading-relaxed";

  return (
    <div>
      {/* 1) Exam reminders (date-based) */}
      <div className={rowCls} style={border}>
        <div className="flex items-center justify-between gap-4">
          <span className={titleCls} style={{ color: "var(--color-ink)" }}>
            {t("remExamsTitle")}
          </span>
          <Toggle
            checked={np.exams.enabled}
            onChange={(v) => update({ exams: { ...np.exams, enabled: v } })}
            label={t("remExamsTitle")}
          />
        </div>
        <ReminderPair
          values={np.exams.days}
          min={EXAM_DAYS_MIN}
          max={EXAM_DAYS_MAX}
          unit={t("remDaysUnit")}
          onCommit={(days) => update({ exams: { ...np.exams, days } })}
        />
        <p className={helpCls} style={{ color: "var(--color-muted)" }}>
          {t("remExamsHelp")}
        </p>
      </div>

      {/* 2) Scheduled-task reminders (time-based) */}
      <div className={rowCls} style={border}>
        <div className="flex items-center justify-between gap-4">
          <span className={titleCls} style={{ color: "var(--color-ink)" }}>
            {t("remTasksTitle")}
          </span>
          <Toggle
            checked={np.tasks.enabled}
            onChange={(v) => update({ tasks: { ...np.tasks, enabled: v } })}
            label={t("remTasksTitle")}
          />
        </div>
        <ReminderPair
          values={np.tasks.hours}
          min={TASK_HOURS_MIN}
          max={TASK_HOURS_MAX}
          unit={t("remHoursUnit")}
          onCommit={(hours) => update({ tasks: { ...np.tasks, hours } })}
        />
        <p className={helpCls} style={{ color: "var(--color-muted)" }}>
          {t("remTasksHelp")}
        </p>
      </div>

      {/* 3) Daily reminder time (0..23) */}
      <div className={rowCls} style={border}>
        <div className="flex items-center justify-between gap-4">
          <span className={titleCls} style={{ color: "var(--color-ink)" }}>
            {t("remDailyHourTitle")}
          </span>
          <select
            className="rounded-xl border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
            style={border}
            aria-label={t("remDailyHourTitle")}
            value={np.dailyReminderHour}
            onChange={(e) => update({ dailyReminderHour: Number(e.target.value) })}
          >
            {Array.from(
              { length: DAILY_HOUR_MAX - DAILY_HOUR_MIN + 1 },
              (_, i) => DAILY_HOUR_MIN + i
            ).map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
        <p className={helpCls} style={{ color: "var(--color-muted)" }}>
          {t("remDailyHourHelp")}
        </p>
      </div>

      {/* 4) Attendance alerts (no timing to customize) */}
      <div className={rowCls} style={border}>
        <div className="flex items-center justify-between gap-4">
          <span className={titleCls} style={{ color: "var(--color-ink)" }}>
            {t("remAttendanceTitle")}
          </span>
          <Toggle
            checked={np.attendance.enabled}
            onChange={(v) => update({ attendance: { enabled: v } })}
            label={t("remAttendanceTitle")}
          />
        </div>
        <p className={helpCls} style={{ color: "var(--color-muted)" }}>
          {t("remAttendanceHelp")}
        </p>
      </div>

      {/* 5) Lecture reminders (minutes before a class start) */}
      <div className={rowCls} style={border}>
        <div className="flex items-center justify-between gap-4">
          <span className={titleCls} style={{ color: "var(--color-ink)" }}>
            {t("remLecturesTitle")}
          </span>
          <Toggle
            checked={np.lectures.enabled}
            onChange={(v) => update({ lectures: { ...np.lectures, enabled: v } })}
            label={t("remLecturesTitle")}
          />
        </div>
        <SingleNumber
          value={np.lectures.minutesBefore}
          min={LECTURE_MINUTES_MIN}
          max={LECTURE_MINUTES_MAX}
          label={t("remLecturesMinLabel")}
          unit={t("remMinutesUnit")}
          onCommit={(minutesBefore) => update({ lectures: { ...np.lectures, minutesBefore } })}
        />
        <p className={helpCls} style={{ color: "var(--color-muted)" }}>
          {t("remLecturesHelp")}
        </p>
      </div>
    </div>
  );
}
