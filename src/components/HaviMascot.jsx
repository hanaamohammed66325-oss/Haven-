"use client";

/**
 * HaviMascot — a living pixel-art frog that behaves like it inhabits the app.
 *
 * Instead of isolated animations triggered by commands, Havi runs a small
 * BEHAVIOUR ENGINE: every action is a "phase" with a duration, and phases are
 * chained into natural sequences. Example: he doesn't teleport when relocating —
 * he wakes up, looks around, walks to the edge of the card, jumps, lands, then
 * settles back to sleep.
 *
 * Key behaviours
 *  - relocating      : sleep -> wake -> watch -> walk -> jump -> land -> settle
 *  - page navigation : rises from behind a card -> walks in -> settles
 *  - high grade      : celebrates 10s, interruptible by any user action
 *  - clicked on      : squishes flat under the press and springs back (fast)
 *
 * Everything is canvas pixels — no images needed.
 * See integration-guide.md for wiring.
 */

import { useEffect, useRef, useState, useCallback } from "react";

/* ================================================================== */
/*  PIXEL ART                                                          */
/* ================================================================== */

const COL = {
  k: "#111111",
  G: "#a8d98a",
  d: "#93c974",
  f: "#e88bb5",
  y: "#f2d94e",
  b: "#3b6ea5",
  L: "#85b7eb",
  N: "#2b3245",
  paper: "#f7f5ee",
  ink: "#8a8780",
  tongue: "#e88bb5",
  mouthRed: "#c0392b",
  cheek: "#f0a0a8",
  blanket: "#7aa8d8",
  blanketHi: "#a9c8e8",
  blanketSh: "#5f8ec0",
  snore: "#c9d6f0",
  zzz: "#7f77dd",
  angry: "#d94f3d",
  steam: "#cfd8e3",
};

// 28 x 21 body, no face baked in. "." = transparent
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
const GRID_H = 21;

function px(ctx, s, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x * s, y * s, w * s, h * s);
}

function paintBody(ctx, s) {
  for (let y = 0; y < BODY.length; y++) {
    for (let x = 0; x < BODY[y].length; x++) {
      const c = BODY[y][x];
      if (c === "." || c === " ") continue;
      px(ctx, s, x, y, 1, 1, COL[c] || "#000");
    }
  }
}

/**
 * Draw one frame.
 * @param extra { riseP?: 0..1 }  riseP clips the body for "rising from behind a card"
 */
