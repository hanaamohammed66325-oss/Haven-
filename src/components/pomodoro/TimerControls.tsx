"use client";

import { Play, Pause, RotateCcw, SkipForward, Flag } from "lucide-react";
import { useT } from "@/i18n";
import type { TimerPhase } from "@/lib/pomodoro/timerEngine";

interface Props {
  phase: TimerPhase;
  clock: string;
  progress: number;
  phaseLabelKey: string;
  sessionCurrent: number;
  sessionTotal: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onAbandon: () => void;
}

const R = 52;
const CIRC = 2 * Math.PI * R;

export function TimerControls({
  phase,
  clock,
  progress,
  phaseLabelKey,
  sessionCurrent,
  sessionTotal,
  onStart,
  onPause,
  onResume,
  onSkip,
  onAbandon,
}: Props) {
  const { t } = useT();
  const running = phase === "focus" || phase === "shortBreak" || phase === "longBreak";
  const isBreak = phase === "shortBreak" || phase === "longBreak";
  const ringColor = isBreak ? "var(--color-success)" : "var(--color-primary)";

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative" style={{ width: 148, height: 148 }}>
        <svg width={148} height={148} viewBox="0 0 128 128" className="-rotate-90">
          <circle cx={64} cy={64} r={R} fill="none" stroke="var(--color-border)" strokeWidth={8} />
          <circle
            cx={64}
            cy={64}
            r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - Math.min(1, Math.max(0, progress)))}
            style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.4s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-display tracking-tight"
            style={{ fontSize: 34, color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}
          >
            {clock}
          </span>
          <span className="haven-label" style={{ color: "var(--color-muted)" }}>
            {t(phaseLabelKey as Parameters<typeof t>[0])}
          </span>
        </div>
      </div>

      {sessionTotal > 0 && (
        <div className="flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: sessionTotal }).map((_, i) => (
            <span
              key={i}
              className="rounded-full"
              style={{
                width: 8,
                height: 8,
                background: i < sessionCurrent ? "var(--color-primary)" : "var(--color-border)",
              }}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        {phase === "idle" && (
          <button onClick={onStart} className="haven-btn flex items-center gap-2 px-6 py-2.5">
            <Play size={18} />
            {t("pom_start")}
          </button>
        )}
        {running && (
          <>
            <button onClick={onPause} className="haven-btn flex items-center gap-2 px-6 py-2.5">
              <Pause size={18} />
              {t("pom_pause")}
            </button>
            <button
              onClick={onSkip}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
            >
              <SkipForward size={16} />
              {t("pom_skip")}
            </button>
          </>
        )}
        {phase === "paused" && (
          <>
            <button onClick={onResume} className="haven-btn flex items-center gap-2 px-6 py-2.5">
              <Play size={18} />
              {t("pom_resume")}
            </button>
            <button
              onClick={onAbandon}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
              style={{ border: "1px solid var(--color-danger)", color: "var(--color-danger)" }}
            >
              <Flag size={16} />
              {t("pom_abandon")}
            </button>
          </>
        )}
        {running && phase === "focus" && (
          <button
            onClick={onAbandon}
            aria-label={t("pom_abandon")}
            className="flex items-center justify-center h-11 w-11 rounded-xl"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
          >
            <RotateCcw size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
