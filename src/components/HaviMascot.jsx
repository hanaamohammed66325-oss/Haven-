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
  size = 54,
  highGradeThreshold = 0.9, // >= 90% of max => celebrate (within 3 pts on /100)
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
      setVisible(true);
    },
    [size]
  );

  /* perch on a card by role; falls back to generic; hides if nothing found */
  const perch = useCallback(
    (role, corner = "right", behind = false) => {
      let el = findCardEl(role);
      if (!el) el = findCardEl("generic");
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
    [findCardEl, applyPosFromEl]
  );

  const maybeBubble = useCallback((kind) => {
    const arr = BUBBLES[kind];
    if (!arr) return;
    setBubble(arr[Math.floor(Math.random() * arr.length)]);
    setTimeout(() => setBubble(null), 4000);
  }, []);

  /* decide default placement: schedule? near-due? else sleep on a generic card */
  const placeDefault = useCallback(() => {
    // Schedule page: write on the current week if present
    if (findCardEl("current-week")) {
      setActivity("write");
      perch("current-week", "right");
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
    // Profile / settings style pages: if there's a generic card, watch on it
    // (profile page should show the watching expression)
    if (findCardEl("profile")) {
      setActivity("watch");
      perch("profile", Math.random() > 0.5 ? "left" : "right");
      return;
    }
    // Default: sleep on a random generic card
    if (findCardEl("generic")) {
      setActivity("sleep");
      perch("generic", Math.random() > 0.5 ? "left" : "right");
    } else {
      // no cards on this page -> hide entirely (prevents floating in empty space)
      setVisible(false);
    }
  }, [findCardEl, perch, maybeBubble]);

  /* celebrate trigger, exposed globally — robust: never errors if card missing */
  const celebrate = useCallback(
    (ratio) => {
      // Accept: celebrate(0.95) | celebrate(95) | celebrate({score, max}) | celebrate()
      let r = ratio;
      if (r && typeof r === "object") {
        const sc = Number(r.score);
        const mx = Number(r.max);
        r = mx > 0 ? sc / mx : undefined;
      }
      if (typeof r === "string") r = Number(r);
      if (typeof r === "number" && r > 1) r = r / 100; // percentage form
      if (typeof r === "number" && !Number.isNaN(r) && r < highGradeThreshold) return;

      // prefer the course card; fall back to any generic; if none, still celebrate in place
      const el = findCardEl("course") || findCardEl("generic") || targetElRef.current;
      setActivity("celebrate");
      if (el) {
        targetElRef.current = el;
        roleRef.current = "course";
        cornerRef.current = "right";
        behindRef.current = true;
        applyPosFromEl(el, "right", true);
      }
      maybeBubble("celebrate");
      window.setTimeout(() => {
        placeDefault();
      }, 4500);
    },
    [highGradeThreshold, findCardEl, applyPosFromEl, maybeBubble, placeDefault]
  );

  /* expose window.havi API + a global event fallback */
  useEffect(() => {
    window.havi = {
      celebrate,
      sleep: () => { setActivity("sleep"); perch("generic"); },
      watch: () => { setActivity("watch"); perch("upcoming"); maybeBubble("watch"); },
      write: () => { setActivity("write"); perch("current-week"); },
      refresh: placeDefault,
    };
    // Alternative trigger — works even if window.havi isn't reachable from a module:
    //   window.dispatchEvent(new CustomEvent("havi:celebrate", { detail: { score, max } }))
    const onEvt = (e) => celebrate(e?.detail);
    window.addEventListener("havi:celebrate", onEvt);
    return () => {
      window.removeEventListener("havi:celebrate", onEvt);
      try { delete window.havi; } catch (e) {}
    };
  }, [celebrate, perch, maybeBubble, placeDefault]);

  useEffect(() => { activityRef.current = activity; }, [activity]);

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

    return () => {
      clearTimeout(boot);
      clearInterval(relocate);
      window.removeEventListener("resize", onMove);
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
      if (ts - last < 130) return;
      last = ts;
      tRef.current++;
      drawFrame(canvasRef.current, activity, tRef.current);
      if (wrapRef.current) {
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
