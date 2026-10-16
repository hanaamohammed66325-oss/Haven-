"use client";

import { useEffect, useRef } from "react";
import { createRewardWaterMotion } from "@/lib/rewardWaterMotion";
import { isAllowedRewardMotion, selectedRewardMotion } from "@/lib/rewardMotions";
import type { RewardMotionId } from "@/types";

export { isRewardTheme } from "@/lib/rewardMotions";

/** Art remains underneath the real controls and responds to their input. */
export function RewardThemeMotion({ theme, motion, active = true, preview = false }: { theme: string; motion?: RewardMotionId | null; active?: boolean; preview?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<ReturnType<typeof createRewardWaterMotion>>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const kind = motion === undefined ? selectedRewardMotion(theme) : isAllowedRewardMotion(theme, motion) ? motion : null;

  useEffect(() => {
    const element = canvas.current;
    const surface = element?.parentElement;
    const input = preview ? surface?.closest("button") : surface?.closest<HTMLElement>(".haven-sidebar") ?? surface;
    if (!element || !input || !kind) return;
    const current = createRewardWaterMotion(element, input, { theme, kind, preview, active: activeRef.current });
    controller.current = current;
    current?.setActive(activeRef.current);
    return () => { current?.dispose(); controller.current = null; };
  }, [theme, kind, preview]);

  useEffect(() => { controller.current?.setActive(active); }, [active]);

  return kind ? <canvas ref={canvas} aria-hidden="true" className="haven-reward-motion" data-reward-motion={kind} /> : null;
}
