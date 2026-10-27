"use client";

import { useEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LocateFixed, Minus, Plus } from "@/components/motion/icons";
import { useT } from "@/i18n";
import { StudyScene, type SceneModel } from "@/lib/study/scene";
import css from "./journey.module.css";

// The production scene receives sample inputs only. All desks, wardrobe,
// arrivals, flower growth, river travel, trees and water use its real renderer.
const participants = [
  { id: "film-sara", ar: "سارة", en: "Sara", color: "#e8a2b6", flower: "#e9a3c0", cosmetics: ["flower"], leaves: 7 },
  { id: "film-noura", ar: "نورة", en: "Noura", color: "#a8c9e7", flower: "#9abde8", cosmetics: ["headphones"], leaves: 8 },
  { id: "film-reem", ar: "ريم", en: "Reem", color: "#b7d797", flower: "#b0ca82", cosmetics: ["scarf"], leaves: 6 },
  { id: "film-lina", ar: "لينا", en: "Lina", color: "#c0afe0", flower: "#bc9bde", cosmetics: ["crown"], leaves: 9 },
  { id: "film-maryam", ar: "مريم", en: "Maryam", color: "#dfb38e", flower: "#edbd70", cosmetics: ["gradcap"], leaves: 5 },
];
const contributors = participants;
const harvest = contributors.flatMap(member => Array<string>(member.leaves).fill(member.id));
const harvestFlowers = new Map(participants.map(member => [member.id, member.flower]));
const awake = new Map(participants.map(member => [member.id, true]));
const selected = new Set<string>();
const places = [3, 5].map(count => participants.slice(0, count).map(member => ({ userId: member.id, away: false })));
const members = [3, 5].map(count => new Map(participants.slice(0, count).map(member => [member.id, member])));
const WIDTH = 900, HEIGHT = 540;
const cameraControls = [
  { factor: 1.25, Icon: Plus, label: "pom_zoomIn" },
  { factor: .8, Icon: Minus, label: "pom_zoomOut" },
  { factor: 0, Icon: LocateFixed, label: "whatsnew_cameraReset" },
] as const;
const growAt = 7500, travelAt = 11_500, arriveAt = 16_000, returnAt = 21_000, loopMs = 25_000;
const smooth = (value: number) => { const q = Math.max(0, Math.min(1, value)); return q * q * (3 - 2 * q); };
function shotAt(time: number) { return time < 3500 ? 0 : time < growAt ? 1 : time < travelAt ? 2 : time < arriveAt ? 3 : time < returnAt ? 4 : 5; }
function framing(time: number) {
  if (time >= returnAt) return 1.15 + 1.45 * smooth((time - returnAt - 2200) / 1800);
  if (time < 3500) return 2.6;
  if (time < growAt) return 2.6 - .15 * smooth((time - 3500) / 1300);
  if (time < travelAt - 1000) return 2.45 + .3 * smooth((time - growAt) / 1300);
  return 2.75 - 1.6 * smooth((time - travelAt + 1000) / 1000);
}

