// Pure canvas renderer for the Pomodoro pond scene. No React.
// Faithful to the approved v7 pond mockup: Havi pulls a little study desk up
// out of the water (fishing), studies on his lily pad, and when a session
// completes the next lily pad — which has been sitting as a faint preview —
// rises to full colour and Havi JUMPS onto it.
//
// Layout is a FULL-WIDTH horizontal banner: it spans the whole content width,
// its height is whatever the container gives it, and only the top and bottom
// edges feather to transparent so it blends into the page. The background is a
// tall, dense, still forest; the water does not move. Only Havi (and the pad
// rise / desk pull / jump events) animate.
//
// The pixel-art style is produced by rendering the whole environment into a
// low-resolution offscreen buffer and upscaling it with smoothing off — one
// clean, consistent chunky look rather than ad-hoc banding.

import { lerpColor, type SkyPalette } from "./timeOfDay";
import type { PondStyle } from "@/types";

const PS = 4; // pixel size for Havi sprites

const COL: Record<string, string> = {
  k: "#111111", G: "#a8d98a", d: "#93c974", f: "#e88bb5", y: "#f2d94e", b: "#3b6ea5", L: "#85b7eb",
  paper: "#f7f5ee", ink: "#8a8780", tongue: "#e88bb5", mouthRed: "#c0392b", cheek: "#f0a0a8", zzz: "#7f77dd",
};

const BODY = [
  "............................",
  ".............kk.............",
  "............kffk............",
  "..........kkfyyfkk..........",
  "........kkkkfffffkkkk........",
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

export type HaviMood = "idle" | "studying" | "resting" | "celebrating" | "sad" | "jumping" | "fishing";

export interface LilyPadState {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  hasFlower: boolean;
  opacity: number;
  dying: number;
}

export interface PondState {
  w: number;
  h: number;
  style: PondStyle;
  palette: SkyPalette;
  lilyPads: LilyPadState[];
  haviPadIndex: number;
  jump: { from: number; to: number; progress: number } | null;
  haviMood: HaviMood;
  fishProgress: number; // 0..1 while pulling the desk from the water
  showHavi: boolean;
  tick: number;
  reducedMotion: boolean;
  dir: "ltr" | "rtl";
}

function waterline(h: number): number {
  return Math.round(h * 0.5);
}

// ── Public entry ─────────────────────────────────────────────────────────────
export function renderPond(ctx: CanvasRenderingContext2D, s: PondState): void {
  ctx.clearRect(0, 0, s.w, s.h);
  ctx.imageSmoothingEnabled = false;
  if (s.style === "pixel") drawEnvironmentPixel(ctx, s);
  else drawEnvironment(ctx, s);
  if (s.showHavi) drawHavi(ctx, s);
  drawEdgeFade(ctx, s);
}

function drawEnvironment(ctx: CanvasRenderingContext2D, s: PondState) {
  const night = s.palette.night;
  drawSky(ctx, s);
  if (night) drawMoon(ctx, s);
  else drawSun(ctx, s);
  if (night) drawStars(ctx, s);
  drawForest(ctx, s);
  drawWater(ctx, s);
  const order = s.lilyPads.map((p, i) => ({ p, i })).sort((a, b) => a.p.cy - b.p.cy);
  for (const { p } of order) if (p.opacity > 0.01) drawLilyPad(ctx, p);
}

// ── Pixel-art path: crisp, deliberate blocks on a coarse grid ────────────────
const PXG = 6; // pixel-art cell size
function snap(v: number): number {
  return Math.round(v / PXG) * PXG;
}
function prect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(snap(x), snap(y), Math.max(PXG, snap(w)), Math.max(PXG, snap(h)));
}
function pdisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: string) {
  ctx.fillStyle = c;
  for (let gy = -r; gy <= r; gy += PXG) {
    const hw = Math.sqrt(Math.max(0, r * r - gy * gy));
    if (hw <= 0) continue;
    ctx.fillRect(snap(cx - hw), snap(cy + gy), Math.max(PXG, snap(hw * 2)), PXG);
  }
}

