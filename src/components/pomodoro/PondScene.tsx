"use client";

import { useEffect, useRef } from "react";
import { PondView, type HudBox, type PondHud, type TrailPad } from "@/lib/pomodoro/pondView";
import type { GrovePadSpec, HaviMood } from "@/lib/pomodoro/pondRenderer";
import { clamp, smooth, lerp, easeInOut, easeOutCubic } from "@/lib/pomodoro/math";
import { getTimeOfDay, type TimeOfDay } from "@/lib/pomodoro/timeOfDay";

interface Props {
  /** finished focus sessions: the home pad + one pad each */
  lilyPadCount: number;
  /** the subject of each recorded session, oldest first (pad flowers + groves) */
  padSpecs: GrovePadSpec[];
  baseMood: "idle" | "studying" | "resting";
  /** 0..1 through the focus session that is running or paused, else null */
  focusProgress: number | null;
  /** the colour of the subject being studied (the flower on the growing pad) */
  focusColor: string | null;
  showHavi: boolean;
  /** bump to trigger: the grown pad firms up and Havi jumps onto it */
  celebrateSignal: number;
  /** bump to trigger: the pad behind Havi withers and he is sad */
  witherSignal: number;
  /** the camera rises into the clouds (opening "your lake"); onLifted fires at the top */
  lifted: boolean;
  onLifted: () => void;
  /** the timer written into the sky (its pulse is played here), or none */
  hud: Omit<PondHud, "pulse"> | null;
  /** where the timer sits, whenever the window is laid out anew */
  onHudLayout?: (box: HudBox) => void;
}

const FRAME_MS = 33; // ~30 fps
const JUMP_MS = 1070;
const FISH_MS = 2800; // Havi reels the desk up at the start of a session
const REACT_MS = 3470; // celebrate / sad hold
const FIRM_MS = 1700; // the grown pad firms up
const DEATH_MS = 2770; // an abandoned pad browns and sinks for good
const OPEN_MS = 1400; // the new pad's flower opens
const RISE_MS = 750; // up into the clouds, or back down
const GROW_MS = 600; // the growing pad appears / sinks away
const PULSE_MS = 1800; // the numerals glow as a session starts and when it is done

const easeOutBack = (q: number) => 1 + 2.2 * (q - 1) ** 3 + 1.2 * (q - 1) ** 2;

