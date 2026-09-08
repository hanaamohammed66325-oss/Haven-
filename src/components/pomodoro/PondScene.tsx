"use client";

import { useEffect, useRef } from "react";
import {
  renderPond,
  buildLilyPads,
  PAD_SLOT_COUNT,
  type PondState,
  type HaviMood,
} from "@/lib/pomodoro/pondRenderer";
import {
  getTimeOfDay,
  SKY_PALETTES,
  lerpPalette,
  type SkyPalette,
  type TimeOfDay,
} from "@/lib/pomodoro/timeOfDay";
import type { PondStyle } from "@/types";

interface Props {
  style: PondStyle;
  /** completed sessions so far; pads shown = this + 1 (home pad + one per session) */
  lilyPadCount: number;
  baseMood: "idle" | "studying" | "resting";
  showHavi: boolean;
  dir: "ltr" | "rtl";
  /** bump to trigger: next pad solidifies + Havi jumps onto it */
  celebrateSignal: number;
  /** bump to trigger a wither + sad reaction */
  witherSignal: number;
}

const FRAME_MS = 66; // ~15 fps
const JUMP_TICKS = 16;
const FISH_TICKS = 42; // desk-pull intro at the start of a focus session
const REACT_TICKS = 46;
const FADE_TICKS = 26;
const PREVIEW_MAX = 0.45;

