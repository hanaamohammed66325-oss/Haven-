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
  const drawFrame = useRef<((delta: number) => void) | null>(null);
  const zoomCommand = useRef<((factor: number) => void) | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const pointerPosition = useRef({ x: 0, y: 0 });
  const [shot, setShot] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // The close crop needs a 2x source even on a 1x laptop screen.
    const dpr = 2;
    const source = document.createElement("canvas");
    source.width = canvas.width = Math.round(WIDTH * dpr);
    source.height = canvas.height = Math.round(HEIGHT * dpr);
    const sourceCtx = source.getContext("2d");
    if (!sourceCtx) return;
    const scene = new StudyScene(WIDTH, HEIGHT, dpr);
    clock.current = reduced ? arriveAt : 0;
    let renderTime = performance.now(), lastShot = -1, lastHovered: string | null = null, gardenFramed = false;
    let currentScale = framing(clock.current);
    const camera = { zoom: 1, x: 0, y: 0 };
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
      const sw = source.width / currentScale, sh = source.height / currentScale;
      const boundX = (WIDTH - WIDTH / currentScale) / 2, boundY = (HEIGHT - HEIGHT / currentScale) / 2;
      camera.x = Math.max(-boundX, Math.min(boundX, camera.x)); camera.y = Math.max(-boundY, Math.min(boundY, camera.y));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, (source.width - sw) / 2 + camera.x * dpr, (source.height - sh) / 2 + camera.y * dpr, sw, sh, 0, 0, canvas.width, canvas.height);
      const next = shotAt(time);
      if (next !== lastShot) { lastShot = next; setShot(next); }
      const owner = scene.hoveredMember;
      if (owner !== lastHovered) { lastHovered = owner; setHovered(owner); }
    };
    // Inverse of the presentation crop: the renderer still owns hit testing.
    const locate = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
      pointer.current = { x: WIDTH / 2 + camera.x + (x - .5) * WIDTH / currentScale, y: HEIGHT / 2 + camera.y + (y - .5) * HEIGHT / currentScale };
      pointerPosition.current = { x: x * 100, y: y * 100 };
      paint(0);
      return { x, y };
    };
    const zoom = (factor: number, at = { x: .5, y: .5 }, immediate = false) => {
      cameraMotion?.stop();
      const base = framing(clock.current), from = { ...camera };
      const scale = factor === 0 ? base : Math.max(1, Math.min(6, currentScale * factor));
      const target = { zoom: scale / base, x: factor === 0 ? 0 : camera.x + (at.x - .5) * WIDTH * (1 / currentScale - 1 / scale),
        y: factor === 0 ? 0 : camera.y + (at.y - .5) * HEIGHT * (1 / currentScale - 1 / scale) };
      const update = (q: number) => { camera.zoom = from.zoom + (target.zoom - from.zoom) * q;
        camera.x = from.x + (target.x - from.x) * q; camera.y = from.y + (target.y - from.y) * q; paint(0); };
      if (reduced || immediate) update(1);
      else cameraMotion = animate(0, 1, { duration: .22, ease: [.22, 1, .36, 1], onUpdate: update });
    };
    zoomCommand.current = zoom;
    const down = (event: PointerEvent) => {
      cameraMotion?.stop(); touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId); locate(event);
    };
    const move = (event: PointerEvent) => {
      const old = touches.get(event.pointerId), rect = canvas.getBoundingClientRect();
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
        camera.y += (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0) * 55 / currentScale; paint(0); }
    };
    const leave = () => { pointer.current = null; paint(0); };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("keydown", key);
    drawFrame.current = paint;
    paint(0);
    return () => {
      drawFrame.current = null;
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
    if (paused || reduced) return;
    let raf = 0, previous = performance.now(), lastPaint = previous, pending = 0;
    const tick = (now: number) => {
      const delta = document.hidden ? 0 : Math.min(now - previous, 80);
      previous = now;
      pending += delta;
      if (!document.hidden && now - lastPaint >= 1000 / 30) {
        drawFrame.current?.(pending); pending = 0; lastPaint = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, reduced, replay]);

  const captions = ["whatsnew_groupWorking", "whatsnew_groupWorking", "whatsnew_groupGrowing", "whatsnew_groupTravelling", "whatsnew_groupGarden", "whatsnew_groupAgain"] as const;
  const owner = participants.find(member => member.id === hovered);
  return <>
    <canvas ref={canvasRef} className={css.interactiveLake} tabIndex={0} data-film-shot={shot} aria-label={t("whatsnew_groups_demo")} aria-describedby="whatsnew-camera-hint" />
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
