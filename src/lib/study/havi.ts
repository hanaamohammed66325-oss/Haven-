// ---------------------------------------------------------------------------
// Group study: Havi at his desk, and the water around the desks.
//
// Built from the approved preview (src/lib/study-preview/haviAnimations.ts):
// the pond sprite's silhouette, seen from the lake map's raised angle with his
// face to the viewer; poses study / rest / sleep / wake; the dashboard Havi's
// "squish" when tapped. Added for the desks (her decision, 2026-10-06): a desk
// rising from the lake or sinking into it with spreading water, and Havi
// hopping back into the water when he leaves.
// ---------------------------------------------------------------------------

import { drawGlow } from "@/lib/pomodoro/glow";
import { drawHaviOutfitLayer } from "@/lib/haviOutfit";

export type DeskPose = "study" | "sleep" | "wake" | "rest" | "phone" | "look";

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

const ease = (v: number) => {
  const n = Math.max(0, Math.min(1, v));
  return n * n * (3 - 2 * n);
};

// A tap on Havi: the app's own reaction (HaviMascot's "squish"). He is pressed
// flat, eyes squeezed shut and mouth open, then springs back to what he was
// doing, a sleeping Havi included.
export const POKE_MS = 420;
function pokeSquash(p: number): [number, number] {
  const sy = p < 0.22 ? 1 - (p / 0.22) * 0.45 // slam down to 0.55
    : p < 0.55 ? 0.55 + ((p - 0.22) / 0.33) * 0.6 // spring to 1.15
    : p < 0.8 ? 1.15 - ((p - 0.55) / 0.25) * 0.22 // settle to 0.93
    : 0.93 + ((p - 0.8) / 0.2) * 0.07; // back to 1
  return [1 + (1 - sy) * 0.35, sy]; // wider as he flattens
}

/** Havi coming out of the water and hopping onto his desk (drawWaterArrival). */
export const ARRIVE_MS = 1700;
/** Havi hopping off his desk into the water (drawWaterLeave). */
export const LEAVE_MS = 1100;
/** A desk and its pad rising out of the lake, or sinking into it. */
export const DESK_RISE_MS = 1300;
export const DESK_SINK_MS = 1100;
/** The rings the water spreads in around a rising or sinking desk. */
const SPREAD_MS = 1900;