function drawFrame(canvas, activity, t, extra) {
  const ctx = canvas.getContext("2d");
  const s = canvas.width / GRID_W;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  paintBody(ctx, s);

  switch (activity) {
    case "sleep": {
      px(ctx, s, 7, 10, 4, 1, COL.k); // closed eyes
      px(ctx, s, 16, 10, 4, 1, COL.k);
      if (t % 12 < 6) px(ctx, s, 12, 13, 4, 2, COL.k);
      else px(ctx, s, 12, 13, 4, 1, COL.k);
      const by = 15; // blanket
      px(ctx, s, 1, by + 1, 23, 5, COL.blanket);
      for (let x = 1; x < 24; x += 2) px(ctx, s, x, by, 1, 1, COL.blanket);
      px(ctx, s, 1, by + 1, 23, 1, COL.blanketHi);
      px(ctx, s, 6, by + 3, 1, 2, COL.blanketSh);
      px(ctx, s, 14, by + 3, 1, 2, COL.blanketSh);
      px(ctx, s, 19, by + 3, 1, 2, COL.blanketSh);
      px(ctx, s, 20, 12, 1 + (t % 12 < 6 ? 1 : 0), 1 + (t % 12 < 6 ? 1 : 0), COL.snore);
      ctx.fillStyle = COL.zzz;
      ctx.font = `${Math.round(s * 2.2)}px sans-serif`;
      ctx.fillText("z", 22 * s, (6 - (t % 6) * 0.35) * s + s);
      break;
    }
    case "wake": {
      // eyelids lifting, a stretch
      const open = Math.min(3, 1 + Math.floor((t % 8) / 3));
      px(ctx, s, 8, 10, 2, open, COL.k);
      px(ctx, s, 17, 10, 2, open, COL.k);
      px(ctx, s, 12, 13, 4, 2, COL.k); // yawn
      px(ctx, s, 13, 14, 2, 1, "#5a3b45");
      px(ctx, s, 3, 8, 2, 3, COL.G); // stretching arms
      px(ctx, s, 22, 8, 2, 3, COL.G);
      break;
    }
    case "watch": {
      px(ctx, s, 12, 13, 4, 1, COL.k);
      px(ctx, s, 10, 18, 8, 3, COL.N); // phone
      const cyc = Math.floor(t / 6) % 4;
      let ox = 0,
        oy = 0;
      if (cyc === 0) ox = -1;
      else if (cyc === 1) ox = 1;
      else oy = 1;
      px(ctx, s, 8 + ox, 9 + oy, 2, 2, COL.k);
      px(ctx, s, 17 + ox, 9 + oy, 2, 2, COL.k);
      if (cyc >= 2) px(ctx, s, 11, 19, 6, 1, t % 2 === 0 ? COL.L : "#c9e3fb");
      break;
    }
    case "write": {
      const cyc = t % 30;
      const writing = cyc < 18;
      px(ctx, s, 7, 19, 9, 3, COL.paper);
      if (writing) {
        px(ctx, s, 8, 10, 2, 2, COL.k);
        px(ctx, s, 17, 10, 2, 2, COL.k);
        const penX = 8 + (cyc % 9);
        px(ctx, s, 15, 17, 2, 2, COL.G);
        px(ctx, s, penX, 16, 1, 3, COL.b);
        px(ctx, s, penX, 15, 1, 1, COL.mouthRed);
        for (let m = 0; m < cyc % 9; m++) px(ctx, s, 8 + m, 20, 1, 1, COL.ink);
      } else {
        px(ctx, s, 7, 10, 3, 1, COL.k);
        px(ctx, s, 16, 10, 3, 1, COL.k);
        px(ctx, s, 15, 18, 2, 1, COL.G);
        px(ctx, s, 8, 20, 7, 1, COL.ink);
      }
      px(ctx, s, 12, 13, 4, 1, COL.k);
      break;
    }
    case "celebrate": {
      px(ctx, s, 8, 11, 1, 1, COL.k); // triangle eyes
      px(ctx, s, 9, 10, 1, 1, COL.k);
      px(ctx, s, 10, 11, 1, 1, COL.k);
      px(ctx, s, 17, 11, 1, 1, COL.k);
      px(ctx, s, 18, 10, 1, 1, COL.k);
      px(ctx, s, 19, 11, 1, 1, COL.k);
      px(ctx, s, 11, 13, 6, 1, COL.k);
      px(ctx, s, 12, 14, 4, 1, COL.mouthRed);
      px(ctx, s, 13, 15, 2, 1, COL.tongue);
      px(ctx, s, 6, 12, 1, 1, COL.cheek);
      px(ctx, s, 20, 12, 1, 1, COL.cheek);
      const cols = [COL.f, COL.y, "#8bc34a", COL.zzz];
      for (let i = 0; i < 4; i++) {
        const cx = 3 + i * 6;
        const cy = (t * 0.6 + i * 4) % 20;
        px(ctx, s, cx, Math.floor(cy), 1, 1, cols[i % 4]);
      }
      break;
    }
    case "hang": {
      const look = Math.floor(t / 6) % 3;
      const ex = look === 0 ? -1 : look === 1 ? 1 : 0;
      px(ctx, s, 8 + ex, 9, 2, 3, COL.k);
      px(ctx, s, 17 + ex, 9, 2, 3, COL.k);
      px(ctx, s, 12, 13, 4, 1, COL.k);
      const sw = Math.round(Math.sin(t / 5));
      px(ctx, s, 8 + sw, 20, 2, 4, COL.G);
      px(ctx, s, 8 + sw, 24, 2, 1, COL.d);
      px(ctx, s, 16 - sw, 20, 2, 4, COL.G);
      px(ctx, s, 16 - sw, 24, 2, 1, COL.d);
      break;
    }
    case "walk": {
      px(ctx, s, 9, 9, 2, 3, COL.k);
      px(ctx, s, 18, 9, 2, 3, COL.k);
      px(ctx, s, 12, 13, 4, 1, COL.k);
      const st = Math.floor(t / 2) % 2;
      px(ctx, s, 7, 19, 3, 2, st ? COL.G : COL.d);
      px(ctx, s, 16, 19, 3, 2, st ? COL.d : COL.G);
      break;
    }
    case "peek": {
      px(ctx, s, 8, 9, 2, 3, COL.k);
      px(ctx, s, 17, 9, 2, 3, COL.k);
      px(ctx, s, 12, 13, 4, 1, COL.k);
      px(ctx, s, 7, 15, 2, 1, COL.G);
      px(ctx, s, 18, 15, 2, 1, COL.G);
      ctx.clearRect(0, 16 * s, canvas.width, canvas.height);
      break;
    }
    case "books": {
      px(ctx, s, 8, 9, 2, 3, COL.k);
      px(ctx, s, 17, 9, 2, 3, COL.k);
      px(ctx, s, 11, 13, 6, 1, COL.k);
      px(ctx, s, 12, 14, 4, 1, COL.k);
      const bob = Math.abs(Math.sin(t / 5)) > 0.5 ? 1 : 0;
      px(ctx, s, 5, 17 - bob, 16, 2, "#c0563f");
      px(ctx, s, 6, 19 - bob, 14, 2, COL.b);
      px(ctx, s, 5, 21 - bob, 16, 2, "#6a9c5a");
      px(ctx, s, 5, 18 - bob, 1, 1, COL.paper);
      px(ctx, s, 6, 20 - bob, 1, 1, COL.paper);
      px(ctx, s, 5, 22 - bob, 1, 1, COL.paper);
      px(ctx, s, 3, 17 - bob, 2, 3, COL.G);
      px(ctx, s, 21, 17 - bob, 2, 3, COL.G);
      break;
    }
    case "jump": {
      px(ctx, s, 8, 9, 2, 3, COL.k);
      px(ctx, s, 17, 9, 2, 3, COL.k);
      px(ctx, s, 12, 13, 4, 1, COL.k);
      px(ctx, s, 7, 18, 3, 2, COL.G); // tucked legs
      px(ctx, s, 17, 18, 3, 2, COL.G);
      break;
    }
    case "squish": {
      // Being pressed: eyes squeezed shut, mouth open. The flattening itself
      // is a transform driven every frame in the loop (see squishRef).
      px(ctx, s, 7, 10, 4, 1, COL.k);
      px(ctx, s, 8, 9, 1, 1, COL.k);
      px(ctx, s, 10, 9, 1, 1, COL.k);
      px(ctx, s, 16, 10, 4, 1, COL.k);
      px(ctx, s, 17, 9, 1, 1, COL.k);
      px(ctx, s, 19, 9, 1, 1, COL.k);
      px(ctx, s, 12, 13, 4, 2, COL.k);
      px(ctx, s, 13, 14, 2, 1, COL.mouthRed);
      break;
    }
    default: {
      px(ctx, s, 8, 9, 2, 3, COL.k);
      px(ctx, s, 17, 9, 2, 3, COL.k);
      px(ctx, s, 12, 13, 4, 1, COL.k);
    }
  }

  // "rising from behind a card": reveal the body gradually from the top
  if (extra && typeof extra.riseP === "number" && extra.riseP < 1) {
    const visible = Math.max(2, Math.round(GRID_H * extra.riseP));
    ctx.clearRect(0, visible * s, canvas.width, canvas.height);
  }
}

