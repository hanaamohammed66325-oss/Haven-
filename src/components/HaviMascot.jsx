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
    // eyes dart left -> right -> forward
    const cyc = Math.floor(t / 6) % 3;
    let ox = 0;
    if (cyc === 0) ox = -1;
    else if (cyc === 1) ox = 1;
    else ox = 0;
    px(ctx, s, 8 + ox, 9, 2, 2, COL.k);
    px(ctx, s, 17 + ox, 9, 2, 2, COL.k);
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
  size: sizeProp = 54,
  highGradeThreshold = 0.9, // >= 90% of max => celebrate (within 3 pts on /100)
  relocateEveryMs = 30000,
  mobileSize = 40, // shrink on small screens so Havi never covers content
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const tRef = useRef(0);
  /* refs to read latest state inside intervals without re-binding */
  const activityRef = useRef("sleep");
  const roleRef = useRef("generic");
  const cornerRef = useRef("right");
  const behindRef = useRef(false);
  const [activity, setActivity] = useState("sleep");
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const [bubble, setBubble] = useState(null);
  const [reduced, setReduced] = useState(false);
  const [mobile, setMobile] = useState(false);
  // Effective size: the smaller of the requested size / mobileSize on phones.
  const size = mobile ? Math.min(sizeProp, mobileSize) : sizeProp;
  const scale = Math.round(size / GRID_W) || 2;
  const canvasW = scale * GRID_W;
  const canvasH = scale * GRID_H;

  /* shrink on small screens (matches the guide's "size ~40 on mobile") */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    setMobile(mq.matches);
    const fn = () => setMobile(mq.matches);
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);

  /* respect reduced motion */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const fn = () => setReduced(mq.matches);
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);

  /* find a card by role, return its bounding rect (viewport coords) */
  const findCard = useCallback((role) => {
    const els = Array.from(
      document.querySelectorAll(`[data-havi-role="${role}"]`)
    ).filter((el) => el.offsetParent !== null); // visible only
    if (!els.length) return null;
    const el = els[Math.floor(Math.random() * els.length)];
    return { el, rect: el.getBoundingClientRect() };
  }, []);

  /* position the frog on a card corner (or behind it for celebrate) */
  const perch = useCallback(
    (role, corner = "right", behind = false) => {
      const found = findCard(role) || findCard("generic");
      if (!found) return;
      roleRef.current = role;
      cornerRef.current = corner;
      behindRef.current = behind;
      const r = found.rect;
      const yBase = window.scrollY + r.top;
      const xLeft = window.scrollX + r.left;
      const xRight = window.scrollX + r.right;
      const top = behind ? yBase - size * 0.55 : yBase - size * 0.65;
      const left =
        corner === "left" ? xLeft + 8 : xRight - size - 8;
      setPos({ top, left });
    },
    [findCard, size]
  );

  /* decide default placement: near-due? else sleep on a generic card */
  const placeDefault = useCallback(() => {
    // Schedule page: write on the current week if present
    const writeCard = findCard("current-week");
    if (writeCard) {
      setActivity("write");
      perch("current-week", "right");
      return;
    }
    const upcoming = document.querySelector('[data-havi-role="upcoming"][data-havi-near-due="true"]');
    if (upcoming && upcoming.offsetParent !== null) {
      setActivity("watch");
      perch("upcoming", "right");
      maybeBubble("watch");
      return;
    }
    setActivity("sleep");
    perch("generic", Math.random() > 0.5 ? "left" : "right");
  }, [findCard, perch]);

  const maybeBubble = useCallback((kind) => {
    const arr = BUBBLES[kind];
    if (!arr) return;
    setBubble(arr[Math.floor(Math.random() * arr.length)]);
    setTimeout(() => setBubble(null), 4000);
  }, []);

  /* celebrate trigger, exposed globally */
  const celebrate = useCallback(
    (ratio) => {
      if (typeof ratio === "number" && ratio < highGradeThreshold) return;
      setActivity("celebrate");
      perch("course", "right", true); // pop from behind the course card
      maybeBubble("celebrate");
      setTimeout(() => {
        placeDefault();
      }, 4500);
    },
    [highGradeThreshold, perch, maybeBubble, placeDefault]
  );

  /* expose window.havi API */
  useEffect(() => {
    window.havi = {
      celebrate,             // window.havi.celebrate(0.95)
      sleep: () => { setActivity("sleep"); perch("generic"); },
      watch: () => { setActivity("watch"); perch("upcoming"); maybeBubble("watch"); },
      write: () => { setActivity("write"); perch("current-week"); },
      refresh: placeDefault, // recompute placement after DOM changes
    };
    return () => { try { delete window.havi; } catch (e) {} };
  }, [celebrate, perch, maybeBubble, placeDefault]);

  /* initial placement + relocate timer + reposition on resize/scroll */
  useEffect(() => {
    const boot = setTimeout(placeDefault, 400); // let cards render first
    const relocate = setInterval(() => {
      if (activityRef.current === "sleep") placeDefault();
    }, relocateEveryMs);
    const onMove = () => {
      // keep glued to its card while scrolling/resizing
      if (roleRef.current) perch(roleRef.current, cornerRef.current, behindRef.current);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      clearTimeout(boot);
      clearInterval(relocate);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relocateEveryMs]);

  useEffect(() => { activityRef.current = activity; }, [activity]);

  /* animation loop */
  useEffect(() => {
    let raf;
    let last = 0;
    const loop = (ts) => {
      raf = requestAnimationFrame(loop);
      if (reduced) {
        // draw a single static frame
        if (canvasRef.current) drawFrame(canvasRef.current, activity, 0);
        return;
      }
      if (ts - last < 130) return;
      last = ts;
      tRef.current++;
      if (canvasRef.current) drawFrame(canvasRef.current, activity, tRef.current);
      if (wrapRef.current) {
        const t = tRef.current;
        wrapRef.current.style.transform =
          `translateY(${bobFor(activity, t)}px) rotate(${rotFor(activity, t)}deg)`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [activity, reduced]);

  return (
    <div
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        width: size,
        height: size,
        zIndex: 40,
        pointerEvents: "none", // never block card buttons
        transition: "top .5s ease, left .5s ease",
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