// `pokeMs`: time since this Havi was tapped (negative or past POKE_MS = none).
export function drawSocialHavi(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, seconds: number, pose: DeskPose, elapsed: number, color: string, reduced: boolean, pokeMs = -1, furniture?: (ctx: CanvasRenderingContext2D, behind: boolean) => void, cosmetics: readonly string[] = []) {
  const t = reduced ? 0 : seconds;
  const poked = pokeMs >= 0 && pokeMs < POKE_MS;
  const down = pose === "sleep" ? (reduced ? 1 : ease(elapsed / 1.6)) : pose === "wake" ? (reduced ? 0 : 1 - ease(elapsed / 1.1)) : 0;
  const stretch = pose === "wake" && !reduced ? Math.sin(Math.PI * ease((elapsed - 1.05) / 1.5)) : 0;
  const breath = down > 0.9 ? Math.sin(t * 1.9) * 0.35 : 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.imageSmoothingEnabled = false;
  const px = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
  // Small chair behind Havi, not a top-down view of his back.
  if (furniture) furniture(ctx,true);
  if (!furniture) {
  px(-9, 8, 18, 13, "#674627"); px(-8, 9, 16, 10, "#a0753f");
  px(-7, 21, 2, 4, "#674627"); px(5, 21, 2, 4, "#674627");
  }
  const yFor = (y: number) => y * (1 - down * 0.42) + down * 8 + breath - stretch;
  // The squash pivots on his bottom edge; the chair and desk stay put.
  const squash = poked && !reduced;
  if (squash) {
    const [sx, sy] = pokeSquash(pokeMs / POKE_MS);
    ctx.save(); ctx.translate(0, 21); ctx.scale(sx, sy); ctx.translate(0, -21);
  }
  const cols: Record<string, string> = { k: "#111111", G: color, f: "#e88bb5", y: "#f2d94e" };
  const outfitPixel = (x: number, y: number, w: number, h: number, c: string) => px(x - 14, yFor(y), w, h, c);
  drawHaviOutfitLayer(cosmetics, "back", outfitPixel);
  for (let y = 0; y < BODY.length; y++) for (let x = 0; x < BODY[y].length; x++) {
    const c = BODY[y][x]; if (c !== ".") px(x - 14, yFor(y), 1, 1, cols[c]);
  }
  const eyes = yFor(9);
  const blink = !reduced && Math.sin(t * 0.9) > 0.992;
  if (poked) {
    // HaviMascot's squish face: eyes squeezed shut, mouth open.
    px(-7, yFor(10), 4, 1, "#111111"); px(-6, eyes, 1, 1, "#111111"); px(-4, eyes, 1, 1, "#111111");
    px(3, yFor(10), 4, 1, "#111111"); px(3, eyes, 1, 1, "#111111"); px(5, eyes, 1, 1, "#111111");
    px(-2, yFor(13), 4, 2, "#111111"); px(-1, yFor(14), 2, 1, "#c0392b");
  } else {
    if (down > 0.45 || blink) {
      px(-6, eyes + 1, 3, 1, "#111111"); px(4, eyes + 1, 3, 1, "#111111");
      px(-6, eyes, 1, 1, "#111111"); px(6, eyes, 1, 1, "#111111");
    } else {
      const glance = pose === "look" && !reduced ? Math.round(Math.sin(t * 0.7)) : 0;
      px(-6 + glance, eyes, 2, 3, "#111111"); px(4 + glance, eyes, 2, 3, "#111111");
    }
    px(-1, yFor(13), 2, stretch > 0.3 ? 2 : 1, "#111111");
  }
  px(-8, yFor(13), 2, 1, "#f0a0a8"); px(7, yFor(13), 2, 1, "#f0a0a8");
  drawHaviOutfitLayer(cosmetics, "front", outfitPixel);
  if (squash) ctx.restore();
  // A shallow desk surface seen from the same elevated angle as the lake.
  if (furniture) furniture(ctx,false);
  else drawDeskFurniture(ctx, down, t, pose === "study" && !reduced, stretch);
  if (pose === "phone") {
    px(-4, 13, 8, 10, "#252b38"); px(-3, 14, 6, 7, "#a5d7e5");
    const screen = reduced ? 0 : Math.floor(elapsed / 3) % 3;
    if (screen === 0) {
      // A sunny meadow, with a little flower.
      px(0, 14, 2, 2, "#ffe684"); px(-3, 19, 6, 2, "#82b779");
      px(-2, 18, 1, 2, "#507b55"); px(-3, 17, 3, 1, "#f3a8c6");
    } else if (screen === 1) {
      // A small heart, gently twinkling.
      px(-3, 14, 6, 7, "#eee0ef");
      px(-2, 16, 2, 1, "#ef8fad"); px(1, 16, 1, 1, "#ef8fad");
      px(-2, 17, 4, 1, "#ef8fad"); px(-1, 18, 2, 1, "#ef8fad");
      if (!reduced && Math.floor(elapsed * 2) % 2 === 0) px(2, 15, 1, 1, "#ffffff");
    } else {
      // A tiny fish swimming through blue water.
      px(-3, 14, 6, 7, "#79bed7");
      const fishX = -2 + (reduced ? 0 : Math.floor(elapsed * 2) % 2);
      px(fishX, 17, 3, 2, "#ffc984"); px(fishX - 1, 18, 1, 1, "#ffc984");
      px(fishX + 2, 17, 1, 1, "#344052"); px(-2, 15, 1, 1, "#e4f8fc");
    }
    px(-6, 18, 3, 2, color); px(3, 18, 3, 2, color);
  }
  ctx.restore();
  if (down > 0.9 && !poked) {
    ctx.save(); ctx.fillStyle = "#cec9e7"; ctx.font = `${3 * scale}px monospace`;
    const drift = reduced ? 0 : (t * 13) % 28;
    ctx.globalAlpha = reduced ? 0.65 : 0.35 + 0.35 * Math.sin(t * 1.5) ** 2;
    ctx.fillText("z", x + scale * 15, y + scale * 2 - drift * scale / 5); ctx.font = `${4 * scale}px monospace`; ctx.fillText("z", x + scale * 19, y - scale * 3 - drift * scale / 5); ctx.restore();
  }
}

