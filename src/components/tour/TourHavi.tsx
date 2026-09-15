"use client";

import { useEffect, useRef } from "react";

// A small, fully-controllable Havi sprite for the guided tour. The main
// HaviMascot runs an autonomous behaviour engine that perches on cards on its
// own, which can't be driven to an exact element on command — so this is a
// stripped-down twin that reuses Havi's pixel art but simply renders the pose
// it's told to, wherever it's placed. Poses used by the tour: "books" (reading,
// while explaining) and "write" (while demonstrating an action).
//
// The pixel BODY + palette + the books/write frames are copied from
// HaviMascot.jsx deliberately; keeping this isolated avoids surgery on the
// 1300-line mascot engine. If these ever drift, reconcile with HaviMascot.

const COL: Record<string, string> = {
  k: "#111111", G: "#a8d98a", d: "#93c974", f: "#e88bb5", y: "#f2d94e",
  b: "#3b6ea5", L: "#85b7eb", N: "#2b3245", paper: "#f7f5ee", ink: "#8a8780",
  mouthRed: "#c0392b",
};

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
  ".kGGGGGGGGGGGGGGGGGGGGGGGk..",
  ".kGGGGGGGGGGGGGGGGGGGGGGGk..",
  ".kGGGGGGGGGGGGGGGGGGGGGGGk..",
  ".kkGGGGkkGGGGGGkkGGGGkkGGk..",
  "..kkkkk..kkkkkk..kkkkkkk....",
  "............................",
];

const GRID_W = 28;

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

function drawFrame(canvas: HTMLCanvasElement, pose: Pose, t: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const s = canvas.width / GRID_W;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  paintBody(ctx, s);

  if (pose === "books") {
    px(ctx, s, 8, 9, 2, 3, COL.k);
    px(ctx, s, 18, 9, 2, 3, COL.k);
    px(ctx, s, 13, 13, 2, 1, COL.k);
    const bob = Math.abs(Math.sin(t / 5)) > 0.5 ? 1 : 0;
    px(ctx, s, 6, 17 - bob, 16, 2, "#c0563f"); // red book
    px(ctx, s, 7, 19 - bob, 14, 2, COL.b); // blue book
    px(ctx, s, 6, 21 - bob, 16, 2, "#6a9c5a"); // green book
    px(ctx, s, 6, 18 - bob, 1, 1, COL.paper);
    px(ctx, s, 7, 20 - bob, 1, 1, COL.paper);
    px(ctx, s, 6, 22 - bob, 1, 1, COL.paper);
    px(ctx, s, 4, 17 - bob, 2, 3, COL.G); // arms
    px(ctx, s, 22, 17 - bob, 2, 3, COL.G);
  } else if (pose === "write") {
    const cyc = t % 30;
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

function bobFor(pose: Pose, t: number): number {
  if (pose === "write") return Math.abs(Math.sin(t / 6)) * -2;
  if (pose === "books") return Math.abs(Math.sin(t / 5)) * -1.5;
  return Math.abs(Math.sin(t / 6)) * -2;
}

export function TourHavi({ pose, size = 64, reduced = false }: { pose: Pose; size?: number; reduced?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef<Pose>(pose);
  poseRef.current = pose;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let t = 0;
    const draw = () => {
      t += 1;
      drawFrame(canvas, poseRef.current, t);
      canvas.style.transform = `translateY(${reduced ? 0 : bobFor(poseRef.current, t)}px)`;
      raf = requestAnimationFrame(draw);
    };
    // ~12fps is plenty for pixel art and keeps it cheap.
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 80) return;
      last = now;
      draw();
    };
    if (reduced) {
      drawFrame(canvas, poseRef.current, 0);
    } else {
      raf = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const h = Math.round((size / GRID_W) * 23);
  return (
    <canvas
      ref={canvasRef}
      width={GRID_W * 3}
      height={23 * 3}
      style={{ width: size, height: h, imageRendering: "pixelated", filter: "drop-shadow(0 3px 6px rgba(0,0,0,.28))" }}
      aria-hidden
    />
  );
}
