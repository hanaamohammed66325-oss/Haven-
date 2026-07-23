"use client";

/**
 * HaviMascot — a living pixel-art frog that behaves like it inhabits the app.
 *
 * Instead of isolated animations triggered by commands, Havi runs a small
 * BEHAVIOUR ENGINE: every action is a "phase" with a duration, and phases are
 * chained into natural sequences. Example: he doesn't teleport when relocating —
 * he emerges from behind a card, peers around, then settles into an activity.
 *
 * Key behaviours
 *  - relocating      : duck away -> rise from behind the new card -> watch -> settle
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
const GRID_H = 21;      // the body itself
const DRAW_H = 23;      // canvas rows: body + room for dangling legs

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
 * @param extra { clipRow?: number }  hide everything below this grid row,
 *        so the card genuinely occludes him while he emerges from behind it.
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
      px(ctx, s, 17, 10, 4, 1, COL.k);
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
      px(ctx, s, 18, 10, 2, open, COL.k);
      px(ctx, s, 12, 13, 4, 2, COL.k); // yawn
      px(ctx, s, 13, 14, 2, 1, "#5a3b45");
      px(ctx, s, 3, 8, 2, 3, COL.G); // stretching arms
      px(ctx, s, 23, 8, 2, 3, COL.G);
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
      px(ctx, s, 18 + ox, 9 + oy, 2, 2, COL.k);
      if (cyc >= 2) px(ctx, s, 11, 19, 6, 1, t % 2 === 0 ? COL.L : "#c9e3fb");
      break;
    }
    case "write": {
      const cyc = t % 30;
      const writing = cyc < 18;
      px(ctx, s, 7, 19, 9, 3, COL.paper);
      if (writing) {
        px(ctx, s, 8, 10, 2, 2, COL.k);
        px(ctx, s, 18, 10, 2, 2, COL.k);
        const penX = 8 + (cyc % 9);
        px(ctx, s, 15, 17, 2, 2, COL.G);
        px(ctx, s, penX, 16, 1, 3, COL.b);
        px(ctx, s, penX, 15, 1, 1, COL.mouthRed);
        for (let m = 0; m < cyc % 9; m++) px(ctx, s, 8 + m, 20, 1, 1, COL.ink);
      } else {
        px(ctx, s, 7, 10, 3, 1, COL.k);
        px(ctx, s, 18, 10, 3, 1, COL.k);
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
      px(ctx, s, 21, 12, 1, 1, COL.cheek);
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
      px(ctx, s, 18 + ex, 9, 2, 3, COL.k);
      px(ctx, s, 12, 13, 4, 1, COL.k);
      // simple flat legs hanging over the card edge, gently swinging
      const sw = Math.round(Math.sin(t / 5));
      const stH = Math.floor(t / 3) % 2;
      px(ctx, s, 7 + sw, 20, 3, 3, stH ? COL.G : COL.d);
      px(ctx, s, 18 - sw, 20, 3, 3, stH ? COL.d : COL.G);
      break;
    }
    case "walk": {
      px(ctx, s, 9, 9, 2, 3, COL.k);
      px(ctx, s, 18, 9, 2, 3, COL.k);
      px(ctx, s, 12, 13, 4, 1, COL.k);
      const st = Math.floor(t / 2) % 2;
      px(ctx, s, 7, 19, 3, 2, st ? COL.G : COL.d);
      px(ctx, s, 18, 19, 3, 2, st ? COL.d : COL.G);
      break;
    }
    case "peek": {
      px(ctx, s, 8, 9, 2, 3, COL.k);
      px(ctx, s, 18, 9, 2, 3, COL.k);
      px(ctx, s, 12, 13, 4, 1, COL.k);
      px(ctx, s, 7, 15, 2, 1, COL.G);
      px(ctx, s, 19, 15, 2, 1, COL.G);
      ctx.clearRect(0, 16 * s, canvas.width, canvas.height);
      break;
    }
    case "books": {
      px(ctx, s, 8, 9, 2, 3, COL.k);
      px(ctx, s, 18, 9, 2, 3, COL.k);
      // short, simple mouth — reads cleanly at this pixel size
      px(ctx, s, 13, 13, 2, 1, COL.k);
      const bob = Math.abs(Math.sin(t / 5)) > 0.5 ? 1 : 0;
      px(ctx, s, 6, 17 - bob, 16, 2, "#c0563f"); // red book
      px(ctx, s, 7, 19 - bob, 14, 2, COL.b); // blue book
      px(ctx, s, 6, 21 - bob, 16, 2, "#6a9c5a"); // green book
      px(ctx, s, 6, 18 - bob, 1, 1, COL.paper); // page edges
      px(ctx, s, 7, 20 - bob, 1, 1, COL.paper);
      px(ctx, s, 6, 22 - bob, 1, 1, COL.paper);
      px(ctx, s, 4, 17 - bob, 2, 3, COL.G); // arms holding
      px(ctx, s, 22, 17 - bob, 2, 3, COL.G);
      break;
    }
    case "squish": {
      // Being pressed: eyes squeezed shut, mouth open. The flattening itself
      // is a transform driven every frame in the loop (see squishRef).
      px(ctx, s, 7, 10, 4, 1, COL.k);
      px(ctx, s, 8, 9, 1, 1, COL.k);
      px(ctx, s, 10, 9, 1, 1, COL.k);
      px(ctx, s, 17, 10, 4, 1, COL.k);
      px(ctx, s, 17, 9, 1, 1, COL.k);
      px(ctx, s, 19, 9, 1, 1, COL.k);
      px(ctx, s, 12, 13, 4, 2, COL.k);
      px(ctx, s, 13, 14, 2, 1, COL.mouthRed);
      break;
    }
    default: {
      px(ctx, s, 8, 9, 2, 3, COL.k);
      px(ctx, s, 18, 9, 2, 3, COL.k);
      px(ctx, s, 12, 13, 4, 1, COL.k);
    }
  }

  // Emerging from behind a card: erase everything below the card's real edge.
  if (extra && typeof extra.clipRow === "number") {
    const cut = Math.max(0, extra.clipRow) * s;
    if (cut < canvas.height) ctx.clearRect(0, cut, canvas.width, canvas.height);
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

/**
 * Extra vertical shift per activity, in fractions of the body height.
 * When he's dangling he must SIT ON the card's edge: the base of his body
 * (grid row 19 of 21) needs to line up with the edge so only his legs hang
 * below it. The normal perch buries a third of him behind the card, which
 * read as standing on it / sinking into it rather than sitting.
 */
