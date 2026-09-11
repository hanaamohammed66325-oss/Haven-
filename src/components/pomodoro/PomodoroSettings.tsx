"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useT } from "@/i18n";
import type { PomodoroSettings as Settings } from "@/types";

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  disabled: boolean;
}

function Stepper({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm" style={{ color: "var(--color-ink)" }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => set(value - 1)}
          disabled={disabled}
          className="flex items-center justify-center h-7 w-7 rounded-lg text-lg leading-none disabled:opacity-40"
          style={{ border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
        >
          −
        </button>
        <span
          className="min-w-[3.5rem] text-center text-sm font-semibold"
          style={{ color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}
        >
          {value} {suffix}
        </span>
        <button
          onClick={() => set(value + 1)}
          disabled={disabled}
          className="flex items-center justify-center h-7 w-7 rounded-lg text-lg leading-none disabled:opacity-40"
          style={{ border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      className="flex items-center justify-between gap-3 py-2 w-full text-start"
    >
      <span className="text-sm" style={{ color: "var(--color-ink)" }}>
        {label}
      </span>
      <span
        className="relative rounded-full transition-colors"
        style={{
          width: 40,
          height: 22,
          background: on ? "var(--color-primary)" : "var(--color-border)",
        }}
      >
        <span
          className="absolute top-0.5 rounded-full bg-white transition-all"
          style={{ width: 18, height: 18, insetInlineStart: on ? 20 : 2 }}
        />
      </span>
    </button>
  );
}

export function PomodoroSettings({ settings, onChange, disabled }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <div className="haven-card p-4">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between w-full"
      >
        <span className="haven-label" style={{ color: "var(--color-muted)" }}>
          {t("pom_settings")}
        </span>
        <ChevronDown
          size={16}
          style={{ color: "var(--color-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        />
      </button>

      {open && (
        <div className="mt-3 flex flex-col divide-y" style={{ borderColor: "var(--color-border)" }}>
          <Stepper
            label={t("pom_focusDuration")}
            value={settings.focusMinutes}
            min={5}
            max={90}
            suffix={t("pom_minutes")}
            onChange={(v) => onChange({ focusMinutes: v })}
            disabled={disabled}
          />
          <Stepper
            label={t("pom_shortBreakDuration")}
            value={settings.shortBreakMinutes}
            min={1}
            max={30}
            suffix={t("pom_minutes")}
            onChange={(v) => onChange({ shortBreakMinutes: v })}
            disabled={disabled}
          />
          <Stepper
            label={t("pom_longBreakDuration")}
            value={settings.longBreakMinutes}
            min={5}
            max={45}
            suffix={t("pom_minutes")}
            onChange={(v) => onChange({ longBreakMinutes: v })}
            disabled={disabled}
          />
          <Stepper
            label={t("pom_sessionsBeforeLong")}
            value={settings.sessionsBeforeLong}
            min={2}
            max={8}
            suffix=""
            onChange={(v) => onChange({ sessionsBeforeLong: v })}
            disabled={disabled}
          />
          <Toggle
            label={t("pom_soundEnabled")}
            on={settings.soundEnabled}
            onToggle={() => onChange({ soundEnabled: !settings.soundEnabled })}
          />
          <Toggle
            label={t("pom_autoStartBreaks")}
            on={settings.autoStartBreaks}
            onToggle={() => onChange({ autoStartBreaks: !settings.autoStartBreaks })}
          />
          <Toggle
            label={t("pom_autoStartFocus")}
            on={settings.autoStartFocus}
            onToggle={() => onChange({ autoStartFocus: !settings.autoStartFocus })}
          />
        </div>
      )}
    </div>
  );
}
