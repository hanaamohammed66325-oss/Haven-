"use client";
import { useEffect, useRef } from "react";
import { drawSocialHavi } from "@/lib/study/havi";

export function StudyHaviIcon({ color }: { color: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 88, 88);
    drawSocialHavi(ctx, 44, 32, 1.5, 0, "study", 0, color, true);
  }, [color]);
  return <canvas ref={canvas} width={88} height={88} aria-hidden className="h-11 w-11 shrink-0" />;
}
