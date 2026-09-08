"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { useStore } from "@/store";
import { useT, usePageTitle } from "@/i18n";
import { useSubscription } from "@/lib/subscription";
import { canUseHavi } from "@/lib/premium";
import { PondScene } from "@/components/pomodoro/PondScene";
import { TimerControls } from "@/components/pomodoro/TimerControls";
import { PomodoroSettings } from "@/components/pomodoro/PomodoroSettings";
import { PomodoroStats } from "@/components/pomodoro/PomodoroStats";
import {
  createInitialTimer,
  startFocus,
  startBreak,
  pause as pauseTimer,
  resume as resumeTimer,
  completeFocus,
  abandon as abandonTimer,
  formatClock,
  progress as timerProgress,
  type TimerState,
  type TimerPhase,
} from "@/lib/pomodoro/timerEngine";
import type { PomodoroSettings as PomSettings } from "@/types";
import { POMODORO_ENABLED } from "@/lib/featureFlags";
import { ComingSoon } from "@/components/ComingSoon";

const PHASE_LABEL: Record<TimerPhase, string> = {
  idle: "pom_idle",
  focus: "pom_focus",
  shortBreak: "pom_shortBreak",
  longBreak: "pom_longBreak",
  paused: "pom_paused",
};

function playChime() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const notes = [660, 880];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const start = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      o.start(start);
      o.stop(start + 0.42);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // audio unavailable — ignore
  }
}

function fireNotif(title: string, body: string, tag: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag, icon: "/icons/icon-192.png" });
  } catch {
    // ignore
  }
}

