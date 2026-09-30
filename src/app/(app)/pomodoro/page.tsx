"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, X, Trees, Check, BarChart3, Maximize2, Minimize2 } from "lucide-react";
import { useStore } from "@/store";
import { useT, usePageTitle } from "@/i18n";
import { useSubscription } from "@/lib/subscription";
import { canUseHavi } from "@/lib/premium";
import { PondScene } from "@/components/pomodoro/PondScene";
import { GroveModal } from "@/components/pomodoro/GroveModal";
import { TimerControls } from "@/components/pomodoro/TimerControls";
import { TaskPicker } from "@/components/pomodoro/TaskPicker";
import { PomodoroSettings } from "@/components/pomodoro/PomodoroSettings";
import { PomodoroStats } from "@/components/pomodoro/PomodoroStats";
import { Modal } from "@/components/Modal";
import { GLASS, ACTION } from "@/components/pomodoro/glass";
import type { HudBox } from "@/lib/pomodoro/pondView";
import {
  createInitialTimer,
  startFocus,
  startBreak,
  pause as pauseTimer,
  resume as resumeTimer,
  completeFocus,
  abandon as abandonTimer,
  formatClock,
  phaseOf,
  progress as timerProgress,
  type TimerState,
} from "@/lib/pomodoro/timerEngine";
import type { PomodoroSettings as PomSettings } from "@/types";
import { focusTasks, isTaskKey, plannerIdOf, type FocusTask, type FocusTaskKind } from "@/lib/pomodoro/focusTasks";
import { hashString } from "@/lib/pomodoro/math";
import type { TranslationKey } from "@/i18n/translations/en";
import { semesterProgress } from "@/lib/grades";
import { spokenDuration } from "@/lib/format";
import { toISODate } from "@/lib/dates";
import { POMODORO_ENABLED } from "@/lib/featureFlags";
import { ComingSoon } from "@/components/ComingSoon";

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

// The line under the timer on a break: the calm green of rest.
const BREAK_COLOR = "#7fd6a8";

// After a session on a task: "is it done?", by the kind of task.
const ASK: Record<FocusTaskKind, { q: TranslationKey; yes: TranslationKey; later: TranslationKey }> = {
  assignment: { q: "pom_askAssignment", yes: "pom_askAssignmentYes", later: "pom_askLater" },
  exam: { q: "pom_askExam", yes: "pom_askExamYes", later: "pom_askExamMore" },
  planner: { q: "pom_askPlanner", yes: "pom_askPlannerYes", later: "pom_askLater" },
};

// Deterministic per-course identity: a stable hash → fallback bloom colour, plus
// the pad species + flower type (so every subject always grows the same plant).
const BLOOM_FALLBACK = ["#e86f9e", "#f2c14e", "#7db6f0", "#c48be0", "#5fce9e", "#ef8f4b", "#e0576b", "#8fd0ff"];
function fallbackColor(id: string): string {
  return BLOOM_FALLBACK[hashString(id) % BLOOM_FALLBACK.length];
}

