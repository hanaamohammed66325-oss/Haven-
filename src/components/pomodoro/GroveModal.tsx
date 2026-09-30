"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Sun, Moon, Clock, Palette, Plus, Minus, LocateFixed, Eye, EyeOff } from "lucide-react";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/translations/en";
import type { GrovePadSpec } from "@/lib/pomodoro/pondRenderer";
import { LakeWorld, Sky, ZOOM_MS, type Camera, type LakeInput } from "@/lib/pomodoro/lakeWorld";
import { getTimeOfDay, type TimeOfDay } from "@/lib/pomodoro/timeOfDay";
import { clamp, lerp, smooth, easeInOut } from "@/lib/pomodoro/math";
import { GLASS } from "./glass";

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

type View = "auto" | "day" | "night";
const VIEWS: View[] = ["auto", "day", "night"];
const VIEW_META: Record<View, { icon: React.ReactNode; label: TranslationKey }> = {
  auto: { icon: <Clock size={15} />, label: "pom_viewAuto" },
  day: { icon: <Sun size={15} />, label: "pom_viewDay" },
  night: { icon: <Moon size={15} />, label: "pom_viewNight" },
};
const IDLE_MS = 33; // ~30 fps while nothing moves
const SKIP_MS = 260; // a tap during the dive finishes it this quickly

// On short screens (a phone held sideways) the zoom column lies down as a row,
// so it fits between the top bar and an open colour panel.
const SHORT_ROW = "[@media(max-height:500px)]:flex-row";

const todFor = (view: View): TimeOfDay =>
  view === "day" ? "afternoon" : view === "night" ? "night" : getTimeOfDay();

const settle = (q: number) => Math.sin(Math.PI * smooth(0.62, 1, q));

// A camera move between zoom levels (or back to Havi): the camera rises or comes
// down along a log-scale zoom, turns a little on the way and settles.
interface Flight { x0: number; y0: number; s0: number; r0: number; x1: number; y1: number; s1: number; t0: number; dur: number; dir: number }
interface ZoomUi { level: number; count: number; away: boolean }

/**
 * "Your lake": every lily pad the student has grown, as a small world seen from
 * above. Opening it dives down out of the clouds onto the lake, with Havi in the
 * middle surrounded by his pads. The lake grows with the harvest, so the student
 * can zoom out (the camera rises) and pan around it; each subject grows a grove
 * of trees in its colour. The pads can be filtered to one subject, recoloured
 * per subject, and the world viewed by day or night.
 */
