"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Sun, Moon, Clock } from "lucide-react";
import { useT } from "@/i18n";
import { renderGrove, type GroveState, type GrovePadSpec } from "@/lib/pomodoro/pondRenderer";
import { getTimeOfDay, SKY_PALETTES } from "@/lib/pomodoro/timeOfDay";

interface LegendEntry { key: string; name: string; color: string; count: number }

interface Props {
  open: boolean;
  onClose: () => void;
  /** earned lily pads — one per completed focus session */
  lilyPadCount: number;
  showHavi: boolean;
  /** pad species + bloom per earned pad (by course) */
  padSpecs: GrovePadSpec[];
  /** subjects → colour + count, for the legend / filter */
  legend: LegendEntry[];
  /** change a course's bloom colour */
  onSetColor: (courseId: string, color: string) => void;
}

const FRAME_MS = 66; // ~15 fps, matching the timer scene
type View = "auto" | "day" | "night";

/**
 * A top-down view of every lily pad the student has grown. Each subject grows a
 * distinct plant; the pond can be filtered to one subject, re-shaped per subject,
 * and viewed by day or night. Opened from the Pomodoro page.
 */
export function GroveModal({ open, onClose, lilyPadCount, showHavi, padSpecs, legend, onSetColor }: Props) {
  const { t } = useT();
  const [mounted, setMounted] = useState(false);
  const [filterKey, setFilterKey] = useState<string | null>(null);
  const [view, setView] = useState<View>("auto");
  const overlayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const padSpecsRef = useRef(padSpecs);
  padSpecsRef.current = padSpecs;
  const filterRef = useRef(filterKey);
  filterRef.current = filterKey;
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const size = { w: 720, h: 460, dpr: 1 };
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.round(rect.width));
      const h = Math.max(240, Math.round(rect.height));
      if (w === size.w && h === size.h && dpr === size.dpr) return;
      size.w = w;
      size.h = h;
      size.dpr = dpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);

    let tick = 0;
    let reactStart = -9999;
    const REACT_FRAMES = 34; // ~2.3s of celebrating after a tap

    // Tapping Havi (the centre of the pond) makes him celebrate.
    const onTap = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dx = e.clientX - rect.left - rect.width / 2;
      const dy = e.clientY - rect.top - rect.height / 2;
      if (Math.hypot(dx, dy) < Math.min(rect.width, rect.height) * 0.18) reactStart = tick;
    };
    canvas.addEventListener("pointerdown", onTap);

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      tick++;
      const v = viewRef.current;
      const palette = v === "day" ? SKY_PALETTES.afternoon : v === "night" ? SKY_PALETTES.night : SKY_PALETTES[getTimeOfDay()];
      const state: GroveState = {
        w: size.w,
        h: size.h,
        palette,
        count: lilyPadCount,
        showHavi,
        haviReact: tick - reactStart < REACT_FRAMES,
        padSpecs: padSpecsRef.current,
        filterKey: filterRef.current,
        tick,
        reducedMotion: reduced,
      };
      ctx.save();
      ctx.scale(size.dpr, size.dpr);
      renderGrove(ctx, state);
      ctx.restore();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onTap);
      ro.disconnect();
    };
  }, [open, mounted, lilyPadCount, showHavi]);

  if (!open || !mounted) return null;

  const subtitle =
    lilyPadCount <= 0
      ? t("pom_groveEmpty")
      : lilyPadCount === 1
        ? t("pom_groveOne")
        : t("pom_groveCount", { count: lilyPadCount });

  const viewBtn = (v: View, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setView(v)}
      aria-label={label}
      title={label}
      className="rounded-lg px-2.5 py-1.5 transition-colors"
      style={{
        background: view === v ? "var(--color-primary-soft)" : "transparent",
        color: view === v ? "var(--color-primary)" : "var(--color-muted)",
        border: "1px solid var(--color-border)",
      }}
    >
      {icon}
    </button>
  );

  return createPortal(
    <div
      ref={overlayRef}
      className="haven-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(36, 54, 64, 0.32)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t("pom_groveTitle")}
    >
      <div
        className="haven-modal w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "92dvh", background: "var(--color-surface)", boxShadow: "0 20px 60px rgba(36,54,64,0.22)" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
          <div>
            <h2 className="font-display text-lg" style={{ color: "var(--color-ink)" }}>
              {t("pom_groveTitle")}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
              {subtitle}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {viewBtn("auto", <Clock size={16} />, t("pom_viewAuto"))}
            {viewBtn("day", <Sun size={16} />, t("pom_viewDay"))}
            {viewBtn("night", <Moon size={16} />, t("pom_viewNight"))}
            <button onClick={onClose} className="rounded-full p-1.5 ml-1 transition-colors hover:bg-black/5" aria-label={t("close")}>
              <X size={18} style={{ color: "var(--color-muted)" }} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <canvas
            ref={canvasRef}
            aria-hidden
            className="block w-full rounded-xl"
            style={{ height: "min(58dvh, 440px)", background: "transparent", cursor: "pointer", touchAction: "manipulation" }}
          />

          {legend.length > 0 && (
            <div className="mt-3">
              {/* filter chips */}
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                <span className="text-[11px] me-1" style={{ color: "var(--color-muted)" }}>
                  {t("pom_filterSubject")}
                </span>
                <button
                  onClick={() => setFilterKey(null)}
                  className="rounded-full px-2.5 py-1 text-xs transition-colors"
                  style={{
                    background: filterKey === null ? "var(--color-primary-soft)" : "transparent",
                    color: filterKey === null ? "var(--color-primary)" : "var(--color-muted)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {t("pom_allSubjects")}
                </button>
                {legend.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setFilterKey((k) => (k === s.key ? null : s.key))}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors"
                    style={{
                      background: filterKey === s.key ? "var(--color-primary-soft)" : "transparent",
                      color: "var(--color-ink)",
                      border: `1px solid ${filterKey === s.key ? "var(--color-primary)" : "var(--color-border)"}`,
                    }}
                  >
                    <span className="inline-block rounded-full" style={{ width: 10, height: 10, background: s.color }} />
                    {s.name}
                    <span style={{ color: "var(--color-muted)", fontVariantNumeric: "tabular-nums" }}>{s.count}</span>
                  </button>
                ))}
              </div>

              {/* per-subject colour picker */}
              <p className="text-[11px] mb-1.5" style={{ color: "var(--color-muted)" }}>
                {t("pom_customizePlant")}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {legend.map((s) => (
                  <label key={s.key} className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--color-ink)" }}>
                    <input
                      type="color"
                      value={s.color}
                      onChange={(e) => onSetColor(s.key, e.target.value)}
                      aria-label={`${s.name} ${t("pom_color")}`}
                      className="rounded-full"
                      style={{ width: 22, height: 22, padding: 0, border: "1px solid var(--color-border)", background: "none", cursor: "pointer" }}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
