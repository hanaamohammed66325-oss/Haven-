"use client";

import { useEffect, useRef } from "react";
import { companionLane } from "@/lib/haviCompanionPlacement";
import { paintCompanion, paintLeaf, COMPANION_W, COMPANION_ROWS, COMPANION_PAD } from "@/lib/haviCompanionArt";
import { soloMotion, sharedMotion, cardTransition, travelMotion, soloDuration, sharedDuration } from "@/lib/haviCompanionMotion";
import { createCompanionContinuity, companionIdle } from "@/lib/haviCompanionContinuity";
import { SOLO_MOTIONS, companionContext, chooseCompanionMotion, companionRestMs, chooseSharedMotion, discoverCompanionCards, COMPANION_AVOID_SELECTOR } from "@/lib/haviCompanionBehavior";

// Shared ownership is only for mounted pets and their live viewport geometry.
const OCCUPANTS = (globalThis.__haviOccupants ||= { fox: null, tiger: null });
const MOUNTED = (globalThis.__haviMounted ||= { fox: false, tiger: false });
const VISIBLE = (globalThis.__haviPetBounds ||= { fox: null, tiger: null });
const METRICS = (globalThis.__haviPetMetrics ||= { fox: null, tiger: null });
const RESERVED = (globalThis.__haviPetDestinations ||= { fox: null, tiger: null });
const PLAY = (globalThis.__haviPlay ||= { card: null, start: 0, until: 0, ended: 0 });
const clamp = v => Math.max(0, Math.min(1, v));
const ease = p => p * p * (3 - 2 * p);
const lerp = (a, b, p) => a + (b - a) * p;
const separation = (a, b) => Math.max(a.left - b.right, b.left - a.right, a.top - b.bottom, b.top - a.bottom);

