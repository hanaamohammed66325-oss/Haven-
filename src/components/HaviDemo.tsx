"use client";

import { useEffect, useRef, useState } from "react";
import { GRID_W, GRID_H, DRAW_H, drawFrame, bobFor, rotFor, offsetFor } from "./HaviMascot";
import { useT } from "@/i18n";

/**
 * A deliberately-placed, NON-roaming Havi for the landing page demo mockup.
 *
 * The real HaviMascot roams the app and is (a) excluded from the landing page
 * and (b) gated behind Premium. This is a marketing preview: it reuses the exact
 * same pixel art + idle animations, but simply perches on the demo card's edge
 * and loops through a few calm idle poses so visitors can see the feature before
 * signing up. Purely decorative → pointer-events-none, aria-hidden.
 */

const IDLE_CYCLE = ["sleep", "watch", "hang"] as const;
const PHASE_MS = 4200;

export function HaviDemo({ size = 46 }: { size?: number }) {
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(false);
  const [idx, setIdx] = useState(0);
  const activity = IDLE_CYCLE[idx];

  const scale = Math.max(2, Math.round(size / GRID_W));
  const canvasW = scale * GRID_W;
  const canvasH = scale * DRAW_H;
  const dispW = size;
  const dispH = (size * DRAW_H) / GRID_W;
  const bodyH = (size * GRID_H) / GRID_W;

  // reduced motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const fn = () => setReduced(mq.matches);
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);

  // cycle through the idle poses (reduced motion → hold a single calm pose)
  useEffect(() => {
    if (reduced) {
      setIdx(1); // "watch" — eyes open, still
      return;
    }
    const id = setInterval(() => setIdx((i) => (i + 1) % IDLE_CYCLE.length), PHASE_MS);
    return () => clearInterval(id);
  }, [reduced]);

  // draw loop (or a single static frame when reduced)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const settle = (t: number) => {
      if (!wrapRef.current) return;
      const b = reduced ? 0 : Math.max(-6, Math.min(6, bobFor(activity, t)));
      const off = offsetFor(activity) * bodyH;
      wrapRef.current.style.transform = `translateY(${(b + off).toFixed(1)}px) rotate(${
        reduced ? 0 : rotFor(activity, t)
      }deg)`;
    };

    // Always paint one frame up front so the canvas is never blank before the
    // first animation tick (rAF is also paused while the tab is backgrounded).
    drawFrame(canvas, activity, 0, {});
    settle(0);
    if (reduced) return;

    let raf = 0;
    let last = 0;
    let tick = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (ts - last < 120) return; // ~8fps, matches the roaming mascot's cadence
      last = ts;
      tick += 1;
      drawFrame(canvas, activity, tick, {});
      settle(tick);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [activity, reduced, bodyH]);

  return (
    <>
      {/* caption — introduces the feature, sits in the empty space above the card */}
      <div
        className="haven-fade-in surface-card pointer-events-none absolute z-20 hidden max-w-[220px] rounded-xl px-3 py-2 text-[11px] font-medium leading-snug sm:block"
        style={{ top: -46, insetInlineStart: 8, color: "var(--color-muted)" }}
        role="note"
      >
        {t("haviDemoCaption")}
      </div>

      {/* Havi perched on the top edge of the demo card */}
      <div
        className="pointer-events-none absolute z-20"
        style={{ top: -Math.round(dispH * 0.78), insetInlineEnd: 34, width: dispW, height: dispH }}
        aria-hidden="true"
      >
        <div ref={wrapRef} style={{ width: dispW, height: dispH }}>
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            style={{ width: dispW, height: dispH, imageRendering: "pixelated", display: "block" }}
            role="img"
            aria-label="Havi"
          />
        </div>
      </div>
    </>
  );
}