export default function PomodoroPage() {
  const store = useStore();
  const {
    hydrated,
    courses,
    planner,
    semester,
    pomodoroSettings,
    pomodoroStats,
    taskFocus,
    setPomodoroSettings,
    recordPomodoroComplete,
    recordPomodoroAbandon,
    setTaskFocus,
    updatePlannerNote,
  } = store;
  const { t } = useT();
  const { sub, profile } = useSubscription();
  const showHavi = canUseHavi(profile, sub);

  const [timer, setTimer] = useState<TimerState>(createInitialTimer);
  const { idle, onBreak, running, pausedFocus, breakWaiting, inSession } = phaseOf(timer);
  // the time left shows in the browser tab while a session or break is on
  usePageTitle("nav_pomodoro", { prefix: idle ? null : formatClock(timer.secondsRemaining) });
  const [celebrateSignal, setCelebrateSignal] = useState(0);
  const [witherSignal, setWitherSignal] = useState(0);
  const [notifBanner, setNotifBanner] = useState(false);
  const [groveOpen, setGroveOpen] = useState(false);
  // "your lake" opens once the pond's camera has risen into the clouds
  const [lifted, setLifted] = useState(false);
  const openLake = useCallback(() => setGroveOpen(true), []);
  // What the session is spent on: "" (general), a course id, or a task key.
  const [focusKey, setFocusKey] = useState("");
  const currentWeek = useMemo(() => semesterProgress(semester).currentWeek, [semester]);
  const tasks = useMemo(
    () => focusTasks(courses, planner.notes, currentWeek, taskFocus),
    [courses, planner.notes, currentWeek, taskFocus],
  );
  const focusTask = isTaskKey(focusKey) ? (tasks.find((x) => x.key === focusKey) ?? null) : null;
  const focusCourseId = focusTask ? focusTask.courseId : focusKey || null;
  const focus = { courseId: focusCourseId, task: focusTask?.key ?? null };
  const focusRef = useRef(focus);
  focusRef.current = focus;
  // After a session on a task: "is it done?" (its key), then what was saved.
  const [ask, setAsk] = useState<string | null>(null);
  const [doneNote, setDoneNote] = useState<{ task: FocusTask; estimate?: number; actual: number } | null>(null);
  const [skipEstimate, setSkipEstimate] = useState<string[]>([]);
  // where the sky draws the timer (the task chip goes under it)
  const [hudBox, setHudBox] = useState<HudBox | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  // the pond over the whole screen (and the browser's full screen, where it can)
  const [immersive, setImmersive] = useState(false);
  const [awake, setAwake] = useState(true);

  // Colour of the bloom each earned pad carries (by the course it was spent on),
  // plus a legend of subjects → colours + counts. This turns the pond into a map
  // of what the student actually studied.
  const padColorsMap = pomodoroSettings.padColors;
  const courseColor = useCallback(
    (id: string | null): string | null => {
      if (!id) return null;
      if (padColorsMap?.[id]) return padColorsMap[id];
      const c = courses.find((x) => x.id === id);
      if (!c) return null;
      return c.color || fallbackColor(id);
    },
    [courses, padColorsMap],
  );
  // For now every pad is the same shape + bloom; only the COLOUR varies by subject.
  // New leaf shapes / flowers / creatures unlock later via challenge rewards.
  const padSpecs = useMemo(
    () =>
      pomodoroStats.pads.map((p) =>
        p.courseId
          ? { key: p.courseId, color: courseColor(p.courseId), species: 0, flower: 0 }
          : { key: "__general", color: null, species: 0, flower: 0 },
      ),
    [pomodoroStats.pads, courseColor],
  );
  const lakeLegend = useMemo(() => {
    const m = new Map<string, { key: string; name: string; color: string; count: number }>();
    for (const p of pomodoroStats.pads) {
      if (!p.courseId) continue; // "General" sessions have no colour to chart
      const c = courses.find((x) => x.id === p.courseId);
      const entry = m.get(p.courseId) ?? { key: p.courseId, name: c ? c.name : t("pom_generalFocus"), color: courseColor(p.courseId) || "#9fb0a5", count: 0 };
      entry.count += 1;
      m.set(p.courseId, entry);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [pomodoroStats.pads, courses, courseColor, t]);

  const setCourseColor = useCallback(
    (courseId: string, color: string) => {
      setPomodoroSettings({ padColors: { ...(padColorsMap ?? {}), [courseId]: color } });
    },
    [setPomodoroSettings, padColorsMap],
  );

  const deadlineRef = useRef<number | null>(null);
  const settingsRef = useRef<PomSettings>(pomodoroSettings);
  settingsRef.current = pomodoroSettings;
  const timerRef = useRef<TimerState>(timer);
  timerRef.current = timer;

  // "/pomodoro?task=component:<id>" (the assignments page's "focus on it")
  // picks that task once the data is in. Read from the URL directly: the static
  // export has no server to hand the search params over.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (!hydrated || deepLinked.current) return;
    deepLinked.current = true;
    const key = new URLSearchParams(window.location.search).get("task");
    if (!key) return;
    if (tasks.some((x) => x.key === key)) setFocusKey(key);
    window.history.replaceState(null, "", window.location.pathname);
  }, [hydrated, tasks]);

  // A chosen task that left the list (graded, done elsewhere) falls back to
  // "general", unless a session on it is under way.
  useEffect(() => {
    if (isTaskKey(focusKey) && !focusTask && idle) setFocusKey("");
  }, [focusKey, focusTask, idle]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      setNotifBanner(true);
    }
  }, []);

  // While a session runs, the buttons step aside after a few still seconds and
  // come back with any movement, tap or key.
  useEffect(() => {
    if (timer.phase !== "focus") return;
    let id = 0;
    const wake = () => {
      setAwake(true);
      window.clearTimeout(id);
      id = window.setTimeout(() => setAwake(false), 4000);
    };
    wake();
    const evs = ["pointermove", "pointerdown", "keydown", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      window.clearTimeout(id);
      evs.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [timer.phase]);

  // Full screen ends with the browser's own (Esc), or Esc where there is none.
  useEffect(() => {
    if (!immersive) return;
    const onFs = () => {
      if (!document.fullscreenElement) setImmersive(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) setImmersive(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("keydown", onKey);
    };
  }, [immersive]);
  useEffect(
    () => () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
    [],
  );
  const toggleImmersive = () => {
    if (immersive) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setImmersive(false);
      return;
    }
    setImmersive(true);
    if (document.fullscreenEnabled) document.documentElement.requestFullscreen().catch(() => {});
  };

  const handleFocusComplete = useCallback(() => {
    const s = settingsRef.current;
    if (s.soundEnabled) playChime();
    fireNotif(t("pom_title"), t("pom_notifFocusDone"), "pom-focus-done");
    const { courseId, task } = focusRef.current;
    recordPomodoroComplete(courseId, task);
    if (task) setAsk(task);
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

  // A break ends (or is skipped): straight into the next session when that's
  // switched on, else back to the start.
  const endBreak = useCallback(() => {
    const s = settingsRef.current;
    setTimer((prev) => {
      if (s.autoStartFocus) {
        const f = startFocus(prev, s);
        deadlineRef.current = Date.now() + f.secondsRemaining * 1000;
        return f;
      }
      deadlineRef.current = null;
      return abandonTimer(prev);
    });
  }, []);

  const handleBreakComplete = useCallback(() => {
    if (settingsRef.current.soundEnabled) playChime();
    const wasLong = timerRef.current.phase === "longBreak";
    fireNotif(t("pom_title"), wasLong ? t("pom_notifLongBreakDone") : t("pom_notifBreakDone"), "pom-break-done");
    endBreak();
  }, [t, endBreak]);

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
        // Finish once: a tick and the tab coming back into view can land in the
        // same moment, before React has re-rendered, and each would count the
        // session again. The next phase sets its own deadline.
        deadlineRef.current = null;
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
    setAsk(null);
    setDoneNote(null);
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
  // Only a break can be skipped: a session counts only once its time is up.
  const onSkipBreak = endBreak;
  const onAbandon = () => {
    // Only a focus phase costs a lily pad; breaks just reset.
    if (timerRef.current.phase === "focus" || timerRef.current.pausedPhase === "focus") {
      recordPomodoroAbandon();
      setWitherSignal((n) => n + 1);
    }
    deadlineRef.current = null;
    setTimer((prev) => abandonTimer(prev));
  };

  // "Yes, it's done": saved on the task (and ticked in the planner for a planner
  // task); the session goes back to its course. Undo puts it all back.
  const markDone = (task: FocusTask) => {
    const f = taskFocus[task.key];
    setTaskFocus(task.key, { done: true, doneAt: toISODate(new Date()) });
    if (task.kind === "planner") updatePlannerNote(plannerIdOf(task.key), { done: true });
    setAsk(null);
    setFocusKey(task.courseId ?? "");
    setDoneNote({ task, estimate: f?.estimate, actual: f?.minutes ?? 0 });
  };
  const undoDone = (task: FocusTask) => {
    setTaskFocus(task.key, { done: false });
    if (task.kind === "planner") updatePlannerNote(plannerIdOf(task.key), { done: false });
    setFocusKey(task.key);
    setDoneNote(null);
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

  const baseMood: "idle" | "studying" | "resting" = timer.phase === "focus" ? "studying" : onBreak ? "resting" : "idle";
  // the next pad grows with the focus session, running or paused
  const focusProgress = inSession ? timerProgress(timer) : null;
  const dur = (min: number) => spokenDuration(min, t);
  const askTask = ask ? (tasks.find((x) => x.key === ask) ?? null) : null;
  const focusStats = focusTask ? taskFocus[focusTask.key] : undefined;
  // "Session 2 of 4" before and during a session; "2 of 4 done" on its break
  const sessionTotal = pomodoroSettings.sessionsBeforeLong;
  const sessionLabel =
    idle || inSession
      ? t("pom_sessionOf", { current: (timer.sessionsInSet % sessionTotal) + 1, total: sessionTotal })
      : t("pom_sessionsDone", { current: ((timer.sessionsInSet - 1) % sessionTotal) + 1, total: sessionTotal });
  // before a start, the clock shows the session's length
  const clock = formatClock(idle ? pomodoroSettings.focusMinutes * 60 : timer.secondsRemaining);
  const accent = courseColor(focusCourseId);
  const hud = {
    clock,
    progress: idle || breakWaiting ? 0 : timerProgress(timer),
    label: pausedFocus
      ? t("pom_paused")
      : breakWaiting
        ? t("pom_breakReady")
        : onBreak
          ? `${t(timer.phase === "longBreak" ? "pom_longBreak" : "pom_shortBreak")} · ${sessionLabel}`
          : sessionLabel,
    color: onBreak ? BREAK_COLOR : accent,
    dim: pausedFocus,
  };
  // under the chip, between sessions: the time spent on the chosen task
  const taskLine =
    focusTask && idle
      ? focusStats?.estimate
        ? focusStats.minutes > 0
          ? t("pom_taskOfEstimate", { time: dur(focusStats.minutes), estimate: dur(focusStats.estimate) })
          : t("pom_taskExpected", { estimate: dur(focusStats.estimate) })
        : focusStats?.minutes
          ? t("pom_taskSoFar", { time: dur(focusStats.minutes) })
          : null
      : null;
  // a running session: after a few still seconds the buttons (and the pointer) rest
  const quiet = timer.phase === "focus" && !awake;
  const show = (on: boolean) => `transition-opacity duration-500 ${on ? "opacity-100" : "pointer-events-none opacity-0"}`;
  const glassBtn = "pointer-events-auto grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-white/10";

  return (
    <div className="haven-fade-in flex flex-1 flex-col">
      {/* The page is the lake: the pond fills the screen, the timer is written
          into its sky, and everything else floats over it as glass. */}
      <div
        data-tour="pom-pond"
        // Havi already lives in the pond: the roaming mascot never perches here
        data-havi-avoid
        className={
          immersive
            ? "fixed inset-0 z-40 overflow-hidden"
            : "relative min-h-[520px] flex-1 overflow-hidden"
        }
        style={{ cursor: quiet ? "none" : undefined }}
      >
        <PondScene
          lilyPadCount={pomodoroStats.lilyPadCount}
          padSpecs={padSpecs}
          baseMood={baseMood}
          focusProgress={focusProgress}
          focusColor={accent}
          showHavi={showHavi}
          celebrateSignal={celebrateSignal}
          witherSignal={witherSignal}
          lifted={lifted}
          onLifted={openLake}
          hud={hud}
          onHudLayout={setHudBox}
        />
        {/* the sky draws the timer; this is it for screen readers */}
        <p role="timer" className="sr-only">
          {clock} · {hud.label}
        </p>

        <div className={`pointer-events-none absolute inset-0 ${show(!lifted)}`}>
          {/* top: your lake · your progress, notifications, full screen */}
          <div
            className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-3 sm:px-5"
            style={{ paddingTop: immersive ? "max(14px, env(safe-area-inset-top))" : 14 }}
          >
            <button
              data-tour="pom-grove"
              onClick={() => setLifted(true)}
              className={`pointer-events-auto flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors hover:bg-white/10 ${show(!inSession)}`}
              style={GLASS}
              inert={inSession}
            >
              <Trees size={16} />
              {t("pom_grove")}
            </button>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 ${show(!inSession)}`} inert={inSession}>
                {notifBanner && (
                  <button onClick={requestNotif} aria-label={t("pom_notifEnable")} title={t("pom_notifEnable")} className={`${glassBtn} relative`} style={GLASS}>
                    <Bell size={17} />
                    <span className="absolute end-2.5 top-2.5 h-1.5 w-1.5 rounded-full" style={{ background: "#f4c74e" }} />
                  </button>
                )}
                <button
                  onClick={() => setStatsOpen(true)}
                  aria-label={t("pom_stats")}
                  className="pointer-events-auto flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors hover:bg-white/10 sm:px-4"
                  style={GLASS}
                >
                  <BarChart3 size={17} />
                  <span className="hidden sm:inline">{t("pom_stats")}</span>
                </button>
              </div>
              <button
                onClick={toggleImmersive}
                aria-label={t(immersive ? "pom_fullscreenExit" : "pom_fullscreen")}
                title={t(immersive ? "pom_fullscreenExit" : "pom_fullscreen")}
                className={`${glassBtn} ${show(!quiet)}`}
                style={GLASS}
              >
                {immersive ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </button>
            </div>
          </div>

          {/* under the timer: what the session is spent on — or, after one on a
              task, whether it's done (once Havi has landed on the new pad) */}
          <div
            className={`absolute inset-x-0 flex justify-center px-4 ${show(!!hudBox)}`}
            style={{ top: hudBox ? hudBox.chipTop : "40%" }}
            data-tour="pom-timer"
          >
            {askTask ? (
              <div className="pointer-events-auto w-full max-w-sm rounded-2xl px-5 py-4 text-center" style={{ ...GLASS, animation: "haven-fade-up 0.5s ease-out 2s backwards" }}>
                <p className="text-[15px] font-semibold">
                  {/* the name isolated, so a name in the other script keeps the quotes around it */}
                  {t(ASK[askTask.kind].q, { name: `⁨${askTask.name}⁩` })}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={() => markDone(askTask)}
                    className="rounded-full px-5 py-2 text-sm font-semibold"
                    style={ACTION}
                  >
                    {t(ASK[askTask.kind].yes)}
                  </button>
                  <button
                    onClick={() => setAsk(null)}
                    className="rounded-full px-5 py-2 text-sm font-medium transition-colors hover:bg-white/10"
                    style={{ border: "1px solid rgba(255,255,255,0.22)" }}
                  >
                    {t(ASK[askTask.kind].later)}
                  </button>
                </div>
              </div>
            ) : doneNote ? (
              // it was marked done: how long it took (next to the estimate), undo
              <div className="haven-fade-up pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl px-4 py-3 text-sm" style={GLASS}>
                <Check size={17} className="shrink-0" style={{ color: BREAK_COLOR }} />
                <span className="flex-1">
                  {t("pom_doneSaved")}{" "}
                  {doneNote.estimate
                    ? t("pom_doneCompare", { estimate: dur(doneNote.estimate), actual: dur(doneNote.actual) })
                    : doneNote.actual > 0
                      ? t("pom_doneTotal", { actual: dur(doneNote.actual) })
                      : null}
                </span>
                <button onClick={() => undoDone(doneNote.task)} className="shrink-0 font-semibold" style={{ color: "#f4d58a" }}>
                  {t("undo")}
                </button>
                <button onClick={() => setDoneNote(null)} aria-label={t("close")} className="shrink-0" style={{ opacity: 0.7 }}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="pointer-events-auto flex max-w-full justify-center">
                <TaskPicker
                  value={focusKey}
                  onChange={setFocusKey}
                  courses={courses}
                  tasks={tasks}
                  taskFocus={taskFocus}
                  currentWeek={currentWeek}
                  courseColor={courseColor}
                  locked={inSession}
                  line={taskLine}
                  onEstimate={(key, m) => setTaskFocus(key, { estimate: m })}
                  skipped={skipEstimate}
                  onSkipEstimate={(key) => setSkipEstimate((k) => [...k, key])}
                />
              </div>
            )}
          </div>

          {/* bottom, over the water: the one action, then the session's settings */}
          <div
            className={`absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 ${show(!quiet)}`}
            style={{ paddingBottom: "max(22px, env(safe-area-inset-bottom))" }}
          >
            <div className="pointer-events-auto">
              <TimerControls
                timer={timer}
                onStart={onStart}
                onPause={onPause}
                onResume={onResume}
                onAbandon={onAbandon}
                onSkipBreak={onSkipBreak}
              />
            </div>
            {idle && (
              <div className="pointer-events-auto flex flex-col items-center gap-2">
                <PomodoroSettings settings={pomodoroSettings} onChange={setPomodoroSettings} />
                {!showHavi && (
                  <p className="rounded-full px-3 py-1 text-xs" style={GLASS}>
                    {t("pom_haviPremium")}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <GroveModal
        open={groveOpen}
        onClose={() => {
          setGroveOpen(false);
          setLifted(false);
        }}
        lilyPadCount={pomodoroStats.lilyPadCount}
        showHavi={showHavi}
        padSpecs={padSpecs}
        legend={lakeLegend}
        onSetColor={setCourseColor}
      />

      <Modal open={statsOpen} onClose={() => setStatsOpen(false)} title={t("pom_stats")} variant="sheet">
        <PomodoroStats stats={pomodoroStats} />
      </Modal>
    </div>
  );
}