export function GroveModal({ open, onClose, lilyPadCount, showHavi, padSpecs, legend, onSetColor }: Props) {
  const { t } = useT();
  const [mounted, setMounted] = useState(false);
  const [filterKey, setFilterKey] = useState<string | null>(null);
  const [view, setView] = useState<View>("auto");
  const [landed, setLanded] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [clean, setClean] = useState(false); // bars hidden: just the lake
  const [zoomUi, setZoomUi] = useState<ZoomUi>({ level: 0, count: 1, away: false });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Read by the render loop without restarting it (a restart would replay the dive),
  // and by the Escape key without re-binding it each time the page re-renders.
  const live = useRef({ padSpecs, filterKey, view, count: lilyPadCount, showHavi, onClose });
  live.current = { padSpecs, filterKey, view, count: lilyPadCount, showHavi, onClose };
  const rebuildRef = useRef<() => void>(() => {});
  const controls = useRef({ zoom: (_dir: 1 | -1) => {}, home: () => {} });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") live.current.onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      setLanded(false);
      setColorsOpen(false);
      setClean(false);
      setZoomUi({ level: 0, count: 1, away: false });
    };
  }, [open]);

  // What the lake shows changed → repaint it (no replayed dive). The subject
  // filter is read live each frame, so it needs no repaint.
  useEffect(() => {
    rebuildRef.current();
  }, [padSpecs, view, lilyPadCount]);

  useEffect(() => {
    if (!open || !mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const world = new LakeWorld();
    const sky = new Sky();
    const size = { w: 0, h: 0, dpr: 1 };
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }; // hover look-around, −1..1
    let ready = false;
    let diveStart = 0;
    let skipAt = -1;
    let skipFrom = 0;
    let landedAt = -1;
    let last = 0;
    let burst = false; // after a rebuild, paint the visible ground at once
    let cam: Camera = { x: 0, y: 0, s: 1, rot: 0 };
    // landed camera: the zoom level, where it rests, a flight in progress, and
    // the glide left over after a drag
    let level = 0;
    const base = { x: 0, y: 0 };
    let flight: Flight | null = null;
    const vel = { x: 0, y: 0 };
    let dragging = false;
    let ui: ZoomUi = { level: -1, count: -1, away: false };

    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (w === size.w && h === size.h && dpr === size.dpr) return false;
      Object.assign(size, { w, h, dpr });
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      return true;
    };
    const input = (): LakeInput => ({
      w: size.w,
      h: size.h,
      dpr: size.dpr,
      count: live.current.count,
      padSpecs: live.current.padSpecs,
      tod: todFor(live.current.view),
      reducedMotion: reduced,
    });
    const build = () => {
      world.build(input());
      sky.build(size.w, size.h, world.night, (A) => world.cameraAtAltitude(A), world.diveTop, world.levels);
      level = Math.min(level, world.levels.length - 1);
      [base.x, base.y] = world.clampCam(base.x, base.y, world.levels[level]);
      flight = null;
      burst = ready && landedAt >= 0;
      ready = true;
      last = 0; // draw the next frame even while idling
    };
    rebuildRef.current = () => {
      if (ready) build();
    };

    const progress = (now: number) => {
      if (reduced) return 1;
      if (skipAt >= 0) return Math.min(1, skipFrom + ((now - skipAt) / SKIP_MS) * (1 - skipFrom));
      return Math.min(1, (now - diveStart) / world.diveMs);
    };
    const landedNow = () => ready && progress(performance.now()) >= 1;

    const fly = (x1: number, y1: number, next: number, dir: number, dur = ZOOM_MS) => {
      const s1 = world.levels[next];
      [x1, y1] = world.clampCam(x1, y1, s1);
      flight = { x0: cam.x, y0: cam.y, s0: cam.s, r0: cam.rot, x1, y1, s1, t0: performance.now(), dur: reduced ? 0 : dur, dir };
      level = next;
      vel.x = vel.y = 0;
      last = 0;
    };
    // One zoom step (dir +1 = closer), about a screen point if given.
    const zoomStep = (dir: 1 | -1, at?: { x: number; y: number }) => {
      if (!landedNow()) return;
      const next = level - dir;
      if (next < 0 || next >= world.levels.length) return;
      const s1 = world.levels[next];
      let x1 = flight ? flight.x1 : base.x;
      let y1 = flight ? flight.y1 : base.y;
      if (at) {
        // keep the spot under the finger / cursor where it is
        const ox = at.x - size.w / 2;
        const oy = at.y - size.h / 2;
        x1 = cam.x + ox / cam.s - ox / s1;
        y1 = cam.y + oy / cam.s - oy / s1;
      }
      fly(x1, y1, next, dir);
    };
    const flyHome = () => {
      if (!landedNow()) return;
      fly(0, 0, 0, level > 0 ? 1 : 0, level > 0 ? ZOOM_MS : ZOOM_MS * 0.7);
    };
    controls.current = { zoom: zoomStep, home: flyHome };

    const pushUi = () => {
      // "back to Havi" once he is near the edge of the screen or off it
      const hx = Math.abs(cam.x) * cam.s;
      const hy = Math.abs(cam.y) * cam.s;
      const away = hx > size.w * 0.42 || hy > size.h * 0.38;
      const next = { level, count: world.levels.length, away };
      if (next.level !== ui.level || next.count !== ui.count || next.away !== ui.away) {
        ui = next;
        setZoomUi(next);
      }
    };

    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!ready || document.hidden) return;
      const p = progress(now);
      const diving = p < 1;
      const gliding = Math.abs(vel.x) + Math.abs(vel.y) > 0.002;
      const moving = diving || flight !== null || dragging || gliding;
      if (!moving && now - last < (reduced ? 120 : IDLE_MS)) return;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      world.filterKey = live.current.filterKey;
      if (diving) {
        cam = world.diveCamera(p);
        // paint the landing spot first, then the view half way down
        world.plan([{ x: 0, y: 0, s: 1, rot: 0 }, world.diveCamera(0.55)], true);
      } else {
        if (landedAt < 0) {
          landedAt = now;
          if (!reduced) world.greet(now);
          setLanded(true);
        }
        if (flight) {
          const f = flight;
          const q = f.dur > 0 ? clamp((now - f.t0) / f.dur, 0, 1) : 1;
          const e = easeInOut(q);
          const s = Math.exp(lerp(Math.log(f.s0), Math.log(f.s1), e)) * (1 + f.dir * 0.022 * settle(q));
          cam = { x: lerp(f.x0, f.x1, e), y: lerp(f.y0, f.y1, e), s, rot: f.r0 * (1 - e) - f.dir * 0.05 * Math.sin(Math.PI * q) };
          world.plan([{ x: f.x1, y: f.y1, s: f.s1, rot: 0 }], true);
          if (q >= 1) {
            base.x = f.x1;
            base.y = f.y1;
            flight = null;
          }
        } else {
          const s = world.levels[level];
          if (!dragging && gliding) {
            base.x += vel.x * dt;
            base.y += vel.y * dt;
            const k = 0.92 ** (dt / 16);
            vel.x *= k;
            vel.y *= k;
          }
          const [cx, cy] = world.clampCam(base.x, base.y, s);
          if (cx !== base.x) vel.x = 0;
          if (cy !== base.y) vel.y = 0;
          base.x = cx;
          base.y = cy;
          pointer.x += (pointer.tx - pointer.x) * 0.08;
          pointer.y += (pointer.ty - pointer.y) * 0.08;
          const drift = reduced ? 0 : 1;
          cam = {
            x: base.x + (pointer.x * 22 + Math.sin(now * 0.00031) * 3 * drift) / s,
            y: base.y + (pointer.y * 16 + Math.cos(now * 0.00027) * 2.4 * drift) / s,
            s,
            rot: 0,
          };
          // get the next levels up and down ready, so a zoom never waits
          const near: Camera[] = [];
          for (const l of [level + 1, level - 1]) {
            if (l < 0 || l >= world.levels.length) continue;
            const [x, y] = world.clampCam(base.x, base.y, world.levels[l]);
            near.push({ x, y, s: world.levels[l], rot: 0 });
          }
          world.plan(near, false);
        }
        pushUi();
      }
      const budget = burst ? 250 : moving ? 4 : 8;
      burst = false;
      world.draw(ctx, cam, now, live.current.showHavi, budget);
      world.drawHaze(ctx, world.hazeAlpha(cam, diving));
      if (diving) sky.drawDive(ctx, size.w, size.h, size.dpr, cam, p);
      else sky.drawWisps(ctx, size.w, size.h, size.dpr, cam, reduced ? 0 : now);
    };

    // Build after the overlay has painted its sky, so the tap feels instant.
    const boot = requestAnimationFrame(() => {
      measure();
      build();
      diveStart = performance.now();
      raf = requestAnimationFrame(loop);
    });

    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (ready && measure()) build();
      }, 150);
    });
    ro.observe(canvas);

    // Pointer: a tap skips the dive, or (landed) pokes Havi / ripples the water;
    // a double tap zooms in there. Dragging pans, with a glide when let go; two
    // fingers pinch between zoom levels; a mouse hovering looks around a little.
    const pts = new Map<number, { x: number; y: number }>();
    let pinch: number | null = null; // finger distance at the last step
    let down: { x: number; y: number; t: number; lx: number; ly: number; lt: number } | null = null;
    let lastTap = { t: -1e9, x: 0, y: 0 };
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const spread = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    const onDown = (e: PointerEvent) => {
      const now = performance.now();
      if (!ready) return;
      if (progress(now) < 1) {
        if (skipAt < 0) {
          skipFrom = progress(now);
          skipAt = now;
        }
        return;
      }
      const q = local(e);
      pts.set(e.pointerId, q);
      canvas.setPointerCapture?.(e.pointerId);
      if (pts.size === 2) {
        pinch = spread().d;
        down = null;
        dragging = false;
        return;
      }
      down = { x: q.x, y: q.y, t: now, lx: q.x, ly: q.y, lt: now };
      vel.x = vel.y = 0;
    };
    const onMove = (e: PointerEvent) => {
      const q = local(e);
      if (pts.has(e.pointerId)) pts.set(e.pointerId, q);
      if (pinch !== null && pts.size >= 2) {
        const sp = spread();
        if (sp.d / pinch > 1.35) {
          zoomStep(1, sp);
          pinch = sp.d;
        } else if (sp.d / pinch < 0.74) {
          zoomStep(-1, sp);
          pinch = sp.d;
        }
        return;
      }
      if (down) {
        const now = performance.now();
        if (!dragging && Math.hypot(q.x - down.x, q.y - down.y) > 6 && !flight) {
          dragging = true;
          canvas.style.cursor = "grabbing";
        }
        if (dragging) {
          const s = world.levels[level];
          const dx = (q.x - down.lx) / s;
          const dy = (q.y - down.ly) / s;
          base.x -= dx;
          base.y -= dy;
          const dtm = Math.max(1, now - down.lt);
          vel.x = vel.x * 0.4 + (-dx / dtm) * 0.6;
          vel.y = vel.y * 0.4 + (-dy / dtm) * 0.6;
        }
        down.lx = q.x;
        down.ly = q.y;
        down.lt = now;
      } else if (e.pointerType === "mouse" && !reduced) {
        pointer.tx = (q.x / size.w) * 2 - 1;
        pointer.ty = (q.y / size.h) * 2 - 1;
      }
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!down) return;
      const now = performance.now();
      const q = local(e);
      if (!dragging && now - down.t < 350 && !flight) {
        if (now - lastTap.t < 320 && Math.hypot(q.x - lastTap.x, q.y - lastTap.y) < 30) {
          zoomStep(1, q);
          lastTap = { t: -1e9, x: 0, y: 0 };
        } else {
          world.tap(q.x, q.y, cam, now);
          lastTap = { t: now, x: q.x, y: q.y };
        }
      }
      if (dragging && now - down.lt > 80) vel.x = vel.y = 0; // held still before letting go
      dragging = false;
      canvas.style.cursor = "grab";
      down = null;
    };
    const onLeave = () => {
      if (!down) pointer.tx = pointer.ty = 0;
    };
    // The wheel (or a trackpad pinch) steps between levels, about the cursor:
    // one step per scroll gesture, however long its momentum runs on.
    let wheelAcc = 0;
    let wheelLast = 0;
    let wheelDone = false;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!landedNow()) return;
      const now = performance.now();
      if (now - wheelLast > 220) {
        wheelAcc = 0;
        wheelDone = false;
      }
      wheelLast = now;
      if (wheelDone) return;
      wheelAcc += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      if (Math.abs(wheelAcc) < 40) return;
      const r = canvas.getBoundingClientRect();
      zoomStep(wheelAcc < 0 ? 1 : -1, { x: e.clientX - r.left, y: e.clientY - r.top });
      wheelDone = true;
    };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "+" || e.key === "=") zoomStep(1);
      else if (e.key === "-" || e.key === "_") zoomStep(-1);
      else if (e.key.startsWith("Arrow") && landedNow() && !flight) {
        const s = world.levels[level];
        const k = 0.9 / s;
        if (e.key === "ArrowLeft") vel.x = -k;
        if (e.key === "ArrowRight") vel.x = k;
        if (e.key === "ArrowUp") vel.y = -k;
        if (e.key === "ArrowDown") vel.y = k;
        e.preventDefault();
      }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(boot);
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onKey);
      rebuildRef.current = () => {};
      controls.current = { zoom: () => {}, home: () => {} };
      world.dispose();
      sky.dispose();
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  const subtitle =
    lilyPadCount <= 0
      ? t("pom_groveEmpty")
      : lilyPadCount === 1
        ? t("pom_groveOne")
        : t("pom_groveCount", { count: lilyPadCount });

  // The HUD fades in once the camera has landed; the student can hide it to see
  // just the lake (the button that brings it back stays).
  const fade = (on: boolean) =>
    `transition-opacity duration-500 ${on ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`;
  const hud = fade(landed && !clean);
  const night = todFor(view) === "night";

  const viewBtn = (v: View) => (
    <button
      key={v}
      onClick={() => setView(v)}
      aria-label={t(VIEW_META[v].label)}
      aria-pressed={view === v}
      title={t(VIEW_META[v].label)}
      className="grid place-items-center rounded-full w-8 h-8 transition-colors"
      style={{ background: view === v ? "rgba(255,255,255,0.22)" : "transparent" }}
    >
      {VIEW_META[v].icon}
    </button>
  );

  const chip = (active: boolean): React.CSSProperties => ({
    background: active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.06)",
    border: `1px solid ${active ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.14)"}`,
  });

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-hidden select-none"
      // the sky the dive starts in, shown while the world is being painted; it
      // fades in over the pond window, which has just risen into the same sky
      style={{ background: night ? "#1c332d" : "#e8f1f2", animation: "haven-overlay-in 0.25s ease both" }}
      role="dialog"
      aria-modal="true"
      aria-label={t("pom_groveTitle")}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        data-tour="pom-lake"
        className="absolute inset-0 block w-full h-full"
        style={{ touchAction: "none", cursor: "grab" }}
      />

      {/* HUD: the top bar, the zoom column centred in the space left between the
          bars (so an open colour panel never covers it), the subjects bar; clear
          of the notch and the home bar */}
      <div
        className="absolute inset-0 flex flex-col pointer-events-none"
        style={{
          paddingTop: "max(12px, env(safe-area-inset-top))",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        {/* top: title + count, day/night, close */}
        <div className="flex items-start justify-between gap-3 px-3 sm:px-5">
          <div className={`rounded-2xl px-4 py-2.5 flex-1 min-w-0 max-w-sm ${hud}`} style={GLASS}>
            <h2 className="font-display text-lg leading-tight">{t("pom_groveTitle")}</h2>
            <p className="text-[13px] mt-0.5" style={{ opacity: 0.8 }}>
              {subtitle}
            </p>
            {legend.length > 0 && (
              <p className="text-[11.5px] mt-1" style={{ opacity: 0.62 }}>
                {t("pom_treeRule")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className={`hidden sm:flex items-center gap-0.5 rounded-full p-1 ${hud}`} style={GLASS}>
              {VIEWS.map((v) => viewBtn(v))}
            </div>
            {/* phones: one button that cycles auto → day → night */}
            <button
              onClick={() => setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length])}
              aria-label={t(VIEW_META[view].label)}
              title={t(VIEW_META[view].label)}
              className={`sm:hidden grid place-items-center rounded-full w-10 h-10 ${hud}`}
              style={GLASS}
            >
              {VIEW_META[view].icon}
            </button>
            <button
              onClick={onClose}
              aria-label={t("close")}
              className={`grid place-items-center rounded-full w-10 h-10 active:scale-95 ${fade(!clean)}`}
              style={GLASS}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* side: zoom levels (the camera rises / comes down), back to Havi, and the
            button that hides the bars for a clean view of the lake (it stays) */}
        <div className="relative flex-1 min-h-0">
          <div className={`absolute end-3 sm:end-5 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 ${SHORT_ROW}`}>
            {zoomUi.count > 1 && (
              <div className={`flex flex-col items-center gap-1 rounded-full p-1 ${SHORT_ROW} ${hud}`} style={GLASS}>
                <button
                  onClick={() => controls.current.zoom(1)}
                  disabled={zoomUi.level === 0}
                  aria-label={t("pom_zoomIn")}
                  title={t("pom_zoomIn")}
                  className="grid place-items-center rounded-full w-9 h-9 transition-opacity disabled:opacity-35"
                >
                  <Plus size={17} />
                </button>
                <div className={`flex flex-col items-center gap-1 p-0.5 ${SHORT_ROW}`} aria-hidden>
                  {Array.from({ length: zoomUi.count }, (_, i) => (
                    <span
                      key={i}
                      className="block rounded-full transition-all duration-300"
                      style={{
                        width: i === zoomUi.level ? 7 : 5,
                        height: i === zoomUi.level ? 7 : 5,
                        background: i === zoomUi.level ? "#f4f1e6" : "rgba(244,241,230,0.35)",
                      }}
                    />
                  ))}
                </div>
                <button
                  onClick={() => controls.current.zoom(-1)}
                  disabled={zoomUi.level === zoomUi.count - 1}
                  aria-label={t("pom_zoomOut")}
                  title={t("pom_zoomOut")}
                  className="grid place-items-center rounded-full w-9 h-9 transition-opacity disabled:opacity-35"
                >
                  <Minus size={17} />
                </button>
              </div>
            )}
            {zoomUi.away && (
              <button
                onClick={() => controls.current.home()}
                aria-label={t("pom_backToHavi")}
                title={t("pom_backToHavi")}
                className={`grid place-items-center rounded-full w-11 h-11 ${hud}`}
                style={GLASS}
              >
                <LocateFixed size={18} />
              </button>
            )}
            <button
              onClick={() => setClean((c) => !c)}
              aria-label={clean ? t("pom_showHud") : t("pom_hideHud")}
              aria-pressed={clean}
              title={clean ? t("pom_showHud") : t("pom_hideHud")}
              className={`grid place-items-center rounded-full w-10 h-10 transition-all duration-500 active:scale-95 ${
                !landed ? "opacity-0 pointer-events-none" : clean ? "opacity-60 hover:opacity-100 pointer-events-auto" : "opacity-100 pointer-events-auto"
              }`}
              style={GLASS}
            >
              {clean ? <Eye size={17} /> : <EyeOff size={17} />}
            </button>
          </div>
        </div>

        {/* bottom: subjects (filter) + each subject's colour */}
        {legend.length > 0 && (
          <div className="flex justify-center px-3 sm:px-5">
            <div className={`w-full max-w-2xl rounded-2xl p-2 ${hud}`} style={GLASS}>
              <div className="flex items-center gap-1.5">
                <div className="flex flex-1 min-w-0 items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  <span className="text-[11px] shrink-0 px-1.5" style={{ opacity: 0.75 }}>
                    {t("pom_filterSubject")}
                  </span>
                  <button
                    onClick={() => setFilterKey(null)}
                    className="shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors"
                    style={chip(filterKey === null)}
                  >
                    {t("pom_allSubjects")}
                  </button>
                  {legend.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setFilterKey((k) => (k === s.key ? null : s.key))}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors"
                      style={chip(filterKey === s.key)}
                    >
                      <span className="inline-block rounded-full" style={{ width: 10, height: 10, background: s.color }} />
                      {s.name}
                      <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{s.count}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setColorsOpen((o) => !o)}
                  aria-label={t("pom_customizePlant")}
                  aria-expanded={colorsOpen}
                  title={t("pom_customizePlant")}
                  className="shrink-0 grid place-items-center rounded-full w-8 h-8 transition-colors"
                  style={chip(colorsOpen)}
                >
                  <Palette size={15} />
                </button>
              </div>

              {colorsOpen && (
                <div className="mt-2 pt-2 px-1.5 border-t" style={{ borderColor: "rgba(255,255,255,0.14)" }}>
                  <p className="text-[11px] mb-1.5" style={{ opacity: 0.75 }}>
                    {t("pom_customizePlant")}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 max-h-[24vh] overflow-y-auto">
                    {legend.map((s) => (
                      <label key={s.key} className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="color"
                          value={s.color}
                          onChange={(e) => onSetColor(s.key, e.target.value)}
                          aria-label={`${s.name} ${t("pom_color")}`}
                          className="rounded-full"
                          style={{ width: 22, height: 22, padding: 0, border: "1px solid rgba(255,255,255,0.3)", background: "none", cursor: "pointer" }}
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