function drawEnvironmentPixel(ctx: CanvasRenderingContext2D, s: PondState) {
  const p = s.palette;
  const WY = snap(waterline(s.h));
  const night = p.night;

  // sky: flat posterized bands
  const skyTop = night ? "#0b1330" : p.top;
  const skyBot = night ? "#26407a" : p.bottom;
  const skyBands = 7;
  for (let i = 0; i < skyBands; i++) {
    ctx.fillStyle = lerpColor(skyTop, skyBot, i / (skyBands - 1));
    const y = Math.round((WY * i) / skyBands);
    const y2 = Math.round((WY * (i + 1)) / skyBands);
    ctx.fillRect(0, y, s.w, y2 - y);
  }

  // sun / moon as a blocky disc
  const cxB = snap(s.w * 0.8);
  const cyB = snap(s.h * 0.19);
  if (night) {
    pdisc(ctx, cxB, cyB, snap(18), "#e6ecff");
  } else {
    pdisc(ctx, cxB, cyB, snap(22), p.celestial);
  }

  // stars
  if (night) {
    ctx.fillStyle = "#c8d4f0";
    const count = Math.max(10, Math.round(s.w / 60));
    for (let i = 0; i < count; i++) {
      const r1 = Math.sin(i * 12.9898) * 43758.5453;
      const r2 = Math.sin(i * 78.233) * 12543.632;
      const sx = (r1 - Math.floor(r1)) * s.w;
      const sy = (r2 - Math.floor(r2)) * (WY * 0.7);
      ctx.fillRect(snap(sx), snap(sy), PXG, PXG);
    }
  }

  // forest: blocky pines (rows of narrowing rectangles)
  const backC = night ? "#0e2418" : lerpColor(p.hillFar, "#1f5030", 0.5);
  const frontC = night ? "#123a24" : lerpColor(p.hillNear, "#2f7a45", 0.5);
  const trunkC = night ? "#0a160f" : "#3a2a1e";
  const pine = (x: number, baseY: number, ht: number, wd: number, col: string) => {
    const rows = Math.max(4, Math.round(ht / PXG));
    // trunk
    prect(ctx, x - PXG / 2, baseY - PXG, PXG, PXG * 2, trunkC);
    for (let r = 0; r < rows; r++) {
      const yy = baseY - PXG - r * PXG;
      const frac = 1 - r / rows;
      // quadratic taper → pointed pine, not a rectangular tower
      const half = r === rows - 1 ? 0 : Math.max(0, snap((wd / 2) * frac * frac));
      ctx.fillStyle = col;
      ctx.fillRect(snap(x - half) - PXG / 2, yy, half * 2 + PXG, PXG);
    }
  };
  for (let i = 0; i * (PXG * 2.4) < s.w + 20; i++) {
    const x = i * (PXG * 2.4) + (Math.sin(i * 91.7) * 0.5 + 0.5) * PXG * 1.5;
    const ht = 66 + (Math.sin(i * 33.3) * 0.5 + 0.5) * 50;
    pine(x, WY, ht, 34, backC);
  }
  for (let i = 0; i * (PXG * 3.4) < s.w + 30; i++) {
    const x = PXG + i * (PXG * 3.4) + (Math.sin(i * 57.1) * 0.5 + 0.5) * PXG * 1.5;
    const ht = 48 + (Math.sin(i * 17.9) * 0.5 + 0.5) * 36;
    pine(x, WY + PXG, ht, 40, frontC);
  }

  // water: flat bands
  const wTop = night ? "#1a466c" : p.waterTop;
  const wBot = night ? "#0a1f36" : p.waterBottom;
  const wBands = Math.max(4, Math.round((s.h - WY) / (PXG * 5)));
  for (let i = 0; i < wBands; i++) {
    ctx.fillStyle = lerpColor(wTop, wBot, i / (wBands - 1));
    const y = WY + Math.round(((s.h - WY) * i) / wBands);
    const y2 = WY + Math.round(((s.h - WY) * (i + 1)) / wBands);
    ctx.fillRect(0, y, s.w, y2 - y);
  }

  // pads
  const order = s.lilyPads.map((pad, i) => ({ pad, i })).sort((a, b) => a.pad.cy - b.pad.cy);
  for (const { pad } of order) if (pad.opacity > 0.01) drawLilyPadPixel(ctx, pad);
}