export function PondScene(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;
  const viewRef = useRef<PondView | null>(null);
  // the trail of pads and Havi's story on it
  const st = useRef({
    count: props.lilyPadCount,
    haviPad: props.lilyPadCount,
    jump: null as { from: number; to: number; start: number } | null,
    react: null as { mood: HaviMood; start: number } | null,
    dying: null as { index: number; start: number } | null,
    dead: new Set<number>(), // abandoned pads never come back
    firm: new Map<number, { alpha: number; grow: number; start: number }>(),
    opening: new Map<number, number>(), // pad → when its flower starts to open
    snapAt: 0, // the count changed without a celebration: move Havi to the newest pad
    grown: { vis: 0, prog: 0, alpha: 0, grow: 0.3 }, // the pad growing with the session
    celebrateSeen: props.celebrateSignal,
    pulseAt: -1e9,
    witherSeen: props.witherSignal,
  });

  // New sessions: pad colours and the groves on the far bank follow the data.
  useEffect(() => {
    const s = st.current;
    if (props.lilyPadCount !== s.count) {
      s.count = props.lilyPadCount;
      s.haviPad = Math.min(s.haviPad, s.count);
      s.snapAt = performance.now();
    }
    viewRef.current?.setData(props.padSpecs, props.lilyPadCount, s.haviPad);
  }, [props.lilyPadCount, props.padSpecs]);

  // A session done: the pad that grew with it firms up, its flower opens and
  // Havi jumps onto it.
  useEffect(() => {
    const s = st.current;
    if (props.celebrateSignal === s.celebrateSeen) return;
    s.celebrateSeen = props.celebrateSignal;
    const now = performance.now();
    const idx = s.count;
    s.snapAt = 0;
    s.firm.set(idx, { alpha: Math.max(0.3, s.grown.alpha), grow: Math.max(0.4, s.grown.grow), start: now });
    s.opening.set(idx, now + JUMP_MS * 0.7);
    s.grown = { vis: 0, prog: 0, alpha: 0, grow: 0.3 };
    s.jump = { from: s.haviPad, to: idx, start: now };
    s.pulseAt = now;
  }, [props.celebrateSignal]);

  // A session abandoned: the pad behind Havi browns and sinks while he watches, sad.
  useEffect(() => {
    const s = st.current;
    if (props.witherSignal === s.witherSeen) return;
    s.witherSeen = props.witherSignal;
    const now = performance.now();
    const idx = s.haviPad - 1;
    if (idx >= 0 && !s.dead.has(idx)) s.dying = { index: idx, start: now };
    s.react = { mood: "sad", start: now };
  }, [props.witherSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const view = new PondView();
    viewRef.current = view;
    const size = { w: 0, h: 0, dpr: 1 };
    let tod: TimeOfDay = getTimeOfDay();
    let rtl = false; // the page's direction: the scene is mirrored in Arabic
    let ready = false;
    let visible = true;
    let cam = 0;
    let camSet = false;
    const look = { x: 0, tx: 0 };
    let rise = live.current.lifted ? 1 : 0;
    let risen = false;
    let studyStart = -1e9;
    let prevBase = live.current.baseMood;
    let last = 0;

    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.round(rect.width));
      const h = Math.max(200, Math.round(rect.height));
      if (w === size.w && h === size.h && dpr === size.dpr) return false;
      Object.assign(size, { w, h, dpr });
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      return true;
    };
    const build = () => {
      const s = st.current;
      rtl = getComputedStyle(canvas).direction === "rtl";
      view.build({ ...size, tod, rtl, padSpecs: live.current.padSpecs, count: s.count, haviPad: s.haviPad, reducedMotion: reduced });
      ready = true;
      last = 0;
      live.current.onHudLayout?.(view.hud());
    };
    measure();
    build();
    // the numerals' and the label's fonts: repaint once each has arrived
    for (const font of [`400 100px Fraunces`, `500 14px Tajawal`]) document.fonts?.load(font).then(() => view.resetHud(), () => {});

    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (measure()) build();
      }, 120);
    });
    ro.observe(canvas);
    // the light turns with the real clock: cross-fade into the new time of day
    const todTimer = window.setInterval(() => {
      const next = getTimeOfDay();
      if (next === tod) return;
      tod = next;
      view.crossfade(canvas);
      build();
    }, 60 * 1000);
    // nothing to draw while the window is scrolled away
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(canvas);

    // a pointer's x in the scene (mirrored in Arabic)
    const sceneX = (e: PointerEvent, r: DOMRect) => (rtl ? r.right - e.clientX : e.clientX - r.left);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = canvas.getBoundingClientRect();
      look.tx = clamp((sceneX(e, r) / r.width - 0.5) * 2, -1, 1);
    };
    const onLeave = () => {
      look.tx = 0;
    };
    // a tap on Havi (when he isn't studying) makes him happy
    const onTap = (e: PointerEvent) => {
      const p = live.current;
      const s = st.current;
      if (!p.showHavi || s.jump || p.baseMood === "studying") return;
      const r = canvas.getBoundingClientRect();
      if (view.onHavi(s.haviPad, cam, sceneX(e, r), e.clientY - r.top)) s.react = { mood: "celebrating", start: performance.now() };
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerup", onTap);

    // up in the clouds: open the lake, once
    const settleRise = (want: number) => {
      if (want && rise >= 1 && !risen) {
        risen = true;
        live.current.onLifted();
      }
      if (!want) risen = false;
    };

    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const p = live.current;
      if (!ready) return;
      const want = p.lifted ? 1 : 0;
      if (!visible || document.hidden) {
        // out of sight: skip the ride, but still open the lake at once
        rise = want;
        settleRise(want);
        return;
      }
      if (now - last < FRAME_MS) return;
      if (want && risen && rise >= 1) return; // up in the clouds behind the lake
      const dt = last ? Math.min(100, now - last) : FRAME_MS;
      last = now;
      const s = st.current;

      // Havi's mood
      const base = p.baseMood;
      if (base === "studying" && prevBase !== "studying") {
        studyStart = now;
        s.pulseAt = now; // the sky lights up as the session begins
      }
      prevBase = base;
      let mood: HaviMood = base;
      let fish = 0;
      if (base === "studying" && now - studyStart < FISH_MS) {
        mood = "fishing";
        fish = (now - studyStart) / FISH_MS;
      }
      let jump: { from: number; to: number; p: number } | null = null;
      if (s.jump) {
        const q = (now - s.jump.start) / JUMP_MS;
        if (q >= 1) {
          s.haviPad = s.jump.to;
          s.react = { mood: "celebrating", start: now };
          s.jump = null;
        } else jump = { from: s.jump.from, to: s.jump.to, p: q };
      }
      if (!s.jump && s.snapAt && now - s.snapAt > 120) {
        s.haviPad = s.count;
        s.snapAt = 0;
      }
      if (jump) mood = "jumping";
      else if (s.react) {
        if (now - s.react.start >= REACT_MS) s.react = null;
        else mood = s.react.mood;
      }

      // the next pad grows with the session (and sinks away if it is abandoned)
      const gr = s.grown;
      if (p.focusProgress != null) gr.prog = clamp(p.focusProgress, 0, 1);
      gr.vis = clamp(gr.vis + ((p.focusProgress != null && !s.jump ? 1 : -1) * dt) / GROW_MS, 0, 1);
      gr.grow = (0.3 + 0.7 * (1 - (1 - gr.prog) ** 2)) * (0.7 + 0.3 * gr.vis);
      gr.alpha = (0.25 + 0.5 * gr.prog) * gr.vis;

      // the camera follows Havi (and looks back at a pad that is dying)
      let active = jump ? lerp(view.padX(jump.from), view.padX(jump.to), easeInOut(jump.p)) : view.padX(s.haviPad);
      if (s.dying) active = (active + view.padX(s.dying.index)) / 2;
      const target = view.camFor(active);
      if (!camSet || reduced) {
        cam = target;
        camSet = true;
      } else cam += (target - cam) * (1 - 0.91 ** (dt / 66));
      look.x += (look.tx - look.x) * (1 - 0.94 ** (dt / 16));

      const pads: TrailPad[] = [];
      const [i0, i1] = view.padRange(cam);
      for (let i = Math.max(0, i0); i <= Math.min(s.count, i1); i++) {
        if (s.dead.has(i)) continue;
        let alpha = 1;
        let grow = 1;
        let dying = 0;
        let open = 1;
        const fm = s.firm.get(i);
        if (fm) {
          const q = (now - fm.start) / FIRM_MS;
          if (q >= 1) s.firm.delete(i);
          else {
            const e = easeOutCubic(q);
            alpha = lerp(fm.alpha, 1, e);
            grow = lerp(fm.grow, 1, e);
          }
        }
        const op = s.opening.get(i);
        if (op !== undefined) {
          const q = (now - op) / OPEN_MS;
          if (q >= 1) s.opening.delete(i);
          else open = q <= 0 ? 0 : easeOutBack(q);
        }
        if (s.dying?.index === i) {
          const q = (now - s.dying.start) / DEATH_MS;
          if (q >= 1) {
            s.dead.add(i);
            s.dying = null;
            continue;
          }
          dying = Math.min(1, q + 0.2);
          alpha = 1 - q;
        }
        pads.push({ i, alpha, grow, dying, bud: 1, open });
      }
      if (gr.vis > 0.01) {
        pads.push({ i: s.count + 1, alpha: gr.alpha, grow: gr.grow, dying: 0, bud: smooth(0.7, 1, gr.prog), open: 0, color: p.focusColor });
      }

      // up into the clouds / back down
      rise = reduced ? want : clamp(rise + ((want ? 1 : -1) * dt) / RISE_MS, 0, 1);

      view.draw(ctx, {
        now,
        tick: Math.floor(now / (1000 / 15)),
        camX: cam,
        look: reduced ? 0 : look.x,
        pads,
        havi: p.showHavi ? { pad: s.haviPad, jump, mood, fish } : null,
        rise,
        hud: p.hud ? { ...p.hud, pulse: reduced ? 0 : Math.sin(Math.PI * clamp((now - s.pulseAt) / PULSE_MS, 0, 1)) } : null,
      });
      settleRise(want);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      window.clearInterval(todTimer);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerup", onTap);
      view.dispose();
      viewRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden style={{ display: "block", width: "100%", height: "100%", background: "transparent" }} />;
}
