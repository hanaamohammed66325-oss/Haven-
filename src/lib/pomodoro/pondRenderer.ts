// Pure canvas renderer for the Pomodoro pond scene. No React.
//
// The pond is a HORIZONTAL journey. Lily pads sit on a single line, left → right,
// one new pad per completed focus session. A camera follows Havi: when he jumps
// to a fresh pad the whole scene scrolls sideways, so a long study day reads as a
// trail of pads marching across the water rather than a static cluster.
//
// The world is alive: the water ripples and drifts, the treeline parallax-scrolls
// behind the camera, and the sky follows the user's real clock (morning → night).
// At night a little lamp glows on Havi's pad and fireflies drift over the water;
// by day the lamp is dark.
//
// Scenario per session: Havi waits on his pad → the session starts and he reels a
// small study desk up out of the water → he studies (sheets fill left → right) →
// the next pad has been fading in to the right → on completion he JUMPS onto it and
// celebrates → then rests (a nap or his phone) until the next session repeats.
//
// Two looks share all of this: a smooth painted style and a chunky pixel style.

import { lerpColor, type SkyPalette } from "./timeOfDay";

const PS = 3; // pixel size for Havi sprites (small frog on a big pad)

// Cartoon ink + halo: soft hand-drawn look. Builds the path via `path`, lays a
// cream halo, fills, then strokes a chunky dark outline over the edge.
const INK = "#33403a";
function inked(
  ctx: CanvasRenderingContext2D,
  path: () => void,
  fill: string | CanvasGradient,
  lineW = 3,
  halo = true,
) {
  if (halo) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#efe9d8";
    ctx.lineWidth = lineW + 4;
    path();
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = lineW;
  ctx.stroke();
  ctx.restore();
}

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
  cx: number; // WORLD x (before camera). Screen x = cx - camX.
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
  palette: SkyPalette;
  lilyPads: LilyPadState[];
  haviPadIndex: number;
  jump: { from: number; to: number; progress: number } | null;
  haviMood: HaviMood;
  fishProgress: number; // 0..1 while pulling the desk from the water
  showHavi: boolean;
  tick: number;
  camX: number; // world x at the left screen edge; the camera scrolls this
  reducedMotion: boolean;
  dir: "ltr" | "rtl";
}

function waterline(h: number): number {
  return Math.round(h * 0.5);
}

// The minimal slice the sky bodies (sun / moon / stars / clouds) read. PondState
// satisfies it structurally, so the pond keeps calling them unchanged, while the
// grove can drive them with a lighter object.
interface SkyView {
  w: number;
  h: number;
  tick: number;
  reducedMotion: boolean;
  palette: SkyPalette;
  camX: number;
}

// Shared cartoon forest palette, so the pond and the grove clearing render the
// same trees. Greens are muted by day for eye comfort; deep and cool at night.
function forestColors(night: boolean) {
  return {
    backC: night ? "#1b3226" : "#749a5f",
    mainC: night ? "#274634" : "#537f4b",
    shadeC: night ? "#1d3527" : "#42693d",
    shrubC: night ? "#22402e" : "#79a052",
    shrubShade: night ? "#1a3324" : "#638e42",
  };
}

