"use client";

import { useState } from "react";
import { Minus, Plus, SlidersHorizontal } from "lucide-react";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/translations/en";
import { Modal } from "@/components/Modal";
import { Toggle } from "@/components/RemindersSettings";
import { spokenDuration } from "@/lib/format";
import type { PomodoroSettings as Settings } from "@/types";
import { GLASS } from "./glass";

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

// Ready-made lengths: a session, its short break, and the long one.
const PRESETS = [
  { key: "pom_presetShort", focus: 25, short: 5, long: 15 },
  { key: "pom_presetMedium", focus: 50, short: 10, long: 20 },
  { key: "pom_presetLong", focus: 90, short: 20, long: 30 },
] as const;

// The fine settings: a stepper per length, a switch per option.
type NumberField = "focusMinutes" | "shortBreakMinutes" | "longBreakMinutes" | "sessionsBeforeLong";
const STEPPERS: { field: NumberField; label: TranslationKey; min: number; max: number }[] = [
  { field: "focusMinutes", label: "pom_focusDuration", min: 5, max: 90 },
  { field: "shortBreakMinutes", label: "pom_shortBreakDuration", min: 1, max: 30 },
  { field: "longBreakMinutes", label: "pom_longBreakDuration", min: 5, max: 45 },
  { field: "sessionsBeforeLong", label: "pom_sessionsBeforeLong", min: 2, max: 8 },
];
type SwitchField = "soundEnabled" | "autoStartBreaks" | "autoStartFocus";
const SWITCHES: { field: SwitchField; label: TranslationKey }[] = [
  { field: "soundEnabled", label: "pom_soundEnabled" },
  { field: "autoStartBreaks", label: "pom_autoStartBreaks" },
  { field: "autoStartFocus", label: "pom_autoStartFocus" },
];

function Stepper({
  label,
  value,
  min,
  max,
  shown,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  shown: string;
  onChange: (v: number) => void;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  const btn = "flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--color-primary-soft)] disabled:opacity-35";
  const btnStyle = { border: "1px solid var(--color-border)", color: "var(--color-ink)" };
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm" style={{ color: "var(--color-ink)" }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button onClick={() => set(value - 1)} disabled={value <= min} aria-label={`${label} −`} className={btn} style={btnStyle}>
          <Minus size={14} />
        </button>
        <span className="min-w-[5.5rem] text-center text-sm font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>
          {shown}
        </span>
        <button onClick={() => set(value + 1)} disabled={value >= max} aria-label={`${label} +`} className={btn} style={btnStyle}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

// Session settings: a small glass chip over the water ("25 min session · 5 min
// break") that opens a sheet of ready-made lengths, fine steppers and switches.
// Only reachable between sessions.
export function PomodoroSettings({ settings, onChange }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const dur = (m: number) => spokenDuration(m, t);
  const lines = "flex flex-col divide-y divide-[var(--color-border)]";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
        style={GLASS}
      >
        <SlidersHorizontal size={14} />
        {t("pom_settingsChip", { focus: dur(settings.focusMinutes), rest: dur(settings.shortBreakMinutes) })}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t("pom_settings")} variant="sheet">
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => {
            const on = settings.focusMinutes === p.focus && settings.shortBreakMinutes === p.short && settings.longBreakMinutes === p.long;
            return (
              <button
                key={p.key}
                onClick={() => onChange({ focusMinutes: p.focus, shortBreakMinutes: p.short, longBreakMinutes: p.long })}
                aria-pressed={on}
                className="flex flex-col items-center gap-0.5 rounded-2xl px-2 py-3 transition-colors"
                style={{
                  background: on ? "var(--color-primary-soft)" : "transparent",
                  border: `1.5px solid ${on ? "var(--color-primary)" : "var(--color-border)"}`,
                }}
              >
                <span className="text-xs font-medium" style={{ color: on ? "var(--color-primary)" : "var(--color-muted)" }}>
                  {t(p.key)}
                </span>
                <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                  {dur(p.focus)}
                </span>
                <span className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                  {t("pom_presetBreak", { rest: dur(p.short) })}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-6 text-xs font-medium" style={{ color: "var(--color-muted)" }}>
          {t("pom_custom")}
        </p>
        <div className={lines}>
          {STEPPERS.map((s) => (
            <Stepper
              key={s.field}
              label={t(s.label)}
              value={settings[s.field]}
              min={s.min}
              max={s.max}
              shown={s.field === "sessionsBeforeLong" ? String(settings[s.field]) : dur(settings[s.field])}
              onChange={(v) => onChange({ [s.field]: v })}
            />
          ))}
        </div>

        <div className={`${lines} mt-4 border-t border-[var(--color-border)]`}>
          {SWITCHES.map((s) => (
            // the whole row flips the switch
            <label key={s.field} className="flex w-full cursor-pointer items-center justify-between gap-3 py-2.5">
              <span className="text-sm" style={{ color: "var(--color-ink)" }}>
                {t(s.label)}
              </span>
              <Toggle label={t(s.label)} checked={settings[s.field]} onChange={(v) => onChange({ [s.field]: v })} />
            </label>
          ))}
        </div>
      </Modal>
    </>
  );
}