export function PondScene({
  style,
  lilyPadCount,
  baseMood,
  showHavi,
  dir,
  celebrateSignal,
  witherSignal,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const tickRef = useRef(0);
  const sizeRef = useRef({ w: 800, h: 360, dpr: 1 });
  const countRef = useRef(lilyPadCount + 1); // solid pads
  const opacityRef = useRef<number[]>([]);
  const previewOpRef = useRef(0);
  const haviPadRef = useRef(Math.max(0, lilyPadCount));
  const jumpRef = useRef<{ from: number; to: number; start: number } | null>(null);
  const reactRef = useRef<{ mood: HaviMood; start: number } | null>(null);
  const reviveRef = useRef<{ index: number; start: number } | null>(null);
  const studyStartRef = useRef(-9999);
  const prevBaseRef = useRef(baseMood);

  const paletteRef = useRef<SkyPalette>(SKY_PALETTES[getTimeOfDay()]);
  const targetTodRef = useRef<TimeOfDay>(getTimeOfDay());
  const paletteFromRef = useRef<SkyPalette>(paletteRef.current);
  const transitionRef = useRef(1);

  const styleRef = useRef(style);
  const baseMoodRef = useRef(baseMood);
  const showHaviRef = useRef(showHavi);
  const dirRef = useRef(dir);
  const reducedRef = useRef(false);

  const celebrateSeen = useRef(celebrateSignal);
  const witherSeen = useRef(witherSignal);

  styleRef.current = style;
  baseMoodRef.current = baseMood;
  showHaviRef.current = showHavi;
  dirRef.current = dir;

  // Track solid-pad count (new pads fade in).
  useEffect(() => {
    const n = Math.max(1, Math.min(lilyPadCount + 1, PAD_SLOT_COUNT));
    countRef.current = n;
    const op = opacityRef.current;
    for (let i = 0; i < n; i++) op[i] ??= 1;
    op.length = n;
  }, [lilyPadCount]);

  // Celebrate: the previewed next pad solidifies and Havi jumps onto it.
  useEffect(() => {
    if (celebrateSignal === celebrateSeen.current) return;
    celebrateSeen.current = celebrateSignal;
    const newIdx = countRef.current - 1;
    if (newIdx < 0) return;
    opacityRef.current[newIdx] = Math.min(previewOpRef.current || 0.3, 0.6); // start translucent → rises to full
    previewOpRef.current = 0;
    jumpRef.current = { from: haviPadRef.current, to: newIdx, start: tickRef.current };
  }, [celebrateSignal]);

  // Wither: a pad withers, Havi goes sad, then the pad regrows fresh (the pond
  // stays alive — one dies, another grows in its place).
  useEffect(() => {
    if (witherSignal === witherSeen.current) return;
    witherSeen.current = witherSignal;
    const dyingIdx = Math.max(0, countRef.current - 1);
    reviveRef.current = { index: dyingIdx, start: tickRef.current };
    reactRef.current = { mood: "sad", start: tickRef.current };
    previewOpRef.current = 0;
  }, [witherSignal]);

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.round(rect.width));
      const h = Math.max(200, Math.round(rect.height));
      if (w === sizeRef.current.w && h === sizeRef.current.h && dpr === sizeRef.current.dpr) return;
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);

    const todTimer = window.setInterval(() => {
      const tod = getTimeOfDay();
      if (tod !== targetTodRef.current) {
        targetTodRef.current = tod;
        paletteFromRef.current = paletteRef.current;
        transitionRef.current = 0;
      }
    }, 5 * 60 * 1000);

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      const tk = ++tickRef.current;
      const { w, h, dpr } = sizeRef.current;

      // detect entry into a focus session → start the desk-pull intro
      const base = baseMoodRef.current;
      if (base === "studying" && prevBaseRef.current !== "studying") studyStartRef.current = tk;
      prevBaseRef.current = base;
      const focusActive = base === "studying";

      // palette transition
      if (transitionRef.current < 1) {
        transitionRef.current = Math.min(1, transitionRef.current + 1 / 30);
        paletteRef.current = lerpPalette(paletteFromRef.current, SKY_PALETTES[targetTodRef.current], transitionRef.current);
      } else {
        paletteRef.current = SKY_PALETTES[targetTodRef.current];
      }

      // pad fade-in
      const op = opacityRef.current;
      for (let i = 0; i < op.length; i++) if (op[i] < 1) op[i] = Math.min(1, op[i] + 1 / FADE_TICKS);

      // preview of the next pad while focusing
      if (focusActive && countRef.current < PAD_SLOT_COUNT && !jumpRef.current) {
        previewOpRef.current = Math.min(PREVIEW_MAX, previewOpRef.current + 1 / 120);
      } else if (!focusActive) {
        previewOpRef.current = 0;
      }

      // build pads
      const showPreview = previewOpRef.current > 0.02 && countRef.current < PAD_SLOT_COUNT;
      const pads = buildLilyPads(countRef.current + (showPreview ? 1 : 0), w, h);
      for (let i = 0; i < countRef.current; i++) pads[i].opacity = op[i] ?? 1;
      if (showPreview && pads[countRef.current]) pads[countRef.current].opacity = previewOpRef.current;

      if (haviPadRef.current >= countRef.current) haviPadRef.current = countRef.current - 1;

      // jump resolution
      let jump: PondState["jump"] = null;
      if (jumpRef.current) {
        const prog = (tk - jumpRef.current.start) / JUMP_TICKS;
        if (prog >= 1) {
          haviPadRef.current = Math.min(jumpRef.current.to, countRef.current - 1);
          reactRef.current = { mood: "celebrating", start: tk };
          jumpRef.current = null;
        } else {
          jump = { from: jumpRef.current.from, to: jumpRef.current.to, progress: prog };
        }
      }

      // mood + fishing progress
      let mood: HaviMood = base;
      let fishProgress = 0;
      if (focusActive) {
        const elapsed = tk - studyStartRef.current;
        if (elapsed < FISH_TICKS) {
          mood = "fishing";
          fishProgress = Math.max(0, Math.min(1, elapsed / FISH_TICKS));
        } else {
          mood = "studying";
        }
      }
      if (jump) mood = "jumping";
      else if (reactRef.current) {
        if (tk - reactRef.current.start >= REACT_TICKS) reactRef.current = null;
        else mood = reactRef.current.mood;
      }

      // wither → regrow: phase 1 the pad browns and sinks, phase 2 a fresh one
      // rises in its place.
      if (reviveRef.current) {
        const r = reviveRef.current;
        const el = tk - r.start;
        if (el >= FADE_TICKS * 2) {
          reviveRef.current = null;
          opacityRef.current[r.index] = 1;
        } else if (r.index < pads.length) {
          if (el < FADE_TICKS) {
            const prog = el / FADE_TICKS;
            pads[r.index] = {
              ...pads[r.index],
              dying: Math.min(1, prog + 0.15),
              opacity: Math.max(0.05, 1 - prog),
              ry: pads[r.index].ry * (1 - prog * 0.5),
              cy: pads[r.index].cy + prog * 10,
            };
          } else {
            const rp = (el - FADE_TICKS) / FADE_TICKS;
            pads[r.index] = {
              ...pads[r.index],
              dying: 0,
              opacity: rp,
              ry: pads[r.index].ry * (0.5 + rp * 0.5),
            };
          }
        }
      }

      const state: PondState = {
        w,
        h,
        style: styleRef.current,
        palette: paletteRef.current,
        lilyPads: pads,
        haviPadIndex: haviPadRef.current,
        jump,
        haviMood: mood,
        fishProgress,
        showHavi: showHaviRef.current,
        tick: tk,
        reducedMotion: reducedRef.current,
        dir: dirRef.current,
      };

      ctx.save();
      ctx.scale(dpr, dpr);
      renderPond(ctx, state);
      ctx.restore();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(todTimer);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        background: "transparent",
        imageRendering: style === "pixel" ? "pixelated" : "auto",
      }}
    />
  );
}
