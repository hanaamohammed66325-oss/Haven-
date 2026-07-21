"use client";

/**
 * HaviMascot — a single context-aware pixel-art frog mascot for Haven.
 *
 * ONE frog at a time. Its position + expression depend on context:
 *   - CELEBRATE : pops up from BEHIND the full course card when a high grade
 *                 is saved (>= 90% of max, i.e. within 3 points of full on a /100 scale;
 *                 the trigger passes a normalized ratio so any max works).
 *   - WATCH     : sits on the Upcoming card corner when a task/exam is near-due.
 *   - WRITE     : sits on top of the CURRENT week card on the Schedule page.
 *   - SLEEP     : default. Perches on a random "generic" card and sleeps (with blanket).
 *
 * The frog art is drawn on a <canvas> pixel grid so it exactly matches the
 * designs you approved (same body, eyes, mouth, flower, blanket, confetti, etc).
 *
 * HOW TO USE — see the block comment at the bottom of this file.
 */

import { useEffect, useRef, useState, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Pixel art definitions                                              */
/* ------------------------------------------------------------------ */

const COL = {
  k: "#111111", // outline / eyes
  G: "#a8d98a", // body green
  f: "#e88bb5", // flower pink
  y: "#f2d94e", // flower yellow center
  b: "#3b6ea5", // pen / accents
  L: "#85b7eb", // light blue
  N: "#2b3245", // dark navy
  W: "#ffffff",
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
};

// 28 wide x 21 tall base body (no eyes/mouth baked in). "." = transparent.
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

/* ------------------------------------------------------------------ */
/*  Canvas drawing helpers                                            */
/* ------------------------------------------------------------------ */

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
 * Draw one animation frame for a given activity onto the canvas.
 * t = frame counter (increments ~ every 130ms).
 */
function drawFrame(canvas, activity, t) {
  const ctx = canvas.getContext("2d");
  const s = canvas.width / GRID_W; // pixel scale
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  paintBody(ctx, s);

  if (activity === "sleep") {
    // closed eyes
    px(ctx, s, 7, 10, 4, 1, COL.k);
    px(ctx, s, 16, 10, 4, 1, COL.k);
    // breathing mouth
    if (t % 12 < 6) px(ctx, s, 12, 13, 4, 2, COL.k);
    else px(ctx, s, 12, 13, 4, 1, COL.k);
    // blanket over lower body with wavy top edge
    const by = 15;
    px(ctx, s, 1, by + 1, 23, 5, COL.blanket);
    for (let x = 1; x < 24; x += 2) px(ctx, s, x, by, 1, 1, COL.blanket);
    px(ctx, s, 1, by + 1, 23, 1, COL.blanketHi);
    px(ctx, s, 6, by + 3, 1, 2, COL.blanketSh);
    px(ctx, s, 14, by + 3, 1, 2, COL.blanketSh);
    px(ctx, s, 19, by + 3, 1, 2, COL.blanketSh);
    // snore bubble
    const size = 1 + (t % 12 < 6 ? 1 : 0);
    px(ctx, s, 20, 12, size, size, COL.snore);
    // Zzz
    ctx.fillStyle = COL.zzz;
    ctx.font = `${Math.round(s * 2.2)}px sans-serif`;
    ctx.fillText("z", 22 * s, (6 - (t % 6) * 0.35) * s + s);
  } else if (activity === "watch") {
    px(ctx, s, 12, 13, 4, 1, COL.k); // mouth
    // phone held in front
    px(ctx, s, 10, 18, 8, 3, COL.N);
    // cycle: look LEFT -> look RIGHT -> look DOWN at phone (x2)
    const cyc = Math.floor(t / 6) % 4;
    let ox = 0;
    let oy = 0;
    if (cyc === 0) ox = -1;
    else if (cyc === 1) ox = 1;
    else oy = 1; // looking down at the phone
    px(ctx, s, 8 + ox, 9 + oy, 2, 2, COL.k);
    px(ctx, s, 17 + ox, 9 + oy, 2, 2, COL.k);
    // screen glows only while looking down
    if (cyc >= 2) {
      px(ctx, s, 11, 19, 6, 1, t % 2 === 0 ? COL.L : "#c9e3fb");
    }
  } else if (activity === "write") {
    // studying: writes for a while, then rests (هجد)
    const cyc = t % 30;
    const writing = cyc < 18;
    // paper
    px(ctx, s, 7, 19, 9, 3, COL.paper);
    if (writing) {
      px(ctx, s, 8, 10, 2, 2, COL.k); // eyes down
      px(ctx, s, 17, 10, 2, 2, COL.k);
      const penX = 8 + (cyc % 9);
      px(ctx, s, 15, 17, 2, 2, COL.G); // little arm
      px(ctx, s, penX, 16, 1, 3, COL.b); // pen
      px(ctx, s, penX, 15, 1, 1, COL.mouthRed); // pen tip
      for (let m = 0; m < cyc % 9; m++) px(ctx, s, 8 + m, 20, 1, 1, COL.ink);
    } else {
      px(ctx, s, 7, 10, 3, 1, COL.k); // half-lidded
      px(ctx, s, 16, 10, 3, 1, COL.k);
      px(ctx, s, 15, 18, 2, 1, COL.G); // arm resting
      px(ctx, s, 8, 20, 7, 1, COL.ink); // finished text
    }
    px(ctx, s, 12, 13, 4, 1, COL.k); // mouth
  } else if (activity === "celebrate") {
    // triangle happy eyes
    px(ctx, s, 8, 11, 1, 1, COL.k);
    px(ctx, s, 9, 10, 1, 1, COL.k);
    px(ctx, s, 10, 11, 1, 1, COL.k);
    px(ctx, s, 17, 11, 1, 1, COL.k);
    px(ctx, s, 18, 10, 1, 1, COL.k);
    px(ctx, s, 19, 11, 1, 1, COL.k);
    // open smile + tongue
    px(ctx, s, 11, 13, 6, 1, COL.k);
    px(ctx, s, 12, 14, 4, 1, COL.mouthRed);
    px(ctx, s, 13, 15, 2, 1, COL.tongue);
    // cheeks
    px(ctx, s, 6, 12, 1, 1, COL.cheek);
    px(ctx, s, 20, 12, 1, 1, COL.cheek);
    // confetti
    const cols = [COL.f, COL.y, "#8bc34a", COL.zzz];
    for (let i = 0; i < 4; i++) {
      const cx = 3 + i * 6;
      const cy = (t * 0.6 + i * 4) % 20;
      px(ctx, s, cx, Math.floor(cy), 1, 1, cols[i % 4]);
    }
  } else if (activity === "hang") {
    // SITTING on the card edge, legs dangling and swinging, eyes WATCHING around.
    const look = Math.floor(t / 6) % 3;
    const ex = look === 0 ? -1 : look === 1 ? 1 : 0;
    px(ctx, s, 8 + ex, 9, 2, 3, COL.k); // eyes dart left / right / forward
    px(ctx, s, 17 + ex, 9, 2, 3, COL.k);
    px(ctx, s, 12, 13, 4, 1, COL.k); // mouth
    const sw = Math.round(Math.sin(t / 5)); // swing
    px(ctx, s, 8 + sw, 20, 2, 4, COL.G); // dangling legs
    px(ctx, s, 8 + sw, 24, 2, 1, COL.d); // feet
    px(ctx, s, 16 - sw, 20, 2, 4, COL.G);
    px(ctx, s, 16 - sw, 24, 2, 1, COL.d);
  } else if (activity === "walk") {
    // WALKING — alternating feet, small head bob
    px(ctx, s, 9, 9, 2, 3, COL.k); // eyes look forward
    px(ctx, s, 18, 9, 2, 3, COL.k);
    px(ctx, s, 12, 13, 4, 1, COL.k);
    const step = Math.floor(t / 2) % 2;
    px(ctx, s, 7, 19, 3, 2, step ? COL.G : COL.d);
    px(ctx, s, 16, 19, 3, 2, step ? COL.d : COL.G);
  } else if (activity === "peek") {
    // PEEKING from behind the card — head, eyes AND mouth stay above the edge
    px(ctx, s, 8, 9, 2, 3, COL.k); // eyes
    px(ctx, s, 17, 9, 2, 3, COL.k);
    px(ctx, s, 12, 13, 4, 1, COL.k); // mouth (kept above the cut)
    // fingers gripping the edge
    px(ctx, s, 7, 15, 2, 1, COL.G);
    px(ctx, s, 18, 15, 2, 1, COL.G);
    // hide everything below the edge so he reads as being behind the card
    ctx.clearRect(0, 16 * s, canvas.width, canvas.height);
  } else if (activity === "books") {
    // CARRYING BOOKS — a colorful stack held in front
    px(ctx, s, 8, 9, 2, 3, COL.k); // eyes
    px(ctx, s, 17, 9, 2, 3, COL.k);
    px(ctx, s, 11, 13, 6, 1, COL.k); // small smile
    px(ctx, s, 12, 14, 4, 1, COL.k);
    const bob = Math.abs(Math.sin(t / 5)) > 0.5 ? 1 : 0;
    px(ctx, s, 5, 17 - bob, 16, 2, "#c0563f"); // red book
    px(ctx, s, 6, 19 - bob, 14, 2, COL.b); // blue book
    px(ctx, s, 5, 21 - bob, 16, 2, "#6a9c5a"); // green book
    px(ctx, s, 5, 18 - bob, 1, 1, COL.paper); // page edges
    px(ctx, s, 6, 20 - bob, 1, 1, COL.paper);
    px(ctx, s, 5, 22 - bob, 1, 1, COL.paper);
    px(ctx, s, 3, 17 - bob, 2, 3, COL.G); // arms holding
    px(ctx, s, 21, 17 - bob, 2, 3, COL.G);
  } else if (activity === "enter") {
    // ENTERING a page — walking forward (fade + shrink handled by the loop)
    px(ctx, s, 9, 9, 2, 3, COL.k); // eyes looking ahead
    px(ctx, s, 18, 9, 2, 3, COL.k);
    px(ctx, s, 12, 13, 4, 1, COL.k);
    const st = Math.floor(t / 2) % 2;
    px(ctx, s, 7, 19, 3, 2, st ? COL.G : COL.d);
    px(ctx, s, 16, 19, 3, 2, st ? COL.d : COL.G);
  } else if (activity === "jump") {
    // JUMP pose — eyes wide, legs tucked under
    px(ctx, s, 8, 9, 2, 3, COL.k);
    px(ctx, s, 17, 9, 2, 3, COL.k);
    px(ctx, s, 12, 13, 4, 1, COL.k);
    px(ctx, s, 7, 18, 3, 2, COL.G); // tucked legs
    px(ctx, s, 17, 18, 3, 2, COL.G);
  } else {
    // idle: plain open-eyed frog
    px(ctx, s, 8, 9, 2, 3, COL.k);
    px(ctx, s, 17, 9, 2, 3, COL.k);
    px(ctx, s, 12, 13, 4, 1, COL.k);
  }
}

/* ------------------------------------------------------------------ */
/*  Vertical bob per activity (returns px offset)                     */
/* ------------------------------------------------------------------ */

function bobFor(activity, t) {
  switch (activity) {
    case "sleep":
      return Math.sin(t / 9) * 2;
    case "celebrate":
      return Math.abs(Math.sin(t / 2.5)) * -6;
    case "watch":
      return Math.abs(Math.sin(t / 7)) * -1.5;
    case "write":
      return Math.abs(Math.sin(t / 6)) * -2;
    case "hang":
      return Math.sin(t / 5) * 1.5; // gentle sway while hanging
    case "walk":
      return Math.floor(t / 2) % 2 ? -2 : 0; // step bounce
    case "peek":
      return Math.abs(Math.sin(t / 8)) * -3; // rises and lowers while peeking
    case "books":
      return Math.abs(Math.sin(t / 5)) * -1.5;
    case "jump":
      return 0; // the arc itself handles movement
    default:
      return Math.abs(Math.sin(t / 6)) * -2;
  }
}

function rotFor(activity, t) {
  return activity === "celebrate" ? Math.sin(t / 2.5) * 3 : 0;
}

/* ------------------------------------------------------------------ */
/*  Speech bubbles                                                    */
/* ------------------------------------------------------------------ */

const BUBBLES = {
  watch: ["ترا قربت! 👀", "لا تنسى! ⏰", "عندك شي قريب!"],
  celebrate: ["برااافو! 🎉", "يا سلام عليك! 🌟", "درجة حلوة! 👏"],
};

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export default function HaviMascot({
  size = 54,
  highGradeThreshold = 0.9, // >= 90% of max => celebrate (within 3 pts on /100)
  celebrateMs = 60000, // how long the celebration lasts (default 1 minute)
  relocateEveryMs = 30000,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const tRef = useRef(0);
  /* refs to read latest state inside intervals without re-binding */
  const activityRef = useRef("sleep");
  const roleRef = useRef("generic");
  const cornerRef = useRef("right");
  const behindRef = useRef(false);
  const celebratingRef = useRef(false);
  const celebrateTimerRef = useRef(null);
  const containerRef = useRef(null);
  const jumpRef = useRef(null); // {fromTop,fromLeft,toTop,toLeft,start,dur,dir}
  const posRef = useRef({ top: -9999, left: -9999 });
  const placeDefaultRef = useRef(null);
  const enterRef = useRef(null); // {start, dur, phase}
  const doorRef = useRef(null); // small glowing doorway element
  const jumpToRef = useRef(null);
  const showDoorRef = useRef(null);
  const perchHomeRef = useRef(null);
  const enterPageRef = useRef(null);
  const [activity, setActivity] = useState("sleep");
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const [bubble, setBubble] = useState(null);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(false);
  const scale = Math.round(size / GRID_W) || 2;
  const canvasW = scale * GRID_W;
  const canvasH = scale * GRID_H;

  /* respect reduced motion */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const fn = () => setReduced(mq.matches);
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);

  /* find a visible card element by role */
  const findCardEl = useCallback((role) => {
    const els = Array.from(
      document.querySelectorAll(`[data-havi-role="${role}"]`)
    ).filter((el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    if (!els.length) return null;
    return els[Math.floor(Math.random() * els.length)];
  }, []);

  /**
   * AUTO-DETECT cards on pages that have no data-havi-role tags.
   * Looks for card-like boxes: visible, rounded corners, own background,
   * reasonable size, and not merely a wrapper around other cards.
   */
  const autoDetectCard = useCallback(() => {
    const vw = window.innerWidth;
    const candidates = [];
    const nodes = document.querySelectorAll(
      "main div, main section, main article, div[class*='card'], section, article"
    );
    for (const el of nodes) {
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 180 || r.height < 70) continue;      // too small
      if (r.width > vw * 0.96) continue;                  // full-width wrapper
      if (r.height > window.innerHeight * 1.5) continue;  // page-level container
      const cs = window.getComputedStyle(el);
      const radius = parseFloat(cs.borderRadius) || 0;
      const bg = cs.backgroundColor;
      const hasBg = bg && bg !== "transparent" && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg);
      const hasBorder = parseFloat(cs.borderWidth) > 0;
      const hasShadow = cs.boxShadow && cs.boxShadow !== "none";
      if (radius < 8) continue;                           // cards are rounded
      if (!hasBg && !hasBorder && !hasShadow) continue;    // needs a visible surface
      candidates.push(el);
    }
    if (!candidates.length) return null;
    // prefer innermost cards (drop any element that contains another candidate)
    const leaves = candidates.filter(
      (el) => !candidates.some((other) => other !== el && el.contains(other))
    );
    const pool = leaves.length ? leaves : candidates;
    return pool[Math.floor(Math.random() * pool.length)];
  }, []);

  /* store the element we're currently perched on so scroll/resize can re-read it */
  const targetElRef = useRef(null);

  /* compute fixed-viewport coords from the perched element and apply them */
  const applyPosFromEl = useCallback(
    (el, corner, behind) => {
      if (!el || el.offsetParent === null) {
        setVisible(false);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) {
        setVisible(false);
        return;
      }
      // DOCUMENT coordinates (not viewport) so the mascot scrolls WITH the card
      const top = r.top + window.scrollY - size * (behind ? 0.5 : 0.62);
      const left =
        corner === "left"
          ? r.left + window.scrollX + 10
          : r.right + window.scrollX - size - 10;
      setPos({ top, left });
      posRef.current = { top, left };
      setVisible(true);
    },
    [size]
  );

  /* perch on a card by role; falls back to generic; hides if nothing found */
  const perch = useCallback(
    (role, corner = "right", behind = false) => {
      let el = findCardEl(role);
      if (!el) el = findCardEl("generic");
      if (!el) el = autoDetectCard(); // works on untagged pages
      if (!el) {
        targetElRef.current = null;
        setVisible(false);
        return;
      }
      targetElRef.current = el;
      roleRef.current = role;
      cornerRef.current = corner;
      behindRef.current = behind;
      applyPosFromEl(el, corner, behind);
    },
    [findCardEl, autoDetectCard, applyPosFromEl]
  );

  const bubbleTimerRef = useRef(null);
  /**
   * JUMP to a card with a frog-like arc (a V that leans left or right
   * depending on travel direction).
   */
  const jumpTo = useCallback(
    (el, corner) => {
      if (!el || el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;

      // where we're going
      const useCorner =
        corner || (Math.random() > 0.5 ? "left" : "right");
      const toTop = r.top + window.scrollY - size * 0.62;
      const toLeft =
        useCorner === "left"
          ? r.left + window.scrollX + 10
          : r.right + window.scrollX - size - 10;

      const from = posRef.current;
      // if we've never been placed, just appear there
      if (from.top < -9000) {
        targetElRef.current = el;
        cornerRef.current = useCorner;
        behindRef.current = false;
        applyPosFromEl(el, useCorner, false);
        return;
      }

      const dx = toLeft - from.left;
      const dy = toTop - from.top;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) return; // already there

      targetElRef.current = el;
      cornerRef.current = useCorner;
      behindRef.current = false;

      // Cards stack vertically and the page scrolls up/down, so the arc must
      // bow PERPENDICULAR to the direction of travel:
      //   - horizontal move  -> arc lifts upward
      //   - vertical move    -> arc bulges out to the side
      const vertical = Math.abs(dy) > Math.abs(dx);
      const side = from.left > window.innerWidth / 2 ? -1 : 1; // bulge inward

      jumpRef.current = {
        fromTop: from.top,
        fromLeft: from.left,
        toTop,
        toLeft,
        start: performance.now(),
        dur: Math.min(950, 400 + dist * 0.32),
        dir: vertical ? side : dx >= 0 ? 1 : -1, // lean direction
        vertical,
        side,
        bulge: Math.min(90, 30 + dist * 0.22), // sideways opening (vertical jumps)
        lift: Math.min(70, 22 + dist * 0.16), // upward hop
      };
      setActivity("jump");
      setVisible(true);
    },
    [size, applyPosFromEl]
  );

  /* Click anywhere on a card -> Havi hops over to it */
  useEffect(() => {
    const CARD_SEL =
      '[data-havi-role], [data-havi-card], [data-havi-course-id]';
    const onClick = (e) => {
      if (celebratingRef.current) return; // don't interrupt the party
      let el = e.target instanceof Element ? e.target.closest(CARD_SEL) : null;
      // untagged pages: walk up to the nearest card-like box
      if (!el && e.target instanceof Element) {
        let p = e.target;
        while (p && p !== document.body) {
          const rect = p.getBoundingClientRect();
          const cs = window.getComputedStyle(p);
          if (
            rect.width >= 180 &&
            rect.height >= 70 &&
            rect.width <= window.innerWidth * 0.96 &&
            (parseFloat(cs.borderRadius) || 0) >= 8
          ) {
            el = p;
            break;
          }
          p = p.parentElement;
        }
      }
      if (!el) return;
      if (el === targetElRef.current) return; // already sitting there
      jumpTo(el);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [jumpTo]);

  /* Find the sidebar / nav menu (Havi's home base lives at its bottom) */
  const findNavEl = useCallback(() => {
    const explicit = document.querySelector('[data-havi-role="nav"]');
    if (explicit && explicit.offsetParent !== null) return explicit;
    const guesses = document.querySelectorAll("nav, aside, [role='navigation']");
    let best = null;
    for (const el of guesses) {
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      // a sidebar is tall and narrow
      if (r.height > window.innerHeight * 0.5 && r.width < window.innerWidth * 0.35) {
        if (!best || r.height > best.getBoundingClientRect().height) best = el;
      }
    }
    return best;
  }, []);

  /* HOME BASE — bottom of the sidebar, near the account section */
  const perchHome = useCallback(() => {
    const nav = findNavEl();
    if (!nav) return false;
    const r = nav.getBoundingClientRect();
    if (r.width === 0) return false;
    const top = r.bottom + window.scrollY - size * 1.35;
    const left = r.left + window.scrollX + r.width / 2 - size / 2;
    targetElRef.current = nav;
    roleRef.current = "nav";
    cornerRef.current = "right";
    behindRef.current = false;
    setPos({ top, left });
    posRef.current = { top, left };
    setVisible(true);
    return true;
  }, [findNavEl, size]);

  /* Show a small glowing doorway on the nav while Havi steps through */
  const showDoor = useCallback((show) => {
    if (!show) {
      if (doorRef.current) {
        doorRef.current.remove();
        doorRef.current = null;
      }
      return;
    }
    const nav = findNavEl();
    if (!nav) return;
    const r = nav.getBoundingClientRect();
    const d = document.createElement("div");
    // deliberately SMALL — just a slot, not a full-width panel
    const w = Math.min(26, r.width * 0.28);
    d.style.cssText = `
      position:absolute;
      top:${r.bottom + window.scrollY - size * 1.15}px;
      left:${r.left + window.scrollX + r.width / 2 - w / 2}px;
      width:${w}px; height:${w}px;
      border-radius:6px;
      background:radial-gradient(circle, rgba(133,183,235,.85), rgba(133,183,235,.15));
      pointer-events:none; z-index:39;
      transition:opacity .25s ease;
    `;
    document.body.appendChild(d);
    doorRef.current = d;
  }, [findNavEl, size]);

  /**
   * ENTER A PAGE — hop to the nav, walk into a small doorway (shrink + fade),
   * vanish for a beat, then reappear at the home base.
   */
  const enterPage = useCallback(() => {
    if (celebratingRef.current) return;
    const nav = findNavEl();
    if (!nav) return;
    // 1) hop over to the menu
    jumpToRef.current?.(nav, "right");
    // 2) after the hop, walk into the doorway
    window.setTimeout(() => {
      perchHome();
      showDoor(true);
      setActivity("enter");
      enterRef.current = { start: performance.now(), dur: 900 };
    }, 950);
  }, [findNavEl, perchHome, showDoor]);

  const maybeBubble = useCallback((kind, ms = 4000) => {
    const arr = BUBBLES[kind];
    if (!arr) return;
    setBubble(arr[Math.floor(Math.random() * arr.length)]);
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => setBubble(null), ms);
  }, []);

  /* decide default placement: schedule? near-due? else sleep on a generic card */
  const placeDefault = useCallback(() => {
    // Never interrupt an ongoing celebration
    if (celebratingRef.current) return;

    // Schedule page: write / hang / walk on the current week
    if (findCardEl("current-week")) {
      const moves = ["write", "hang", "walk"];
      setActivity(moves[Math.floor(Math.random() * moves.length)]);
      perch("current-week", Math.random() > 0.5 ? "left" : "right");
      return;
    }
    // Upcoming with a near-due flag
    const upcoming = document.querySelector(
      '[data-havi-role="upcoming"][data-havi-near-due="true"]'
    );
    if (upcoming && upcoming.offsetParent !== null) {
      setActivity("watch");
      perch("upcoming", "right");
      maybeBubble("watch");
      return;
    }
    // COURSES PAGE: watch / peek / books on a course card
    if (findCardEl("course")) {
      const moves = ["watch", "peek", "books"];
      setActivity(moves[Math.floor(Math.random() * moves.length)]);
      perch("course", Math.random() > 0.5 ? "left" : "right");
      return;
    }
    // Profile / settings style pages: if there's a generic card, watch on it
    // (profile page should show the watching expression)
    if (findCardEl("profile")) {
      setActivity("watch");
      perch("profile", Math.random() > 0.5 ? "left" : "right");
      return;
    }
    // Default: sleep on a random card (tagged, or auto-detected on untagged pages)
    if (findCardEl("generic") || autoDetectCard()) {
      setActivity("sleep");
      perch("generic", Math.random() > 0.5 ? "left" : "right");
    } else {
      // no cards on this page -> go home (bottom of the sidebar)
      if (!perchHomeRef.current?.()) setVisible(false);
      else setActivity("watch");
    }
  }, [findCardEl, autoDetectCard, perch, maybeBubble]);

  /* celebrate trigger, exposed globally — robust: never errors if card missing */
  const celebrate = useCallback(
    (arg) => {
      // Accept: celebrate(0.95) | celebrate(95) | celebrate({score, max, courseId|el|selector}) | celebrate()
      const detail = arg && typeof arg === "object" ? arg : null;
      let r = detail ? undefined : arg;
      if (detail) {
        const sc = Number(detail.score);
        const mx = Number(detail.max);
        if (mx > 0) r = sc / mx;
        else if (detail.ratio !== undefined) r = Number(detail.ratio);
      }
      if (typeof r === "string") r = Number(r);
      if (typeof r === "number" && r > 1) r = r / 100; // percentage form
      if (typeof r === "number" && !Number.isNaN(r) && r < highGradeThreshold) return;

      /* ---- Find the RIGHT card: the course the grade belongs to ---- */
      const CARD_SEL =
        '[data-havi-role="course"], [data-havi-course-id], [data-havi-card]';
      let el = null;

      // 1) explicit element passed in
      if (detail?.el instanceof Element) el = detail.el;
      // 2) CSS selector passed in
      if (!el && detail?.selector) el = document.querySelector(detail.selector);
      // 3) course id passed in -> match the card carrying that id
      if (!el && detail?.courseId != null) {
        el =
          document.querySelector(`[data-havi-course-id="${detail.courseId}"]`) ||
          document.querySelector(`[data-course-id="${detail.courseId}"]`);
      }
      // 4) SMART FALLBACK: the field you just typed the grade into tells us
      //    which course card we're in — no wiring needed.
      if (!el) {
        const focused = document.activeElement;
        if (focused && focused !== document.body) {
          el = focused.closest(CARD_SEL) || null;
          if (!el) {
            // walk up to the nearest auto-detected card-like ancestor
            let p = focused.parentElement;
            while (p && p !== document.body) {
              const rect = p.getBoundingClientRect();
              const cs = window.getComputedStyle(p);
              if (
                rect.width >= 180 &&
                rect.height >= 70 &&
                (parseFloat(cs.borderRadius) || 0) >= 8
              ) {
                el = p;
                break;
              }
              p = p.parentElement;
            }
          }
        }
      }
      // 5) last resorts
      if (!el) el = findCardEl("course") || findCardEl("generic") || autoDetectCard();
      if (!el) el = targetElRef.current;

      setActivity("celebrate");
      celebratingRef.current = true;
      if (el) {
        targetElRef.current = el;
        roleRef.current = "course";
        cornerRef.current = "right";
        behindRef.current = true;
        applyPosFromEl(el, "right", true);
        // make sure the party is actually visible on screen
        try {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (e) {}
      }
      maybeBubble("celebrate", Math.min(celebrateMs, 8000));

      // stay celebrating for a good while (default 60s)
      if (celebrateTimerRef.current) clearTimeout(celebrateTimerRef.current);
      celebrateTimerRef.current = window.setTimeout(() => {
        celebratingRef.current = false;
        placeDefault();
      }, celebrateMs);
    },
    [
      highGradeThreshold,
      celebrateMs,
      findCardEl,
      autoDetectCard,
      applyPosFromEl,
      maybeBubble,
      placeDefault,
    ]
  );

  /* expose window.havi API + a global event fallback */
  useEffect(() => {
    window.havi = {
      celebrate,
      sleep: () => { setActivity("sleep"); perch("generic"); },
      watch: () => { setActivity("watch"); perch("upcoming"); maybeBubble("watch"); },
      write: () => { setActivity("write"); perch("current-week"); },
      jumpTo: (elOrSelector, corner) => {
        const el =
          typeof elOrSelector === "string"
            ? document.querySelector(elOrSelector)
            : elOrSelector;
        jumpTo(el, corner);
      },
      refresh: placeDefault,
      enterPage: () => enterPageRef.current?.(),
      goHome: () => { perchHomeRef.current?.(); setActivity("watch"); },
    };
    // Alternative trigger — works even if window.havi isn't reachable from a module:
    //   window.dispatchEvent(new CustomEvent("havi:celebrate", { detail: { score, max } }))
    const onEvt = (e) => celebrate(e?.detail);
    window.addEventListener("havi:celebrate", onEvt);
    return () => {
      window.removeEventListener("havi:celebrate", onEvt);
      try { delete window.havi; } catch (e) {}
    };
  }, [celebrate, perch, maybeBubble, placeDefault, jumpTo]);

  useEffect(() => { activityRef.current = activity; }, [activity]);
  useEffect(() => { placeDefaultRef.current = placeDefault; }, [placeDefault]);
  useEffect(() => { jumpToRef.current = jumpTo; }, [jumpTo]);
  useEffect(() => { showDoorRef.current = showDoor; }, [showDoor]);
  useEffect(() => { perchHomeRef.current = perchHome; }, [perchHome]);
  useEffect(() => { enterPageRef.current = enterPage; }, [enterPage]);

  /* initial placement + relocate timer + reposition on scroll/resize */
  useEffect(() => {
    const boot = setTimeout(placeDefault, 400);
    const relocate = setInterval(() => {
      if (activityRef.current === "sleep") placeDefault();
    }, relocateEveryMs);

    // Only reposition on RESIZE. No scroll listener: with document coordinates
    // the mascot scrolls along with its card automatically and stays glued to it.
    const onMove = () => {
      if (targetElRef.current) {
        applyPosFromEl(targetElRef.current, cornerRef.current, behindRef.current);
      }
    };
    window.addEventListener("resize", onMove);

    // If the page/route changes and cards differ, recompute after a tick.
    const mo = new MutationObserver(() => {
      // only re-place if our current target vanished
      if (!targetElRef.current || targetElRef.current.offsetParent === null) {
        placeDefault();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Re-place on client-side route changes (Next.js navigation doesn't reload)
    let lastPath = window.location.pathname;
    const routeCheck = setInterval(() => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        targetElRef.current = null;
        // Havi "walks into" the new page from the menu, then settles on it
        setTimeout(() => {
          if (!celebratingRef.current) enterPageRef.current?.();
        }, 200);
      }
    }, 500);

    return () => {
      clearTimeout(boot);
      clearInterval(relocate);
      clearInterval(routeCheck);
      window.removeEventListener("resize", onMove);
      if (doorRef.current) { doorRef.current.remove(); doorRef.current = null; }
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relocateEveryMs]);

  /* animation loop */
  useEffect(() => {
    let raf;
    let last = 0;
    const loop = (ts) => {
      raf = requestAnimationFrame(loop);
      if (!canvasRef.current) return;
      if (reduced) {
        drawFrame(canvasRef.current, activity, 0);
        if (wrapRef.current) wrapRef.current.style.transform = "none";
        return;
      }
      /* ---- JUMP ARC — runs EVERY frame for smoothness ---- */
      /* ---- ENTERING A PAGE: shrink + fade into the small doorway ---- */
      const en = enterRef.current;
      if (en && containerRef.current) {
        const p = Math.min(1, (ts - en.start) / en.dur);
        const sc = 1 - 0.75 * p;
        containerRef.current.style.opacity = String(Math.max(0, 1 - p));
        containerRef.current.style.transform = `scale(${sc.toFixed(3)})`;
        containerRef.current.style.transformOrigin = "50% 100%";
        if (p >= 1) {
          enterRef.current = null;
          setVisible(false);
          showDoorRef.current?.(false);
          // gone for a beat, then reappear at the home base
          window.setTimeout(() => {
            if (containerRef.current) {
              containerRef.current.style.opacity = "1";
              containerRef.current.style.transform = "";
            }
            perchHomeRef.current?.();
            placeDefaultRef.current?.();
          }, 450);
        }
      }

      const j = jumpRef.current;
      if (j && containerRef.current) {
        const p = Math.min(1, (ts - j.start) / j.dur);
        const wave = Math.sin(Math.PI * p); // 0 -> 1 -> 0
        let x = j.fromLeft + (j.toLeft - j.fromLeft) * p;
        let y = j.fromTop + (j.toTop - j.fromTop) * p;
        if (j.vertical) {
          x += j.side * j.bulge * wave; // arc opens sideways
          y -= j.lift * wave * 0.45; // small hop
        } else {
          y -= j.lift * wave; // classic upward arc
        }
        containerRef.current.style.top = `${y}px`;
        containerRef.current.style.left = `${x}px`;
        if (wrapRef.current) {
          const rot = j.dir * 9 * wave;
          const sy = 1 + 0.15 * wave; // stretch airborne
          wrapRef.current.style.transform = `rotate(${rot}deg) scaleY(${sy.toFixed(3)})`;
        }
        if (p >= 1) {
          jumpRef.current = null;
          posRef.current = { top: j.toTop, left: j.toLeft };
          setPos({ top: j.toTop, left: j.toLeft });
          // little squash on landing
          if (wrapRef.current) {
            wrapRef.current.style.transform = "scaleY(0.88)";
            setTimeout(() => {
              if (wrapRef.current && !jumpRef.current)
                wrapRef.current.style.transform = "";
            }, 110);
          }
          placeDefaultRef.current?.(); // settle into this page's activity
        }
      }

      if (ts - last < 130) return;
      last = ts;
      tRef.current++;
      drawFrame(canvasRef.current, activity, tRef.current);

      if (wrapRef.current && !jumpRef.current) {
        const t = tRef.current;
        // clamp the bob so it can never look like a glitch
        const b = Math.max(-6, Math.min(6, bobFor(activity, t)));
        const rot = rotFor(activity, t);
        wrapRef.current.style.transform = `translateY(${b}px) rotate(${rot}deg)`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [activity, reduced]);

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
      aria-hidden="true"
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
          style={{
            width: size,
            height: size,
            imageRendering: "pixelated",
            display: "block",
          }}
        />
      </div>
    </div>
  );
}
