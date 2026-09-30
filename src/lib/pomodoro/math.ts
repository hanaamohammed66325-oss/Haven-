// Small helpers shared by the pond (pondView), the lake (lakeWorld), the sprites
// (pondRenderer) and the scenes that drive them: numbers, easing, colour mixing.

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** A positive remainder: wraps v into [0, m). */
export const mod = (v: number, m: number) => ((v % m) + m) % m;
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (q: number) => (q < 0.5 ? 4 * q * q * q : 1 - (-2 * q + 2) ** 3 / 2);
export const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
export const hash = (n: number) => {
  const r = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return r - Math.floor(r);
};
/** A stable whole number for a string (a course id → its colour, its grove). */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// ── Colours ──────────────────────────────────────────────────────────────────
export type RGB = [number, number, number];
let colorCtx: CanvasRenderingContext2D | null = null;
const parsed = new Map<string, RGB>();
/** Any CSS colour → RGB, read back through a scratch canvas once per colour
 *  (the scenes mix a few palette colours every frame). Don't mutate the result. */
export function rgbOf(c: string): RGB {
  const hit = parsed.get(c);
  if (hit) return hit;
  if (!colorCtx) colorCtx = document.createElement("canvas").getContext("2d")!;
  colorCtx.fillStyle = "#6a9451";
  colorCtx.fillStyle = c; // the browser normalises any CSS colour
  const v = String(colorCtx.fillStyle);
  let rgb: RGB = [106, 148, 81];
  if (v[0] === "#") {
    const n = parseInt(v.slice(1, 7), 16);
    rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else {
    const m = v.match(/[\d.]+/g);
    if (m) rgb = [+m[0], +m[1], +m[2]];
  }
  if (parsed.size > 512) parsed.clear();
  parsed.set(c, rgb);
  return rgb;
}
export const mixRgb = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const rgbCss = (c: RGB) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
/** Mixes two CSS colours: k = 0 → a, 1 → b. */
export function mixColor(a: string, b: string, k: number): string {
  return rgbCss(mixRgb(rgbOf(a), rgbOf(b), k));
}