export function GroupLakeFilm({ paused, replay }: { paused: boolean; replay: number }) {
  const { t, lang } = useT();
  const reduced = !!useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0);
  const setPlayback = useRef<((playing: boolean) => void) | null>(null);
  const zoomCommand = useRef<((factor: number) => void) | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const pointerPosition = useRef({ x: 0, y: 0 });
  const [shot, setShot] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  // Local profiling only; inspect rendered DOM attributes without account data.
  const frameStats = useRef({ start: 0, ticks: 0, frames: 0, costs: [] as number[], samples: [] as object[] });

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    const viewport = canvas?.parentElement;
    if (!canvas || !ctx || !viewport) return;
    // The close crop needs a 2x source even on a 1x laptop screen.
    const dpr = 2;
    const source = canvas;
    source.width = Math.round(WIDTH * dpr);
    source.height = Math.round(HEIGHT * dpr);
    // The browser compositor crops the original canvas. Avoid an intermediate
    // bitmap and a second full drawImage/upload on every animation frame.
    const sourceCtx = ctx;
    const scene = new StudyScene(WIDTH, HEIGHT, dpr);
    frameStats.current = { start: performance.now(), ticks: 0, frames: 0, costs: [], samples: [] };
    clock.current = reduced ? arriveAt : 0;
    let renderTime = performance.now(), lastShot = -1, lastHovered: string | null = null, gardenFramed = false;
    let currentScale = framing(clock.current);
    const camera = { zoom: 1, x: 0, y: 0 };
    let raf = 0, previous = performance.now(), playing = false, dirty = false;
    const touches = new Map<number, { x: number; y: number }>();
    let cameraMotion: { stop(): void } | null = null;
    const modelAt = (time: number): SceneModel => {
      const shot = shotAt(time), returning = time >= returnAt, achievement = time >= travelAt && !returning;
      return {
        night: false, reduced, view: achievement ? "achievement" : "session", phase: "study",
        progress: time < growAt ? .12 : .12 + .88 * smooth((time - growAt) / 3500),
        places: places[returning ? 0 : Math.min(shot, 1)], members: members[returning ? 0 : Math.min(shot, 1)],
        awake, harvest, harvestFlowers, selected, pointer: pointer.current, serverTime: renderTime,
      };
    };
    // Prepare the genuine lake before presenting its first close shot. This
    // skips only the initial sky dive, never the later river transition.
    const model = modelAt(clock.current);
    scene.draw(sourceCtx, Math.max(1, renderTime - 15_000), model);
    scene.draw(sourceCtx, renderTime, model);
    const paint = (delta: number) => {
      const measuredAt = process.env.NODE_ENV === "development" ? performance.now() : 0;
      // On a freshly opened tab, allow the original entry to settle before
      // counting the first studying shot. Its internal start must be positive.
      if (scene.ui.landed || clock.current > 0) {
        const next = clock.current + delta;
        if (next >= loopMs) gardenFramed = false;
        clock.current = next % loopMs;
      }
      const time = clock.current;
      renderTime += delta;
      currentScale = Math.max(1, Math.min(6, framing(time) * camera.zoom));
      scene.draw(sourceCtx, renderTime, modelAt(time));
      if (time >= arriveAt && time < returnAt && scene.ui.landed && !gardenFramed) {
        // Use the lake's real rising camera to reveal the coloured groves.
        // Re-anchor only at this settled shot; a pause never skips a flight.
        renderTime = performance.now();
        for (let level = scene.ui.level; level < scene.ui.count - 1; level++) scene.zoomStep(-1);
        gardenFramed = true;
        scene.draw(sourceCtx, renderTime, modelAt(time));
      }
      const boundX = (WIDTH - WIDTH / currentScale) / 2, boundY = (HEIGHT - HEIGHT / currentScale) / 2;
      camera.x = Math.max(-boundX, Math.min(boundX, camera.x)); camera.y = Math.max(-boundY, Math.min(boundY, camera.y));
      canvas.style.transform = `scale(${currentScale}) translate(${-camera.x / WIDTH * 100}%,${-camera.y / HEIGHT * 100}%)`;
      const next = shotAt(time);
      if (next !== lastShot) { lastShot = next; setShot(next); }
      const owner = scene.hoveredMember;
      if (owner !== lastHovered) { lastHovered = owner; setHovered(owner); }
      if (process.env.NODE_ENV === "development" && delta > 0) {
        const end = performance.now(), stats = frameStats.current;
        stats.frames++; stats.costs.push(end - measuredAt);
        const elapsed = end - stats.start;
        if (elapsed >= 1000) {
          const costs = stats.costs.sort((a, b) => a - b);
          stats.samples.push({ shot: next, fps: +(stats.frames * 1000 / elapsed).toFixed(1), refresh: +(stats.ticks * 1000 / elapsed).toFixed(1),
            p95Ms: +costs[Math.min(costs.length - 1, Math.floor(costs.length * .95))].toFixed(2), maxMs: +costs.at(-1)!.toFixed(2),
            source: `${source.width}x${source.height}`, presentation: "compositor", canvases: 1 });
          if (stats.samples.length > 40) stats.samples.shift();
          canvas.dataset.filmSamples = JSON.stringify(stats.samples);
          stats.start = end; stats.ticks = stats.frames = 0; stats.costs = [];
        }
      }
    };
    const resetMeasurement = () => {
      const stats = frameStats.current;
      stats.start = performance.now(); stats.ticks = stats.frames = 0; stats.costs = [];
    };
    // Animation, gestures, Motion camera updates and resize share one frame.
    // RAF follows the display cadence: no fixed 30/60 FPS timer or dropped tick.
    const tick = (now: number) => {
      raf = 0;
      if (document.hidden) { previous = now; return; }
      const delta = playing ? Math.max(0, Math.min(now - previous, 80)) : 0;
      previous = now;
      if (playing || dirty) {
        dirty = false;
        if (process.env.NODE_ENV === "development" && playing) frameStats.current.ticks++;
        paint(delta);
      }
      if (playing) raf = requestAnimationFrame(tick);
    };
    const invalidate = () => {
      dirty = true;
      if (!raf && !document.hidden) raf = requestAnimationFrame(tick);
    };
    setPlayback.current = (next) => {
      if (playing === next) return;
      playing = next; previous = performance.now(); resetMeasurement();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (playing) invalidate();
    };
    const visibility = () => {
      previous = performance.now(); resetMeasurement();
      if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; }
      else invalidate();
    };
    document.addEventListener("visibilitychange", visibility);
    // Inverse of the presentation crop: the renderer still owns hit testing.
    const locate = (event: { clientX: number; clientY: number }) => {
      const rect = viewport.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
      pointer.current = { x: WIDTH / 2 + camera.x + (x - .5) * WIDTH / currentScale, y: HEIGHT / 2 + camera.y + (y - .5) * HEIGHT / currentScale };
      pointerPosition.current = { x: x * 100, y: y * 100 };
      invalidate();
      return { x, y };
    };
    const zoom = (factor: number, at = { x: .5, y: .5 }, immediate = false) => {
      cameraMotion?.stop();
      const base = framing(clock.current), from = { ...camera };
      const scale = factor === 0 ? base : Math.max(1, Math.min(6, currentScale * factor));
      const target = { zoom: scale / base, x: factor === 0 ? 0 : camera.x + (at.x - .5) * WIDTH * (1 / currentScale - 1 / scale),
        y: factor === 0 ? 0 : camera.y + (at.y - .5) * HEIGHT * (1 / currentScale - 1 / scale) };
      const update = (q: number) => { camera.zoom = from.zoom + (target.zoom - from.zoom) * q;
        camera.x = from.x + (target.x - from.x) * q; camera.y = from.y + (target.y - from.y) * q;
        currentScale = Math.max(1, Math.min(6, framing(clock.current) * camera.zoom)); invalidate(); };
      if (reduced || immediate) update(1);
      else cameraMotion = animate(0, 1, { duration: .22, ease: [.22, 1, .36, 1], onUpdate: update });
    };
    zoomCommand.current = zoom;
    const down = (event: PointerEvent) => {
      cameraMotion?.stop(); touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId); locate(event);
    };
    const move = (event: PointerEvent) => {
      const old = touches.get(event.pointerId), rect = viewport.getBoundingClientRect();
      if (old) {
        const before = [...touches.values()];
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const after = [...touches.values()];
        if (before.length === 2) {
          const distance = (points: typeof before) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
          const prior = distance(before);
          if (prior > 2) zoom(distance(after) / prior, { x: ((after[0].x + after[1].x) / 2 - rect.left) / rect.width,
            y: ((after[0].y + after[1].y) / 2 - rect.top) / rect.height }, true);
        } else if (before.length === 1) {
          camera.x -= (event.clientX - old.x) / rect.width * WIDTH / currentScale;
          camera.y -= (event.clientY - old.y) / rect.height * HEIGHT / currentScale;
        }
      }
      locate(event);
    };
    const up = (event: PointerEvent) => { touches.delete(event.pointerId); if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); };
    const wheel = (event: WheelEvent) => { event.preventDefault(); zoom(Math.exp(-Math.max(-80, Math.min(80, event.deltaY)) * .004), locate(event)); };
    const key = (event: KeyboardEvent) => {
      if (["+", "=", "-", "_", "Home"].includes(event.key)) { event.preventDefault(); zoom(event.key === "Home" ? 0 : ["+", "="].includes(event.key) ? 1.25 : .8); }
      else if (event.key.startsWith("Arrow")) { event.preventDefault();
        camera.x += (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0) * 55 / currentScale;
        camera.y += (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0) * 55 / currentScale; invalidate(); }
    };
    const leave = () => { pointer.current = null; invalidate(); };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("keydown", key);
    paint(0);
    return () => {
      setPlayback.current = null;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", visibility);
      zoomCommand.current = null; cameraMotion?.stop(); touches.clear();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("keydown", key);
      scene.dispose(); source.width = source.height = 0;
    };
  }, [replay, reduced]);

  useEffect(() => {
    setPlayback.current?.(!paused && !reduced);
  }, [paused, reduced, replay]);

  const captions = ["whatsnew_groupWorking", "whatsnew_groupWorking", "whatsnew_groupGrowing", "whatsnew_groupTravelling", "whatsnew_groupGarden", "whatsnew_groupAgain"] as const;
  const owner = participants.find(member => member.id === hovered);
  return <>
    <div className={css.filmViewport}>
      <canvas ref={canvasRef} className={css.interactiveLake} tabIndex={0} data-film-shot={shot} aria-label={t("whatsnew_groups_demo")} aria-describedby="whatsnew-camera-hint" />
    </div>
    <div className={css.filmCamera}>
      {cameraControls.map(({ factor, Icon, label }) => <motion.button key={label} type="button" className={css.sceneButton} onClick={() => zoomCommand.current?.(factor)}
        aria-label={t(label)} whileTap={{ scale: .9 }}><Icon size={13} /></motion.button>)}
    </div>
    <div className={css.filmHeading}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={shot} initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -5 }}
          transition={{ duration: reduced ? 0 : .2 }}>{shot < 2 ? t("whatsnew_groupMembers", { n: [3, 5][shot] }) : t(captions[shot])}</motion.span>
      </AnimatePresence>
    </div>
    {owner && <span className={css.filmName} style={{ left: `${pointerPosition.current.x}%`, top: `${Math.min(78, pointerPosition.current.y)}%` }}>{lang === "ar" ? owner.ar : owner.en}</span>}
    <AnimatePresence>
      {shot === 4 && <motion.div className={css.filmRoster} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
        {contributors.map(member => <span key={member.id}><i style={{ background: member.flower }} />{lang === "ar" ? member.ar : member.en}</span>)}
      </motion.div>}
    </AnimatePresence>
    <span id="whatsnew-camera-hint" className={css.sceneCaption}>{t("whatsnew_cameraHint")}</span>
  </>;
}
