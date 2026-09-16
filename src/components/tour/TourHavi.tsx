"use client";

import { useEffect, useRef } from "react";

// A small, fully-controllable Havi sprite for the guided tour. The main
// HaviMascot runs an autonomous behaviour engine that perches on cards on its
// own, which can't be driven to an exact element on command — so this is a
// stripped-down twin that renders exactly the pose it's told to, wherever it's
// placed. Poses: "books" (reading, while explaining), "write" (demonstrating).
//
// The pixel BODY + palette + pose frames are copied VERBATIM from HaviMascot.jsx
// so the tour Havi is identical to the one in the app. Keep them in sync.

const COL: Record<string, string> = {
  k: "#111111", G: "#a8d98a", d: "#93c974", f: "#e88bb5", y: "#f2d94e",
  b: "#3b6ea5", L: "#85b7eb", N: "#2b3245", paper: "#f7f5ee", ink: "#8a8780",
  mouthRed: "#c0392b",
};

// 28 x 21 body, no face baked in — identical to HaviMascot.BODY.
const BODY = [
  "............................",
  ".............kk.............",
  "............kffk............",
  "..........kkfyyfkk..........",
  ".......kkkkfffffkkkk........",
  "......kGGGGGkkGGGGGGk.......",
  ".....kGGGGGGGGGGGGGGGk......",
  "....kGGGGGGGGGGGGGGGGGk.....",
  "...kGGGGGGGGGGGGGGGGGGGk....",
  "...kGGGGGGGGGGGGGGGGGGGk....",
  "..kGGGGGGGGGGGGGGGGGGGGGk...",
  "..kGGGGGGGGGGGGGGGGGGGGGk...",
  "..kGGGGGGGGGGGGGGGGGGGGGk...",
  "..kGGGGGGGGGGGGGGGGGGGGGk...",
  ".kGGGGGGGGGGGGGGGGGGGGGGGk..",
  ".kGGGGGGGGGGGGGGGGGGGGGGGk..",
  ".kGGGGGGGGGGGGGGGGGGGGGGGk..",
  ".kGGGGGGGGGGGGGGGGGGGGGGGk..",
  ".kkGGGGkkGGGGGGkkGGGGkkGGk..",
  "..kkkkk..kkkkkk..kkkkkkk....",
  "............................",
];

const GRID_W = 28;
const DRAW_H = 23; // canvas rows: body (21) + room for the dangling books/legs

type Pose = "books" | "write" | "idle";

function px(ctx: CanvasRenderingContext2D, s: number, x: number, y: number, w: number, h: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.fillRect(x * s, y * s, w * s, h * s);
}

function paintBody(ctx: CanvasRenderingContext2D, s: number) {
  for (let y = 0; y < BODY.length; y++) {
    for (let x = 0; x < BODY[y].length; x++) {
      const c = BODY[y][x];
      if (c === "." || c === " ") continue;
      px(ctx, s, x, y, 1, 1, COL[c] || "#000");
    }
  }
}

function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, s: number, pose: Pose) {
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  paintBody(ctx, s);

  if (pose === "books") {
    px(ctx, s, 8, 9, 2, 3, COL.k);
    px(ctx, s, 18, 9, 2, 3, COL.k);
    px(ctx, s, 13, 13, 2, 1, COL.k); // short mouth
    px(ctx, s, 6, 17, 16, 2, "#c0563f"); // red book
    px(ctx, s, 7, 19, 14, 2, COL.b);     // blue book
    px(ctx, s, 6, 21, 16, 2, "#6a9c5a"); // green book
    px(ctx, s, 6, 18, 1, 1, COL.paper);  // page edges
    px(ctx, s, 7, 20, 1, 1, COL.paper);
    px(ctx, s, 6, 22, 1, 1, COL.paper);
    px(ctx, s, 4, 17, 2, 3, COL.G);      // arms holding
    px(ctx, s, 22, 17, 2, 3, COL.G);
  } else if (pose === "write") {
    const cyc = Math.floor(Date.now() / 90) % 30;
    const writing = cyc < 18;
    px(ctx, s, 7, 19, 9, 3, COL.paper);
    if (writing) {
      px(ctx, s, 8, 10, 2, 2, COL.k);
      px(ctx, s, 18, 10, 2, 2, COL.k);
      const penX = 8 + (cyc % 9);
      px(ctx, s, 15, 17, 2, 2, COL.G);
      px(ctx, s, penX, 16, 1, 3, COL.b);
      px(ctx, s, penX, 15, 1, 1, COL.mouthRed);
      for (let m = 0; m < cyc % 9; m++) px(ctx, s, 8 + m, 20, 1, 1, COL.ink);
    } else {
      px(ctx, s, 7, 10, 3, 1, COL.k);
      px(ctx, s, 18, 10, 3, 1, COL.k);
      px(ctx, s, 15, 18, 2, 1, COL.G);
      px(ctx, s, 8, 20, 7, 1, COL.ink);
    }
    px(ctx, s, 12, 13, 4, 1, COL.k);
  } else {
    px(ctx, s, 8, 9, 2, 3, COL.k);
    px(ctx, s, 18, 9, 2, 3, COL.k);
    px(ctx, s, 12, 13, 4, 1, COL.k);
  }
}

// Gentle vertical bob — small amplitude, slow period, so Havi breathes.
function bobFor(pose: Pose, ms: number): number {
  const amp = pose === "write" ? 1 : 0.8;
  const period = pose === "write" ? 900 : 1400;
  return -Math.abs(Math.sin((ms / period) * Math.PI)) * amp;
}

export function TourHavi({ pose, size = 72, reduced = false }: { pose: Pose; size?: number; reduced?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const poseRef = useRef<Pose>(pose);
  poseRef.current = pose;

  // Integer pixel scale → render 1:1 with the display size (no fractional
  // down-scale that would distort the pixels).
  const unit = Math.max(2, Math.round(size / GRID_W));
  const w = GRID_W * unit;
  const h = DRAW_H * unit;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (reduced) {
      drawFrame(ctx, w, h, unit, poseRef.current);
      if (wrap) wrap.style.transform = "translateY(0)";
      return;
    }

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 90) return; // ~11fps is plenty for pixel art
      last = now;
      drawFrame(ctx, w, h, unit, poseRef.current);
      if (wrap) wrap.style.transform = `translateY(${bobFor(poseRef.current, now)}px)`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced, w, h, unit]);

  return (
    <div ref={wrapRef} style={{ width: w, height: h, willChange: "transform" }} aria-hidden>
      <canvas
        ref={canvasRef}
        width={w}
        height={h}
        style={{ width: w, height: h, imageRendering: "pixelated", filter: "drop-shadow(0 3px 6px rgba(0,0,0,.28))" }}
      />
    </div>
  );
}