function drawLilyPadPixel(ctx: CanvasRenderingContext2D, pad: LilyPadState) {
  const { cx, cy, rx, ry, opacity, hasFlower, dying } = pad;
  ctx.save();
  ctx.globalAlpha = opacity;
  let top: string, mid: string, edge: string;
  if (dying) {
    const d = dying;
    top = `rgb(${90 + d * 70},${175 - d * 110},${60 - d * 35})`;
    mid = `rgb(${60 + d * 70},${140 - d * 95},${45 - d * 28})`;
    edge = `rgb(${40 + d * 55},${100 - d * 60},${30 - d * 18})`;
  } else {
    top = "#5cc250";
    mid = "#3f9a3a";
    edge = "#2a7030";
  }
  // stepped ellipse rows
  for (let gy = -ry; gy <= ry; gy += PXG) {
    const frac = 1 - (gy * gy) / (ry * ry);
    if (frac <= 0) continue;
    const hw = rx * Math.sqrt(frac);
    const y = snap(cy + gy);
    const col = gy > ry * 0.3 ? edge : gy < -ry * 0.3 ? top : mid;
    ctx.fillStyle = col;
    ctx.fillRect(snap(cx - hw), y, Math.max(PXG, snap(hw * 2)), PXG);
  }
  if (hasFlower && rx > 45 && !dying) {
    const fx = snap(cx - rx * 0.5), fy = snap(cy - ry * 0.4);
    ctx.fillStyle = "#ec90b8";
    ctx.fillRect(fx - PXG, fy, PXG, PXG);
    ctx.fillRect(fx + PXG, fy, PXG, PXG);
    ctx.fillRect(fx, fy - PXG, PXG, PXG);
    ctx.fillRect(fx, fy + PXG, PXG, PXG);
    ctx.fillStyle = "#f0d040";
    ctx.fillRect(fx, fy, PXG, PXG);
  }
  ctx.restore();
}

// ── Sky & sky bodies ─────────────────────────────────────────────────────────
function drawSky(ctx: CanvasRenderingContext2D, s: PondState) {
  const p = s.palette;
  const WY = waterline(s.h);
  const g = ctx.createLinearGradient(0, 0, 0, WY);
  if (p.night) {
    g.addColorStop(0, "#080e20");
    g.addColorStop(0.35, "#101830");
    g.addColorStop(0.65, "#182648");
    g.addColorStop(1, "#223660");
  } else {
    g.addColorStop(0, p.top);
    g.addColorStop(1, p.bottom);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s.w, WY);
}

function drawMoon(ctx: CanvasRenderingContext2D, s: PondState) {
  const mx = s.w * 0.8, my = s.h * 0.18;
  const glo = ctx.createRadialGradient(mx, my, 4, mx, my, 90);
  glo.addColorStop(0, "rgba(210,220,255,0.22)");
  glo.addColorStop(0.5, "rgba(170,190,235,0.05)");
  glo.addColorStop(1, "transparent");
  ctx.fillStyle = glo;
  ctx.beginPath();
  ctx.arc(mx, my, 90, 0, Math.PI * 2);
  ctx.fill();
  const mg = ctx.createRadialGradient(mx - 3, my - 3, 1, mx, my, 15);
  mg.addColorStop(0, "#eef2ff");
  mg.addColorStop(0.6, "#d4dcea");
  mg.addColorStop(1, "#b0c0d8");
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.arc(mx, my, 15, 0, Math.PI * 2);
  ctx.fill();
}

