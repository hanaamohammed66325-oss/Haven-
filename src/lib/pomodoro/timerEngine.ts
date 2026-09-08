// Pure Pomodoro timer state machine — no React, no side effects.
// The page component owns the interval and calls these transitions; keeping
// the logic pure makes the phase rules easy to reason about and test.

import type { PomodoroSettings } from "@/types";

export type TimerPhase = "idle" | "focus" | "shortBreak" | "longBreak" | "paused";

export interface TimerState {
  phase: TimerPhase;
  secondsRemaining: number;
  totalSeconds: number;
  /** completed focus sessions in the current set (resets after a long break) */
  sessionsInSet: number;
  /** the phase we were in before pausing, so resume knows where to return */
  pausedPhase: Exclude<TimerPhase, "idle" | "paused"> | null;
}

export function createInitialTimer(): TimerState {
  return {
    phase: "idle",
    secondsRemaining: 0,
    totalSeconds: 0,
    sessionsInSet: 0,
    pausedPhase: null,
  };
}

export function startFocus(state: TimerState, settings: PomodoroSettings): TimerState {
  const secs = Math.max(1, Math.round(settings.focusMinutes * 60));
  return {
    ...state,
    phase: "focus",
    secondsRemaining: secs,
    totalSeconds: secs,
    pausedPhase: null,
  };
}

/** Start the break that follows a completed focus session (short, or long
 *  every `sessionsBeforeLong` sessions). */
export function startBreak(state: TimerState, settings: PomodoroSettings): TimerState {
  const isLong =
    state.sessionsInSet > 0 && state.sessionsInSet % settings.sessionsBeforeLong === 0;
  const mins = isLong ? settings.longBreakMinutes : settings.shortBreakMinutes;
  const secs = Math.max(1, Math.round(mins * 60));
  return {
    ...state,
    phase: isLong ? "longBreak" : "shortBreak",
    secondsRemaining: secs,
    totalSeconds: secs,
    pausedPhase: null,
  };
}

export function pause(state: TimerState): TimerState {
  if (state.phase === "idle" || state.phase === "paused") return state;
  return { ...state, phase: "paused", pausedPhase: state.phase };
}

export function resume(state: TimerState): TimerState {
  if (state.phase !== "paused" || !state.pausedPhase) return state;
  return { ...state, phase: state.pausedPhase, pausedPhase: null };
}

/** Cancel the running phase and return to idle (used for "give up"). */
export function abandon(state: TimerState): TimerState {
  return { ...createInitialTimer(), sessionsInSet: state.sessionsInSet };
}

/** Record a finished focus session (increments the set counter). */
export function completeFocus(state: TimerState): TimerState {
  return { ...state, sessionsInSet: state.sessionsInSet + 1 };
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function progress(state: TimerState): number {
  if (state.totalSeconds <= 0) return 0;
  return 1 - state.secondsRemaining / state.totalSeconds;
}
