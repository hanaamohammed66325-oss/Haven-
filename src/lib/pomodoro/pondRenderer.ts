// Shared pond art for the Pomodoro scenes (pure canvas, no React): the ink
// style, Havi's pixel sprite and his moods (reeling the desk up, studying,
// resting, celebrating, sad, jumping), lily pads, their flowers and the small
// creatures. The page's pond window (pondView.ts) and "your lake" (lakeWorld.ts)
// both draw with these.

import { mixColor } from "./math";

const PS = 3; // pixel size for Havi sprites (small frog on a big pad)

// Cartoon ink + halo: soft hand-drawn look. Builds the path via `path`, lays a
// cream halo, fills, then strokes a chunky dark outline over the edge.
export const INK = "#33403a";
export function inked(
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
  cx: number; // the pad's centre, in the context's units
  cy: number;
  rx: number;
  ry: number;
  hasFlower: boolean;
  opacity: number;
  dying: number;
}

export function drawLilyPad(ctx: CanvasRenderingContext2D, p: LilyPadState) {
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

// ── Havi ─────────────────────────────────────────────────────────────────────
function pxFn(ctx: CanvasRenderingContext2D) {
  return (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x * PS), Math.round(y * PS), Math.ceil(w * PS), Math.ceil(h * PS));
  };
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

// Havi on the page's pond: (x, y) is where he sits on his pad (CSS px) and
// `size` one sprite pixel (CSS px). Every sprite pixel lands on whole device
// pixels, so he stays crisp at any size. With `mirrorY` he is drawn upside down
// about that water line (his reflection). A mirrored scene moves him but never
// flips him.
export function drawHaviSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  mood: HaviMood,
  tick: number,
  fish: number,
  reduced: boolean,
  mirrorY?: number,
) {
  const m = ctx.getTransform();
  const cell = Math.max(1, Math.round(size * Math.abs(m.a)));
  const k = cell / PS;
  const X = Math.round(m.a * x + m.e);
  const Y = Math.round(m.d * y + m.f);
  const bob = reduced ? 0
    : mood === "celebrating" ? Math.abs(Math.sin(tick * 0.14)) * -3
    : mood === "studying" || mood === "fishing" ? Math.sin(tick * 0.025) * 0.4
    : Math.sin(tick * 0.04) * 1;
  ctx.save();
  if (mirrorY === undefined) ctx.setTransform(k, 0, 0, k, X, Y);
  else ctx.setTransform(k, 0, 0, -k, X, Math.round(2 * (m.d * mirrorY + m.f)) - Y);
  const px = pxFn(ctx);
  // the sprite is 28×21 cells; cell (14, 19) sits on the pad
  const ox = -14;
  const oy = Math.round(-19 + bob);
  if (mood === "fishing") drawFishing(px, ox, oy, tick, fish);
  else if (mood === "studying") drawStudying(px, ox, oy - 4, tick);
  else {
    drawBody(px, ox, oy);
    drawFace(px, ctx, ox, oy, mood, tick);
  }
  ctx.restore();
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

// A small lotus bloom seen from above (two rings of petals + a gold centre), in
// the given base colour — one course's signature colour per pad.
function drawLotus(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, base = "#efa7c4") {
  const outer = base;
  const inner = mixColor(base, "#ffffff", 0.42);
  const edge = mixColor(base, "#3a1030", 0.5);
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

export function drawGrovePad(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, species: number, night: boolean) {
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
    ctx.strokeStyle = mixColor(body, "#ffffff", 0.28);
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
    ctx.strokeStyle = mixColor(cool, "#ffffff", 0.4);
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
  const edge = mixColor(color, "#3a1030", 0.5);
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
  petals(r * 0.18, 0.8, mixColor(color, "#ffffff", 0.3), Math.PI / 6, 6);
  ctx.fillStyle = mixColor(color, "#ffffff", 0.5);
  ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f6d84a";
  ctx.beginPath(); ctx.arc(x, y, r * 0.09, 0, Math.PI * 2); ctx.fill();
}
function drawFlowerDaisy(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const edge = mixColor(color, "#3a1030", 0.45);
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
  ctx.fillStyle = mixColor("#f6d84a", "#8a5a12", 0.4);
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
  ctx.strokeStyle = mixColor(color, "#3a1030", 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  // a hint of a sepal seam
  ctx.strokeStyle = mixColor(color, "#ffffff", 0.3);
  ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(0, -r * 0.4); ctx.lineTo(0, r * 0.1); ctx.stroke();
  ctx.restore();
}
export function drawGroveBloom(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, flower: number, color: string) {
  if (flower === 1) drawFlowerLotusCup(ctx, x, y, r, color);
  else if (flower === 2) drawFlowerDaisy(ctx, x, y, r, color);
  else if (flower === 3) drawFlowerBud(ctx, x, y, r, color);
  else drawLotus(ctx, x, y, r, color);
}

// A single mossy rock seen from above.
export function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, night: boolean) {
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

// A little ladybug resting on a pad.
export function drawLadybug(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
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
export function drawButterfly(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, seed: number, col: string) {
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
export function drawDragonfly(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, tick: number, night: boolean) {
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

// Havi centred at (x, y), scaled small to suit the pond. `mood` is "idle" (calmly
// watching) or "celebrating" (a happy bounce + confetti when the user taps him).
export function drawGroveHavi(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, tick: number, mood: HaviMood) {
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