function drawDeskFurniture(ctx: CanvasRenderingContext2D, down: number, t: number, writing: boolean, stretch = 0) {
  const px = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  ctx.fillStyle = "#9b7249"; ctx.beginPath(); ctx.moveTo(-19, 17); ctx.lineTo(19, 17); ctx.lineTo(22, 23); ctx.lineTo(-22, 23); ctx.closePath(); ctx.fill();
  px(-22, 23, 44, 2, "#6b4226"); px(-20, 25, 2, 4, "#5a3520"); px(18, 25, 2, 4, "#5a3520");
  px(-20, 22, 40, 1, "#b38a58");
  const bookX = -5 - Math.round(down * 11);
  px(bookX - 2, 18, 17, 5, "#3b6ea5"); px(bookX - 1, 17, 15, 5, "#f7f5ee"); px(bookX + 6, 17, 1, 5, "#cfc8ac");
  px(bookX + 1, 18, 4, 1, "#a7a398"); px(bookX + 8, 19, 4, 1, "#a7a398");
  px(-18, 19, 4, 2, "#b96b53");
  // Screen blending keeps the small lamp lit at map scale; softened at the
  // owner's request so the glow doesn't dominate the desk.
  ctx.save(); ctx.globalCompositeOperation = "screen";
  drawGlow(ctx, 12, 21, 22, 0.16, "255,197,92");
  drawGlow(ctx, 16.5, 13, 13, 0.35, "255,210,115");
  ctx.restore();
  // A steady warm pool lights the book and stays on during rest/sleep.
  ctx.save(); ctx.beginPath(); ctx.moveTo(-19, 17); ctx.lineTo(19, 17); ctx.lineTo(22, 23); ctx.lineTo(-22, 23); ctx.closePath(); ctx.clip();
  ctx.globalCompositeOperation = "screen";
  drawGlow(ctx, 8, 20, 22, 0.3, "255,220,145"); ctx.restore();
  px(14, 19, 5, 1, "#73512d"); px(16, 12, 1, 7, "#b48a50"); px(13, 10, 7, 3, "#ffe19a");
  px(14, 13, 5, 1, "#fff4cc");
  px(15, 12, 3, 2, "#fff9df");
  const pen = Math.floor(t * 4) % 2;
  if (writing && down < 0.35 && stretch < 0.1) {
    px(bookX + 8 + pen, 15 + pen, 3, 3, "#a8d98a");
    px(bookX + 9 + pen, 16 + pen, 2, 5, "#f2d94e"); px(bookX + 9 + pen, 21 + pen, 2, 1, "#333333");
  }
}

/** An empty desk: the chair and the desk, nobody at it. */
export function drawPreparedDesk(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillStyle = "#674627"; ctx.fillRect(-9, 8, 18, 13);
  ctx.fillStyle = "#a0753f"; ctx.fillRect(-8, 9, 16, 10);
  ctx.fillStyle = "#674627"; ctx.fillRect(-7, 21, 2, 4); ctx.fillRect(5, 21, 2, 4);
  drawDeskFurniture(ctx, 0, 0, false);
  ctx.restore();
}

/**
 * The water spreading around a desk that rises or sinks: rings widening on
 * the surface and a few drops thrown up. `ms` since it began; `r` the pad's
 * radius. Nothing after SPREAD_MS.
 */