function offsetFor(activity) {
  if (activity === "hang") return -0.28; // lift him up onto the edge
  return 0;
}

/** Order used when the user clicks him 3x to switch animation */
const CYCLE_ACTS = ["sleep", "watch", "hang", "books", "peek", "write"];

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */

export default function HaviMascot({
  size = 54,
  highGradeThreshold = 0.9,
  celebrateMs = 10000, // celebration lasts 10s, interruptible
  restMinMs = 14000, // how long he rests before wanting to move
  restMaxMs = 26000,
  excludePaths = ["/"], // pages he should never appear on (the landing page)
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const containerRef = useRef(null);

  const [activity, setActivity] = useState("sleep");
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);

  const tRef = useRef(0);
  const posRef = useRef({ top: -9999, left: -9999 });
  const targetElRef = useRef(null);
  const cornerRef = useRef("right");

  // behaviour engine
  const queueRef = useRef([]); // upcoming phases
  const phaseEndRef = useRef(0); // when the current phase finishes
  const emergeRef = useRef(null); // emerging from behind a card
  const walkRef = useRef(null); // {dir, speed}
  const squishRef = useRef(null); // {start, dur} — fast press reaction
  const celebrateUntilRef = useRef(0);
  const busyRef = useRef(false); // hurt/celebrate lock
  const restedRef = useRef(false); // alternates rest <-> relocate
  const lastRestRef = useRef(null); // avoid repeating the same idle twice
  const clickCountRef = useRef(0); // 3 clicks -> switch animation
  const clickTimerRef = useRef(null);
  const forcedActRef = useRef(null); // manually chosen animation
  const forcedIdxRef = useRef(-1);
  const isValidCardRef = useRef(null);
  const isStillValidRef = useRef(null);
  const coordsForRef = useRef(null);
  const lastResyncRef = useRef(0);
  const spotIsBlockedRef = useRef(null);

  const scale = Math.max(2, Math.round(size / GRID_W));
  const canvasW = scale * GRID_W;
  const canvasH = scale * DRAW_H;
  /* `size` is his WIDTH. Pixels must stay square, so the displayed height is
     derived from the grid — previously the canvas was squashed into a square
     and he came out stretched by a third. */
  const dispW = size;
  const dispH = (size * DRAW_H) / GRID_W;
  const bodyH = (size * GRID_H) / GRID_W; // displayed height of the body
  const perchOff = bodyH * 0.62;          // how far above the card edge he sits

  /* ---------------- reduced motion ---------------- */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const fn = () => setReduced(mq.matches);
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);

  /* ---------------- finding cards ---------------- */
  /**
   * Looser check: is he still legitimately sitting on this card?
   * Deliberately does NOT require the card to be on screen — otherwise he
   * would hop to a new card every time you scrolled, i.e. follow you down
   * the page. He should stay where he is and scroll away with his card.
   */
  const isStillValid = useCallback((el) => {
    if (!el || !el.isConnected || el.offsetParent === null) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, []);

  /** Is this element a legitimate place to perch? */
  const isValidCard = useCallback((el) => {
    if (!el || el.offsetParent === null) return false;
    // never sit on navigation chrome — that's how he ended up over the logo
    if (el.closest("nav, aside, header, footer, [role='navigation'], [data-havi-avoid]"))
      return false;
    // never sit inside decorative artwork / marketing mockups
    if (
      el.closest(
        "figure, picture, svg, canvas, [aria-hidden='true'], [data-hero], [class*='hero'], [class*='mockup'], [class*='preview'], [class*='illustration']"
      )
    )
      return false;
    const cs0 = window.getComputedStyle(el);
    if (cs0.pointerEvents === "none") return false; // decorative layer
    const r = el.getBoundingClientRect();
    if (r.width < 160 || r.height < 60) return false;
    if (r.width > window.innerWidth * 0.97) return false;
    // must sit comfortably inside the viewport, with room above him
    if (r.top < 70) return false; // too close to the top -> he'd get clipped
    if (r.top > window.innerHeight - 60) return false;
    if (r.bottom < 90) return false;
    return true;
  }, []);

  const findCardEl = useCallback(
    (role) => {
      const els = Array.from(
        document.querySelectorAll(`[data-havi-role="${role}"]`)
      ).filter(isValidCard);
      if (!els.length) return null;
      return els[Math.floor(Math.random() * els.length)];
    },
    [isValidCard]
  );

  const allCards = useCallback(() => {
    const tagged = Array.from(
      document.querySelectorAll("[data-havi-role], [data-havi-card], [data-havi-course-id]")
    ).filter(isValidCard);
    if (tagged.length) return tagged;

    // auto-detect card-like boxes on untagged pages
    const out = [];
    const scope = document.querySelector("main") || document.body;
    const nodes = scope.querySelectorAll("div, section, article");
    for (const el of nodes) {
      if (!isValidCard(el)) continue;
      const cs = window.getComputedStyle(el);
      if ((parseFloat(cs.borderRadius) || 0) < 8) continue;
      const bg = cs.backgroundColor;
      const hasBg = bg && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg) && bg !== "transparent";
      if (!hasBg && !(parseFloat(cs.borderWidth) > 0) && cs.boxShadow === "none") continue;
      out.push(el);
    }
    /* Prefer the OUTERMOST card-like boxes. Preferring innermost meant he sat
       on inner rows (a form row inside a card), which looked like he was
       floating in the middle of the card instead of on its edge. */
    const tops = out.filter((el) => !out.some((o) => o !== el && o.contains(el)));
    return tops.length ? tops : out;
  }, [isValidCard]);

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

  /** Is anything interactive under this spot? (buttons, inputs, links) */
  const spotIsBlocked = useCallback(
    (top, left) => {
      const cx = left - window.scrollX + size / 2;
      const cy = top - window.scrollY + bodyH * 0.8; // his feet
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight)
        return true;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit) return false;
      return !!hit.closest(
        "button, a, input, select, textarea, [role='button'], [role='tab'], label"
      );
    },
    [size, bodyH]
  );

  const coordsFor = useCallback(
    (el, corner, clamp = true) => {
      const r = el.getBoundingClientRect();
      let top = r.top + window.scrollY - perchOff;
      let left =
        corner === "left"
          ? r.left + window.scrollX + 10
          : r.right + window.scrollX - size - 10;

      /* Clamp only when CHOOSING a spot, so he isn't placed half off-screen.
         It must NOT be applied while he's already sitting on a card: the clamp
         is relative to the current scroll position, so re-applying it every
         frame pinned him to the edge of the viewport and he appeared to stick
         to the screen instead of scrolling away with his card. */
      if (clamp) {
        const minTop = window.scrollY + 8;
        const maxTop = window.scrollY + window.innerHeight - size - 8;
        const minLeft = window.scrollX + 8;
        const maxLeft = window.scrollX + window.innerWidth - size - 8;
        top = Math.max(minTop, Math.min(maxTop, top));
        left = Math.max(minLeft, Math.min(maxLeft, left));
      }
      return { top, left };
    },
    [size, perchOff]
  );

  /** Choose the corner that doesn't sit on top of a button/input */
  const bestCorner = useCallback(
    (el, preferred) => {
      const order =
        preferred === "left" ? ["left", "right"] : ["right", "left"];
      for (const c of order) {
        const { top, left } = coordsFor(el, c);
        if (!spotIsBlocked(top, left)) return c;
      }
      return order[0]; // both blocked — take the preferred one anyway
    },
    [coordsFor, spotIsBlocked]
  );

  const perch = useCallback(
    (el, corner) => {
      if (!el || el.offsetParent === null) return false;
      const wanted = corner || (Math.random() > 0.5 ? "left" : "right");
      const c = bestCorner(el, wanted); // avoid covering buttons/inputs
      const { top, left } = coordsFor(el, c);
      targetElRef.current = el;
      cornerRef.current = c;
      setPosition(top, left);
      setVisible(true);
      return true;
    },
    [coordsFor, bestCorner, setPosition]
  );

  /* ================= BEHAVIOUR ENGINE ================= */

  /** what he does when resting, based on which page he's on */
  const restingActivity = useCallback(() => {
    // a manually chosen activity (from clicking him 3x) wins until cleared
    if (forcedActRef.current) return forcedActRef.current;

    // an urgent reminder always takes priority
    const nearDue = document.querySelector(
      '[data-havi-role="upcoming"][data-havi-near-due="true"]'
    );
    if (nearDue && nearDue.offsetParent !== null && Math.random() > 0.4) return "watch";

    // Page-flavoured pools, but every pool is varied so ALL animations get seen.
    let pool;
    // Week cards on the schedule read best with him dangling off the edge.
    if (findCardEl("current-week")) pool = ["hang", "hang", "write", "sleep", "watch"];
    else if (findCardEl("course")) pool = ["peek", "books", "watch", "hang", "sleep"];
    else pool = ["sleep", "watch", "hang", "books", "peek", "write"];

    // avoid repeating the same one twice in a row
    const choices = pool.filter((a) => a !== lastRestRef.current);
    const pick = (choices.length ? choices : pool)[
      Math.floor(Math.random() * (choices.length ? choices.length : pool.length))
    ];
    lastRestRef.current = pick;
    return pick;
  }, [findCardEl]);

  /** push a sequence of phases; the engine plays them in order */
  const queue = useCallback((steps) => {
    queueRef.current = steps;
    phaseEndRef.current = 0; // advance immediately on next tick
  }, []);

  /** settle into a resting phase on the current card */
  const settle = useCallback(() => {
    busyRef.current = false;
    walkRef.current = null; // never keep walking while resting/asleep
    emergeRef.current = null;
    // the card he's on must still be valid, otherwise find a new one
    const el = targetElRef.current;
    if (!isValidCard(el)) {
      const c = randomCard();
      if (!c) {
        setVisible(false);
        phaseEndRef.current = performance.now() + 3000;
        return;
      }
      perch(c);
    } else {
      // re-snap exactly onto the card edge (no clamp — he stays with his card)
      const { top, left } = coordsFor(el, cornerRef.current, false);
      setPosition(top, left);
    }
    // Choose ONE activity and commit to it for the full rest period.
    const act = restingActivity();
    setActivity(act);
    phaseEndRef.current =
      performance.now() + restMinMs + Math.random() * (restMaxMs - restMinMs);
  }, [
    perch,
    randomCard,
    restingActivity,
    restMinMs,
    restMaxMs,
    isValidCard,
    coordsFor,
    setPosition,
  ]);

  /** the full "I want to move somewhere else" sequence */
  const relocate = useCallback(
    (target) => {
      const dest = target || randomCard();
      if (!dest || dest === targetElRef.current) {
        settle();
        return;
      }
      /* No more jumping. He ducks out of sight and re-emerges from behind the
         destination card — which reads far better and can't glitch mid-air. */
      queueRef.current = [];
      walkRef.current = null;
      emergeAtRef.current?.(dest);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [randomCard, settle]
  );

  /**
   * EMERGE FROM BEHIND A CARD.
   * He starts fully hidden behind the card's top edge, rises until just his
   * head and eyes clear it, watches for a moment, then climbs the rest of the
   * way out and carries on normally. The "hidden" part is real: the canvas is
   * clipped at the card's actual top edge every frame, so it works wherever
   * the card is and however the page scrolls.
   */
  const emergeAt = useCallback(
    (card) => {
      const el = card || randomCard();
      if (!el) {
        setVisible(false);
        return;
      }
      const corner = bestCorner(el, Math.random() > 0.5 ? "left" : "right");
      targetElRef.current = el;
      cornerRef.current = corner;

      const r = el.getBoundingClientRect();
      const left =
        corner === "left"
          ? r.left + window.scrollX + 10
          : r.right + window.scrollX - size - 10;
      const cardTopDoc = r.top + window.scrollY;

      emergeRef.current = {
        start: performance.now(),
        cardTopDoc,
        left,
        // how far above the card edge he ends up (his normal perch)
        finalRise: perchOff,
        // how far up he goes for the peek — his eyes (grid rows 9-11) must
        // clear the card edge, with the rest of him still hidden behind it
        peekRise: bodyH * 0.58,
      };
      // start fully behind the card
      setPosition(cardTopDoc, left);
      setActivity("peek");
      setVisible(true);
      queueRef.current = [];
      phaseEndRef.current = Number.MAX_SAFE_INTEGER; // the emergence drives it
    },
    [randomCard, bestCorner, size, perchOff, bodyH, setPosition]
  );

  /** entrance: rise up from behind a visible card, walk a little, then settle */
  const enterFromCard = useCallback(() => {
    // never show up on excluded pages (e.g. the public landing page)
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (excludePaths.some((p) => (p.replace(/\/+$/, "") || "/") === path)) {
      setVisible(false);
      return;
    }
    const card = randomCard();
    if (!card) {
      setVisible(false);
      return;
    }
    // Rise up from behind a card, watch, then carry on.
    emergeAtRef.current?.(card);
  }, [randomCard, excludePaths]);

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
      emergeRef.current = null;
      walkRef.current = null;
      busyRef.current = true;
      perch(el, "right");
      setActivity("celebrate");
      celebrateUntilRef.current = performance.now() + celebrateMs;
      phaseEndRef.current = celebrateUntilRef.current;
      try {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (e) {}
    },
    [highGradeThreshold, celebrateMs, findCardEl, randomCard, perch]
  );

  /** any user action cuts the party short and he re-enters naturally */
  const interruptCelebration = useCallback(() => {
    if (!busyRef.current || activity !== "celebrate") return;
    celebrateUntilRef.current = 0;
    busyRef.current = false;
    enterFromCard();
  }, [activity, enterFromCard]);

  /* ---------------- poke reaction ---------------- */
  const poke = useCallback(() => {
    if (squishRef.current) return; // already squishing

    /* count clicks — every 3rd one switches to the next animation */
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0; // clicks must be within ~1.5s of each other
    }, 1500);

    const switching = clickCountRef.current % 3 === 0;

    emergeRef.current = null;
    walkRef.current = null;
    busyRef.current = true;
    squishRef.current = { start: performance.now(), dur: 420 }; // fast & snappy

    if (switching) {
      forcedIdxRef.current = (forcedIdxRef.current + 1) % CYCLE_ACTS.length;
      const next = CYCLE_ACTS[forcedIdxRef.current];
      forcedActRef.current = next;
      queueRef.current = [{ act: "squish", ms: 420 }, { act: next, ms: 9000 }];
    } else {
      queueRef.current = [{ act: "squish", ms: 420 }];
    }
    phaseEndRef.current = 0;
  }, []);

  /* ---------------- refs used inside the loop ---------------- */
  const settleRef = useRef(null);
  const relocateRef = useRef(null);
  const emergeAtRef = useRef(null);
  const enterRef2 = useRef(null);
  useEffect(() => {
    settleRef.current = settle;
  }, [settle]);
  useEffect(() => {
    isValidCardRef.current = isValidCard;
  }, [isValidCard]);
  useEffect(() => {
    isStillValidRef.current = isStillValid;
  }, [isStillValid]);
  useEffect(() => {
    coordsForRef.current = coordsFor;
  }, [coordsFor]);
  useEffect(() => {
    spotIsBlockedRef.current = spotIsBlocked;
  }, [spotIsBlocked]);
  useEffect(() => {
    relocateRef.current = relocate;
  }, [relocate]);
  useEffect(() => {
    emergeAtRef.current = emergeAt;
  }, [emergeAt]);
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

      // clicking a card -> he re-emerges from behind that card
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

  /* ---------------- come over when you're actually working ---------------- */
  useEffect(() => {
    const CARD_SEL =
      "[data-havi-role], [data-havi-card], [data-havi-course-id]";

    /** find the card that contains the element being interacted with */
    const cardOf = (el) => {
      if (!(el instanceof Element)) return null;
      const tagged = el.closest(CARD_SEL);
      if (tagged) return tagged;
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
          return p;
        }
        p = p.parentElement;
      }
      return null;
    };

    const comeOver = (el) => {
      if (busyRef.current) return; // don't interrupt a celebration/squish
      const card = cardOf(el);
      if (!card) return;
      if (card === targetElRef.current) return; // already there
      relocateRef.current?.(card);
    };

    // typing / focusing a field
    const onFocus = (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (!t.matches("input, textarea, select, [contenteditable='true']")) return;
      comeOver(t);
    };
    // pressing an add / save style button
    const onPress = (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const btn = t.closest("button, [role='button']");
      if (!btn) return;
      comeOver(btn);
    };

    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("click", onPress, true);
    return () => {
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("click", onPress, true);
    };
  }, []);

  /* ---------------- route changes (instant, no polling lag) ---------------- */
  useEffect(() => {
    const reset = () => {
      queueRef.current = [];
      emergeRef.current = null;
      walkRef.current = null;
      squishRef.current = null;
      busyRef.current = false;
      celebrateUntilRef.current = 0;
      forcedActRef.current = null;
      clickCountRef.current = 0;
      targetElRef.current = null;
      setVisible(false); // hide IMMEDIATELY — no lingering on the old page
    };

    const onNavigate = () => {
      reset();
      // let the new page paint, then he rises from behind a card
      setTimeout(() => enterRef2.current?.(), 420);
    };

    // 1) hide the instant a nav link is clicked, before the route even changes
    const onLinkClick = (e) => {
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (href.startsWith("#") || a.target === "_blank") return;
      reset();
    };
    document.addEventListener("click", onLinkClick, true);

    // 2) patch history so Next.js client navigation fires immediately
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      const r = origPush.apply(this, args);
      onNavigate();
      return r;
    };
    history.replaceState = function (...args) {
      const r = origReplace.apply(this, args);
      onNavigate();
      return r;
    };
    window.addEventListener("popstate", onNavigate);

    return () => {
      document.removeEventListener("click", onLinkClick, true);
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener("popstate", onNavigate);
    };
  }, []);

  /* ---------------- public API ---------------- */
  useEffect(() => {
    window.havi = {
      version: "v17",
      features: [
        "behaviour-engine",      // chained, natural phases
        "rise-entrance",         // enters by rising from behind a card
        "celebrate-10s",         // 10s, interruptible
        "squish-on-click",       // fast squash reaction
        "auto-detect-cards",     // works on untagged pages
        "click3-cycle",          // 3 clicks switches animation
        "viewport-clamped",      // never clipped or on the sidebar
        "avoids-buttons",        // never perches over a button or input
        "instant-nav",           // hides immediately on navigation
        "emerge-from-cards",     // no jumping; rises from behind cards
        "no-speech-bubbles",     // silent — no text popups
        "sticks-to-card",        // re-syncs every frame through layout shifts
        "skips-controls",        // won't stand on buttons or inputs
        "no-landing-page",       // excluded from marketing pages
        "decisive",              // commits to one activity, no flickering
        "symmetric",             // eyes/limbs perfectly mirrored
        "stays-put",             // doesn't follow you when you scroll
        "comes-on-interaction",  // moves to where you're typing/adding
      ],
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
      if (el && el.offsetParent !== null && !emergeRef.current) {
        const { top, left } = coordsFor(el, cornerRef.current, false);
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
        phaseEndRef.current = performance.now() + (step.ms > 0 ? step.ms : 800);
        return;
      }

      // Queue is empty. He stays put on his card by default — he only moves
      // when you actually do something (add/type/click a card). Wandering on
      // his own made him feel like he was following you around.
      settleRef.current?.();
    };

    const loop = (ts) => {
      raf = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      if (!canvas) return;

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

      /* --- keep him glued to his card, every frame ---
         Layout shifts (sidebar collapsing, images loading, content changing)
         used to strand him in empty space because his position was only
         computed once when he sat down. Now it's re-verified continuously. */
      if (
        !emergeRef.current &&
        !walkRef.current &&
        !squishRef.current &&
        containerRef.current &&
        visible
      ) {
        const el = targetElRef.current;
        if (!el || !isStillValidRef.current?.(el)) {
          // his card was actually removed from the page -> find a new one
          if (ts - lastResyncRef.current > 400) {
            lastResyncRef.current = ts;
            targetElRef.current = null;
            enterRef2.current?.();
          }
        } else {
          const want = coordsForRef.current?.(el, cornerRef.current, false);
          if (want) {
            const dx = Math.abs(want.left - posRef.current.left);
            const dy = Math.abs(want.top - posRef.current.top);
            if (dx > 1 || dy > 1) {
              posRef.current = want;
              containerRef.current.style.top = `${want.top}px`;
              containerRef.current.style.left = `${want.left}px`;
            }
          }
        }
      }

      /* ---- EMERGING FROM BEHIND A CARD ---- */
      let clipRow = null; // grid row below which he's hidden by the card
      const em = emergeRef.current;
      if (em && containerRef.current) {
        const el = targetElRef.current;
        // follow the card if the page moves under us
        if (el && el.isConnected) {
          const rr = el.getBoundingClientRect();
          em.cardTopDoc = rr.top + window.scrollY;
          em.left =
            cornerRef.current === "left"
              ? rr.left + window.scrollX + 10
              : rr.right + window.scrollX - size - 10;
        }

        const el2 = ts - em.start;
        const HIDDEN = 260; // beat fully out of sight
        const RISE = 620; // creeping up until his eyes clear the edge
        const WATCH = 1900; // peering around from behind the card
        const OUT = 520; // climbing the rest of the way out

        let rise;
        if (el2 < HIDDEN) {
          rise = 0; // completely behind the card
        } else if (el2 < HIDDEN + RISE) {
          const p = (el2 - HIDDEN) / RISE;
          const eased = 1 - Math.pow(1 - p, 2); // ease-out, like peeking up
          rise = em.peekRise * eased;
        } else if (el2 < HIDDEN + RISE + WATCH) {
          // hold at peek height, with a tiny curious bob
          const w = (el2 - HIDDEN - RISE) / WATCH;
          rise = em.peekRise + Math.sin(w * Math.PI * 3) * 1.5;
        } else if (el2 < HIDDEN + RISE + WATCH + OUT) {
          const p = (el2 - HIDDEN - RISE - WATCH) / OUT;
          const eased = 1 - Math.pow(1 - p, 2);
          rise = em.peekRise + (em.finalRise - em.peekRise) * eased;
        } else {
          // done — hand over to normal behaviour
          emergeRef.current = null;
          setPosition(em.cardTopDoc - em.finalRise, em.left);
          phaseEndRef.current = 0;
          rise = em.finalRise;
        }

        const top = em.cardTopDoc - rise;
        posRef.current = { top, left: em.left };
        containerRef.current.style.top = `${top}px`;
        containerRef.current.style.left = `${em.left}px`;

        // Clip at the card's real top edge so he is genuinely behind it.
        if (emergeRef.current) {
          clipRow = (rise / bodyH) * GRID_H;
          // while he's still low, show the watchful face
          if (rise < em.finalRise - 1) {
            const look = Math.floor(tRef.current / 6) % 3;
            emergeRef.current.look = look;
          }
        }
      }


      /* --- walking along a card --- */
      const w = walkRef.current;
      if (w && containerRef.current && !emergeRef.current) {
        const el = targetElRef.current;
        // No valid card to walk along -> stop immediately. (Without this he
        // walked off into empty space forever.)
        if (!el || el.offsetParent === null) {
          walkRef.current = null;
          phaseEndRef.current = 0;
        } else {
          let nx = posRef.current.left + w.dir * w.speed;
          let hitEdge = false;
          const r = el.getBoundingClientRect();
          const minX = r.left + window.scrollX + 6;
          const maxX = r.right + window.scrollX - size - 6;
          if (nx <= minX) {
            nx = minX;
            hitEdge = true;
          } else if (nx >= maxX) {
            nx = maxX;
            hitEdge = true;
          }
          posRef.current = { ...posRef.current, left: nx };
          containerRef.current.style.left = `${nx}px`;

          // Don't come to rest on top of a control. If the next step would put
          // him over a button/input, stop here instead of standing on it.
          const blocked = spotIsBlockedRef.current?.(posRef.current.top, nx);

          // Reached the end of the card, or hit a control: stop and move on
          // instead of marching in place forever.
          if (hitEdge || blocked) {
            walkRef.current = null;
            if (blocked && !hitEdge) {
              // back off a little so he isn't left standing on the control
              const back = nx - w.dir * 26;
              posRef.current = { ...posRef.current, left: back };
              containerRef.current.style.left = `${back}px`;
            }
            phaseEndRef.current = 0;
          }
        }
      }

      /* --- phase scheduler --- */
      if (!emergeRef.current && ts >= phaseEndRef.current) {
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
        drawFrame(canvas, activity, 0, { clipRow });
        if (wrapRef.current) wrapRef.current.style.transform = "none";
        return;
      }
      if (ts - last < 120) return;
      last = ts;
      tRef.current++;
      drawFrame(canvas, activity, tRef.current, { clipRow });
      if (wrapRef.current && !emergeRef.current && !squishRef.current) {
        const t = tRef.current;
        // clamp the bob so it can never look like a glitch
        const b = Math.max(-6, Math.min(6, bobFor(activity, t)));
        // plus a fixed per-activity shift (sitting on a card edge, etc.)
        const off = offsetFor(activity) * bodyH;
        wrapRef.current.style.transform = `translateY(${(b + off).toFixed(
          1
        )}px) rotate(${rotFor(activity, t)}deg)`;
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [activity, reduced, size, bodyH]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        width: dispW,
        height: dispH,
        zIndex: 40,
        pointerEvents: "none",
      }}
    >
      <div ref={wrapRef} style={{ width: dispW, height: dispH }}>
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          onClick={(e) => {
            e.stopPropagation();
            poke();
          }}
          style={{
            width: dispW,
            height: dispH,
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