function drawSun(ctx: CanvasRenderingContext2D, s: PondState) {
  const p = s.palette;
  const sx = s.w * 0.8, sy = s.h * 0.2;
  const glo = ctx.createRadialGradient(sx, sy, 6, sx, sy, 100);
  glo.addColorStop(0, p.celestialGlow);
  glo.addColorStop(1, "transparent");
  ctx.fillStyle = glo;
  ctx.beginPath();
  ctx.arc(sx, sy, 100, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.celestial;
  ctx.beginPath();
  ctx.arc(sx, sy, 18, 0, Math.PI * 2);
  ctx.fill();
}

// Still star field (no twinkle — the environment does not move).
function drawStars(ctx: CanvasRenderingContext2D, s: PondState) {
  const WY = waterline(s.h);
  const count = Math.max(16, Math.round(s.w / 30));
  ctx.fillStyle = "#c8d4f0";
  for (let i = 0; i < count; i++) {
    const r1 = Math.sin(i * 12.9898) * 43758.5453;
    const r2 = Math.sin(i * 78.233) * 12543.632;
    const sx = (r1 - Math.floor(r1)) * s.w;
    const sy = (r2 - Math.floor(r2)) * (WY * 0.7);
    const a = 0.4 + (Math.sin(i * 3.1) * 0.5 + 0.5) * 0.5;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(sx, sy, 1 + (i % 3 === 0 ? 0.8 : 0), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── Forest: tall, dense, still ───────────────────────────────────────────────
function drawForest(ctx: CanvasRenderingContext2D, s: PondState) {
  const p = s.palette;
  const WY = waterline(s.h);
  const backC = p.night ? "#0b2016" : lerpColor(p.hillFar, "#1f5030", 0.5);
  const frontC = p.night ? "#123a24" : lerpColor(p.hillNear, "#2f7a45", 0.5);
  const trunk = p.night ? "#0a160f" : "#3a2a1e";

  // dark ground strip along the shore
  ctx.fillStyle = p.night ? "#0a1c14" : "#1c4a2b";
  ctx.fillRect(0, WY - 8, s.w, 14);

  const pine = (x: number, baseY: number, ht: number, wd: number, col: string) => {
    ctx.fillStyle = trunk;
    ctx.fillRect(x - 1.5, baseY - ht * 0.12, 3, ht * 0.16);
    ctx.fillStyle = col;
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const ty = baseY - ht * 0.12 - (ht * 0.9) * (i / tiers);
      const tw = wd * (1 - (i / (tiers + 0.6)) * 0.85);
      ctx.beginPath();
      ctx.moveTo(x, ty - ht * 0.34);
      ctx.lineTo(x - tw / 2, ty);
      ctx.lineTo(x + tw / 2, ty);
      ctx.closePath();
      ctx.fill();
    }
  };

  // back layer: dense, tall, seeded (deterministic → static)
  for (let i = 0; i * 18 < s.w + 20; i++) {
    const x = i * 18 + (Math.sin(i * 91.7) * 0.5 + 0.5) * 12;
    const ht = 78 + (Math.sin(i * 33.3) * 0.5 + 0.5) * 55;
    pine(x, WY - 2, ht, 30, backC);
  }
  // front layer: shorter, overlapping
  for (let i = 0; i * 27 < s.w + 27; i++) {
    const x = 10 + i * 27 + (Math.sin(i * 57.1) * 0.5 + 0.5) * 14;
    const ht = 54 + (Math.sin(i * 17.9) * 0.5 + 0.5) * 38;
    pine(x, WY + 3, ht, 34, frontC);
  }
}

// ── Water: still ─────────────────────────────────────────────────────────────
function drawWater(ctx: CanvasRenderingContext2D, s: PondState) {
  const p = s.palette;
  const WY = waterline(s.h);
  const g = ctx.createLinearGradient(0, WY, 0, s.h);
  if (p.night) {
    g.addColorStop(0, "#18456a");
    g.addColorStop(0.3, "#133854");
    g.addColorStop(0.7, "#0d2840");
    g.addColorStop(1, "#081c30");
  } else {
    g.addColorStop(0, p.waterTop);
    g.addColorStop(1, p.waterBottom);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, WY, s.w, s.h - WY);

  // reflection of the treeline just below the shore
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = p.night ? "#0c2418" : "#1c4a2b";
  ctx.fillRect(0, WY, s.w, 10);
  ctx.globalAlpha = 1;

  // static ripple lines (fixed shape, no time term)
  const rows = Math.max(4, Math.round((s.h - WY) / 30));
  for (let i = 0; i < rows; i++) {
    const wy = WY + 12 + i * 30;
    if (wy > s.h) break;
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = i < 2 ? "#4890b8" : "#2e5474";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = 0; x <= s.w; x += 3)
      ctx.lineTo(x, wy + Math.sin(x * 0.02 + i * 1.5) * 2.2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawLilyPad(ctx: CanvasRenderingContext2D, p: LilyPadState) {
  const { cx, cy, rx, ry, opacity: alpha, hasFlower: flower, dying } = p;
  ctx.save();
  ctx.globalAlpha = alpha * 0.18;
  ctx.fillStyle = "#061828";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 7, rx + 3, ry + 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.moveTo(cx + rx * 0.04, cy);
  ctx.lineTo(cx + rx * 0.32, cy - ry * 0.14);
  ctx.lineTo(cx + rx * 0.32, cy + ry * 0.14);
  ctx.closePath();
  let b: string, m: string, e: string;
  if (dying) {
    const d = dying;
    b = `rgb(${75 + d * 85},${170 - d * 115},${55 - d * 40})`;
    m = `rgb(${55 + d * 75},${135 - d * 95},${40 - d * 30})`;
    e = `rgb(${35 + d * 65},${95 - d * 65},${28 - d * 18})`;
  } else {
    b = "#48b042";
    m = "#389035";
    e = "#28702e";
  }
  const pg = ctx.createRadialGradient(cx - rx * 0.12, cy - ry * 0.18, rx * 0.08, cx, cy, rx);
  pg.addColorStop(0, b);
  pg.addColorStop(0.55, m);
  pg.addColorStop(1, e);
  ctx.fillStyle = pg;
  ctx.fill();
  if (!dying || dying < 0.5) {
    ctx.globalAlpha = alpha * (dying ? 0.25 : 0.2);
    ctx.strokeStyle = dying ? "#806828" : "#58c450";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI + i * (Math.PI / 3.2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx + Math.cos(a) * rx * 0.4 + Math.sin(a) * 4, cy + Math.sin(a) * ry * 0.4, cx + Math.cos(a) * rx * 0.82, cy + Math.sin(a) * ry * 0.82);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
  }
  ctx.globalAlpha = alpha * (dying ? 0.04 : 0.12);
  ctx.fillStyle = "#90e898";
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.18, cy - ry * 0.28, rx * 0.4, ry * 0.3, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  if (flower && rx > 45 && !dying) {
    const fx = cx - rx * 0.52, fy = cy - ry * 0.45;
    for (let i = 0; i < 5; i++) {
      const a = i * ((Math.PI * 2) / 5) - Math.PI / 2;
      ctx.fillStyle = i % 2 ? "#e080a8" : "#ec90b8";
      ctx.beginPath();
      ctx.ellipse(fx + Math.cos(a) * 5.5, fy + Math.sin(a) * 5.5, 4.5, 2.5, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#f0d040";
    ctx.beginPath();
    ctx.arc(fx, fy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Feather only top & bottom to transparent; full-bleed left/right.
function drawEdgeFade(ctx: CanvasRenderingContext2D, s: PondState) {
  const F = Math.min(Math.round(s.h * 0.12), 52);
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  let g = ctx.createLinearGradient(0, 0, 0, F);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s.w, F);
  g = ctx.createLinearGradient(0, s.h, 0, s.h - F);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, s.h - F, s.w, F);
  ctx.restore();
}

// ── Havi ─────────────────────────────────────────────────────────────────────
function pxFn(ctx: CanvasRenderingContext2D) {
  return (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x * PS), Math.round(y * PS), Math.ceil(w * PS), Math.ceil(h * PS));
  };
}

function haviOrigin(pad: LilyPadState): { ox: number; oy: number } {
  return { ox: Math.round(pad.cx / PS) - 14, oy: Math.round((pad.cy - 50) / PS) - 10 };
}

function drawBody(px: ReturnType<typeof pxFn>, ox: number, oy: number, rows = BODY.length) {
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < BODY[y].length; x++) {
      const c = BODY[y][x];
      if (c === ".") continue;
      px(ox + x, oy + y, 1, 1, COL[c] || "#000");
    }
}

// Havi reeling a little desk up out of the water.
function drawFishing(px: ReturnType<typeof pxFn>, ox: number, oy: number, t: number, prog: number) {
  drawBody(px, ox, oy);
  px(ox + 8, oy + 10, 2, 2, COL.k);
  px(ox + 18, oy + 10, 2, 2, COL.k);
  px(ox + 12, oy + 13, 4, 1, COL.k);
  // rod
  for (let i = 0; i < 10; i++) px(Math.round(ox + 22 + i * 0.4), Math.round(oy + 14 - i), 1, 1, "#8B6535");
  // line
  for (let i = 0; i < 14; i++) px(Math.round(ox + 26 + i * 0.6), Math.round(oy + 5 + i * 1.7 + Math.sin(t * 0.07 + i) * 0.4), 1, 1, "#99aabb");
  px(ox + 22, oy + 14, 3, 2, COL.G);
  if (prog > 0) {
    const dY = oy + 30 - Math.floor(prog * 16);
    px(ox + 30, dY, 14, 2, "#6B4226");
    px(ox + 30, dY + 2, 2, 4, "#5A3520");
    px(ox + 42, dY + 2, 2, 4, "#5A3520");
    if (prog < 0.6) for (let i = 0; i < 3; i++) px(ox + 32 + i * 3, dY + 5 + Math.floor((t + i * 4) % 6), 1, 1, "#4a88b8");
  }
  if (prog < 0.35) {
    px(ox + 33, oy + 27 + (t % 3), 2, 1, "#80c0e0");
    px(ox + 38, oy + 27 + ((t + 2) % 3), 2, 1, "#80c0e0");
  }
}

function drawStudying(px: ReturnType<typeof pxFn>, ox: number, oy: number, t: number) {
  px(ox + 9, oy + 20, 2, 4, "#8B6535");
  px(ox + 17, oy + 20, 2, 4, "#8B6535");
  px(ox + 8, oy + 19, 12, 2, "#A0753F");
  px(ox + 8, oy + 12, 2, 8, "#8B6535");
  px(ox + 18, oy + 12, 2, 8, "#8B6535");
  px(ox + 8, oy + 12, 12, 2, "#A0753F");
  drawBody(px, ox, oy, 18);
  px(ox + 9, oy + 18, 3, 4, COL.G);
  px(ox + 9, oy + 22, 3, 1, COL.d);
  px(ox + 16, oy + 18, 3, 4, COL.G);
  px(ox + 16, oy + 22, 3, 1, COL.d);
  px(ox + 8, oy + 9, 2, 3, COL.k);
  px(ox + 18, oy + 9, 2, 3, COL.k);
  px(ox + 13, oy + 13, 2, 1, COL.k);
  const dY = oy + 18;
  px(ox - 4, dY, 36, 2, "#6B4226");
  px(ox - 4, dY + 2, 2, 6, "#5A3520");
  px(ox + 30, dY + 2, 2, 6, "#5A3520");
  px(ox - 4, dY, 36, 1, "#7B5236");
  const bob = Math.abs(Math.sin(t / 6)) > 0.5 ? 1 : 0;
  px(ox + 2, dY - 2 - bob, 12, 2, "#c0563f");
  px(ox + 3, dY - 4 - bob, 10, 2, COL.b);
  px(ox + 2, dY - 1 - bob, 1, 1, COL.paper);
  px(ox + 3, dY - 3 - bob, 1, 1, COL.paper);
  px(ox + 4, dY - 1, 2, 2, COL.G);
  px(ox + 22, dY - 1, 2, 2, COL.G);
  const pw = Math.floor(t / 5) % 3;
  px(ox + 23 + (pw % 2), dY - 2, 1, 2, "#f2d94e");
  px(ox + 23 + (pw % 2), dY - 3, 1, 1, "#333");
}

function drawFace(px: ReturnType<typeof pxFn>, ctx: CanvasRenderingContext2D, ox: number, oy: number, act: HaviMood, t: number) {
  if (act === "idle") {
    const cyc = Math.floor(t / 12) % 4;
    let ex = 0, ey = 0;
    if (cyc === 0) ex = -1; else if (cyc === 1) ex = 1; else if (cyc === 2) ey = -1; else ey = 1;
    px(ox + 8 + ex, oy + 9 + ey, 2, 2, COL.k);
    px(ox + 18 + ex, oy + 9 + ey, 2, 2, COL.k);
    px(ox + 12, oy + 13, 4, 1, COL.k);
  } else if (act === "celebrating") {
    px(ox + 8, oy + 11, 1, 1, COL.k); px(ox + 9, oy + 10, 1, 1, COL.k); px(ox + 10, oy + 11, 1, 1, COL.k);
    px(ox + 17, oy + 11, 1, 1, COL.k); px(ox + 18, oy + 10, 1, 1, COL.k); px(ox + 19, oy + 11, 1, 1, COL.k);
    px(ox + 11, oy + 13, 6, 1, COL.k); px(ox + 12, oy + 14, 4, 1, COL.mouthRed); px(ox + 13, oy + 15, 2, 1, COL.tongue);
    px(ox + 6, oy + 12, 1, 1, COL.cheek); px(ox + 21, oy + 12, 1, 1, COL.cheek);
    const cols = [COL.f, COL.y, "#8bc34a", COL.zzz, "#f8c040", "#88ddff"];
    for (let i = 0; i < 6; i++) px(ox + 2 + i * 4, Math.floor(oy + ((t * 0.7 + i * 4) % 22)), 1, 1, cols[i % 6]);
  } else if (act === "resting") {
    px(ox + 7, oy + 10, 4, 1, COL.k); px(ox + 17, oy + 10, 4, 1, COL.k);
    px(ox + 12, oy + 13, 4, t % 14 < 7 ? 2 : 1, COL.k);
    ctx.fillStyle = COL.zzz;
    ctx.font = `${Math.round(PS * 2.5)}px monospace`;
    ctx.fillText("z", (ox + 23) * PS, (oy + 5 - (t % 7) * 0.4) * PS);
  } else if (act === "sad") {
    px(ox + 8, oy + 10, 2, 2, COL.k);
    px(ox + 9, oy + 10, 1, 1, "#334433");
    px(ox + 18, oy + 10, 2, 2, COL.k);
    px(ox + 19, oy + 10, 1, 1, "#334433");
    px(ox + 12, oy + 13, 4, 1, COL.k);
    px(ox + 11, oy + 14, 1, 1, COL.k);
    px(ox + 16, oy + 14, 1, 1, COL.k);
    const tp = (t % 50) / 50;
    if (tp < 0.7) {
      ctx.globalAlpha = Math.max(0, 1 - tp * 1.4);
      px(ox + 20, Math.floor(oy + 12 + tp * 5), 1, 1, "#70b8e8");
      ctx.globalAlpha = 1;
    }
  } else {
    px(ox + 8, oy + 9, 2, 3, COL.k);
    px(ox + 18, oy + 9, 2, 3, COL.k);
    px(ox + 12, oy + 13, 4, 1, COL.k);
  }
}

function drawHavi(ctx: CanvasRenderingContext2D, s: PondState) {
  const pads = s.lilyPads;
  if (pads.length === 0) return;
  const px = pxFn(ctx);
  const t = s.tick;

  // Jump between pads (celebration) — an arc, no walking.
  if (s.jump) {
    const from = pads[Math.min(s.jump.from, pads.length - 1)];
    const to = pads[Math.min(s.jump.to, pads.length - 1)];
    const a = haviOrigin(from);
    const bO = haviOrigin(to);
    const p = s.jump.progress;
    const ox = Math.round(a.ox + (bO.ox - a.ox) * p);
    const oy = Math.round(a.oy + (bO.oy - a.oy) * p - Math.sin(p * Math.PI) * 10);
    drawBody(px, ox, oy);
    drawFace(px, ctx, ox, oy, "jumping", t);
    return;
  }

  const pad = pads[Math.min(s.haviPadIndex, pads.length - 1)];
  const o = haviOrigin(pad);
  const bobAmt = s.reducedMotion ? 0
    : s.haviMood === "celebrating" ? Math.abs(Math.sin(t * 0.14)) * -3
    : s.haviMood === "studying" || s.haviMood === "fishing" ? Math.sin(t * 0.025) * 0.4
    : Math.sin(t * 0.04) * 1;
  const ox = o.ox;
  const oy = Math.round(o.oy + bobAmt);

  if (s.haviMood === "fishing") {
    drawFishing(px, ox, oy, t, s.fishProgress);
    return;
  }
  if (s.haviMood === "studying") {
    drawStudying(px, ox, Math.round(oy - 4), t);
    return;
  }
  drawBody(px, ox, oy);
  drawFace(px, ctx, ox, oy, s.haviMood, t);
}

// ── helpers ──────────────────────────────────────────────────────────────────
// ── Lily pad layout (fractions of banner size) ───────────────────────────────
// Scattered across the WHOLE pond — full width and the full water band — so a
// grown pond reads as lily pads everywhere, not a central cluster. Slot 0 is
// the big front pad Havi calls home.
const PAD_SLOTS: Array<{ fx: number; fy: number; rx: number; ry: number }> = [
  { fx: 0.3, fy: 0.74, rx: 84, ry: 26 },
  { fx: 0.68, fy: 0.7, rx: 76, ry: 23 },
  { fx: 0.09, fy: 0.83, rx: 66, ry: 21 },
  { fx: 0.9, fy: 0.85, rx: 64, ry: 20 },
  { fx: 0.5, fy: 0.9, rx: 74, ry: 23 },
  { fx: 0.83, fy: 0.63, rx: 56, ry: 17 },
  { fx: 0.16, fy: 0.63, rx: 58, ry: 18 },
  { fx: 0.62, fy: 0.92, rx: 60, ry: 19 },
  { fx: 0.38, fy: 0.61, rx: 54, ry: 16 },
  { fx: 0.97, fy: 0.72, rx: 52, ry: 16 },
  { fx: 0.03, fy: 0.71, rx: 52, ry: 16 },
  { fx: 0.5, fy: 0.66, rx: 50, ry: 15 },
  { fx: 0.25, fy: 0.92, rx: 62, ry: 19 },
  { fx: 0.75, fy: 0.82, rx: 58, ry: 18 },
  { fx: 0.11, fy: 0.95, rx: 56, ry: 17 },
  { fx: 0.89, fy: 0.97, rx: 54, ry: 16 },
];

export function buildLilyPads(count: number, w: number, h: number): LilyPadState[] {
  const n = Math.max(1, Math.min(count, PAD_SLOTS.length));
  return PAD_SLOTS.slice(0, n).map((slot, i) => ({
    cx: slot.fx * w,
    cy: slot.fy * h,
    rx: slot.rx,
    ry: slot.ry,
    hasFlower: i === 0,
    opacity: 1,
    dying: 0,
  }));
}

export const PAD_SLOT_COUNT = PAD_SLOTS.length;