export function drawSpreadingWater(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ms: number, night: boolean) {
  if (ms < 0 || ms > SPREAD_MS) return;
  ctx.save();
  ctx.strokeStyle = night ? "#a9d6cb" : "#e3f3ee";
  for (let i = 0; i < 4; i++) {
    const p = (ms - i * 170) / (SPREAD_MS - 520);
    if (p <= 0 || p >= 1) continue;
    const e = 1 - (1 - p) ** 2;
    const rr = r * (0.55 + e * 2.3);
    ctx.globalAlpha = (1 - p) * (i === 0 ? 0.7 : 0.45);
    ctx.lineWidth = Math.max(0.6, r * 0.05 * (1 - p * 0.6));
    ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // Drops thrown up as the surface breaks.
  const q = ms / 900;
  if (q < 1) {
    ctx.fillStyle = night ? "#bfe3da" : "#f2fbf8";
    for (let d = 0; d < 7; d++) {
      const a = d * 2.399 + 0.4;
      const out = r * (0.5 + q * 1.1);
      ctx.globalAlpha = (1 - q) * 0.8;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * out, y + Math.sin(a) * out * 0.42 - Math.sin(q * Math.PI) * r * 0.6, r * 0.05, r * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * A desk part-way out of the water: 0 under the surface, 1 standing on its
 * pad. The part still under water is hidden below the line at `waterY`.
 */
export function drawDeskAt(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, out: number, waterY: number, draw: (x: number, y: number) => void) {
  if (out <= 0) return;
  if (out >= 1) { draw(x, y); return; }
  const sunk = (1 - out) * 34 * scale;
  ctx.save();
  ctx.beginPath(); ctx.rect(x - 60 * scale, waterY - 90 * scale, 120 * scale, 90 * scale); ctx.clip();
  ctx.globalAlpha = Math.min(1, out * 1.6);
  draw(x, y + sunk);
  ctx.restore();
}

export function drawWaterArrival(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, elapsed: number, color: string, cosmetics: readonly string[] = []) {
  // Distances were drawn for a desk at scale 1.4; they follow the desk's size.
  const k = scale / 1.4;
  const waterX = x + 44 * k, waterY = y + 28 * k;
  const rise = ease((elapsed - 0.2) / 0.75);
  const hop = ease((elapsed - 1.05) / 0.65);
  drawRipples(ctx, waterX, waterY, k, elapsed);
  if (elapsed < 0.2) return;
  if (hop === 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(waterX - 50 * k, waterY - 80 * k, 100 * k, 80 * k); ctx.clip();
    drawArrivingHavi(ctx, waterX, waterY + (22 * (1 - rise) - 2) * k, scale, color, cosmetics); ctx.restore();
  } else {
    drawArrivingHavi(ctx, waterX + (x - waterX) * hop, waterY + (y - 1 * k - waterY) * hop - Math.sin(hop * Math.PI) * 17 * k, scale, color, cosmetics);
  }
}

/** Havi hopping off his desk and into the water beside it (the arrival, backwards). */
export function drawWaterLeave(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, elapsed: number, color: string, cosmetics: readonly string[] = []) {
  const k = scale / 1.4;
  const waterX = x + 44 * k, waterY = y + 28 * k;
  const hop = ease(elapsed / 0.55);
  const dive = ease((elapsed - 0.5) / 0.45);
  if (elapsed > 0.5) drawRipples(ctx, waterX, waterY, k, elapsed - 0.5);
  if (hop < 1) {
    drawArrivingHavi(ctx, x + (waterX - x) * hop, y - 1 * k + (waterY - (y - 1 * k)) * hop - Math.sin(hop * Math.PI) * 17 * k, scale, color, cosmetics);
  } else if (dive < 1) {
    ctx.save(); ctx.beginPath(); ctx.rect(waterX - 50 * k, waterY - 80 * k, 100 * k, 80 * k); ctx.clip();
    drawArrivingHavi(ctx, waterX, waterY + 24 * dive * k, scale, color, cosmetics); ctx.restore();
  }
}

function drawRipples(ctx: CanvasRenderingContext2D, waterX: number, waterY: number, k: number, elapsed: number) {
  for (let i = 0; i < 3; i++) {
    const p = (elapsed - i * 0.15) / 1.5;
    if (p < 0 || p > 1) continue;
    ctx.save(); ctx.strokeStyle = "#b0ddd3"; ctx.globalAlpha = (1 - p) * 0.6;
    ctx.lineWidth = 1.3 * k; ctx.beginPath(); ctx.ellipse(waterX, waterY, (8 + p * 40) * k, (3 + p * 14) * k, 0, 0, Math.PI * 2); ctx.stroke();
    for (let d = 0; d < 5; d++) {
      const a = d * 2.399;
      ctx.fillStyle = "#c0e2dd"; ctx.beginPath(); ctx.ellipse(waterX + Math.cos(a) * p * 24 * k, waterY + (Math.sin(a) * p * 9 - Math.sin(p * Math.PI) * 17) * k, 1.7 * k, 2.4 * k, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

function drawArrivingHavi(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string, cosmetics: readonly string[]) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  const cols: Record<string, string> = { k: "#111111", G: color, f: "#e88bb5", y: "#f2d94e" };
  const outfitPixel = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x - 14, y - 19, w, h); };
  drawHaviOutfitLayer(cosmetics, "back", outfitPixel);
  for (let row = 0; row < BODY.length; row++) for (let col = 0; col < BODY[row].length; col++) {
    const c = BODY[row][col]; if (c !== ".") { ctx.fillStyle = cols[c]; ctx.fillRect(col - 14, row - 19, 1, 1); }
  }
  ctx.fillStyle = "#111111"; ctx.fillRect(-6, -10, 2, 3); ctx.fillRect(4, -10, 2, 3); ctx.fillRect(-1, -6, 2, 1);
  drawHaviOutfitLayer(cosmetics, "front", outfitPixel);
  ctx.restore();
}