function bobFor(activity, t) {
  switch (activity) {
    case "sleep":
      return Math.sin(t / 9) * 2;
    case "wake":
      return Math.sin(t / 4) * 2;
    case "celebrate":
      return Math.abs(Math.sin(t / 2.5)) * -6;
    case "watch":
      return Math.abs(Math.sin(t / 7)) * -1.5;
    case "write":
      return Math.abs(Math.sin(t / 6)) * -2;
    case "hang":
      return Math.sin(t / 5) * 1.5;
    case "walk":
      return Math.floor(t / 2) % 2 ? -2 : 0;
    case "peek":
      return Math.abs(Math.sin(t / 8)) * -3;
    case "books":
      return Math.abs(Math.sin(t / 5)) * -1.5;
    case "squish":
      return 0; // the squash transform handles it
    default:
      return Math.abs(Math.sin(t / 6)) * -2;
  }
}

function rotFor(activity, t) {
  if (activity === "celebrate") return Math.sin(t / 2.5) * 3;
  return 0;
}

const BUBBLES = {
  watch: ["ترا قربت! 👀", "لا تنسى! ⏰", "عندك شي قريب!"],
  celebrate: ["برااافو! 🎉", "يا سلام عليك! 🌟", "درجة حلوة! 👏"],
  squish: ["آي! 😖", "أوووه!", "بس! 😣", "لا تضغط! 😤"],
};

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */

export default function HaviMascot({
  size = 54,
  highGradeThreshold = 0.9,
  celebrateMs = 10000, // celebration lasts 10s, interruptible
  restMinMs = 14000, // how long he rests before wanting to move
  restMaxMs = 26000,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const containerRef = useRef(null);

  const [activity, setActivity] = useState("sleep");
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const [visible, setVisible] = useState(false);
  const [bubble, setBubble] = useState(null);
  const [reduced, setReduced] = useState(false);

  const tRef = useRef(0);
  const posRef = useRef({ top: -9999, left: -9999 });
  const targetElRef = useRef(null);
  const cornerRef = useRef("right");

  // behaviour engine
  const queueRef = useRef([]); // upcoming phases
  const phaseEndRef = useRef(0); // when the current phase finishes
  const jumpRef = useRef(null);
  const walkRef = useRef(null); // {dir, speed}
  const riseRef = useRef(null); // {start, dur}
  const squishRef = useRef(null); // {start, dur} — fast press reaction
  const celebrateUntilRef = useRef(0);
  const busyRef = useRef(false); // hurt/celebrate lock
  const restedRef = useRef(false); // alternates rest <-> relocate
  const bubbleTimerRef = useRef(null);

  const scale = Math.max(2, Math.round(size / GRID_W));
  const canvasW = scale * GRID_W;
  const canvasH = scale * GRID_H;

  /* ---------------- reduced motion ---------------- */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const fn = () => setReduced(mq.matches);
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);

  /* ---------------- finding cards ---------------- */
  const findCardEl = useCallback((role) => {
    const els = Array.from(
      document.querySelectorAll(`[data-havi-role="${role}"]`)
    ).filter((el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    if (!els.length) return null;
    return els[Math.floor(Math.random() * els.length)];
  }, []);

  const allCards = useCallback(() => {
    const tagged = Array.from(
      document.querySelectorAll("[data-havi-role], [data-havi-card], [data-havi-course-id]")
    ).filter((el) => el.offsetParent !== null);
    if (tagged.length) return tagged;

    // auto-detect card-like boxes on untagged pages
    const vw = window.innerWidth;
    const out = [];
    const nodes = document.querySelectorAll(
      "main div, main section, main article, div[class*='card'], section, article"
    );
    for (const el of nodes) {
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 180 || r.height < 70) continue;
      if (r.width > vw * 0.96) continue;
      if (r.height > window.innerHeight * 1.5) continue;
      const cs = window.getComputedStyle(el);
      if ((parseFloat(cs.borderRadius) || 0) < 8) continue;
      const bg = cs.backgroundColor;
      const hasBg = bg && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg) && bg !== "transparent";
      if (!hasBg && !(parseFloat(cs.borderWidth) > 0) && cs.boxShadow === "none") continue;
      out.push(el);
    }
    // prefer innermost
    const leaves = out.filter((el) => !out.some((o) => o !== el && el.contains(o)));
    return leaves.length ? leaves : out;
  }, []);

  /* only cards currently on screen — so he never acts off-view */
  const visibleCards = useCallback(() => {
    return allCards().filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 60 && r.top < window.innerHeight - 40;
    });
  }, [allCards]);

  const randomCard = useCallback(() => {
    const pool = visibleCards();
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [visibleCards]);

  /* ---------------- positioning ---------------- */
  const setPosition = useCallback((top, left) => {
    posRef.current = { top, left };
    setPos({ top, left });
    if (containerRef.current) {
      containerRef.current.style.top = `${top}px`;
      containerRef.current.style.left = `${left}px`;
    }
  }, []);

  const coordsFor = useCallback(
    (el, corner) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top + window.scrollY - size * 0.62,
        left:
          corner === "left"
            ? r.left + window.scrollX + 10
            : r.right + window.scrollX - size - 10,
      };
    },
    [size]
  );

  const perch = useCallback(
    (el, corner) => {
      if (!el || el.offsetParent === null) return false;
      const c = corner || (Math.random() > 0.5 ? "left" : "right");
      const { top, left } = coordsFor(el, c);
      targetElRef.current = el;
      cornerRef.current = c;
      setPosition(top, left);
      setVisible(true);
      return true;
    },
    [coordsFor, setPosition]
  );

  /* ---------------- bubbles ---------------- */
  const say = useCallback((kind, ms = 3500) => {
    const arr = BUBBLES[kind];
    if (!arr) return;
    setBubble(arr[Math.floor(Math.random() * arr.length)]);
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => setBubble(null), ms);
  }, []);

  /* ================= BEHAVIOUR ENGINE ================= */

  /** what he does when resting, based on which page he's on */
  const restingActivity = useCallback(() => {
    if (findCardEl("current-week")) {
      return ["write", "hang", "walk"][Math.floor(Math.random() * 3)];
    }
    const nearDue = document.querySelector(
      '[data-havi-role="upcoming"][data-havi-near-due="true"]'
    );
    if (nearDue && nearDue.offsetParent !== null) return "watch";
    if (findCardEl("course")) {
      return ["watch", "peek", "books"][Math.floor(Math.random() * 3)];
    }
    return Math.random() > 0.35 ? "sleep" : "watch";
  }, [findCardEl]);

  /** push a sequence of phases; the engine plays them in order */
  const queue = useCallback((steps) => {
    queueRef.current = steps;
    phaseEndRef.current = 0; // advance immediately on next tick
  }, []);

  /** settle into a resting phase on the current card */
  const settle = useCallback(() => {
    busyRef.current = false;
    const el = targetElRef.current;
    if (!el || el.offsetParent === null) {
      const c = randomCard();
      if (!c) {
        setVisible(false);
        phaseEndRef.current = performance.now() + 3000;
        return;
      }
      perch(c);
    }
    // near-due reminder gets a nudge
    const act = restingActivity();
    setActivity(act);
    if (act === "watch") {
      const nearDue = document.querySelector(
        '[data-havi-role="upcoming"][data-havi-near-due="true"]'
      );
      if (nearDue && Math.random() > 0.5) say("watch");
    }
    phaseEndRef.current =
      performance.now() + restMinMs + Math.random() * (restMaxMs - restMinMs);
  }, [perch, randomCard, restingActivity, say, restMinMs, restMaxMs]);

  /** the full "I want to move somewhere else" sequence */
  const relocate = useCallback(
    (target) => {
      const dest = target || randomCard();
      if (!dest || dest === targetElRef.current) {
        settle();
        return;
      }
      const from = posRef.current;
      const to = coordsFor(dest, Math.random() > 0.5 ? "left" : "right");
      const goingRight = to.left >= from.left;

      const steps = [];
      // if he's asleep, he has to wake up first
      if (activity === "sleep") steps.push({ act: "wake", ms: 900 });
      steps.push({ act: "watch", ms: 1400 }); // look around
      steps.push({
        act: "walk",
        ms: 900,
        onStart: () => {
          walkRef.current = { dir: goingRight ? 1 : -1, speed: 0.9 };
        },
        onEnd: () => {
          walkRef.current = null;
        },
      });
      steps.push({
        act: "jump",
        ms: 0, // duration comes from the jump itself
        onStart: () => startJump(dest, to),
      });
      queue(steps);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, randomCard, coordsFor, settle, queue]
  );

  /** launch the arc; perpendicular bow so vertical moves work */
  const startJump = useCallback(
    (destEl, toCoords) => {
      const from = posRef.current;
      const to = toCoords || coordsFor(destEl, cornerRef.current);
      const dx = to.left - from.left;
      const dy = to.top - from.top;
      const dist = Math.hypot(dx, dy) || 1;
      const vertical = Math.abs(dy) > Math.abs(dx);
      const side = from.left > window.innerWidth / 2 ? -1 : 1;

      targetElRef.current = destEl;
      jumpRef.current = {
        fromTop: from.top,
        fromLeft: from.left,
        toTop: to.top,
        toLeft: to.left,
        start: performance.now(),
        dur: Math.min(950, 420 + dist * 0.3),
        vertical,
        side,
        dir: vertical ? side : dx >= 0 ? 1 : -1,
        bulge: Math.min(90, 30 + dist * 0.22),
        lift: Math.min(70, 24 + dist * 0.16),
      };
      setVisible(true);
    },
    [coordsFor]
  );

  /** entrance: rise up from behind a visible card, walk a little, then settle */
  const enterFromCard = useCallback(() => {
    const card = randomCard();
    if (!card) {
      setVisible(false);
      return;
    }
    perch(card);
    setVisible(true);
    riseRef.current = { start: performance.now(), dur: 700 };
    queue([
      { act: "peek", ms: 700 }, // rising (clip handled by riseRef)
      {
        act: "walk",
        ms: 800,
        onStart: () => {
          walkRef.current = { dir: Math.random() > 0.5 ? 1 : -1, speed: 0.7 };
        },
        onEnd: () => {
          walkRef.current = null;
        },
      },
    ]);
  }, [randomCard, perch, queue]);

  /* ---------------- celebrate ---------------- */
  const celebrate = useCallback(
    (arg) => {
      const detail = arg && typeof arg === "object" ? arg : null;
      let r = detail ? undefined : arg;
      if (detail) {
        const sc = Number(detail.score);
        const mx = Number(detail.max);
        if (mx > 0) r = sc / mx;
        else if (detail.ratio !== undefined) r = Number(detail.ratio);
      }
      if (typeof r === "string") r = Number(r);
      if (typeof r === "number" && r > 1) r = r / 100;
      if (typeof r === "number" && !Number.isNaN(r) && r < highGradeThreshold) return;

      // which card? the one whose grade field you were just in
      const SEL = '[data-havi-role="course"], [data-havi-course-id], [data-havi-card]';
      let el = null;
      if (detail?.el instanceof Element) el = detail.el;
      if (!el && detail?.selector) el = document.querySelector(detail.selector);
      if (!el && detail?.courseId != null)
        el =
          document.querySelector(`[data-havi-course-id="${detail.courseId}"]`) ||
          document.querySelector(`[data-course-id="${detail.courseId}"]`);
      if (!el) {
        const f = document.activeElement;
        if (f && f !== document.body) el = f.closest(SEL);
      }
      if (!el) el = findCardEl("course") || randomCard() || targetElRef.current;
      if (!el) return;

      queueRef.current = [];
      jumpRef.current = null;
      walkRef.current = null;
      busyRef.current = true;
      perch(el, "right");
      setActivity("celebrate");
      say("celebrate", Math.min(celebrateMs, 5000));
      celebrateUntilRef.current = performance.now() + celebrateMs;
      phaseEndRef.current = celebrateUntilRef.current;
      try {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (e) {}
    },
    [highGradeThreshold, celebrateMs, findCardEl, randomCard, perch, say]
  );

  /** any user action cuts the party short and he re-enters naturally */
  const interruptCelebration = useCallback(() => {
    if (!busyRef.current || activity !== "celebrate") return;
    celebrateUntilRef.current = 0;
    busyRef.current = false;
    setBubble(null);
    enterFromCard();
  }, [activity, enterFromCard]);

  /* ---------------- poke reaction ---------------- */
  const poke = useCallback(() => {
    if (squishRef.current) return; // already squishing
    jumpRef.current = null;
    walkRef.current = null;
    busyRef.current = true;
    squishRef.current = { start: performance.now(), dur: 420 }; // fast & snappy
    queueRef.current = [{ act: "squish", ms: 420 }];
    phaseEndRef.current = 0;
    say("squish", 1100);
  }, [say]);

  /* ---------------- refs used inside the loop ---------------- */
  const settleRef = useRef(null);
  const relocateRef = useRef(null);
  const enterRef2 = useRef(null);
  useEffect(() => {
    settleRef.current = settle;
  }, [settle]);
  useEffect(() => {
    relocateRef.current = relocate;
  }, [relocate]);
  useEffect(() => {
    enterRef2.current = enterFromCard;
  }, [enterFromCard]);

  /* ---------------- clicks ---------------- */
  useEffect(() => {
    const onClick = (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      // clicking Havi himself is handled by his own handler
      if (containerRef.current && containerRef.current.contains(el)) return;

      // any click during a celebration ends it gracefully
      if (busyRef.current && activity === "celebrate") {
        interruptCelebration();
        return;
      }
      if (busyRef.current) return; // hurt/angry: let him finish

      // clicking a card -> he goes there properly (walk + jump)
      let card = el.closest(
        '[data-havi-role], [data-havi-card], [data-havi-course-id]'
      );
      if (!card) {
        let p = el;
        while (p && p !== document.body) {
          const r = p.getBoundingClientRect();
          const cs = window.getComputedStyle(p);
          if (
            r.width >= 180 &&
            r.height >= 70 &&
            r.width <= window.innerWidth * 0.96 &&
            (parseFloat(cs.borderRadius) || 0) >= 8
          ) {
            card = p;
            break;
          }
          p = p.parentElement;
        }
      }
      if (card && card !== targetElRef.current) relocateRef.current?.(card);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [activity, interruptCelebration]);

  /* ---------------- route changes ---------------- */
  useEffect(() => {
    let lastPath = window.location.pathname;
    const id = setInterval(() => {
      if (window.location.pathname === lastPath) return;
      lastPath = window.location.pathname;
      // a page change cancels whatever he was doing
      queueRef.current = [];
      jumpRef.current = null;
      walkRef.current = null;
      busyRef.current = false;
      celebrateUntilRef.current = 0;
      setBubble(null);
      setVisible(false);
      // let the new page render, then he rises from behind a card
      setTimeout(() => enterRef2.current?.(), 500);
    }, 400);
    return () => clearInterval(id);
  }, []);

  /* ---------------- public API ---------------- */
  useEffect(() => {
    window.havi = {
      celebrate,
      poke,
      goTo: (elOrSelector) => {
        const el =
          typeof elOrSelector === "string"
            ? document.querySelector(elOrSelector)
            : elOrSelector;
        if (el) relocateRef.current?.(el);
      },
      refresh: () => enterRef2.current?.(),
    };
    const onEvt = (e) => celebrate(e?.detail);
    window.addEventListener("havi:celebrate", onEvt);
    return () => {
      window.removeEventListener("havi:celebrate", onEvt);
      try {
        delete window.havi;
      } catch (e) {}
    };
  }, [celebrate, poke]);

  /* ---------------- boot + keep glued on resize ---------------- */
  useEffect(() => {
    const boot = setTimeout(() => enterRef2.current?.(), 600);
    const onResize = () => {
      const el = targetElRef.current;
      if (el && el.offsetParent !== null && !jumpRef.current) {
        const { top, left } = coordsFor(el, cornerRef.current);
        setPosition(top, left);
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(boot);
      window.removeEventListener("resize", onResize);
    };
  }, [coordsFor, setPosition]);

  /* ================= MAIN LOOP ================= */
  useEffect(() => {
    let raf;
    let last = 0;

    const currentStepRef = { step: null };
    const advance = () => {
      // finish the step that just ended
      if (currentStepRef.step?.onEnd) currentStepRef.step.onEnd();
      currentStepRef.step = null;

      const q = queueRef.current;
      if (q.length) {
        const step = q.shift();
        currentStepRef.step = step;
        step.onStart?.();
        setActivity(step.act);
        phaseEndRef.current =
          step.ms > 0 ? performance.now() + step.ms : Number.MAX_SAFE_INTEGER;
        return;
      }

      // Queue is empty. Alternate between resting and moving somewhere new,
      // so he naturally cycles: rest -> wake/look/walk/jump -> rest -> ...
      if (restedRef.current) {
        restedRef.current = false;
        relocateRef.current?.();
      } else {
        restedRef.current = true;
        settleRef.current?.();
      }
    };

    const loop = (ts) => {
      raf = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      if (!canvas) return;

      /* --- rising from behind a card --- */
      let riseP = 1;
      const ri = riseRef.current;
      if (ri) {
        riseP = Math.min(1, (ts - ri.start) / ri.dur);
        if (riseP >= 1) riseRef.current = null;
      }

      /* --- squish reaction: flatten fast, spring back --- */
      const sq = squishRef.current;
      if (sq && wrapRef.current) {
        const p = Math.min(1, (ts - sq.start) / sq.dur);
        let sy;
        if (p < 0.22) sy = 1 - (p / 0.22) * 0.45; // slam down to 0.55
        else if (p < 0.55) sy = 0.55 + ((p - 0.22) / 0.33) * 0.6; // spring to 1.15
        else if (p < 0.8) sy = 1.15 - ((p - 0.55) / 0.25) * 0.22; // settle to 0.93
        else sy = 0.93 + ((p - 0.8) / 0.2) * 0.07; // back to 1
        const sx = 1 + (1 - sy) * 0.35; // widen as it flattens
        wrapRef.current.style.transformOrigin = "50% 100%";
        wrapRef.current.style.transform = `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
        if (p >= 1) {
          squishRef.current = null;
          wrapRef.current.style.transform = "";
          wrapRef.current.style.transformOrigin = "";
        }
      }

      /* --- jump arc --- */
      const j = jumpRef.current;
      if (j && containerRef.current) {
        const p = Math.min(1, (ts - j.start) / j.dur);
        const wave = Math.sin(Math.PI * p);
        let x = j.fromLeft + (j.toLeft - j.fromLeft) * p;
        let y = j.fromTop + (j.toTop - j.fromTop) * p;
        if (j.vertical) {
          x += j.side * j.bulge * wave;
          y -= j.lift * wave * 0.45;
        } else {
          y -= j.lift * wave;
        }
        containerRef.current.style.top = `${y}px`;
        containerRef.current.style.left = `${x}px`;
        if (wrapRef.current) {
          wrapRef.current.style.transform = `rotate(${(j.dir * 9 * wave).toFixed(
            2
          )}deg) scaleY(${(1 + 0.15 * wave).toFixed(3)})`;
        }
        if (p >= 1) {
          jumpRef.current = null;
          posRef.current = { top: j.toTop, left: j.toLeft };
          setPos({ top: j.toTop, left: j.toLeft });
          if (wrapRef.current) {
            wrapRef.current.style.transform = "scaleY(0.88)"; // landing squash
            setTimeout(() => {
              if (wrapRef.current && !jumpRef.current)
                wrapRef.current.style.transform = "";
            }, 120);
          }
          phaseEndRef.current = 0; // move on
        }
      }

      /* --- walking along a card --- */
      const w = walkRef.current;
      if (w && containerRef.current && !j) {
        const el = targetElRef.current;
        let nx = posRef.current.left + w.dir * w.speed;
        if (el) {
          const r = el.getBoundingClientRect();
          const minX = r.left + window.scrollX + 6;
          const maxX = r.right + window.scrollX - size - 6;
          nx = Math.max(minX, Math.min(maxX, nx));
        }
        posRef.current = { ...posRef.current, left: nx };
        containerRef.current.style.left = `${nx}px`;
      }

      /* --- phase scheduler --- */
      if (!jumpRef.current && ts >= phaseEndRef.current) {
        if (activity === "celebrate" && celebrateUntilRef.current) {
          // party's over -> re-enter the page naturally
          celebrateUntilRef.current = 0;
          busyRef.current = false;
          queueRef.current = [];
          enterRef2.current?.();
        } else {
          advance();
        }
      }

      /* --- draw --- */
      if (reduced) {
        drawFrame(canvas, activity, 0, { riseP });
        if (wrapRef.current) wrapRef.current.style.transform = "none";
        return;
      }
      if (ts - last < 120) return;
      last = ts;
      tRef.current++;
      drawFrame(canvas, activity, tRef.current, { riseP });
      if (wrapRef.current && !jumpRef.current && !squishRef.current) {
        const t = tRef.current;
        const b = Math.max(-6, Math.min(6, bobFor(activity, t)));
        wrapRef.current.style.transform = `translateY(${b}px) rotate(${rotFor(
          activity,
          t
        )}deg)`;
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [activity, reduced, size]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        width: size,
        height: size,
        zIndex: 40,
        pointerEvents: "none",
      }}
    >
      {bubble && (
        <div
          dir="rtl"
          style={{
            position: "absolute",
            bottom: size - 4,
            right: 0,
            background: "#fff",
            border: "1px solid #e3e3dd",
            borderRadius: 10,
            padding: "4px 10px",
            fontSize: 12,
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,.08)",
            color: "#2c2c2a",
          }}
        >
          {bubble}
        </div>
      )}
      <div ref={wrapRef} style={{ width: size, height: size }}>
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          onClick={(e) => {
            e.stopPropagation();
            poke();
          }}
          style={{
            width: size,
            height: size,
            imageRendering: "pixelated",
            display: "block",
            pointerEvents: "auto", // he can be poked
            cursor: "pointer",
          }}
          aria-label="Havi"
          role="img"
        />
      </div>
    </div>
  );
}
