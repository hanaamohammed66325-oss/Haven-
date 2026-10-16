"use client";

import { useEffect, useRef } from "react";
import { drawHaviStill, HAVI_GRID_W, HAVI_DRAW_H } from "@/components/HaviMascot";
import styles from "./ReferralRewardDialog.module.css";

/** A still of one reward outfit, using Havi's actual pixel artwork. */
export default function HaviShowcase({ outfit, celebrate = false }: { outfit: string; celebrate?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = HAVI_GRID_W * 3;
    canvas.height = HAVI_DRAW_H * 3;
    drawHaviStill(canvas, [outfit], celebrate ? "celebrate" : "watch");
  }, [outfit, celebrate]);
  return <canvas ref={ref} className={celebrate ? styles.happy : undefined} aria-hidden style={{ imageRendering: "pixelated", display: "block", width: HAVI_GRID_W * 3, height: HAVI_DRAW_H * 3 }} />;
}