export default function PomodoroPage() {
  const store = useStore();
  const { hydrated, pomodoroSettings, pomodoroStats, setPomodoroSettings, recordPomodoroComplete, recordPomodoroAbandon } = store;
  const { t, dir } = useT();
  usePageTitle("nav_pomodoro");
  const { sub, profile } = useSubscription();
  const showHavi = canUseHavi(profile, sub);

  const [timer, setTimer] = useState<TimerState>(createInitialTimer);
  const [celebrateSignal, setCelebrateSignal] = useState(0);
  const [witherSignal, setWitherSignal] = useState(0);
  const [notifBanner, setNotifBanner] = useState(false);

  const deadlineRef = useRef<number | null>(null);
  const settingsRef = useRef<PomSettings>(pomodoroSettings);
  settingsRef.current = pomodoroSettings;
  const timerRef = useRef<TimerState>(timer);
  timerRef.current = timer;

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      setNotifBanner(true);
    }
  }, []);

  const running = timer.phase === "focus" || timer.phase === "shortBreak" || timer.phase === "longBreak";

  const handleFocusComplete = useCallback(() => {
    const s = settingsRef.current;
    if (s.soundEnabled) playChime();
    fireNotif(t("pom_title"), t("pom_notifFocusDone"), "pom-focus-done");
    recordPomodoroComplete();
    setCelebrateSignal((n) => n + 1);
    setTimer((prev) => {
      const done = completeFocus(prev);
      const withBreak = startBreak(done, s);
      if (s.autoStartBreaks) {
        deadlineRef.current = Date.now() + withBreak.secondsRemaining * 1000;
        return withBreak;
      }
      deadlineRef.current = null;
      return { ...withBreak, phase: "paused", pausedPhase: withBreak.phase as "shortBreak" | "longBreak" };
    });
  }, [recordPomodoroComplete, t]);

  const handleBreakComplete = useCallback(() => {
    const s = settingsRef.current;
    if (s.soundEnabled) playChime();
    const wasLong = timerRef.current.phase === "longBreak";
    fireNotif(t("pom_title"), wasLong ? t("pom_notifLongBreakDone") : t("pom_notifBreakDone"), "pom-break-done");
    setTimer((prev) => {
      if (s.autoStartFocus) {
        const f = startFocus(prev, s);
        deadlineRef.current = Date.now() + f.secondsRemaining * 1000;
        return f;
      }
      deadlineRef.current = null;
      return abandonTimer(prev);
    });
  }, [t]);

  // Countdown driven by an absolute deadline so a backgrounded tab catches up
  // the moment it becomes visible again (setInterval throttles in the background,
  // but the deadline math is exact whenever a tick finally runs).
  useEffect(() => {
    if (!running || deadlineRef.current == null) return;

    const recompute = () => {
      const dl = deadlineRef.current;
      if (dl == null) return;
      const remaining = Math.max(0, Math.ceil((dl - Date.now()) / 1000));
      const phase = timerRef.current.phase;
      setTimer((prev) => (prev.secondsRemaining === remaining ? prev : { ...prev, secondsRemaining: remaining }));
      if (remaining <= 0) {
        if (phase === "focus") handleFocusComplete();
        else handleBreakComplete();
      }
    };

    const id = window.setInterval(recompute, 1000);
    const onVis = () => {
      if (!document.hidden) recompute();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [running, handleFocusComplete, handleBreakComplete]);

  const onStart = () => {
    setTimer((prev) => {
      const f = startFocus(prev, settingsRef.current);
      deadlineRef.current = Date.now() + f.secondsRemaining * 1000;
      return f;
    });
  };
  const onPause = () => {
    deadlineRef.current = null;
    setTimer((prev) => pauseTimer(prev));
  };
  const onResume = () => {
    setTimer((prev) => {
      const r = resumeTimer(prev);
      deadlineRef.current = Date.now() + r.secondsRemaining * 1000;
      return r;
    });
  };
  const onSkip = () => {
    if (timerRef.current.phase === "focus") handleFocusComplete();
    else handleBreakComplete();
  };
  const onAbandon = () => {
    // Only a focus phase costs a lily pad; breaks just reset.
    if (timerRef.current.phase === "focus" || timerRef.current.pausedPhase === "focus") {
      recordPomodoroAbandon();
      setWitherSignal((n) => n + 1);
    }
    deadlineRef.current = null;
    setTimer((prev) => abandonTimer(prev));
  };

  const requestNotif = async () => {
    setNotifBanner(false);
    try {
      await Notification.requestPermission();
    } catch {
      // ignore
    }
  };

  if (!hydrated) return <div className="h-40" />;

  // Held behind a "coming soon" lock for the initial launch. The route stays so
  // the built experience is one flag flip from going live.
  if (!POMODORO_ENABLED) {
    return <ComingSoon title={t("pom_title")} tag={t("pom_soonTag")} desc={t("pom_soonBody")} />;
  }

  const baseMood: "idle" | "studying" | "resting" =
    timer.phase === "focus"
      ? "studying"
      : timer.phase === "shortBreak" || timer.phase === "longBreak"
        ? "resting"
        : "idle";
  const sessionTotal = pomodoroSettings.sessionsBeforeLong;
  const sessionCurrent = timer.sessionsInSet % sessionTotal;

  return (
    <div className="haven-fade-in pb-6">
      {/* Full-bleed pond banner: spans the full content width, fades top/bottom
          into the page, height adapts to the viewport. */}
      <div
        className="haven-fade-up relative -mx-5 sm:-mx-6 md:-mx-10 -mt-6 sm:-mt-8 md:-mt-12 mb-6"
        style={{ height: "clamp(280px, 44vh, 460px)" }}
      >
        <PondScene
          style={pomodoroSettings.pondStyle}
          lilyPadCount={pomodoroStats.lilyPadCount}
          baseMood={baseMood}
          showHavi={showHavi}
          dir={dir}
          celebrateSignal={celebrateSignal}
          witherSignal={witherSignal}
        />
      </div>

      <div className="mx-auto max-w-4xl">
        <header className="haven-fade-up mb-5">
          <h1 className="font-display text-2xl" style={{ color: "var(--color-ink)" }}>
            {t("pom_title")}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
            {t("pom_subtitle")}
          </p>
        </header>

        {notifBanner && (
          <div
            className="haven-fade-up mb-4 flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: "var(--color-primary-soft)", border: "1px solid var(--color-border)" }}
          >
            <Bell size={18} style={{ color: "var(--color-primary)" }} />
            <span className="text-sm flex-1" style={{ color: "var(--color-ink)" }}>
              {t("pom_notifEnable")}
            </span>
            <button onClick={requestNotif} className="haven-btn px-4 py-1.5 text-sm">
              {t("pom_notifEnableBtn")}
            </button>
            <button
              onClick={() => setNotifBanner(false)}
              aria-label={t("pom_notifDismiss")}
              style={{ color: "var(--color-muted)" }}
            >
              <X size={18} />
            </button>
          </div>
        )}

        {!showHavi && (
          <p className="text-center text-xs mb-4" style={{ color: "var(--color-muted)" }}>
            {t("pom_haviPremium")}
          </p>
        )}

        <div className="haven-fade-up mb-6">
          <TimerControls
            phase={timer.phase}
            clock={formatClock(timer.secondsRemaining)}
            progress={timerProgress(timer)}
            phaseLabelKey={PHASE_LABEL[timer.phase]}
            sessionCurrent={sessionCurrent}
            sessionTotal={sessionTotal}
            onStart={onStart}
            onPause={onPause}
            onResume={onResume}
            onSkip={onSkip}
            onAbandon={onAbandon}
          />
        </div>

        <div className="haven-stagger grid gap-4 md:grid-cols-2">
          <PomodoroStats stats={pomodoroStats} />
          <PomodoroSettings settings={pomodoroSettings} onChange={setPomodoroSettings} disabled={running} />
        </div>
      </div>
    </div>
  );
}