export default function HaviCompanion({ kind = "fox", size = 42, corner = "left", interactionLabel = kind === "fox" ? "Interact with the fox" : "Interact with the tiger" }) {
  const boxRef = useRef(null), canvasRef = useRef(null), propBoxRef = useRef(null), propCanvasRef = useRef(null);
  useEffect(() => {
    const other = kind === "fox" ? "tiger" : "fox", scale = Math.max(3, Math.round(size / COMPANION_W[kind]));
    const width = (COMPANION_W[kind] + COMPANION_PAD * 2) * scale, height = (COMPANION_ROWS + 2) * scale;
    const pad = COMPANION_PAD * scale, ground = Math.max(2, Math.round(scale * .7));
    const hitHeight = Math.max(44, height), hitOffset = (hitHeight - height) / 2;
    const box = boxRef.current, canvas = canvasRef.current, propBox = propBoxRef.current, propCanvas = propCanvasRef.current;
    if (!box || !canvas || !propBox || !propCanvas) return;
    canvas.width = width; canvas.height = height; propCanvas.width = propCanvas.height = 4 * scale;
    const ctx = canvas.getContext("2d"), propCtx = propCanvas.getContext("2d");
    const motion = createCompanionContinuity(kind);
    box.style.width = width + "px"; box.style.height = hitHeight + "px";
    canvas.style.position = "absolute"; canvas.style.top = hitOffset + "px";
    const media = matchMedia("(prefers-reduced-motion:reduce)");
    let reduce = media.matches, activity = null, suppressed = 0, raf = 0, reaction = null, lastFrame = null, wasShared = false, tour = false;
    let clicks = 0, lastPoke = -Infinity, nextSearch = 0, floor = null, away = null;
    const behaviors = SOLO_MOTIONS[kind];
    const state = { card: null, started: performance.now(), behavior: null, played: {}, dwell: 24000, dir: 1, band: [.06, .94], pause: false, transfer: null, anchor: null, pausedAt: null, manualUntil: 0, pending: null, departing: false, next: null };
    if (!MOUNTED.fox && !MOUNTED.tiger) { PLAY.nextAt = performance.now() + 25000; PLAY.last = null; }
    MOUNTED[kind] = true; METRICS[kind] = { width, height, scale, ground };

    const haviBounds = () => { try { return window.havi?.bounds?.() || null; } catch { return null; } };
    const haviCard = () => { try { return window.havi?.currentCard?.() || null; } catch { return null; } };
    let previousHavi = null;
    const laneFor = (r, preferred = null) => {
      const current = haviBounds(), now = performance.now();
      let anticipated = current;
      if (current && previousHavi && now > previousHavi.now && now - previousHavi.now < 150) {
        const dx = Math.max(-32, Math.min(32, (current.left - previousHavi.left) / (now - previousHavi.now) * 180));
        anticipated = { left: Math.min(current.left, current.left + dx), right: Math.max(current.right, current.right + dx), top: current.top, bottom: current.bottom };
      }
      if (current) previousHavi = { left: current.left, now };
      return companionLane(r, width, height + 32, ground, [anticipated, VISIBLE[other]], corner, 12, preferred);
    };
    const pairLane = r => {
      if (!METRICS.fox || !METRICS.tiger) return null;
      return companionLane(r, METRICS.fox.width + METRICS.tiger.width + 18, Math.max(METRICS.fox.height, METRICS.tiger.height) + 32, ground, haviBounds(), "left");
    };
    const liveCard = c => {
      if (!c?.isConnected || c.offsetParent === null || c.closest(COMPANION_AVOID_SELECTOR)) return false;
      const r = c.getBoundingClientRect();
      return r.width > 140 && r.width <= innerWidth * .97 && r.height > 60;
    };
    const inView = c => { const r = c.getBoundingClientRect(); return r.top >= height + 8 && r.top < innerHeight - 40 && r.right > 8 && r.left < innerWidth - 8; };
    const cardPool = () => discoverCompanionCards(document, c => liveCard(c) && inView(c));
    const cards = () => cardPool().filter(c => laneFor(c.getBoundingClientRect()));
    const context = card => companionContext({ role: card?.dataset.haviRole, path: location.pathname, nearDue: Array.from(document.querySelectorAll('[data-havi-near-due="true"]')).some(c => liveCard(c) && inView(c)) });
    const selectBehavior = now => {
      state.behavior = chooseCompanionMotion(kind, { context: context(state.card), activity, last: state.behavior, played: state.played, now });
      state.played[state.behavior] = now; state.dwell = soloDuration(state.behavior) * 1000 + companionRestMs(state.behavior);
    };
    const endShared = now => {
      if (!PLAY.card) return;
      PLAY.card = null; PLAY.pause = null; PLAY.ready = null; PLAY.segment = null; PLAY.stage = null; delete PLAY.blockedAt; PLAY.ended = now; PLAY.nextAt = now + 55000 + Math.random() * 25000;
    };
    const pauseClock = now => { state.pausedAt ??= now; };
    const resumeClock = now => {
      if (state.pausedAt === null) return;
      const delta = now - state.pausedAt; state.started += delta;
      if (state.transfer) state.transfer.start += delta;
      if (state.anchor) state.anchor.start += delta;
      if (state.join) state.join.start += delta;
      state.pausedAt = null;
    };
    const settleHere = (now, frame = lastFrame) => {
      if (!frame || !liveCard(frame.card)) return false;
      state.card = frame.card; OCCUPANTS[kind] = frame.card; RESERVED[kind] = null; state.transfer = null;
      state.anchor = { offset: frame.offset, faceLeft: frame.a.faceLeft, topOffset: frame.topOffset, start: now };
      state.started = now - 4200; state.pausedAt = null; state.departing = false; state.next = null;
      state.dwell = soloDuration(state.behavior) * 1000 + companionRestMs(state.behavior);
      return true;
    };
    const hideProp = () => { propBox.style.opacity = "0"; };
    const hide = () => { box.style.opacity = "0"; box.style.pointerEvents = "none"; box.tabIndex = -1; box.setAttribute("aria-hidden", "true"); if (document.activeElement === box) box.blur(); canvas.style.pointerEvents = "none"; VISIBLE[kind] = null; hideProp(); };
    const at = (lane, f) => lane.left + Math.max(0, lane.right - lane.left - width) * clamp(f);
    const showProp = (type, x, y, turn = 0, opacity = 1, remember = true) => {
      propCtx.clearRect(0, 0, propCanvas.width, propCanvas.height); propCtx.imageSmoothingEnabled = false;
      const center = propCanvas.width / 2;
      if (type === "leaf") paintLeaf(propCtx, center, center - 2, Math.max(1, Math.floor(scale / 2)), turn);
      else {
        propCtx.fillStyle = "#4a90c2"; propCtx.fillRect(center - scale, center - scale, 2 * scale, 2 * scale);
        propCtx.fillStyle = "#bfe0f4"; propCtx.fillRect(center - scale, center - scale, scale, scale);
      }
      propBox.style.left = Math.round(x - center) + "px"; propBox.style.top = Math.round(y - center) + "px"; propBox.style.opacity = String(opacity);
      if (remember && lastFrame) lastFrame.prop = { type, x: x - lastFrame.a.left, y: y - lastFrame.a.top, turn, opacity };
    };
    const render = (a, r, mode, now, { clip = null, coordinated = false, remember = true, direct = false } = {}) => {
      if (floor?.card === state.card) motion.translate(r.left - floor.left, r.top - floor.top);
      floor = { card: state.card, left: r.left, top: r.top };
      a = { ...a, top: a.top ?? r.top - height + ground - (a.lift || 0), pose: a.pose === "nap" ? "curl" : a.pose === "watch" || a.pose === "sit" || a.pose === "peek" ? "stand" : a.pose || "stand" };
      if (!direct) a = motion.sample(a, now, reduce);
      const top = a.top, left = a.left;
      const bounds = { left: Math.round(left), right: Math.round(left) + width, top: Math.round(top), bottom: Math.round(top) + height };
      if ([haviBounds(), coordinated ? null : VISIBLE[other]].some(b => b && separation(bounds, b) < 12)) { pauseClock(now); if (PLAY.card) PLAY.blockedAt ??= now; hide(); return false; }
      box.style.left = bounds.left + "px"; box.style.top = bounds.top - hitOffset + "px"; box.style.opacity = "1";
      box.dataset.haviMotion = mode; box.dataset.haviTop = String(bounds.top);
      const interactive = clip === null && !reduce;
      box.style.pointerEvents = interactive ? "auto" : "none"; box.tabIndex = interactive ? 0 : -1;
      box.setAttribute("aria-hidden", "false"); box.setAttribute("aria-disabled", String(!interactive)); canvas.style.pointerEvents = interactive ? "auto" : "none";
      ctx.clearRect(0, 0, width, height); ctx.imageSmoothingEnabled = false;
      if (clip !== null) clip = Math.max(0, Math.min(height, r.top - bounds.top));
      paintCompanion(ctx, kind, scale, pad, height, { ...a, hideTail: clip !== null && clip < 6 * scale });
      // A single card-edge mask applies to the entire sprite, never half its body.
      if (clip !== null) ctx.clearRect(0, Math.max(0, Math.round(clip)), width, height);
      VISIBLE[kind] = bounds;
      if (remember && clip === null) lastFrame = { card: state.card, offset: bounds.left - r.left, topOffset: bounds.top - r.top, a: { ...a, left: bounds.left, top: bounds.top }, mode };
      return true;
    };
    const tryShared = now => {
      if (kind !== "fox" || !MOUNTED.tiger || PLAY.card || reduce || RESERVED.fox || RESERVED.tiger || activity === "sleep") return;
      if (now < PLAY.nextAt || now < (PLAY.interactionUntil || 0) || Math.random() > .32) return;
      const pool = cardPool().filter(c => pairLane(c.getBoundingClientRect()));
      const preferred = pool.filter(c => c !== haviCard()), available = preferred.length ? preferred : pool;
      if (!available.length) return;
      PLAY.card = available.includes(state.card) ? state.card : available[Math.floor(Math.random() * available.length)]; PLAY.start = now; PLAY.until = Infinity;
      PLAY.stage = "join"; PLAY.ready = {}; PLAY.segment = null; PLAY.leftKind = VISIBLE.fox && VISIBLE.tiger && VISIBLE.fox.left > VISIBLE.tiger.left ? "tiger" : "fox";
      PLAY.mode = chooseSharedMotion(context(PLAY.card), PLAY.last); PLAY.last = PLAY.mode;
    };
    const pick = () => {
      const pool = cards(), hv = haviCard();
      if (pool.includes(state.pending)) { const card = state.pending; state.pending = null; return card; }
      const fresh = pool.filter(c => c !== state.card && c !== hv && c !== OCCUPANTS[other] && c !== RESERVED[other]);
      const preferred = fresh.length ? fresh : pool.filter(c => c !== hv && c !== OCCUPANTS[other] && c !== RESERVED[other]);
      const choices = preferred.length ? preferred : pool;
      return choices.length ? choices[Math.floor(Math.random() * choices.length)] : null;
    };
    const visit = (card, now, arrival = null) => {
      state.card = card; OCCUPANTS[kind] = card; RESERVED[kind] = null; state.transfer = null;
      state.started = now - (arrival ? 1600 : 0); state.anchor = null; state.pausedAt = null; state.manualUntil = 0; state.departing = false; state.next = null; lastFrame = null;
      selectBehavior(now); state.dir = arrival ? (arrival.faceLeft ? -1 : 1) : Math.random() < .5 ? 1 : -1;
      state.band = arrival ? (arrival.faceLeft ? [.06, arrival.frac] : [arrival.frac, .94]) : [.06, .94]; state.pause = Math.random() < .6;
      tryShared(now); return card;
    };
    const walkFraction = p => {
      const start = state.dir > 0 ? state.band[0] : state.band[1], end = state.dir > 0 ? state.band[1] : state.band[0], mid = lerp(start, end, .5);
      if (!state.pause) return lerp(start, end, ease(p));
      return p < .4 ? lerp(start, mid, ease(p / .4)) : p < .62 ? mid : lerp(mid, end, ease((p - .62) / .38));
    };
    const beginTransfer = (now, requested = null) => {
      const from = state.card;
      const pool = requested ? [requested].filter(c => c !== from && liveCard(c) && inView(c)) : cards().filter(c => c !== from && c !== OCCUPANTS[other] && c !== RESERVED[other]);
      state.departing = true; state.next = null;
      if (!pool.length) return false;
      const r = from.getBoundingClientRect();
      pool.sort((a, b) => {
        const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
        return Math.hypot(x.left - r.left, x.top - r.top) - Math.hypot(y.left - r.left, y.top - r.top);
      });
      const to = requested || (pool.includes(state.pending) ? state.pending : pool[0]); state.next = to; state.pending = null;
      const dest = to.getBoundingClientRect(), mode = cardTransition(r, dest);
      if (mode === "peek") return false; // Continuous emerge/hide remains the distant-card fallback.
      const lane = laneFor(r, parseFloat(box.style.left)), next = laneFor(dest);
      if (!lane || !next) return false;
      const leftward = dest.left + dest.width / 2 < r.left + r.width / 2;
      const start = { left: lastFrame?.a.left ?? parseFloat(box.style.left), top: lastFrame?.a.top ?? r.top - height + ground };
      const span = Math.max(1, lane.right - lane.left - width);
      state.transfer = { from, to, mode, start: now, sourceFrac: clamp((start.left - lane.left) / span), leftward };
      RESERVED[kind] = to; hideProp(); return true;
    };
    const runTransfer = now => {
      const transfer = state.transfer;
      if (!liveCard(transfer.from) || !liveCard(transfer.to)) {
        const from = transfer.from;
        state.transfer = null; RESERVED[kind] = null;
        if (liveCard(from) && lastFrame) { selectBehavior(now); settleHere(now); }
        else { state.card = null; OCCUPANTS[kind] = null; motion.reset(); hide(); }
        return false;
      }
      const r = transfer.from.getBoundingClientRect(), dest = transfer.to.getBoundingClientRect(), lane = laneFor(r, lastFrame ? r.left + lastFrame.offset : null), next = laneFor(dest);
      if (!lane || !next || cardTransition(r, dest) !== transfer.mode) {
        // A changed floor is a paused/replanned route, not a new animal visit.
        if (liveCard(transfer.from) && lastFrame) { state.transfer = null; RESERVED[kind] = null; state.pending = liveCard(transfer.to) ? transfer.to : null; selectBehavior(now); settleHere(now); }
        return false;
      }
      const start = { left: at(lane, transfer.sourceFrac), top: r.top - height + ground };
      const edge = { left: at(lane, transfer.leftward ? 0 : 1), top: start.top };
      const destination = { left: at(next, transfer.leftward ? .94 : .06), top: dest.top - height + ground };
      const a = travelMotion(transfer.mode, (now - transfer.start) / 1000, start, edge, destination, scale, kind);
      if (!render(a, r, "travel:" + transfer.mode, now)) return false;
      if (a.done && motion.settled()) {
        const arrived = lastFrame;
        visit(transfer.to, now, { faceLeft: a.faceLeft, frac: transfer.leftward ? .94 : .06 });
        if (arrived) lastFrame = { ...arrived, card: transfer.to, offset: arrived.a.left - dest.left, topOffset: arrived.a.top - dest.top };
      }
      return true;
    };
    const fetch = (now, r, lane, elapsed) => {
      // One complete game, then a calm hold; do not restart the throw every 8s.
      const p = Math.min(1, elapsed / 8000), home = state.anchor.faceLeft ? 1 : 0, far = state.anchor.faceLeft ? .14 : .86;
      let fraction = home, ballFraction = home, faceLeft = far < home, moving = false, pose = "stand", arc = 0;
      if (p < .18) { ballFraction = lerp(home, far, ease(p / .18)); arc = Math.sin(p / .18 * Math.PI) * height * .4; }
      else if (p < .5) { fraction = lerp(home, far, ease((p - .18) / .32)); ballFraction = far; moving = true; }
      else if (p < .64) { fraction = far; ballFraction = far; pose = "sniff"; }
      else { fraction = lerp(far, home, ease((p - .64) / .36)); ballFraction = fraction; faceLeft = home < far; moving = p < 1; }
      const left = at(lane, fraction), phase = moving ? Math.abs(left - at(lane, home)) / 22 * 4 : 0;
      const settling = 1 - ease(clamp((now - state.anchor.start) / 350));
      const top = r.top - height + ground + (state.anchor.topOffset + height - ground) * settling;
      if (!render({ left, top, pose, faceLeft, phase }, r, "play", now)) return;
      const retirement = ease(clamp((elapsed - 8000) / 600));
      const carried = p >= .64, drawn = lastFrame.a, mouth = drawn.left + (drawn.faceLeft ? pad - 5 : pad + 9 * scale + 5);
      const x = carried ? mouth : lerp(lane.left + 2 * scale, lane.right - 2 * scale, ballFraction);
      showProp("ball", x, carried ? drawn.top + height - 4.5 * scale + retirement * 4 * scale : r.top - scale - arc, 0, 1 - retirement);
    };
    const frame = now => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || tour || now < suppressed) {
        pauseClock(now); motion.pause(now); if (reaction) reaction.suspendedAt ??= now; if (PLAY.card) PLAY.blockedAt ??= now; hide(); return;
      }
      const perch = PLAY.card || reaction?.frame.card || state.transfer?.from || state.card;
      if (liveCard(perch) && !inView(perch)) {
        if (!away || away.card !== perch) {
          const sceneNow = state.pausedAt ?? now;
          const remaining = PLAY.card ? (PLAY.stage === "play" ? PLAY.until - now : sharedDuration(PLAY.mode) * 1000)
            : state.transfer ? state.transfer.start + (state.transfer.mode === "step" ? 3600 : 3100) - sceneNow
              : state.started + 4200 + state.dwell - sceneNow;
          away = { card: perch, until: now + Math.max(0, remaining) };
        }
        pauseClock(now); motion.pause(now); if (reaction) reaction.suspendedAt ??= now; if (PLAY.card) PLAY.blockedAt ??= now; hide();
        // Keep the current perch initially, then choose a visible one at its boundary.
        // The offscreen deadline is independent of the paused animation cursor.
        if (now >= away.until && now >= nextSearch) {
          nextSearch = now + 600;
          const next = pick();
          if (next && next !== state.card) {
            endShared(now); wasShared = false; reaction = lastFrame = null; state.join = state.remote = null;
            motion.reset(); floor = away = null; visit(next, now);
          }
        }
        return;
      }
      away = null;
      if (reduce && lastFrame && liveCard(lastFrame.card)) {
        // Preserve the same solo, reaction or pair cursor while movement is disabled.
        pauseClock(now); motion.pause(now); if (reaction) reaction.suspendedAt ??= now; if (PLAY.card) PLAY.blockedAt ??= now;
        const held = reaction?.frame || lastFrame, r = held.card.getBoundingClientRect();
        if (!inView(held.card)) { hide(); return; }
        const a = { ...held.a, left: r.left + held.offset, top: r.top + held.topOffset };
        if (render(a, r, held.mode, now, { coordinated: !!PLAY.card, remember: false, direct: true }) && held.prop) showProp(held.prop.type, a.left + held.prop.x, a.top + held.prop.y, held.prop.turn, held.prop.opacity, false);
        else hideProp();
        return;
      }
      if (reaction?.suspendedAt !== undefined) { reaction.start += now - reaction.suspendedAt; delete reaction.suspendedAt; }
      if (PLAY.blockedAt !== undefined && now > PLAY.blockedAt) {
        const delta = now - PLAY.blockedAt; PLAY.start += delta; PLAY.until += delta;
        if (PLAY.pause) { PLAY.pause.start += delta; PLAY.pause.until += delta; }
        delete PLAY.blockedAt;
      }
      if (PLAY.pause && now >= PLAY.pause.until) {
        const delta = now - PLAY.pause.start; PLAY.start += delta; PLAY.until += delta; PLAY.pause = null;
      }
      if (wasShared && !PLAY.card) { wasShared = false; state.join = null; selectBehavior(now); settleHere(now); }
      if (reaction) {
        const held = reaction.frame, p = (now - reaction.start) / 420;
        if (!liveCard(held.card)) { reaction = null; resumeClock(now); motion.resume(now); }
        else if (p < 1) {
          const r = held.card.getBoundingClientRect();
          const sleeping = held.a.pose === "curl";
          const a = { ...held.a, left: r.left + held.offset + Math.round(Math.sin(p * Math.PI * 4) * (1 - p)), top: r.top + held.topOffset - Math.sin(p * Math.PI) * (sleeping ? .5 : scale), pose: sleeping ? "curl" : "blink", phase: 0 };
          if (render(a, r, "poke", now, { coordinated: !!PLAY.card, remember: false, direct: true }) && held.prop) showProp(held.prop.type, a.left + held.prop.x, a.top + held.prop.y, held.prop.turn, held.prop.opacity, false);
          return;
        } else {
          const switching = reaction.switching; reaction = null; resumeClock(now); motion.resume(now);
          if (switching) {
            endShared(now); wasShared = false; state.join = null; settleHere(now, held);
            state.behavior = behaviors[(behaviors.indexOf(state.behavior) + 1) % behaviors.length];
            state.played[state.behavior] = now; state.dwell = soloDuration(state.behavior) * 1000 + companionRestMs(state.behavior); state.manualUntil = now + 9000;
          }
        }
      }
      if (PLAY.card) {
        const sharedCard = PLAY.card, r = sharedCard.getBoundingClientRect(), lane = liveCard(sharedCard) ? pairLane(r) : null;
        if (!MOUNTED.fox || !MOUNTED.tiger || !liveCard(sharedCard) || now >= PLAY.until || reduce || activity === "sleep") {
          endShared(now); if (wasShared) { wasShared = false; state.join = null; selectBehavior(now); settleHere(now); }
        }
        else if (!lane || !inView(sharedCard)) { pauseClock(now); motion.pause(now); PLAY.blockedAt ??= now; hide(); return; }
        else {
          PLAY.stage ||= "join"; PLAY.ready ||= {}; PLAY.until ||= Infinity;
          const actionTime = (now - state.started - 4200) / 1000;
          const finishingAction = lastFrame?.mode === state.behavior && actionTime >= 0 && actionTime < soloDuration(state.behavior);
          // Finish a finite gesture before the pair walks together.
          if (PLAY.stage === "join" && finishingAction && state.card !== null && !wasShared) {
            // Continue through the normal solo renderer below.
          } else if (state.card !== sharedCard) {
            wasShared = true;
            resumeClock(now); motion.resume(now);
            // The resident first makes room on the arrival side; never walk through it.
            if (!PLAY.segment || !PLAY.ready[other]) {
              if (lastFrame && liveCard(state.card)) { const old = state.card.getBoundingClientRect(); render({ ...lastFrame.a, ...companionIdle((now - state.started) / 1000), left: old.left + lastFrame.offset, top: old.top + lastFrame.topOffset }, old, "together:wait", now); }
              return;
            }
            if (state.transfer) { if (runTransfer(now)) return; if (state.transfer) { pauseClock(now); return; } }
            if (liveCard(state.card) && lastFrame) {
              if (beginTransfer(now, sharedCard)) { runTransfer(now); return; }
              state.remote ||= { start: now, frame: lastFrame, to: sharedCard };
              const q = clamp((now - state.remote.start) / 650), old = state.card.getBoundingClientRect();
              render({ ...state.remote.frame.a, left: old.left + state.remote.frame.offset, top: old.top - height * (1 - ease(q)) + ground }, old, "hide", now, { clip: height * (1 - ease(q)) });
              if (q >= 1 && motion.settled()) { const from = old; const dest = sharedCard.getBoundingClientRect(); visit(sharedCard, now); motion.reset(); state.dir = dest.left + dest.width / 2 >= from.left + from.width / 2 ? 1 : -1; state.remote = null; }
              return;
            }
          } else if (now - state.started < 1600) {
            // A genuine distant arrival keeps its whole-sprite edge reveal.
          } else {
            wasShared = true; resumeClock(now); motion.resume(now);
            if (!PLAY.segment && VISIBLE[kind] && VISIBLE[other]) {
              const bothHere = OCCUPANTS.fox === sharedCard && OCCUPANTS.tiger === sharedCard;
              PLAY.leftKind = bothHere ? (VISIBLE.fox.left <= VISIBLE.tiger.left ? "fox" : "tiger") : (VISIBLE[other].left + METRICS[other].width / 2 < r.left + r.width / 2 ? other : kind);
              const span = Math.min(lane.right - lane.left, METRICS.fox.width + METRICS.tiger.width + 18 + 120);
              const center = bothHere ? (VISIBLE.fox.left + METRICS.fox.width / 2 + VISIBLE.tiger.left + METRICS.tiger.width / 2) / 2 : VISIBLE[kind].left + METRICS[kind].width / 2;
              PLAY.segment = { offset: Math.max(lane.left, Math.min(lane.right - span, center - span / 2)) - r.left, span };
            }
            if (!PLAY.segment) { const f = lastFrame; if (f) render({ ...f.a, ...companionIdle((now - state.started) / 1000), left: r.left + f.offset, top: r.top + f.topOffset }, r, "together:wait", now); return; }
            const left = Math.max(lane.left, Math.min(lane.right - PLAY.segment.span, r.left + PLAY.segment.offset));
            const pair = { left, right: Math.min(lane.right, left + PLAY.segment.span) };
            if (PLAY.stage === "join") {
              const target = sharedMotion(PLAY.mode, 0, pair, METRICS, PLAY.leftKind)?.[kind];
              if (!target) { endShared(now); return; }
              state.join ||= { start: now, from: lastFrame?.offset ?? target.left - r.left, duration: Math.max(450, Math.abs(target.left - (lastFrame?.a.left ?? target.left)) / 80 * 1000) };
              const approach = clamp((now - state.join.start) / state.join.duration), goal = target.left;
              target.left = lerp(r.left + state.join.from, goal, ease(approach));
              target.top = r.top - height + ground;
              target.faceLeft = lastFrame ? target.left < lastFrame.a.left : target.faceLeft;
              render(target, r, "together:approach", now, { coordinated: true }); hideProp();
              PLAY.ready[kind] = approach >= 1 && motion.settled() && lastFrame?.a.pose !== "curl";
              if (PLAY.ready.fox && PLAY.ready.tiger) { PLAY.stage = "play"; PLAY.start = now; PLAY.until = now + sharedDuration(PLAY.mode) * 1000; }
              return;
            }
          const clock = PLAY.pause?.start ?? now;
          const t = Math.max(0, (clock - PLAY.start) / 1000), shared = sharedMotion(PLAY.mode, t, pair, METRICS, PLAY.leftKind);
          const a = shared?.[kind]; if (!a) { endShared(now); hide(); return; }
          if (PLAY.mode === "rest") Object.assign(a, companionIdle(t, a.pose === "curl"));
          if (!render(a, r, "together:" + PLAY.mode, now, { coordinated: true })) { pauseClock(now); return; }
          hideProp();
          if (kind === "fox" && shared.leaf) { const fade = 1 - ease(clamp((t - 6.2) / .8)); showProp("leaf", shared.leaf.x, r.top - shared.leaf.lift + (1 - fade) * 12, shared.leaf.turn, fade); }
          return;
          }
        }
      }
      if (state.transfer && !reduce) {
        if (liveCard(state.transfer.from) && !inView(state.transfer.from)) { pauseClock(now); motion.pause(now); hide(); return; } resumeClock(now); motion.resume(now);
        if (runTransfer(now)) return;
        if (state.transfer) { pauseClock(now); return; }
      }
      if (!liveCard(state.card)) {
        if (now < nextSearch) { hide(); return; } nextSearch = now + 600;
        if (!visit(pick(), now)) { hide(); return; }
      }
      const r = state.card.getBoundingClientRect(), lane = laneFor(r, lastFrame?.card === state.card ? r.left + lastFrame.offset : null);
      if (!inView(state.card) || !lane) { pauseClock(now); motion.pause(now); hide(); return; }
      hideProp();
      const airborne = lastFrame?.card === state.card && lastFrame.a.top < r.top - height + ground - 1;
      if (reduce || (activity === "sleep" && now >= state.manualUntil && !airborne)) {
        pauseClock(now);
        const left = lastFrame?.card === state.card ? Math.max(lane.left, Math.min(lane.right - width, r.left + lastFrame.offset)) : at(lane, .5);
        render({ left, ...companionIdle(reduce ? 0 : now / 1000, activity === "sleep" || lastFrame?.a.pose === "curl"), faceLeft: lastFrame?.a.faceLeft ?? corner === "right" }, r, activity === "sleep" ? "nap" : "watch", now); return;
      }
      resumeClock(now); motion.resume(now);
      const elapsed = now - state.started;
      if (elapsed >= 4200 + state.dwell + 650 && motion.settled()) {
        const next = liveCard(state.next) ? state.next : pick();
        if (next === state.card && lastFrame) { selectBehavior(now); settleHere(now); tryShared(now); render({ ...lastFrame.a, left: r.left + lastFrame.offset, top: r.top + lastFrame.topOffset }, r, state.behavior, now); }
        else {
          const from = r, dest = next?.getBoundingClientRect();
          if (!visit(next, now)) hide();
          else { motion.reset(); state.dir = dest.left + dest.width / 2 >= from.left + from.width / 2 ? 1 : -1; }
        }
        return;
      }
      if (elapsed < 1600 || elapsed >= 4200 + state.dwell && (state.departing || motion.settled())) {
        const leaving = elapsed >= 4200 + state.dwell;
        if (leaving && !state.departing) {
          if (beginTransfer(now)) { runTransfer(now); return; }
          if (!state.next) { selectBehavior(now); settleHere(now); tryShared(now); if (lastFrame) render({ ...lastFrame.a, left: r.left + lastFrame.offset, top: r.top + lastFrame.topOffset }, r, state.behavior, now); return; }
        }
        let rise;
        const peekRise = Math.min(height, 5 * scale + ground);
        if (leaving) rise = height * (1 - ease(clamp((elapsed - 4200 - state.dwell) / 650)));
        else if (elapsed < 240) rise = 0;
        else if (elapsed < 820) rise = peekRise * ease((elapsed - 240) / 580);
        else if (elapsed < 1040) rise = peekRise;
        else rise = peekRise + (height - peekRise) * ease(clamp((elapsed - 1040) / 560));
        const frac = state.dir > 0 ? state.band[0] : state.band[1];
        const left = leaving && lastFrame?.card === state.card ? r.left + lastFrame.offset : at(lane, frac);
        render({ left, top: r.top - rise + ground, pose: "stand", phase: 0, faceLeft: state.dir < 0 }, r, leaving ? "hide" : "emerge", now, { clip: Math.max(0, rise - ground) }); return;
      }
      if (elapsed < 4200) {
        const p = (elapsed - 1600) / 2600, left = at(lane, walkFraction(p)), moving = !state.pause || p < .4 || p >= .62;
        const phase = moving ? Math.abs(left - at(lane, state.dir > 0 ? state.band[0] : state.band[1])) / (kind === "fox" ? 22 : 27) * 4 : 0;
        render({ left, phase, pose: moving ? "stand" : "blink", faceLeft: state.dir < 0 }, r, moving ? "walk" : "watch", now); return;
      }
      state.anchor ||= { offset: at(lane, walkFraction(1)) - r.left, faceLeft: state.dir > 0, topOffset: -height + ground, start: now };
      const anchor = Math.max(lane.left, Math.min(lane.right - width, r.left + state.anchor.offset));
      const behaviorLane = state.anchor.faceLeft ? { left: lane.left, right: anchor + width } : { left: anchor, right: lane.right };
      const behavior = state.behavior, t = (elapsed - 4200) / 1000;
      const active = soloDuration(behavior);
      if (kind === "fox" && behavior === "play" && t < active) { fetch(now, r, behaviorLane, elapsed - 4200); return; }
      const a = soloMotion(kind, behavior, t, behaviorLane, width, scale, !state.anchor.faceLeft);
      if (!active || t >= active) Object.assign(a, companionIdle(t - active, behavior === "nap"));
      const settling = 1 - ease(clamp((now - state.anchor.start) / 350));
      a.top = r.top - height + ground - a.lift + (state.anchor.topOffset + height - ground) * settling;
      if (render(a, r, active && t >= active ? "idle:" + behavior : behavior, now) && a.leaf && t < active) {
        const fade = 1 - ease(clamp((t - 6.2) / .8)); showProp("leaf", a.leaf.x, r.top - a.leaf.lift + (1 - fade) * 12, a.leaf.turn, fade);
      }
    };
    const poke = (e, cycle = true) => {
      if (box.style.opacity === "0" || reduce || reaction || !lastFrame || canvas.style.pointerEvents === "none") return;
      e?.stopPropagation(); const now = performance.now();
      if (cycle) { clicks = now - lastPoke <= 1500 ? clicks + 1 : 1; lastPoke = now; }
      reaction = { start: now, frame: lastFrame, switching: cycle && clicks % 3 === 0 }; pauseClock(now); motion.pause(now);
      PLAY.interactionUntil = now + 9000;
      if (PLAY.card && !PLAY.pause) PLAY.pause = { start: now, until: now + 420 };
    };
    const onActivity = e => { activity = e?.detail?.activity || null; };
    const onHaviPoke = () => { poke(null, false); };
    const navigate = () => {
      endShared(performance.now()); state.card = null; state.transfer = null; state.pending = null; state.anchor = null; state.pausedAt = null; OCCUPANTS[kind] = RESERVED[kind] = null;
      reaction = lastFrame = null; state.join = state.remote = null; floor = away = null; wasShared = false; clicks = 0; lastPoke = -Infinity; motion.reset(); hide(); suppressed = performance.now() + 520;
    };
    const preference = () => { const now = performance.now(); reduce = media.matches; if (reduce) { pauseClock(now); motion.pause(now); if (reaction) reaction.suspendedAt ??= now; if (PLAY.card) PLAY.blockedAt ??= now; } else motion.resume(now); };
    const visibility = () => { const now = performance.now(); if (document.hidden) { pauseClock(now); motion.pause(now); if (reaction) reaction.suspendedAt ??= now; if (PLAY.card) PLAY.blockedAt ??= now; hide(); } };
    const interaction = e => {
      const target = e.target;
      if (!(target instanceof Element) || target.closest(COMPANION_AVOID_SELECTOR + ',[data-havi-companion]')) return;
      if (!target.closest("input,textarea,select,[contenteditable='true'],button,[role='button']")) return;
      const card = cardPool().find(c => c.contains(target));
      if (card && card !== state.card && performance.now() >= state.manualUntil) state.pending = card;
    };
    const tourOpen = () => { tour = true; visibility(); pauseClock(performance.now()); motion.pause(performance.now()); hide(); }, tourClose = () => { tour = false; suppressed = performance.now() + 520; };
    const key = e => { if (!e.repeat && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); poke(e); } };
    box.addEventListener("click", poke); box.addEventListener("keydown", key); window.addEventListener("havi:activity", onActivity);
    window.addEventListener("havi:poke", onHaviPoke); window.addEventListener("havi:navigate", navigate);
    window.addEventListener("haven:tour-open", tourOpen); window.addEventListener("haven:tour-close", tourClose);
    document.addEventListener("focusin", interaction, true); document.addEventListener("click", interaction, true);
    media.addEventListener("change", preference); document.addEventListener("visibilitychange", visibility);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); box.removeEventListener("click", poke); box.removeEventListener("keydown", key); motion.dispose(); window.removeEventListener("havi:activity", onActivity);
      window.removeEventListener("havi:poke", onHaviPoke); window.removeEventListener("havi:navigate", navigate);
      window.removeEventListener("haven:tour-open", tourOpen); window.removeEventListener("haven:tour-close", tourClose);
      document.removeEventListener("focusin", interaction, true); document.removeEventListener("click", interaction, true);
      media.removeEventListener("change", preference); document.removeEventListener("visibilitychange", visibility);
      OCCUPANTS[kind] = VISIBLE[kind] = METRICS[kind] = RESERVED[kind] = null; MOUNTED[kind] = false;
      if (PLAY.card) endShared(performance.now());
    };
  }, [kind, size, corner]);

  return (
    <>
      <div ref={boxRef} data-havi-companion={kind} role="button" aria-label={interactionLabel} aria-hidden="true" tabIndex={-1} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ position: "fixed", top: -9999, left: -9999, opacity: 0, zIndex: 41, pointerEvents: "none", cursor: "pointer", borderRadius: 4 }}>
        <canvas ref={canvasRef} aria-hidden="true" style={{ imageRendering: "pixelated", display: "block", pointerEvents: "none" }} />
      </div>
      <div ref={propBoxRef} style={{ position: "fixed", top: -9999, left: -9999, opacity: 0, zIndex: 38, pointerEvents: "none" }}>
        <canvas ref={propCanvasRef} style={{ imageRendering: "pixelated", display: "block", pointerEvents: "none" }} />
      </div>
    </>
  );
}
