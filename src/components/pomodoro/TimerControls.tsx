"use client";

import { Pause, Play, SkipForward } from "lucide-react";
import { useT } from "@/i18n";
import { phaseOf, type TimerState } from "@/lib/pomodoro/timerEngine";
import { GLASS, ACTION, ON_SCENE } from "./glass";

interface Props {
  timer: TimerState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onAbandon: () => void;
  onSkipBreak: () => void;
}

// One clear action for each state, floating over the water: the lantern-lit
// pill starts or resumes, glass for everything quieter. (The timer itself is
// written into the sky above.)
export function TimerControls({ timer, onStart, onPause, onResume, onAbandon, onSkipBreak }: Props) {
  const { t } = useT();
  const { idle, pausedFocus, breakWaiting, onBreak } = phaseOf(timer);

  const big =
    "inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-[15px] font-semibold transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.97]";
  const small = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10";

  return (
    <div className="flex flex-col items-center gap-2.5">
      {idle && (
        <button onClick={onStart} data-tour="pom-start" className={big} style={ACTION}>
          <Play size={17} fill="currentColor" />
          {t("pom_start")}
        </button>
      )}
      {timer.phase === "focus" && (
        <button onClick={onPause} className={big} style={GLASS}>
          <Pause size={17} />
          {t("pom_pause")}
        </button>
      )}
      {pausedFocus && (
        <>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button onClick={onResume} className={big} style={ACTION}>
              <Play size={17} fill="currentColor" />
              {t("pom_resume")}
            </button>
            <button onClick={onAbandon} className={small} style={{ ...GLASS, color: "#ffc4b8" }}>
              {t("pom_abandon")}
            </button>
          </div>
          <p className="text-xs" style={ON_SCENE}>
            {t("pom_endHint")}
          </p>
        </>
      )}
      {breakWaiting && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button onClick={onResume} className={big} style={ACTION}>
            <Play size={17} fill="currentColor" />
            {t("pom_startBreak")}
          </button>
          <button onClick={onSkipBreak} className={small} style={GLASS}>
            {t("pom_skipBreak")}
          </button>
        </div>
      )}
      {onBreak && (
        <button onClick={onSkipBreak} className={big} style={GLASS}>
          <SkipForward size={17} />
          {t("pom_skipBreak")}
        </button>
      )}
    </div>
  );
}