// One soft pine: three rounded tiers, apex nudged by the breeze. Shared by the
// side-scroll pond treeline and the grove clearing that rings the lake.
function drawPine(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  ht: number,
  wd: number,
  i: number,
  outline: boolean,
  mainC: string,
  shadeC: string,
  tick: number,
  reduced: boolean,
) {
  const dx = reduced ? 0 : Math.sin(tick * 0.028 + i * 0.8) * 3;
  const tiers = 3;
  ctx.save();
  ctx.lineJoin = "round";
  for (let t = 0; t < tiers; t++) {
    const ty = baseY - (ht * 0.82) * (t / tiers);
    const tw = wd * (1 - (t / (tiers + 0.5)) * 0.78);
    const apexX = x + dx * (t + 1) / tiers;
    const apexY = ty - ht * 0.42;
    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(x - tw / 2, ty);
    ctx.quadraticCurveTo(x, ty + 3, x + tw / 2, ty);
    ctx.closePath();
    ctx.fillStyle = mainC;
    ctx.fill();
    // left-side shade wedge for a hand-drawn hint of volume
    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(x - tw / 2, ty);
    ctx.lineTo(x, ty);
    ctx.closePath();
    ctx.fillStyle = shadeC;
    ctx.fill();
    if (outline) {
      ctx.beginPath();
      ctx.moveTo(apexX, apexY);
      ctx.lineTo(x - tw / 2, ty);
      ctx.quadraticCurveTo(x, ty + 3, x + tw / 2, ty);
      ctx.closePath();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ── Public entry ─────────────────────────────────────────────────────────────
export function renderPond(ctx: CanvasRenderingContext2D, s: PondState): void {
  ctx.clearRect(0, 0, s.w, s.h);
  const cam = Math.round(s.camX);

  // Background: sky, celestial body, forest (parallax), water. Screen space.
  drawEnvironment(ctx, s, cam);

  // World layer: pads, lamp, Havi — all shifted by the camera together.
  ctx.save();
  ctx.translate(-cam, 0);
  drawPads(ctx, s);
  if (s.showHavi) {
    if (s.palette.night) drawLamp(ctx, s);
    drawHavi(ctx, s);
  }
  ctx.restore();

  // Ambient life over everything (screen space).
  if (s.palette.night) drawFireflies(ctx, s);
  else drawButterflies(ctx, s);
  drawGrass(ctx, s);
  drawEdgeFade(ctx, s);
}

function drawPads(ctx: CanvasRenderingContext2D, s: PondState) {
  const order = s.lilyPads.map((p, i) => ({ p, i })).sort((a, b) => a.p.cy - b.p.cy);
  for (const { p } of order) {
    if (p.opacity <= 0.01) continue;
    drawLilyPad(ctx, p);
  }
}

function drawEnvironment(ctx: CanvasRenderingContext2D, s: PondState, cam: number) {
  const night = s.palette.night;
  drawSky(ctx, s);
  if (night) {
    drawStars(ctx, s);
    drawMoon(ctx, s);
  } else {
    drawSun(ctx, s);
    drawClouds(ctx, s, cam);
  }
  drawForest(ctx, s, cam);
  drawWater(ctx, s);
}

// ── Sky & sky bodies ─────────────────────────────────────────────────────────
function drawSky(ctx: CanvasRenderingContext2D, s: PondState) {
  const p = s.palette;
  const WY = waterline(s.h);
  const g = ctx.createLinearGradient(0, 0, 0, WY);
  g.addColorStop(0, p.top);
  g.addColorStop(1, p.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s.w, WY);
}

// A big, friendly golden crescent with a chunky cream outline — echoing the
// cozy "moon for the night" reference. Built by carving a sky-coloured bite out
// of a clipped golden disc, so it is one clean crescent (never a double sliver).
function drawMoon(ctx: CanvasRenderingContext2D, s: SkyView) {
  const mx = s.w * 0.78 - s.camX * 0.04, my = s.h * 0.2;
  const R = Math.min(36, s.w * 0.058);
  const Rb = R * 1.06;
  const dx = R * 0.62;
  const by = my - R * 0.14;
  const skyC = lerpColor(s.palette.top, s.palette.bottom, 0.4);

  // soft warm glow
  const glo = ctx.createRadialGradient(mx, my, R * 0.4, mx, my, R * 3);
  glo.addColorStop(0, "rgba(244,205,110,0.26)");
  glo.addColorStop(0.5, "rgba(244,199,78,0.07)");
  glo.addColorStop(1, "transparent");
  ctx.fillStyle = glo;
  ctx.beginPath();
  ctx.arc(mx, my, R * 3, 0, Math.PI * 2);
  ctx.fill();

  // cream halo behind the disc
  ctx.fillStyle = "#fbf3dd";
  ctx.beginPath();
  ctx.arc(mx, my, R + 2.5, 0, Math.PI * 2);
  ctx.fill();

  // gold disc, then a sky-coloured bite carves the crescent (clipped to disc)
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#f4c74e";
  ctx.fillRect(mx - R - 2, my - R - 2, (R + 2) * 2, (R + 2) * 2);
  // warm inner highlight on the thick side
  ctx.fillStyle = "#ffe08a";
  ctx.beginPath();
  ctx.ellipse(mx - R * 0.35, my - R * 0.1, R * 0.45, R * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // the bite
  ctx.fillStyle = skyC;
  ctx.beginPath();
  ctx.arc(mx + dx, by, Rb, 0, Math.PI * 2);
  ctx.fill();
  // ink outline along the bite edge
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(mx + dx, by, Rb, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // ink outline around the outer disc
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(mx, my, R, 0, Math.PI * 2);
  ctx.stroke();
}

// Soft pale sun with a ring of short hand-drawn rays (cartoon, not glowing).
function drawSun(ctx: CanvasRenderingContext2D, s: SkyView) {
  const p = s.palette;
  const sx = s.w * 0.72 - s.camX * 0.03, sy = s.h * 0.2;
  const R = Math.min(34, s.w * 0.05);
  const sway = s.reducedMotion ? 0 : Math.sin(s.tick * 0.02) * 0.06;

  // rays
  ctx.save();
  ctx.strokeStyle = "#e9d99f";
  ctx.lineCap = "round";
  ctx.lineWidth = 3;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + sway;
    const r0 = R + 8, r1 = R + 8 + (i % 2 ? 12 : 18);
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0);
    ctx.lineTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();

  inked(ctx, () => { ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); }, p.celestial, 3);
}

// Chunky golden four-point stars with a cream outline (reference style), plus a
// scatter of tiny twinkling dots behind them.
function fourPointStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const inner = r * 0.34;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const ang = (Math.PI / 4) * k - Math.PI / 2;
    const rad = k % 2 === 0 ? r : inner;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawStars(ctx: CanvasRenderingContext2D, s: SkyView) {
  const WY = waterline(s.h);

  // tiny background dots
  const dots = Math.max(14, Math.round(s.w / 34));
  ctx.fillStyle = "#eaf3d6";
  for (let i = 0; i < dots; i++) {
    const r1 = Math.sin(i * 12.9898) * 43758.5453;
    const r2 = Math.sin(i * 78.233) * 12543.632;
    const sx = (r1 - Math.floor(r1)) * s.w;
    const sy = (r2 - Math.floor(r2)) * (WY * 0.72);
    const tw = s.reducedMotion ? 0 : Math.sin(s.tick * 0.05 + i * 3.1) * 0.5;
    ctx.globalAlpha = Math.max(0.15, Math.min(1, 0.4 + (Math.sin(i * 3.1) * 0.5 + 0.5) * 0.4 + tw * 0.15));
    ctx.beginPath();
    ctx.arc(sx, sy, 1 + (i % 3 === 0 ? 0.7 : 0), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // a few big feature stars
  const big = Math.max(3, Math.round(s.w / 220));
  for (let i = 0; i < big; i++) {
    const r1 = Math.sin(i * 5.31 + 1.2) * 43758.5453;
    const r2 = Math.sin(i * 9.17 + 2.7) * 12543.632;
    const sx = (r1 - Math.floor(r1)) * s.w;
    const sy = WY * 0.12 + (r2 - Math.floor(r2)) * (WY * 0.5);
    const pulse = s.reducedMotion ? 1 : 0.85 + Math.sin(s.tick * 0.06 + i * 1.7) * 0.15;
    const r = (7 + (Math.sin(i * 3.3) * 0.5 + 0.5) * 5) * pulse;
    fourPointStar(ctx, sx, sy, r + 2);
    ctx.fillStyle = "#fbf3dd";
    ctx.fill();
    fourPointStar(ctx, sx, sy, r);
    ctx.fillStyle = "#f4c74e";
    ctx.fill();
  }
}

// ── Forest: soft cartoon pines in layers, swaying in the breeze ──────────────
function drawForest(ctx: CanvasRenderingContext2D, s: PondState, cam: number) {
  const p = s.palette;
  const night = p.night;
  const WY = waterline(s.h);

  const { mainC, shadeC, shrubC, shrubShade } = forestColors(night);

  const pine = (x: number, baseY: number, ht: number, wd: number, i: number, outline: boolean) =>
    drawPine(ctx, x, baseY, ht, wd, i, outline, mainC, shadeC, s.tick, s.reducedMotion);

  ctx.save();
  ctx.translate(Math.round(-cam * 0.3), 0);
  const px0 = cam * 0.3;

  // back layer: faded, no outline, sits a touch higher
  const stepB = 38;
  const startB = Math.floor(px0 / stepB) - 1;
  const endB = startB + Math.ceil(s.w / stepB) + 3;
  for (let i = startB; i < endB; i++) {
    const x = i * stepB + (Math.sin(i * 91.7) * 0.5 + 0.5) * 18;
    const ht = 120 + (Math.sin(i * 33.3) * 0.5 + 0.5) * 60;
    pine(x, WY - 16, ht, 62, i, false);
  }

  // shrub band along the shore: rounded bumps with a dark top edge + halo
  const bumps: Array<[number, number]> = [];
  const stepS = 34;
  const startS = Math.floor(px0 / stepS) - 1;
  const endS = startS + Math.ceil(s.w / stepS) + 3;
  for (let i = startS; i < endS; i++) {
    const bx = i * stepS + (Math.sin(i * 12.3) * 0.5 + 0.5) * 10;
    const bh = 16 + (Math.sin(i * 5.7) * 0.5 + 0.5) * 12;
    bumps.push([bx, bh]);
  }
  const shrubPath = () => {
    ctx.beginPath();
    ctx.moveTo(px0 - 40, WY + 12);
    ctx.lineTo(px0 - 40, WY - 6);
    for (const [bx, bh] of bumps) ctx.quadraticCurveTo(bx - stepS / 2, WY - 6 - bh, bx, WY - 4 - bh * 0.6);
    ctx.quadraticCurveTo(px0 + s.w + 40, WY - 10, px0 + s.w + 40, WY - 4);
    ctx.lineTo(px0 + s.w + 40, WY + 12);
    ctx.closePath();
  };
  inked(ctx, shrubPath, shrubC, 2.6, true);
  // shrub inner shade line
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = shrubShade;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [bx, bh] of bumps) ctx.lineTo(bx, WY - 2 - bh * 0.4);
  ctx.stroke();
  ctx.restore();

  // front layer: the main outlined pines, overlapping onto the shrub
  const stepF = 52;
  const startF = Math.floor(px0 / stepF) - 1;
  const endF = startF + Math.ceil(s.w / stepF) + 3;
  for (let i = startF; i < endF; i++) {
    const x = 14 + i * stepF + (Math.sin(i * 57.1) * 0.5 + 0.5) * 22;
    const ht = 116 + (Math.sin(i * 17.9) * 0.5 + 0.5) * 58;
    pine(x, WY - 2, ht, 68, i + 100, true);
  }
  ctx.restore();
}

// ── Clouds: soft rounded puffs drifting slowly across the sky ─────────────────
const CLOUD_PUFFS: Array<[number, number, number, number]> = [
  [0, 0, 34, 20],
  [-30, 6, 22, 15],
  [30, 6, 24, 16],
  [6, -10, 20, 15],
];
function drawClouds(ctx: CanvasRenderingContext2D, s: SkyView, cam: number) {
  const WY = waterline(s.h);
  const drift = s.reducedMotion ? 0 : s.tick * 0.15;
  // Layer solid fills (halo → ink → white) so the silhouette reads as one clean
  // outline instead of a tangle of overlapping ellipse strokes.
  const blob = (x: number, y: number, scale: number, color: string, grow: number) => {
    ctx.fillStyle = color;
    for (const [dx, dy, ex, ey] of CLOUD_PUFFS) {
      ctx.beginPath();
      ctx.ellipse(x + dx * scale, y + dy * scale, (ex + grow) * scale, (ey + grow) * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const cloud = (baseX: number, y: number, scale: number) => {
    const x = ((baseX - cam * 0.06 - drift) % (s.w + 240) + (s.w + 240)) % (s.w + 240) - 120;
    blob(x, y, scale, "#fbf7ec", 3.5);
    blob(x, y, scale, INK, 2);
    blob(x, y, scale, "#fbf9f2", 0);
  };
  cloud(90, WY * 0.28, 1);
  cloud(s.w * 0.64, WY * 0.18, 0.8);
  cloud(s.w * 1.05, WY * 0.42, 0.9);
}

// ── Butterflies: a couple fluttering over the water by day ───────────────────
function drawButterflies(ctx: CanvasRenderingContext2D, s: PondState) {
  if (s.reducedMotion) return;
  const WY = waterline(s.h);
  const one = (seed: number, col: string) => {
    const t = s.tick * 0.03 + seed;
    const x = s.w * (0.3 + 0.4 * (Math.sin(t * 0.5 + seed) * 0.5 + 0.5)) + Math.sin(t * 2) * 10;
    const y = WY + 20 + (Math.sin(t * 0.8 + seed * 2) * 0.5 + 0.5) * (s.h - WY - 60);
    const flap = Math.abs(Math.sin(s.tick * 0.5 + seed));
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = col;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(dir * (2 + flap * 4), -1, 3.4, 4.2 * (0.5 + flap * 0.5), dir * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(dir * (2 + flap * 3), 3, 2.6, 3, dir * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = INK;
    ctx.fillRect(-0.7, -3, 1.4, 7);
    ctx.restore();
  };
  one(0, "#f2a65a");
  one(2.5, "#e88bb5");
}

// ── Foreground grass tufts in the bottom corners ─────────────────────────────
function drawGrass(ctx: CanvasRenderingContext2D, s: PondState) {
  const night = s.palette.night;
  const g1 = night ? "#2a4a30" : "#6ea651";
  const g2 = night ? "#203a26" : "#568f41";
  const blade = (x: number, baseY: number, h: number, lean: number, col: string, i: number) => {
    const bend = s.reducedMotion ? 0 : Math.sin(s.tick * 0.03 + i) * 4;
    inked(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(x - 5, baseY);
      ctx.quadraticCurveTo(x + lean * 0.5 + bend, baseY - h * 0.6, x + lean + bend, baseY - h);
      ctx.quadraticCurveTo(x + lean * 0.5 + bend + 3, baseY - h * 0.6, x + 5, baseY);
      ctx.closePath();
    }, col, 2, true);
  };
  const tuft = (cx: number, baseY: number, dir: number) => {
    blade(cx, baseY, 78, 26 * dir, g2, cx);
    blade(cx + 16 * dir, baseY, 96, 16 * dir, g1, cx + 3);
    blade(cx + 32 * dir, baseY, 70, 34 * dir, g2, cx + 6);
    blade(cx + 46 * dir, baseY, 58, 20 * dir, g1, cx + 9);
  };
  tuft(20, s.h + 6, 1);
  tuft(s.w - 20, s.h + 6, -1);
}

// ── Water: flat cartoon lake with drifting white dash ripples ────────────────
function drawWater(ctx: CanvasRenderingContext2D, s: PondState) {
  const p = s.palette;
  const WY = waterline(s.h);
  const g = ctx.createLinearGradient(0, WY, 0, s.h);
  g.addColorStop(0, p.waterTop);
  g.addColorStop(1, p.waterBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, WY, s.w, s.h - WY);

  // a soft brighter sheen band near the shore
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, WY, s.w, (s.h - WY) * 0.18);
  ctx.restore();

  // short white dash ripples, scattered and gently drifting
  const phase = s.reducedMotion ? 0 : s.tick * 0.5;
  ctx.save();
  ctx.strokeStyle = p.night ? "rgba(200,225,235,0.28)" : "rgba(240,246,244,0.45)";
  ctx.lineCap = "round";
  ctx.lineWidth = 2.4;
  const cols = Math.ceil(s.w / 90) + 1;
  const rowN = Math.max(3, Math.round((s.h - WY) / 46));
  for (let r = 0; r < rowN; r++) {
    for (let c = 0; c < cols; c++) {
      const seed = r * 13.1 + c * 7.7;
      const jitter = (Math.sin(seed) * 0.5 + 0.5);
      const wy = WY + 20 + r * 46 + Math.sin(phase * 0.05 + seed) * 2;
      const wx = ((c * 90 + jitter * 60 - phase * (0.6 + (r % 2) * 0.5)) % (s.w + 120) + (s.w + 120)) % (s.w + 120) - 60;
      const len = 10 + jitter * 14;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + len / 2, wy - 2, wx + len, wy);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawLilyPad(ctx: CanvasRenderingContext2D, p: LilyPadState) {
  const { cx, cy, rx, ry, opacity: alpha, hasFlower: flower, dying } = p;
  const night = false; // pad keeps its green identity in both day and night

  // colours (brown out as the pad dies)
  let body: string, rim: string, vein: string;
  if (dying) {
    const d = dying;
    body = `rgb(${100 + d * 70},${180 - d * 120},${70 - d * 40})`;
    rim = `rgb(${70 + d * 70},${140 - d * 100},${55 - d * 30})`;
    vein = `rgb(${55 + d * 60},${110 - d * 75},${45 - d * 25})`;
  } else {
    body = night ? "#367347" : "#61a54e";
    rim = night ? "#255436" : "#437a3a";
    vein = night ? "#1f4a2e" : "#3c7336";
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  // concentric ripple rings in the water around the pad
  ctx.save();
  ctx.globalAlpha = alpha * 0.5;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.6;
  for (const k of [1.16, 1.34]) {
    ctx.beginPath();
    ctx.ellipse(cx, cy + ry * 0.1, rx * k, ry * k, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // soft shadow under the pad
  ctx.globalAlpha = alpha * 0.16;
  ctx.fillStyle = "#08202a";
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.4, rx * 0.95, ry * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;

  // pad body with cream halo + dark ink outline
  inked(ctx, () => { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); }, body, 3, true);

  // darker inner rim
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.strokeStyle = rim;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 5, ry - 4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // soft top highlight
  ctx.save();
  ctx.globalAlpha = alpha * 0.18;
  ctx.fillStyle = "#eaf6d8";
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.16, cy - ry * 0.34, rx * 0.42, ry * 0.32, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // radial veins fanning from a front notch (the classic lily-pad slit)
  const notch = 0.22; // half-angle of the wedge opening (facing front/right)
  ctx.save();
  ctx.strokeStyle = vein;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const a = notch + (i / 8) * (Math.PI * 2 - notch * 2);
    ctx.globalAlpha = alpha * 0.55;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (rx - 6), cy + Math.sin(a) * (ry - 5));
    ctx.stroke();
  }
  ctx.restore();

  // the wedge notch: a slim slit cut from the right edge to the centre
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = dying ? "#5a4a22" : "#2f5e33";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(-notch) * (rx + 1), cy + Math.sin(-notch) * (ry + 1));
  ctx.lineTo(cx + Math.cos(notch) * (rx + 1), cy + Math.sin(notch) * (ry + 1));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();

  // flower on the home pad
  if (flower && !dying) {
    const fx = cx - rx * 0.5, fy = cy - ry * 0.5;
    inked(ctx, () => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = i * ((Math.PI * 2) / 5) - Math.PI / 2;
        ctx.ellipse(fx + Math.cos(a) * 5.5, fy + Math.sin(a) * 5.5, 4.6, 2.8, a, 0, Math.PI * 2);
      }
    }, "#f0a9c8", 1.4, false);
    ctx.fillStyle = "#f6d84a";
    ctx.beginPath();
    ctx.arc(fx, fy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

// ── Night lamp: a warm lantern on Havi's pad ─────────────────────────────────
function drawLamp(ctx: CanvasRenderingContext2D, s: PondState) {
  const pads = s.lilyPads;
  if (!pads.length) return;
  const pad = pads[Math.min(s.haviPadIndex, pads.length - 1)];
  if (pad.opacity < 0.5) return;
  const bx = pad.cx - pad.rx * 0.62;
  const baseY = pad.cy - pad.ry * 0.3;
  const bulbY = baseY - 34;
  const flicker = s.reducedMotion ? 1 : 0.85 + Math.sin(s.tick * 0.3) * 0.15;

  // warm glow pool
  const glo = ctx.createRadialGradient(bx, bulbY, 3, bx, bulbY, 58);
  glo.addColorStop(0, `rgba(255,214,130,${0.5 * flicker})`);
  glo.addColorStop(0.5, `rgba(255,190,90,${0.16 * flicker})`);
  glo.addColorStop(1, "transparent");
  ctx.fillStyle = glo;
  ctx.beginPath();
  ctx.arc(bx, bulbY, 58, 0, Math.PI * 2);
  ctx.fill();

  // post
  ctx.fillStyle = "#3a2f26";
  ctx.fillRect(bx - 1.5, bulbY, 3, baseY - bulbY);
  ctx.fillRect(bx - 5, baseY - 2, 10, 3);
  // lantern housing
  ctx.fillStyle = "#241d16";
  ctx.beginPath();
  ctx.moveTo(bx - 7, bulbY + 2);
  ctx.lineTo(bx + 7, bulbY + 2);
  ctx.lineTo(bx + 5, bulbY - 8);
  ctx.lineTo(bx - 5, bulbY - 8);
  ctx.closePath();
  ctx.fill();
  // warm bulb
  const bg = ctx.createRadialGradient(bx, bulbY - 2, 1, bx, bulbY - 2, 6);
  bg.addColorStop(0, "#fff3c8");
  bg.addColorStop(1, "#ffca66");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(bx, bulbY - 2, 5, 0, Math.PI * 2);
  ctx.fill();
}

// ── Night fireflies: soft drifting motes over the water ──────────────────────
function drawFireflies(ctx: CanvasRenderingContext2D, s: PondState) {
  const WY = waterline(s.h);
  const n = s.reducedMotion ? 6 : Math.max(10, Math.round(s.w / 60));
  for (let i = 0; i < n; i++) {
    const r1 = Math.sin(i * 21.13) * 43758.5453;
    const r2 = Math.sin(i * 47.71) * 12543.632;
    const baseX = (r1 - Math.floor(r1)) * s.w;
    const baseY = WY + 10 + (r2 - Math.floor(r2)) * (s.h - WY - 24);
    const dx = s.reducedMotion ? 0 : Math.sin(s.tick * 0.02 + i * 1.7) * 22;
    const dy = s.reducedMotion ? 0 : Math.cos(s.tick * 0.017 + i * 2.3) * 14;
    const x = baseX + dx;
    const y = baseY + dy;
    const pulse = s.reducedMotion ? 0.4 : 0.3 + (Math.sin(s.tick * 0.08 + i * 2.1) * 0.5 + 0.5) * 0.6;
    const glo = ctx.createRadialGradient(x, y, 0, x, y, 7);
    glo.addColorStop(0, `rgba(226,255,150,${pulse})`);
    glo.addColorStop(1, "transparent");
    ctx.fillStyle = glo;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(240,255,190,${Math.min(1, pulse + 0.2)})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
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
  // Sprite is 28×21 cells; centre it on the pad and sit it on the pad surface.
  return { ox: Math.round(pad.cx / PS) - 14, oy: Math.round((pad.cy - pad.ry * 0.2) / PS) - 19 };
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
  for (let i = 0; i < 10; i++) px(Math.round(ox + 22 + i * 0.4), Math.round(oy + 14 - i), 1, 1, "#8B6535");
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
  // sheets fill the desk left → right as the session progresses (no scatter —
  // one orderly row that advances, then wraps to a fresh page).
  const sheets = Math.floor((t / 14) % 8);
  for (let k = 0; k <= sheets; k++) px(ox - 3 + k * 4, dY - 1, 3, 1, COL.paper);
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

// Resting: alternates between a nap (zzz) and idly scrolling a phone, so the
// break reads as a genuine breather.
function drawResting(px: ReturnType<typeof pxFn>, ctx: CanvasRenderingContext2D, ox: number, oy: number, t: number) {
  const onPhone = Math.floor(t / 140) % 2 === 1;
  if (onPhone) {
    // half-closed eyes down on a little glowing phone
    px(ox + 7, oy + 10, 4, 1, COL.k);
    px(ox + 17, oy + 10, 4, 1, COL.k);
    px(ox + 12, oy + 13, 4, 1, COL.k);
    px(ox + 11, oy + 17, 6, 3, "#2a2a30");
    const lit = (t % 8) < 4;
    px(ox + 12, oy + 18, 4, 1, lit ? "#8fd0ff" : "#6fb0e0");
    px(ox + 10, oy + 16, 2, 3, COL.G);
    px(ox + 16, oy + 16, 2, 3, COL.G);
  } else {
    px(ox + 7, oy + 10, 4, 1, COL.k);
    px(ox + 17, oy + 10, 4, 1, COL.k);
    px(ox + 12, oy + 13, 4, t % 14 < 7 ? 2 : 1, COL.k);
    ctx.fillStyle = COL.zzz;
    ctx.font = `${Math.round(PS * 2.5)}px monospace`;
    ctx.fillText("z", (ox + 23) * PS, (oy + 5 - (t % 7) * 0.4) * PS);
  }
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
    drawResting(px, ctx, ox, oy, t);
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
    const oy = Math.round(a.oy + (bO.oy - a.oy) * p - Math.sin(p * Math.PI) * 12);
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

// ── Lily pad layout: a single left → right line across the water ─────────────
// Pads march in an orderly row; the camera scrolls to follow Havi. Slot 0 is the
// big front pad Havi calls home; each completed session adds the next one to the
// right. World coordinates (independent of viewport width) so scrolling is stable.
const FIRST_PAD_X = 190;
const PAD_SPACING = 250;
const MAX_PADS = 80;

export function padWorldX(i: number): number {
  return FIRST_PAD_X + i * PAD_SPACING;
}

export function buildLilyPads(count: number, w: number, h: number): LilyPadState[] {
  void w;
  const n = Math.max(1, Math.min(count, MAX_PADS));
  const baseY = waterline(h) + (h - waterline(h)) * 0.5;
  const amp = Math.min(16, h * 0.03);
  return Array.from({ length: n }, (_, i) => {
    const home = i === 0;
    return {
      cx: padWorldX(i),
      cy: baseY + Math.sin(i * 0.9) * amp,
      rx: home ? 116 : 92 + (Math.sin(i * 2.3) * 0.5 + 0.5) * 12,
      ry: home ? 40 : 32 + (Math.sin(i * 2.3) * 0.5 + 0.5) * 4,
      hasFlower: home,
      opacity: 1,
      dying: 0,
    };
  });
}

export const PAD_SLOT_COUNT = MAX_PADS;

// ── Grove: a top-down view of the whole harvest ──────────────────────────────
// The camera looks straight down at a lush pond. Water fills the frame, dense
// leafy foliage frames the edges, and every focus session the student has ever
// finished floats on the open water as a lily pad (some blooming into a lotus).
// Havi sits in the very centre, quietly watching over it — so the pond reads as
// a growing record of the work, the achievement made visible. Day/night follows
// the real clock (a soft green glow + drifting motes at night).
export interface GroveState {
  w: number;
  h: number;
  palette: SkyPalette;
  count: number; // earned lily pads (one per completed session)
  showHavi: boolean;
  haviReact: boolean; // true briefly after the user taps Havi → he celebrates
  padSpecs?: GrovePadSpec[]; // pad species + bloom per pad (by course)
  filterKey?: string | null; // when set, only this subject's pads are shown
  tick: number;
  reducedMotion: boolean;
}

// What each earned pad looks like. `species`/`flower` are indices (by course, so a
// subject always grows the same plant); `color` is the bloom colour (null = a
// plain, unassigned "General" pad with no flower).
export interface GrovePadSpec {
  key: string; // course id, or "__general" for unassigned sessions
  color: string | null;
  species: number; // 0..PAD_SPECIES-1
  flower: number; // 0..PAD_FLOWERS-1
}
export const PAD_SPECIES = 5;
export const PAD_FLOWERS = 4;

// Deterministic scatter of the earned pads over the water using a sunflower
// (phyllotaxis) spiral, so any count fills the pond evenly without overlap.
const GOLDEN_ANGLE = 2.399963229728653;

interface Greens { deep: string; dark: string; mid: string; light: string; glow: string; }
function groveGreens(night: boolean): Greens {
  return night
    ? { deep: "#0c2418", dark: "#14361f", mid: "#1f5230", light: "#2f7a45", glow: "#7fe6a0" }
    : { deep: "#1f3d22", dark: "#33612f", mid: "#4f8a3f", light: "#7bb851", glow: "#bfe887" };
}

export function renderGrove(ctx: CanvasRenderingContext2D, s: GroveState): void {
  const { w, h, tick } = s;
  const night = s.palette.night;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h * 0.5;

  // ── Water fills the frame (the camera looks straight down) ──
  const wg = ctx.createLinearGradient(0, 0, 0, h);
  wg.addColorStop(0, night ? "#123a2e" : "#347a6b");
  wg.addColorStop(1, night ? "#07201a" : "#173d38");
  ctx.fillStyle = wg;
  ctx.fillRect(0, 0, w, h);

  // soft light pooling in the middle (a magical green glow at night)
  const glowR = Math.max(w, h) * 0.55;
  const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, glowR);
  if (night) {
    glow.addColorStop(0, "rgba(96,214,140,0.30)");
    glow.addColorStop(0.45, "rgba(60,160,100,0.10)");
    glow.addColorStop(1, "transparent");
  } else {
    glow.addColorStop(0, "rgba(190,232,205,0.22)");
    glow.addColorStop(0.55, "rgba(150,210,180,0.06)");
    glow.addColorStop(1, "transparent");
  }
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2); ctx.fill();

  // concentric ripple rings spreading out from the centre
  const rp = s.reducedMotion ? 0.4 : (tick * 0.006) % 1;
  ctx.save();
  ctx.strokeStyle = night ? "rgba(150,240,185,1)" : "rgba(255,255,255,1)";
  for (let i = 0; i < 3; i++) {
    const fr = (rp + i / 3) % 1;
    const rr = 24 + fr * glowR * 0.6;
    ctx.globalAlpha = (1 - fr) * (night ? 0.4 : 0.26);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rr, rr * 0.9, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  const earned = Math.max(0, Math.min(s.count, 400));
  // The pond widens as the harvest grows (and the foliage frame thins to match),
  // so a big grove feels like a bigger lake — not the same picture shrunk down.
  const grow = Math.min(1, earned / 36);
  const openRX = w * (0.33 + grow * 0.11);
  const openRY = h * (0.33 + grow * 0.11);
  const band = Math.min(w, h) * (0.185 - grow * 0.075);

  // living surface underneath the pads: floating duckweed + a few shore rocks
  drawGroveDuckweed(ctx, s, cx, cy, openRX, openRY);
  drawGroveRocks(ctx, s, cx, cy, openRX, openRY);

  // ── Each session shows as a lily pad on the water; the OUTER ones become shore
  // greenery (a top-down tree canopy or a grass tuft) so the pond sits in a green
  // ring, not a solid raft of pads. Sunflower spiral, centre kept clear for Havi.
  interface Item { kind: "pad" | "tree" | "grass"; x: number; y: number; r: number; spec: GrovePadSpec; bug: boolean; seed: number; }
  const items: Item[] = [];
  const PLAIN: GrovePadSpec = { key: "__general", color: null, species: 0, flower: 0 };
  const RT = 0.82; // beyond this fraction the session is shore greenery, not a pad
  const edgeX = w * 0.46;
  const edgeY = h * 0.46;

  // When a subject filter is on, show only that subject's pads (all as pads, no
  // shore greenery), so the lake becomes just that subject's plants.
  const filtered = s.filterKey ? (s.padSpecs ?? []).filter((sp) => sp.key === s.filterKey) : null;
  const shown = filtered ? filtered.length : earned;
  const padBase = Math.max(15, Math.min(42, (Math.min(openRX, openRY) / Math.sqrt(shown + 3)) * 1.15));
  const specAt = (k: number): GrovePadSpec => {
    if (filtered) return filtered[k - 1] ?? PLAIN;
    return s.padSpecs && k - 1 < s.padSpecs.length ? s.padSpecs[k - 1] : PLAIN;
  };
  for (let k = 1; k <= shown; k++) {
    const R = 0.2 + Math.sqrt(k / (shown + 1)) * 0.8;
    const ang = k * GOLDEN_ANGLE;
    // each pad is the species + bloom of the course it was earned on
    const spec = specAt(k);
    if (filtered || R <= RT) {
      const wob = s.reducedMotion ? 0 : Math.sin(tick * 0.02 + k) * 2;
      items.push({
        kind: "pad",
        x: cx + Math.cos(ang) * R * openRX,
        y: cy + Math.sin(ang) * R * openRY + wob,
        r: padBase * (0.82 + (Math.sin(k * 2.3) * 0.5 + 0.5) * 0.32),
        spec,
        bug: k % 9 === 4,
        seed: k,
      });
    } else {
      const lt = (R - RT) / (1 - RT); // 0 at the shore → 1 out at the frame edge
      items.push({
        kind: k % 2 === 0 ? "tree" : "grass",
        x: cx + Math.cos(ang) * (openRX * RT + lt * (edgeX - openRX * RT)),
        y: cy + Math.sin(ang) * (openRY * RT + lt * (edgeY - openRY * RT)),
        r: padBase * (k % 2 === 0 ? 1.0 : 0.72),
        spec: PLAIN,
        bug: false,
        seed: k,
      });
    }
  }
  items.sort((a, b) => a.y - b.y);
  const greens = groveGreens(night);
  for (const it of items) {
    if (it.kind === "pad") {
      drawGrovePad(ctx, it.x, it.y, it.r, it.spec.species, night);
      if (it.spec.color) drawGroveBloom(ctx, it.x - it.r * 0.06, it.y - it.r * 0.06, it.r * 0.74, it.spec.flower, it.spec.color);
      if (it.bug) drawLadybug(ctx, it.x + it.r * 0.42, it.y - it.r * 0.18, Math.max(0.85, it.r / 26));
    } else if (it.kind === "tree") {
      drawGroveTree(ctx, it.x, it.y, it.r, it.seed, greens, night, tick, s.reducedMotion);
    } else {
      drawGrassTuft(ctx, it.x, it.y, it.r, it.seed, greens, tick, s.reducedMotion);
    }
  }

  // ── Havi in the very centre, on his home pad — watching, or celebrating on tap ──
  const homeR = padBase * 1.15;
  drawLilyPad(ctx, { cx, cy, rx: homeR, ry: homeR * 0.86, hasFlower: false, opacity: 1, dying: 0 });
  if (s.showHavi) drawGroveHavi(ctx, cx, cy - homeR * 0.12, Math.max(0.5, Math.min(0.82, homeR / 46)), tick, s.haviReact ? "celebrating" : "idle");

  // ── Lush foliage framing the edges, willow trees and reeds ──
  drawGroveFoliage(ctx, s, band);
  drawGroveWillow(ctx, s, -1);
  drawGroveWillow(ctx, s, 1);
  drawGroveReeds(ctx, s);

  // ── Bugs: butterflies + a dragonfly by day, glowing motes by night ──
  drawGroveInsects(ctx, s, cx, cy, openRX, openRY);
  if (night) drawGroveMotes(ctx, s);

  // gentle vignette so the corners sink into leafy shadow (both refs are dark-edged)
  const vig = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.28, cx, cy, Math.max(w, h) * 0.72);
  vig.addColorStop(0, "transparent");
  vig.addColorStop(1, night ? "rgba(2,12,8,0.55)" : "rgba(6,26,22,0.42)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

// One pointed leaf, drawn from its stem at (x,y) pointing along `ang`.
function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, wid: number, ang: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(wid, -len * 0.55, 0, -len);
  ctx.quadraticCurveTo(-wid, -len * 0.55, 0, 0);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -len * 0.9);
  ctx.stroke();
  ctx.restore();
}

// A leafy bush: a dark mass with many small leaves fanned over it. Used to frame
// the pond edges like an overhanging canopy seen from above.
function drawLeafBush(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, seed: number, g: Greens, night: boolean, tick: number, reduced: boolean) {
  const H = (v: number) => { const r = Math.sin((seed + v) * 12.9898) * 43758.5453; return r - Math.floor(r); };
  const sway = reduced ? 0 : Math.sin(tick * 0.02 + seed) * 2;
  ctx.fillStyle = g.deep;
  ctx.beginPath();
  ctx.ellipse(x, y, R * 0.95, R * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  const nLeaves = Math.round(R / 7) + 10;
  for (let i = 0; i < nLeaves; i++) {
    const a = i * GOLDEN_ANGLE + H(i) * 0.6;
    const rr = R * (0.15 + (i / nLeaves) * 0.85);
    const lx = x + Math.cos(a) * rr * 0.72 + sway * (rr / R);
    const ly = y + Math.sin(a) * rr * 0.6;
    const len = R * (0.34 + H(i * 2) * 0.34);
    const wid = len * (0.34 + H(i * 3) * 0.14);
    const ang = a + Math.PI / 2 + (H(i * 5) - 0.5) * 0.8;
    const tier = i % 3;
    drawLeaf(ctx, lx, ly, len, wid, ang, tier === 0 ? g.dark : tier === 1 ? g.mid : g.light);
    if (night && H(i * 7) > 0.86) {
      ctx.fillStyle = g.glow;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(lx + Math.cos(ang - Math.PI / 2) * len * 0.8, ly + Math.sin(ang - Math.PI / 2) * len * 0.8, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

// Dense foliage ringing the frame: thick along the top and sides, corners at the
// bottom, leaving the lower-centre open water (as in both reference photos).
function drawGroveFoliage(ctx: CanvasRenderingContext2D, s: GroveState, band: number) {
  const { w, h, tick } = s;
  const night = s.palette.night;
  const g = groveGreens(night);
  const rnd = (v: number) => { const r = Math.sin(v * 127.1) * 43758.5453; return r - Math.floor(r); };
  const bushes: Array<[number, number, number, number]> = []; // x, y, radius, seed
  let n = 0;
  const push = (x: number, y: number, rad: number) => { bushes.push([x, y, rad, n * 3 + 1]); n++; };
  // top edge — dense, overhanging (two staggered rows)
  for (let x = -20; x < w + 40; x += band * 0.6) {
    push(x + rnd(n + 1) * 40, -band * 0.15 + rnd(n + 3) * band * 0.55, band * (0.75 + rnd(n + 5) * 0.6));
    push(x + band * 0.32, band * 0.55 + rnd(n + 7) * band * 0.4, band * (0.55 + rnd(n + 9) * 0.5));
  }
  // left & right edges
  for (let y = -10; y < h + 40; y += band * 0.68) {
    push(-band * 0.12 + rnd(n + 2) * band * 0.4, y, band * (0.68 + rnd(n + 4) * 0.5));
    push(w + band * 0.12 - rnd(n + 6) * band * 0.4, y, band * (0.68 + rnd(n + 8) * 0.5));
  }
  // bottom corners only (leave the bottom-centre open)
  push(band * 0.35, h + band * 0.15, band * 1.15);
  push(w - band * 0.35, h + band * 0.15, band * 1.15);

  bushes.sort((a, b) => a[1] - b[1]); // far → near
  for (const [x, y, rad, seed] of bushes) drawLeafBush(ctx, x, y, rad, seed, g, night, tick, s.reducedMotion);
}

// A small lotus bloom seen from above (two rings of petals + a gold centre), in
// the given base colour — one course's signature colour per pad.
function drawLotus(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, base = "#efa7c4") {
  const outer = base;
  const inner = lerpColor(base, "#ffffff", 0.42);
  const edge = lerpColor(base, "#3a1030", 0.5);
  const ring = (rr: number, scale: number, col: string, rot: number) => {
    for (let i = 0; i < 5; i++) {
      const a = rot + i * (Math.PI * 2 / 5);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.86;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.16 * scale, r * 0.24 * scale, r * 0.44 * scale, 0, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  };
  ring(r * 0.42, 1, outer, 0);
  ring(r * 0.26, 0.8, inner, Math.PI / 5);
  ctx.fillStyle = "#f6d84a";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

// ── Lily-pad species ─────────────────────────────────────────────────────────
// Different leaf shapes so each subject grows a recognisably different plant.
function padInnerRim(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, col: string, scale = 1) {
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, rx * scale - 5, ry * scale - 4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
function padTopHi(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#eaf6d8";
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.16, y - ry * 0.34, rx * 0.42, ry * 0.32, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function padVeins(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, col: string, notch: number, n: number) {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < n; i++) {
    const a = notch + (i / (n - 1)) * (Math.PI * 2 - notch * 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * (rx - 5), y + Math.sin(a) * (ry - 4));
    ctx.stroke();
  }
  ctx.restore();
}
function padWedge(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, notch: number) {
  ctx.save();
  ctx.fillStyle = "#2f5e33";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(-notch) * (rx + 1), y + Math.sin(-notch) * (ry + 1));
  ctx.lineTo(x + Math.cos(notch) * (rx + 1), y + Math.sin(notch) * (ry + 1));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

function drawGrovePad(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, species: number, night: boolean) {
  const rx = r;
  const ry = r * 0.86;
  const body = night ? "#3f8f5e" : "#61a54e";
  const rim = night ? "#2c6b45" : "#437a3a";
  const vein = night ? "#245638" : "#3c7336";
  const cool = night ? "#3a8f78" : "#4f9e7a";

  // shadow + ripple rings (shared by every species)
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#08202a";
  ctx.beginPath(); ctx.ellipse(x, y + ry * 0.4, rx * 0.95, ry * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.4;
  for (const kk of [1.14, 1.3]) { ctx.beginPath(); ctx.ellipse(x, y + ry * 0.1, rx * kk, ry * kk, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();

  const ellipse = () => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); };

  if (species === 1) {
    // ruffled: a scalloped wavy edge
    const wavy = () => {
      ctx.beginPath();
      const N = 44;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const rr = 1 + 0.07 * Math.sin(a * 9);
        const px = x + Math.cos(a) * rx * rr;
        const py = y + Math.sin(a) * ry * rr;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
    };
    inked(ctx, wavy, body, 3, true);
    padInnerRim(ctx, x, y, rx, ry, rim, 0.94);
    padTopHi(ctx, x, y, rx, ry);
    padVeins(ctx, x, y, rx, ry, vein, 0.16, 11);
    padWedge(ctx, x, y, rx, ry, 0.16);
  } else if (species === 2) {
    // Victoria: big round tray with a raised outer rim and many ribs, no notch
    inked(ctx, ellipse, body, 3, true);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = lerpColor(body, "#ffffff", 0.28);
    ctx.lineWidth = Math.max(3, r * 0.13);
    ctx.beginPath(); ctx.ellipse(x, y, rx * 0.88, ry * 0.88, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    padInnerRim(ctx, x, y, rx, ry, rim, 0.72);
    padVeins(ctx, x, y, rx, ry, vein, 0.001, 18);
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(x, y, Math.max(2, r * 0.06), 0, Math.PI * 2); ctx.fill();
  } else if (species === 3) {
    // lotus leaf: round, no notch, veins radiating from a central hub, cooler green
    inked(ctx, ellipse, cool, 3, true);
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = lerpColor(cool, "#ffffff", 0.4);
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(x, y, rx * 0.6, ry * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    padTopHi(ctx, x, y, rx, ry);
    padVeins(ctx, x, y, rx, ry, night ? "#215246" : "#347d63", 0.001, 14);
    ctx.fillStyle = night ? "#215246" : "#347d63";
    ctx.beginPath(); ctx.arc(x, y, Math.max(2, r * 0.07), 0, Math.PI * 2); ctx.fill();
  } else if (species === 4) {
    // arrow/heart leaf: two top lobes tapering to a point
    const heart = () => {
      ctx.beginPath();
      ctx.moveTo(x, y + ry * 0.92);
      ctx.bezierCurveTo(x - rx * 1.18, y + ry * 0.1, x - rx * 0.5, y - ry * 1.05, x, y - ry * 0.18);
      ctx.bezierCurveTo(x + rx * 0.5, y - ry * 1.05, x + rx * 1.18, y + ry * 0.1, x, y + ry * 0.92);
      ctx.closePath();
    };
    inked(ctx, heart, body, 3, true);
    ctx.save();
    ctx.strokeStyle = vein;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.moveTo(x, y + ry * 0.8); ctx.lineTo(x, y - ry * 0.1); ctx.stroke();
    for (const d of [-1, 1]) for (const t of [0.25, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(x, y + ry * (0.55 - t));
      ctx.lineTo(x + d * rx * (0.4 + t * 0.3), y + ry * (0.2 - t));
      ctx.stroke();
    }
    ctx.restore();
  } else {
    // classic Nymphaea: round with the front slit + radial veins
    inked(ctx, ellipse, body, 3, true);
    padInnerRim(ctx, x, y, rx, ry, rim);
    padTopHi(ctx, x, y, rx, ry);
    padVeins(ctx, x, y, rx, ry, vein, 0.22, 9);
    padWedge(ctx, x, y, rx, ry, 0.22);
  }
}

// ── Flower species ───────────────────────────────────────────────────────────
function drawFlowerLotusCup(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const edge = lerpColor(color, "#3a1030", 0.5);
  const petals = (rr: number, scale: number, col: string, rot: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = rot + i * (Math.PI * 2 / n);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.8;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.12 * scale, r * 0.2 * scale, r * 0.34 * scale, 0, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  };
  petals(r * 0.34, 1, color, 0, 6);
  petals(r * 0.18, 0.8, lerpColor(color, "#ffffff", 0.3), Math.PI / 6, 6);
  ctx.fillStyle = lerpColor(color, "#ffffff", 0.5);
  ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f6d84a";
  ctx.beginPath(); ctx.arc(x, y, r * 0.09, 0, Math.PI * 2); ctx.fill();
}
function drawFlowerDaisy(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const edge = lerpColor(color, "#3a1030", 0.45);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = i * (Math.PI * 2 / n);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.34, r * 0.1, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = "#f6d84a";
  ctx.beginPath(); ctx.arc(x, y, r * 0.17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lerpColor("#f6d84a", "#8a5a12", 0.4);
  ctx.beginPath(); ctx.arc(x, y, r * 0.09, 0, Math.PI * 2); ctx.fill();
}
function drawFlowerBud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  // green sepal cradle
  ctx.fillStyle = "#3c7336";
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.28, r * 0.26, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  // the closed teardrop bud
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.52);
  ctx.quadraticCurveTo(r * 0.3, 0, 0, r * 0.22);
  ctx.quadraticCurveTo(-r * 0.3, 0, 0, -r * 0.52);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = lerpColor(color, "#3a1030", 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  // a hint of a sepal seam
  ctx.strokeStyle = lerpColor(color, "#ffffff", 0.3);
  ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(0, -r * 0.4); ctx.lineTo(0, r * 0.1); ctx.stroke();
  ctx.restore();
}
function drawGroveBloom(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, flower: number, color: string) {
  if (flower === 1) drawFlowerLotusCup(ctx, x, y, r, color);
  else if (flower === 2) drawFlowerDaisy(ctx, x, y, r, color);
  else if (flower === 3) drawFlowerBud(ctx, x, y, r, color);
  else drawLotus(ctx, x, y, r, color);
}

// Soft green fireflies drifting over the water at night.
function drawGroveMotes(ctx: CanvasRenderingContext2D, s: GroveState) {
  const { w, h, tick } = s;
  const n = s.reducedMotion ? 8 : 18;
  for (let i = 0; i < n; i++) {
    const r1 = Math.sin(i * 21.13) * 43758.5453;
    const r2 = Math.sin(i * 47.71) * 12543.632;
    const bx = (r1 - Math.floor(r1)) * w;
    const by = (r2 - Math.floor(r2)) * h;
    const x = bx + (s.reducedMotion ? 0 : Math.sin(tick * 0.02 + i * 1.7) * 18);
    const y = by + (s.reducedMotion ? 0 : Math.cos(tick * 0.017 + i * 2.3) * 12);
    const pulse = s.reducedMotion ? 0.4 : 0.3 + (Math.sin(tick * 0.08 + i * 2.1) * 0.5 + 0.5) * 0.6;
    const glo = ctx.createRadialGradient(x, y, 0, x, y, 7);
    glo.addColorStop(0, `rgba(190,255,180,${pulse})`);
    glo.addColorStop(1, "transparent");
    ctx.fillStyle = glo;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(220,255,200,${Math.min(1, pulse + 0.2)})`;
    ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
  }
}

// Floating duckweed: tiny leaf clusters speckled over the water for a living surface.
function drawGroveDuckweed(ctx: CanvasRenderingContext2D, s: GroveState, cx: number, cy: number, rx: number, ry: number) {
  const night = s.palette.night;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = night ? "#2f6a42" : "#5fa24a";
  for (let i = 0; i < 44; i++) {
    const r1 = Math.sin(i * 12.9898) * 43758.5453;
    const r2 = Math.sin(i * 78.233) * 12543.632;
    const u = (r1 - Math.floor(r1)) * 2 - 1;
    const v = (r2 - Math.floor(r2)) * 2 - 1;
    if (u * u + v * v > 1) continue;
    const x = cx + u * rx * 1.02;
    const y = cy + v * ry * 1.02;
    const nn = 3 + Math.floor((r1 - Math.floor(r1)) * 3);
    for (let j = 0; j < nn; j++) {
      const a = j * 2.2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 3, y + Math.sin(a) * 2, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// A single mossy rock seen from above.
function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, night: boolean) {
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#08120c";
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.5, r * 1.05, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  inked(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(x - r, y + r * 0.4);
    ctx.quadraticCurveTo(x - r * 1.05, y - r * 0.5, x - r * 0.3, y - r * 0.72);
    ctx.quadraticCurveTo(x + r * 0.4, y - r * 0.92, x + r, y - r * 0.2);
    ctx.quadraticCurveTo(x + r * 1.1, y + r * 0.42, x + r * 0.4, y + r * 0.5);
    ctx.closePath();
  }, night ? "#3a4048" : "#8b9199", 2.2, false);
  // top light
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = night ? "#4a515a" : "#a7adb4";
  ctx.beginPath(); ctx.ellipse(x - r * 0.2, y - r * 0.35, r * 0.5, r * 0.28, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // a fleck of moss
  ctx.fillStyle = night ? "#2f7a45" : "#6fae4d";
  ctx.beginPath(); ctx.ellipse(x + r * 0.35, y + r * 0.25, r * 0.28, r * 0.16, 0.3, 0, Math.PI * 2); ctx.fill();
}

// A handful of rocks around the shore (and a couple as stepping stones).
function drawGroveRocks(ctx: CanvasRenderingContext2D, s: GroveState, cx: number, cy: number, rx: number, ry: number) {
  const night = s.palette.night;
  const spots: Array<[number, number, number]> = [
    [-0.86, -0.18, 18], [0.9, 0.14, 20], [-0.5, 0.92, 15],
    [0.58, 0.95, 16], [0.12, -0.96, 14], [-1.0, 0.5, 16],
    [-0.35, 0.5, 11], [0.4, -0.45, 10],
  ];
  for (const [u, v, r] of spots) drawRock(ctx, cx + u * rx, cy + v * ry, r, night);
}

// A willow hanging in from a top corner — a brown branch with drooping leafy
// strands (dir −1 = left corner, +1 = right corner). Reads as a real tree.
function drawGroveWillowStrand(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, g: Greens, tick: number, reduced: boolean, seed: number) {
  const sway = reduced ? 0 : Math.sin(tick * 0.02 + seed) * 5;
  ctx.strokeStyle = g.dark;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + sway, y + len * 0.5, x + sway * 1.3, y + len);
  ctx.stroke();
  const nn = Math.max(3, Math.round(len / 16));
  for (let i = 1; i <= nn; i++) {
    const t = i / nn;
    ctx.fillStyle = i % 2 ? g.mid : g.light;
    ctx.beginPath();
    ctx.ellipse(x + sway * 1.3 * t, y + len * t, 2.4, 4.2, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
function drawGroveWillow(ctx: CanvasRenderingContext2D, s: GroveState, dir: number) {
  const { w, h, tick } = s;
  const night = s.palette.night;
  const g = groveGreens(night);
  const x0 = dir < 0 ? w * 0.06 : w * 0.94;
  const y0 = -6;
  const endx = x0 + dir * w * 0.2;
  const endy = h * 0.22;
  ctx.strokeStyle = night ? "#3a2c1e" : "#5c4327";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(x0 + dir * w * 0.1, h * 0.08, endx, endy);
  ctx.stroke();
  const strands = 7;
  for (let i = 0; i <= strands; i++) {
    const t = i / strands;
    drawGroveWillowStrand(ctx, x0 + (endx - x0) * t, y0 + (endy - y0) * t, h * (0.12 + t * 0.16), g, tick, s.reducedMotion, i + dir * 10);
  }
}

// Reed clumps (cattails) at a couple of shore points.
function drawGroveReeds(ctx: CanvasRenderingContext2D, s: GroveState) {
  const { w, h, tick } = s;
  const night = s.palette.night;
  const stalk = night ? "#2c5233" : "#4e7d3a";
  const cat = night ? "#5a3f28" : "#7a4a29";
  const spots: Array<[number, number]> = [[w * 0.12, h * 0.92], [w * 0.9, h * 0.88], [w * 0.05, h * 0.52]];
  spots.forEach(([bx, by], si) => {
    for (let i = 0; i < 4; i++) {
      const x = bx + i * 6 - 8;
      const hgt = 40 + i * 8;
      const sway = s.reducedMotion ? 0 : Math.sin(tick * 0.03 + si + i) * 4;
      ctx.strokeStyle = stalk;
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, by);
      ctx.quadraticCurveTo(x + sway, by - hgt * 0.6, x + sway * 1.4, by - hgt);
      ctx.stroke();
      if (i % 2 === 0) {
        ctx.fillStyle = cat;
        ctx.beginPath();
        ctx.ellipse(x + sway * 1.4, by - hgt, 3, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

// A little ladybug resting on a pad.
function drawLadybug(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const r = 2.6 * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#c0392b";
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
  ctx.fillStyle = "#111";
  ctx.beginPath(); ctx.arc(0, -r * 0.95, r * 0.42, 0, Math.PI * 2); ctx.fill();
  for (const dx of [-0.5, 0.5]) for (const dy of [-0.15, 0.5]) {
    ctx.beginPath(); ctx.arc(dx * r, dy * r, r * 0.18, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// A butterfly, wings opening and closing.
function drawButterfly(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, seed: number, col: string) {
  const flap = Math.abs(Math.sin(tick * 0.4 + seed));
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  for (const d of [-1, 1]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(d * (2 + flap * 4), -1, 3.4, 4.4 * (0.5 + flap * 0.5), d * 0.5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(d * (2 + flap * 3), 3, 2.6, 3, d * 0.4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = INK;
  ctx.fillRect(-0.8, -3, 1.6, 7);
  ctx.restore();
}

// A dragonfly skimming the surface (glows faintly at night).
function drawDragonfly(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, tick: number, night: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.strokeStyle = night ? "#5fd6a0" : "#2f7f8a";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
  ctx.fillStyle = night ? "#7fe6b0" : "#3fa0ad";
  ctx.beginPath(); ctx.arc(8, 0, 2.2, 0, Math.PI * 2); ctx.fill();
  const fl = Math.sin(tick * 0.6) * 0.3;
  ctx.strokeStyle = night ? "rgba(150,240,190,0.8)" : "rgba(180,230,235,0.85)";
  ctx.fillStyle = night ? "rgba(150,240,190,0.4)" : "rgba(200,240,245,0.5)";
  ctx.lineWidth = 1;
  for (const sgn of [-1, 1]) for (const wx of [-1, 3]) {
    ctx.save();
    ctx.translate(wx, 0);
    ctx.rotate(sgn * (0.5 + fl));
    ctx.beginPath(); ctx.ellipse(0, sgn * 4, 6, 2.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// Butterflies (day) + a dragonfly drift over the water.
function drawGroveInsects(ctx: CanvasRenderingContext2D, s: GroveState, cx: number, cy: number, rx: number, ry: number) {
  if (s.reducedMotion) return;
  const { tick } = s;
  const night = s.palette.night;
  if (!night) {
    const bfly = (seed: number, col: string) => {
      const t = tick * 0.03 + seed;
      const x = cx + Math.cos(t * 0.7 + seed) * rx * 0.72;
      const y = cy + Math.sin(t * 0.9 + seed * 2) * ry * 0.6 - ry * 0.12;
      drawButterfly(ctx, x, y, tick, seed, col);
    };
    bfly(0, "#f2a65a");
    bfly(2.5, "#e88bb5");
    bfly(4.1, "#f2d94e");
  }
  const t = tick * 0.02;
  const dx = cx + Math.cos(t) * rx * 0.82;
  const dy = cy + Math.sin(t * 1.3) * ry * 0.72;
  const ang = Math.atan2(Math.cos(t * 1.3) * ry * 0.72 * 1.3, -Math.sin(t) * rx * 0.82);
  drawDragonfly(ctx, dx, dy, ang, tick, night);
}

// A top-down tree: a rounded leafy canopy with a soft ground shadow.
function drawGroveTree(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, g: Greens, night: boolean, tick: number, reduced: boolean) {
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#08120c";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.3, r * 1.0, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawLeafBush(ctx, x, y, r * 1.1, seed, g, night, tick, reduced);
}

// A grass tuft: a small fan of blades bending in the breeze.
function drawGrassTuft(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, g: Greens, tick: number, reduced: boolean) {
  const H = (v: number) => { const q = Math.sin((seed + v) * 12.9898) * 43758.5453; return q - Math.floor(q); };
  const sway = reduced ? 0 : Math.sin(tick * 0.03 + seed) * 3;
  const n = 6 + Math.round(r / 6);
  ctx.lineCap = "round";
  ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const spread = (t - 0.5) * r * 1.6;
    const bx = x + spread * 0.5;
    const len = r * (0.9 + H(i) * 0.7);
    const lean = spread * 0.3 + sway;
    ctx.strokeStyle = i % 2 ? g.mid : g.light;
    ctx.beginPath();
    ctx.moveTo(bx, y + 2);
    ctx.quadraticCurveTo(bx + lean * 0.5, y - len * 0.6, bx + lean, y - len);
    ctx.stroke();
  }
}

// Havi centred at (x, y), scaled small to suit the pond. `mood` is "idle" (calmly
// watching) or "celebrating" (a happy bounce + confetti when the user taps him).
function drawGroveHavi(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, tick: number, mood: HaviMood) {
  const bob = mood === "celebrating"
    ? -Math.round(Math.abs(Math.sin(tick * 0.3)) * 4)
    : Math.round(Math.sin(tick * 0.04) * 1);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const px = (cxp: number, cyp: number, wq: number, hq: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round((cxp - 14) * PS), Math.round((cyp - 19 + bob) * PS), Math.ceil(wq * PS), Math.ceil(hq * PS));
  };
  drawBody(px, 0, 0);
  drawFace(px, ctx, 0, 0, mood, tick);
  ctx.restore();
}
