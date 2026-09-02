"use client";

import { useEffect, useRef } from "react";

const COL: Record<string, string> = {
  k: "#111111",
  G: "#a8d98a",
  d: "#93c974",
  f: "#e88bb5",
  y: "#f2d94e",
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
  ".kkGGGGkkGGGGGGkkGGGGkkGGk..",
  "..kkkkk..kkkkkk..kkkkkkk....",
  "............................",
];

const W = 28;
const H = 21;

function drawHavi(canvas: HTMLCanvasElement, tick: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const s = canvas.width / W;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < BODY.length; y++) {
    for (let x = 0; x < BODY[y].length; x++) {
      const c = BODY[y][x];
      if (c === "." || c === " ") continue;
      ctx.fillStyle = COL[c] || "#000";
      ctx.fillRect(x * s, y * s, s, s);
    }
  }

  // Blinking eyes
  const blink = tick % 40 < 3;
  if (blink) {
    ctx.fillStyle = COL.k;
    ctx.fillRect(7 * s, 10 * s, 4 * s, s);
    ctx.fillRect(17 * s, 10 * s, 4 * s, s);
  } else {
    ctx.fillStyle = COL.k;
    ctx.fillRect(8 * s, 9 * s, 2 * s, 3 * s);
    ctx.fillRect(18 * s, 9 * s, 2 * s, 3 * s);
  }

  // Mouth
  ctx.fillStyle = COL.k;
  ctx.fillRect(12 * s, 13 * s, 4 * s, s);
}

export function HaviLoader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tickRef = useRef(0);

  useEffect(() => {
    let raf: number;
    let last = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (ts - last < 150) return;
      last = ts;
      tickRef.current++;
      if (canvasRef.current) drawHavi(canvasRef.current, tickRef.current);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Read lang from document for bilingual text
  const lang =
    typeof document !== "undefined"
      ? document.documentElement.getAttribute("lang") || "en"
      : "en";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        background: "var(--app-bg, #f3f0ea)",
        zIndex: 9999,
      }}
    >
      <canvas
        ref={canvasRef}
        width={112}
        height={84}
        style={{
          width: 80,
          height: 60,
          imageRendering: "pixelated",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          className="haven-loader-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--color-primary, #477680)",
            animation: "haven-dot-bounce 1.2s ease-in-out infinite",
          }}
        />
        <div
          className="haven-loader-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--color-primary, #477680)",
            animation: "haven-dot-bounce 1.2s ease-in-out 0.2s infinite",
          }}
        />
        <div
          className="haven-loader-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--color-primary, #477680)",
            animation: "haven-dot-bounce 1.2s ease-in-out 0.4s infinite",
          }}
        />
      </div>
      <style>{`
        @keyframes haven-dot-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
