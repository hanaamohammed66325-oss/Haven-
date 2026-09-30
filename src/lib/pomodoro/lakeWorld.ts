// "Your lake" (بحيرتك) as a small game world seen from above. Pure canvas, no React.
//
// World units: 1 unit = 1 CSS px at the closest zoom level, and the lake centre
// is the world origin. The lake grows with the harvest: every pad keeps its size
// and its room on the water, so a big collection is a bigger world to explore
// (zoom levels + panning), never the same picture shrunk down.
//
// Rendering:
//   ground tiles – everything flat (meadow, beach, water depth, the dock, rocks,
//                  reeds, tree shadows), painted on demand into 512-px tiles, one
//                  set per level of detail, kept in a small LRU cache (iPad memory)
//   base         – the whole ground once at low resolution: the fallback while a
//                  tile is still being painted
//   live         – each frame: koi, pads, Havi, the trees (cached sprites that
//                  lean out from the centre like real height and sway in the
//                  wind), insects, birds, cloud shadows, ripples
// Every SESSIONS_PER_TREE focus sessions in a subject grow a tree in its colour,
// in that subject's grove on the shore.
//
// Opening plays a short dive (`diveCamera` + `Sky`): the camera drops out of the
// clouds, turns gently and lands over the lake with Havi in the middle. Zooming
// out lifts the camera; at the highest level thin clouds drift below it.

import { type TimeOfDay } from "./timeOfDay";
import { clamp, smooth, easeOutCubic, hash, hashString, mod, rgbOf, mixRgb, rgbCss, type RGB } from "./math";
import {
  INK,
  inked,
  drawLilyPad,
  drawGrovePad,
  drawGroveBloom,
  drawGroveHavi,
  drawButterfly,
  drawDragonfly,
  drawLadybug,
  drawRock,
  type GrovePadSpec,
} from "./pondRenderer";

export interface LakeInput {
  w: number; // viewport, CSS px
  h: number;
  dpr: number;
  count: number; // earned pads (one per completed focus session)
  padSpecs: GrovePadSpec[];
  tod: TimeOfDay;
  reducedMotion: boolean;
}

export interface Camera {
  x: number; // world point under the screen centre
  y: number;
  s: number; // world → screen scale (1 = the closest level)
  rot: number;
}

// ── Tunables ────────────────────────────────────────────────────────────────
export const DIVE_MS = 1900; // sky → lake
export const ZOOM_MS = 900; // one zoom step (the camera rises or comes down)
export const SESSIONS_PER_TREE = 5; // focus sessions in a subject → a tree in its colour
const S0 = 0.3; // ground scale at the top of the dive (lower for a big lake, so it starts above it all)
const ROT0 = 0.36; // how far the camera turns while it falls (rad)
const TILE_PX = 512; // ground tile side in device px (the same at every level of detail)
const BLEED = 2; // tiles overlap by this many px, so no seams show
const SCREEN_PX = 3.5e6; // device px a screen-sized layer may use (iPad memory)
const BASE_MAX = 1600; // max side of the low-resolution base, px
const MAX_LOD = 5;
const BASE_LOD = 99;
const FOCAL = 1400; // camera focal length (CSS px): how far tall things lean out
const MAX_PADS = 2000;
const VARIANTS = 5; // canopy shapes per kind of tree
const STREAM_A = -2.25; // where the stream meets the lake (angle)
const GOLDEN = 2.399963229728653;
const TAU = Math.PI * 2;

// a stable random number per grid cell (so any tile paints the same cell alike)
const hash2 = (x: number, y: number, k: number) => hash(x * 12.9898 + y * 78.233 + k * 37.719);
const hashStr = (s: string) => hashString(s) % 9973;
// small deterministic PRNG (mulberry32) so a student's world is the same each visit
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext("2d")!];
}
// Safari keeps canvas memory until the element is shrunk, so free old layers.
export function release(c?: HTMLCanvasElement) {
  if (c) c.width = c.height = 0;
}

// A soft round glow (a firefly, a lantern): one painted sprite per pair of
// colours ("r,g,b"), drawn at any strength, instead of a new gradient for each
// glow every frame.
const glows = new Map<string, HTMLCanvasElement>();
export function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, inner: string, outer = inner) {
  const key = inner + "|" + outer;
  let c = glows.get(key);
  if (!c) {
    const G = 128;
    const [cv, g] = makeCanvas(G, G);
    const gr = g.createRadialGradient(G / 2, G / 2, 0, G / 2, G / 2, G / 2);
    gr.addColorStop(0, `rgba(${inner},1)`);
    gr.addColorStop(1, `rgba(${outer},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, G, G);
    glows.set(key, (c = cv));
  }
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  ctx.drawImage(c, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = a;
}

// Adds a circle to the current path (without joining it to the previous one).
function addCircle(ctx: CanvasRenderingContext2D | Path2D, x: number, y: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU);
}

// ── Palette ─────────────────────────────────────────────────────────────────
export interface Leaf { deep: string; dark: string; mid: string; light: string }
export interface Pal {
  night: boolean;
  floor: string; grass: string; grassDark: string; grassLight: string;
  sand: string; sandWet: string; pebble: string;
  shallow: string; shallowHi: string; deep: string; deepCore: string; foam: string;
  leaf: Leaf; pine: Leaf; blossom: Leaf; bush: Leaf; // blossom: young spring-green trees
  path: string; pathEdge: string;
  wood: string; woodDark: string; woodLight: string;
  reed: string; reedHi: string; cattail: string;
  flowers: string[];
  haze: string; // the sky's haze while the camera is high up
  tint: string | null; // a soft light wash over the frame (morning / evening)
  shadow: string;
}
const DAY: Pal = {
  night: false,
  floor: "#4a7743", grass: "#83ac64", grassDark: "#6a9451", grassLight: "#9fc27e",
  sand: "#e2d3a8", sandWet: "#c9b88a", pebble: "#b1a58a",
  shallow: "#86c5b3", shallowHi: "#b7ddcd", deep: "#43898a", deepCore: "#2c6c70", foam: "#ffffff",
  leaf: { deep: "#21432a", dark: "#3a6935", mid: "#578f44", light: "#86bc5f" },
  pine: { deep: "#1d3c2a", dark: "#2d5a3b", mid: "#40784d", light: "#619d66" },
  blossom: { deep: "#2f5a2e", dark: "#5e9a46", mid: "#8cc463", light: "#c4e69c" },
  bush: { deep: "#284c2d", dark: "#47783c", mid: "#649c4c", light: "#92c468" },
  path: "#d6c194", pathEdge: "#b69f73",
  wood: "#ad7f4d", woodDark: "#765233", woodLight: "#cc9d69",
  reed: "#4c853a", reedHi: "#79ad55", cattail: "#774828",
  flowers: ["#fbfaf4", "#f3d25a", "#efa3bd", "#c3b0ec", "#f29f7a"],
  haze: "#e8f1f2",
  tint: null,
  shadow: "rgba(16,40,28,0.24)",
};
const NIGHT: Pal = {
  night: true,
  floor: "#0e2117", grass: "#1d3a2a", grassDark: "#152f21", grassLight: "#284a35",
  sand: "#57563f", sandWet: "#454433", pebble: "#666252",
  shallow: "#2b5e57", shallowHi: "#3c766c", deep: "#143a39", deepCore: "#0b2829", foam: "#b8f0d8",
  leaf: { deep: "#07170e", dark: "#11321f", mid: "#1c4d2d", light: "#2b7142" },
  pine: { deep: "#06140c", dark: "#0e291a", mid: "#163f29", light: "#235739" },
  blossom: { deep: "#0a1c10", dark: "#1a4426", mid: "#285f35", light: "#3d8048" },
  bush: { deep: "#091c11", dark: "#153e29", mid: "#1f5836", light: "#2d7848" },
  path: "#4b4636", pathEdge: "#393528",
  wood: "#5a4028", woodDark: "#382819", woodLight: "#705336",
  reed: "#224d2d", reedHi: "#326d40", cattail: "#4b3321",
  flowers: ["#c3cfc9", "#b0a260", "#a2788a", "#8780ab", "#9a7862"],
  haze: "#1c332d",
  tint: null,
  shadow: "rgba(0,8,4,0.34)",
};
export function lakePalette(tod: TimeOfDay): Pal {
  if (tod === "night") return NIGHT;
  if (tod === "morning") return { ...DAY, tint: "#fff2de" };
  if (tod === "evening") return { ...DAY, tint: "#f5cba9" };
  return DAY;
}

// A grove tree's leaves in its subject's colour: shaded, lit, and dimmed at night.
export function leafFrom(color: string, night: boolean): Leaf {
  const c = rgbOf(color);
  const tone = (to: RGB, k: number) => {
    const x = mixRgb(c, to, k);
    return rgbCss(night ? mixRgb(x, [9, 24, 18], 0.48) : x);
  };
  return { deep: tone([22, 38, 30], 0.66), dark: tone([34, 50, 40], 0.34), mid: tone(c, 0), light: tone([255, 255, 255], 0.5) };
}

export interface Grove { key: string; color: string; trees: number }
/** The subjects that have grown at least one tree (one per SESSIONS_PER_TREE
 *  sessions), in the order they were first studied. */
export function groveList(padSpecs: GrovePadSpec[], n = padSpecs.length): Grove[] {
  const seen = new Map<string, { color: string; count: number }>();
  for (let k = 0; k < Math.min(n, padSpecs.length); k++) {
    const sp = padSpecs[k];
    if (!sp.color || sp.key === PLAIN.key) continue;
    const e = seen.get(sp.key);
    if (e) {
      e.count++;
      e.color = sp.color;
    } else seen.set(sp.key, { color: sp.color, count: 1 });
  }
  return [...seen]
    .map(([key, v]) => ({ key, color: v.color, trees: Math.floor(v.count / SESSIONS_PER_TREE) }))
    .filter((gr) => gr.trees > 0);
}

const KOI: Array<[string, string]> = [
  ["#f08a3c", "#fff4e6"],
  ["#fbf6ec", "#e0523f"],
  ["#f2c14e", "#fff8e0"],
  ["#f5f1e8", "#2f2f2f"],
  ["#e8663d", "#2f2f2f"],
];
const BUTTERFLIES = ["#f2a65a", "#e88bb5", "#f2d94e"];
const PLAIN: GrovePadSpec = { key: "__general", color: null, species: 0, flower: 0 };

type TreeKind = "round" | "pine" | "blossom" | "bush" | "grove";
const KIND_SEED: Record<TreeKind, number> = { round: 11, pine: 23, blossom: 37, bush: 41, grove: 53 };
type Pt = [number, number];
type Box = [number, number, number, number]; // x0, y0, x1, y1
// `sp`: its sprite per level of detail, looked up once
interface Pad { x: number; y: number; r: number; spec: GrovePadSpec; bug: boolean; seed: number; sp?: Sprite[] }
// `tint`: blooms on a bush, or the leaves of a grove tree (its subject's colour)
// `z`: how tall it stands, in camera-altitude units (how far it leans out)
interface Tree { x: number; y: number; r: number; kind: TreeKind; v: number; tint: string | null; z: number; sp?: Sprite[] }
interface Koi { cx: number; cy: number; ax: number; ay: number; sp: number; ph: number; len: number; body: string; patch: string; seed: number }
interface Ripple { x: number; y: number; t0: number }
interface Tile { c: HTMLCanvasElement; used: number; bytes: number }
interface Sprite { c: HTMLCanvasElement; size: number; rb: number }

// A polyline (the path, the stream) with chunk boxes for quick distance checks.
class Poly {
  readonly pts: Pt[];
  readonly box: Box;
  private chunks: Array<[number, number, number, number, number]> = [];
  constructor(pts: Pt[]) {
    this.pts = pts;
    const C = 12;
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (let i = 0; i < pts.length - 1; i += C) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let j = i; j <= Math.min(i + C, pts.length - 1); j++) {
        const [x, y] = pts[j];
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      this.chunks.push([x0, y0, x1, y1, i]);
      bx0 = Math.min(bx0, x0);
      by0 = Math.min(by0, y0);
      bx1 = Math.max(bx1, x1);
      by1 = Math.max(by1, y1);
    }
    this.box = [bx0, by0, bx1, by1];
  }
  /** Distance from (x, y) to the line, or `cap` if it is farther than that. */
  dist(x: number, y: number, cap: number): number {
    let best = cap;
    const last = this.pts.length - 1;
    for (const [x0, y0, x1, y1, i0] of this.chunks) {
      if (x < x0 - best || x > x1 + best || y < y0 - best || y > y1 + best) continue;
      for (let i = i0 + 1; i <= Math.min(i0 + 12, last); i++) {
        const [ax, ay] = this.pts[i - 1];
        const [bx, by] = this.pts[i];
        const dx = bx - ax;
        const dy = by - ay;
        const L = dx * dx + dy * dy || 1;
        const t = clamp(((x - ax) * dx + (y - ay) * dy) / L, 0, 1);
        const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
        if (d < best) best = d;
      }
    }
    return best;
  }
}

export class LakeWorld {
  /** Zoom levels (ground scale), closest first; 1 = the landing view. */
  levels: number[] = [1, 0.55];
  /** Only this subject's pads stand out (the others fade), or null for all. */
  filterKey: string | null = null;

  private inp!: LakeInput;
  private pal: Pal = DAY;
  private rx = 0;
  private ry = 0;
  private padR = 30;
  private homeR = 40;
  private band = 0; // beach width
  private meadow = 0; // open meadow ring between the beach and the forest
  private E = 0; // world half-extent
  private s0 = S0; // ground scale at the top of the dive
  private cx = 0; // content half-extents (the camera stays over these)
  private cy = 0;
  private shoreN = 180;
  private shorePaths = new Map<number, Path2D>();
  private pads: Pad[] = [];
  private trees: Tree[] = []; // sorted by y (drawn back to front)
  private groveSig = "";
  private path = new Poly([[0, 0], [0, 1]]);
  private stream = new Poly([[0, 0], [0, 1]]);
  private clearings: Array<[number, number, number]> = [];
  private dock = { y0: 0, y1: 0, w: 0 };
  private lanterns: Pt[] = [];
  private rocks: Array<[number, number, number]> = [];
  private reeds: Array<[number, number, number]> = [];
  private flowers: Array<[number, number, number, number]> = []; // x, y, colour, seed
  private pebbles: Array<[number, number, number]> = []; // x, y, seed
  private bedStones: Array<[number, number, number]> = [];
  private bedPlants: Array<[number, number, number]> = [];
  private pathStones: Array<[number, number, number]> = [];
  private koi: Koi[] = [];
  private glints: Array<[number, number, number]> = [];
  private dashes: Array<[number, number, number]> = [];
  private flutters = 3; // butterflies
  private fireflies = 26;
  private cloudShadows: Array<[number, number, number]> = []; // x0, y, speed
  private ripples: Ripple[] = [];
  private reactUntil = 0;
  // ground tiles
  private ts0 = 1; // device px per world unit at level of detail 0
  private tiles = new Map<string, Tile>();
  private tileBytes = 0;
  private tileBudget = 0;
  private frameNo = 0;
  private wishes: Camera[] = [];
  private wishFirst = false;
  private groundSig = "";
  private base?: HTMLCanvasElement;
  private sprites = new Map<string, Sprite>();
  private cloudShadow?: HTMLCanvasElement;

  get night(): boolean {
    return this.pal.night;
  }

  /** How long the dive lasts: a little longer when it starts higher up. */
  get diveMs(): number {
    return DIVE_MS * clamp(Math.log(1 / this.s0) / Math.log(1 / S0), 1, 1.22);
  }

  /** The camera's altitude at the top of the dive (the clouds are set by it). */
  get diveTop(): number {
    return 1 / this.s0;
  }

  build(inp: LakeInput): void {
    this.inp = inp;
    this.pal = lakePalette(inp.tod);
    this.ts0 = Math.min(inp.dpr, Math.sqrt(SCREEN_PX / (inp.w * inp.h)));
    for (const s of this.sprites.values()) release(s.c);
    this.sprites.clear();
    this.layout();
    // The ground only changes with the screen, day/night, the lake's size and the
    // groves; a new pad colour just redraws the sprites.
    const sig = [inp.w, inp.h, inp.dpr, this.pal.night, this.pads.length, this.groveSig].join("|");
    if (sig !== this.groundSig) {
      this.groundSig = sig;
      this.dropTiles();
      this.tileBudget = Math.max(24e6, 6 * inp.w * inp.h * this.ts0 ** 2 * 4);
      this.paintBase();
    }
    if (!this.cloudShadow) this.cloudShadow = cloudShadowSprite();
  }

  dispose(): void {
    this.dropTiles();
    this.groundSig = "";
    release(this.base);
    release(this.cloudShadow);
    this.cloudShadow = undefined;
    for (const s of this.sprites.values()) release(s.c);
    this.sprites.clear();
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  /** The dive: p 0 → 1 over DIVE_MS. Falls fast out of the sky, then settles. */
  diveCamera(p: number): Camera {
    // falling at a steady, fast rate through the clouds (log-scale zoom), easing
    // into the landing, with a small dip-and-settle at the very end
    const e = 1 - (1 - p) ** 2.2;
    const settle = 1 + 0.04 * Math.sin(Math.PI * smooth(0.7, 1, p));
    const s = Math.exp(Math.log(this.s0) * (1 - e)) * settle;
    const k = (1 - easeOutCubic(p)) * (S0 / this.s0);
    const { w, h } = this.inp;
    // come in from over the path (lower left), sweeping onto the lake
    return { x: -w * 0.32 * k, y: h * 0.42 * k, s, rot: ROT0 * (1 - easeOutCubic(p)) };
  }

  /** Where the dive camera is when it has fallen to altitude A (1 = landed). */
  cameraAtAltitude(A: number): Pt {
    for (let i = 0; i <= 100; i++) {
      const c = this.diveCamera(i / 100);
      if (1 / c.s <= A) return [c.x, c.y];
    }
    return [0, 0];
  }

  /** Keeps the camera over the lake and its groves at scale s. */
  clampCam(x: number, y: number, s: number): Pt {
    const { w, h } = this.inp;
    const lx = Math.max(0, this.cx - (w / 2 / s) * 0.8);
    const ly = Math.max(0, this.cy - (h / 2 / s) * 0.8);
    return [clamp(x, -lx, lx), clamp(y, -ly, ly)];
  }

  /** Cameras whose ground should be painted ahead of time (the landing spot, a
   *  zoom's destination, the next levels up and down). */
  plan(cams: Camera[], first: boolean): void {
    this.wishes = cams;
    this.wishFirst = first;
  }

  /** The sky's haze over the ground: thick in the dive, a light veil up high. */
  hazeAlpha(cam: Camera, diving: boolean): number {
    const A = 1 / cam.s;
    if (diving) return 0.88 * clamp((A - 1) / (1 / this.s0 - 1), 0, 1) ** 1.4;
    const top = 1 / this.levels[this.levels.length - 1];
    return top > 1.01 ? 0.13 * smooth(1, top, A) : 0;
  }

  /** Havi waves hello when the camera lands. */
  greet(now: number): void {
    this.reactUntil = now + 1500;
  }

  /** A tap at a screen point: Havi celebrates, or the water ripples. */
  tap(sx: number, sy: number, cam: Camera, now: number): void {
    const { w, h } = this.inp;
    let dx = (sx - w / 2) / cam.s;
    let dy = (sy - h / 2) / cam.s;
    const c = Math.cos(-cam.rot);
    const s = Math.sin(-cam.rot);
    [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
    const x = dx + cam.x;
    const y = dy + cam.y;
    if (Math.hypot(x, y + this.homeR * 0.2) < Math.max(this.homeR * 1.25, 18 / cam.s)) {
      this.reactUntil = now + 2300;
      return;
    }
    if (this.lakeR(x, y) < 0.97) {
      this.ripples.push({ x, y, t0: now });
      if (this.ripples.length > 6) this.ripples.shift();
    }
  }

  // ── Geometry ──────────────────────────────────────────────────────────────
  private shoreK(a: number): number {
    return 1 + 0.06 * Math.sin(3 * a + 1.3) + 0.04 * Math.sin(5 * a + 0.4) + 0.022 * Math.sin(8 * a + 2.1);
  }
  private shorePoint(a: number, out = 0): Pt {
    const k = this.shoreK(a);
    return [Math.cos(a) * (this.rx * k + out), Math.sin(a) * (this.ry * k + out)];
  }
  /** The shoreline pushed out (or in, if negative) by `out`; cached. */
  private shoreAt(out: number): Path2D {
    const key = Math.round(out * 100);
    let p = this.shorePaths.get(key);
    if (!p) {
      p = new Path2D();
      const N = this.shoreN;
      for (let i = 0; i <= N; i++) {
        const [x, y] = this.shorePoint((i / N) * TAU, out);
        if (i) p.lineTo(x, y);
        else p.moveTo(x, y);
      }
      p.closePath();
      this.shorePaths.set(key, p);
    }
    return p;
  }
  private lakeBox(out: number): Box {
    const ex = this.rx * 1.13 + out;
    const ey = this.ry * 1.13 + out;
    return [-ex, -ey, ex, ey];
  }
  /** 0 at the centre, 1 on the shoreline, > 1 on land. */
  private lakeR(x: number, y: number): number {
    const a = Math.atan2(y / this.ry, x / this.rx);
    return Math.hypot(x / this.rx, y / this.ry) / this.shoreK(a);
  }
  /** Rough distance from the shoreline (negative inside the water). */
  private shoreDist(x: number, y: number): number {
    const a = Math.atan2(y / this.ry, x / this.rx);
    const k = this.shoreK(a);
    const rad = Math.hypot(Math.cos(a) * this.rx * k, Math.sin(a) * this.ry * k);
    return (this.lakeR(x, y) - 1) * rad;
  }

  // ── Layout: where everything goes (deterministic) ─────────────────────────
  private layout(): void {
    const { w, h, count, padSpecs } = this.inp;
    const n = clamp(Math.round(count), 0, MAX_PADS);
    const padR = clamp(Math.min(w, h) * 0.048, 22, 34);
    this.padR = padR;
    this.homeR = Math.max(28, padR * 1.3);

    // The lake: at least the size that suits the screen; past that it grows with
    // the harvest, so every pad keeps its size and its room on the water.
    let rx0 = Math.min(w * 0.42, h * 0.74);
    const ry0 = Math.min(h * 0.38, rx0 * 1.6);
    rx0 = Math.min(rx0, ry0 * 1.9);
    const room = padR * 2.3; // centre-to-centre room per pad
    const rIn = this.homeR * 1.2 + padR; // Havi's open circle
    const need = Math.sqrt(rIn ** 2 + n * 1.06 * room ** 2) / 0.86;
    const grow = Math.max(1, need / Math.sqrt(rx0 * ry0));
    const rx = (this.rx = rx0 * grow);
    const ry = (this.ry = ry0 * grow);
    const g = Math.sqrt(rx * ry);
    this.band = clamp(padR * 0.6, 12, 22);
    const circ = TAU * Math.sqrt((rx * rx + ry * ry) / 2);
    this.shoreN = clamp(Math.round(circ / 9), 180, 1800);
    this.shorePaths.clear();

    // Dock at the bottom of the lake, where the path from the forest arrives.
    const shoreY = this.shorePoint(Math.PI / 2)[1];
    const dw = padR * 0.95;
    this.dock = { y0: shoreY + this.band * 0.9, y1: shoreY - clamp(ry * 0.17, padR * 1.4, padR * 3), w: dw };

    // ── Pads: the earned pads float around Havi on a sunflower spiral (oldest
    // nearest him), each with the same room around it however many there are.
    const endW = dw * 1.7;
    const endH = dw * 0.75;
    const hitsDock = (x: number, y: number, r: number) => {
      const dx = Math.max(-endW / 2 - 6 - x, 0, x - (endW / 2 + dw * 1.5));
      const dy = Math.max(this.dock.y1 - endH / 2 - 6 - y, 0);
      return Math.hypot(dx, dy) < r;
    };
    const specAt = (k: number) => (k < padSpecs.length ? padSpecs[k] : PLAIN);
    const pads: Pad[] = [];
    for (let slot = 0; pads.length < n && slot < n * 2 + 40; slot++) {
      const rad = Math.sqrt(rIn ** 2 + (slot + 0.5) * room ** 2);
      const ang = slot * GOLDEN;
      const k = pads.length;
      const r = Math.round(padR * (0.8 + hash(k * 3.1) * 0.36));
      // a little jitter so the spiral reads as pads drifting, not a grid
      const jit = room * 0.16;
      const kk = this.shoreK(ang) * rad;
      let x = Math.cos(ang) * kk * (rx / g) + (hash(k * 5.7) - 0.5) * jit * 2;
      let y = Math.sin(ang) * kk * (ry / g) + (hash(k * 9.3) - 0.5) * jit * 2;
      // keep the pad's rim off the sand
      const [sx, sy] = this.shorePoint(ang);
      const reach = Math.hypot(sx, sy) - r - 6;
      const d = Math.hypot(x, y);
      if (d > reach) {
        x *= reach / d;
        y *= reach / d;
      }
      if (hitsDock(x, y, r)) continue;
      pads.push({ x, y, r, spec: specAt(k), bug: k % 9 === 4, seed: k + 1 });
    }
    this.pads = pads;

    // ── Each subject's grove on the shore, then the meadow wide enough for it
    const groves = this.layoutGroves(n);
    const rows = groves.rows;
    const rG = padR * 1.12;
    this.meadow = Math.max(padR * 3.2, rows ? 8 + rG * 2 + (rows - 1) * rG * 1.7 + 24 : 0);

    // ── Zoom levels: from the landing view up to the whole lake with its groves
    const edge = this.band + this.meadow + padR * 2;
    this.cx = rx * 1.12 + edge;
    this.cy = ry * 1.12 + edge;
    // leave room for the title card and subject bar (and the zoom buttons on a
    // wide screen; on a phone the lake may pass under them)
    const hudH = h > 560 ? 160 : 120;
    const hudW = w < 640 ? 24 : 96;
    const fit = Math.min(Math.max(160, w - hudW) / (2 * this.cx), Math.max(160, h - hudH) / (2 * this.cy));
    const sMin = clamp(fit, 0.04, 0.55);
    const nL = clamp(1 + Math.ceil(Math.log(1 / sMin) / Math.log(2.3)), 2, 4);
    this.levels = Array.from({ length: nL }, (_, i) => sMin ** (i / (nL - 1)));
    // the dive starts above the whole lake with its groves
    this.s0 = Math.min(S0, sMin * 0.72);
    const half = Math.hypot(w, h) / 2;
    const f = S0 / this.s0;
    this.E =
      Math.max(
        half / this.s0 + Math.hypot(w * 0.32 * f, h * 0.42 * f),
        half / sMin + Math.max(this.cx, this.cy) * 0.3,
        Math.hypot(this.cx, this.cy) + 300,
      ) *
        1.04 +
      60;

    // ── The path (from the dock down through the forest) and the stream
    // (from the forest in the upper left into the lake).
    const path: Pt[] = [];
    for (let y = this.dock.y0 - 2; y < this.E + 140; y += 32) {
      const t = y - this.dock.y0;
      const bend = smooth(0, 240, t);
      path.push([(Math.sin(t * 0.0042 + 0.6) * 110 + Math.sin(t * 0.0011) * 240) * bend, y]);
    }
    this.path = new Poly(path);
    const [sx0, sy0] = this.shorePoint(STREAM_A, -this.band * 1.5);
    const dl = Math.hypot(Math.cos(STREAM_A) * rx, Math.sin(STREAM_A) * ry);
    const ux = (Math.cos(STREAM_A) * rx) / dl;
    const uy = (Math.sin(STREAM_A) * ry) / dl;
    const stream: Pt[] = [];
    for (let t = 0; t < this.E * 1.6; t += 28) {
      const on = smooth(0, 180, t);
      const wig = (Math.sin(t * 0.005) * 70 + Math.sin(t * 0.013) * 16) * on;
      stream.push([sx0 + ux * t - uy * wig, sy0 + uy * t + ux * wig]);
    }
    this.stream = new Poly(stream);

    // ── Forest clearings far out (seen from the sky on the way down)
    const rc = rng(5);
    const inner = Math.hypot(this.cx, this.cy) + 160;
    this.clearings = [];
    for (let i = 0; i < clamp(Math.round((this.E * this.E) / 1.6e6), 6, 30); i++) {
      const a = rc() * TAU;
      const d = inner + rc() * Math.max(100, this.E * 0.92 - inner);
      this.clearings.push([Math.cos(a) * d, Math.sin(a) * d, (110 + rc() * 170) * (padR / 34)]);
    }

    // ── Trees: the groves, then a jittered grid; sparse across the meadow,
    // dense in the forest
    const trees: Tree[] = [...groves.trees];
    const grid = new Map<string, Tree[]>();
    for (const t of groves.trees) {
      const key = `${Math.floor(t.x / 100)},${Math.floor(t.y / 100)}`;
      const list = grid.get(key);
      if (list) list.push(t);
      else grid.set(key, [t]);
    }
    const nearGrove = (x: number, y: number, r: number) => {
      const gx = Math.floor(x / 100);
      const gy = Math.floor(y / 100);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (const t of grid.get(`${gx + i},${gy + j}`) ?? []) if (Math.hypot(t.x - x, t.y - y) < (t.r * 1.4 + r) * 0.9) return true;
      return false;
    };
    const cell = padR * 2.2;
    const nC = Math.ceil(this.E / cell);
    for (let iy = -nC; iy < nC; iy++) {
      for (let ix = -nC; ix < nC; ix++) {
        const x = (ix + hash2(ix, iy, 11)) * cell;
        const y = (iy + hash2(ix, iy, 12)) * cell;
        const d = this.shoreDist(x, y);
        if (d < this.band + 10) continue;
        const inMeadow = d < this.band + this.meadow;
        const roll = hash2(ix, iy, 13);
        if (inMeadow ? roll > 0.09 : roll > 0.86) continue;
        if (this.clearings.some(([cx, cy, cr]) => Math.hypot(x - cx, y - cy) < cr)) continue;
        const kr = hash2(ix, iy, 14);
        const kind: TreeKind = inMeadow
          ? kr < 0.35 ? "blossom" : kr < 0.7 ? "bush" : "round"
          : kr < 0.56 ? "round" : kr < 0.88 ? "pine" : kr < 0.94 ? "blossom" : "bush";
        let r = cell * (0.44 + hash2(ix, iy, 15) * 0.3) * (inMeadow ? 0.85 : 1);
        if (kind === "bush") r *= 0.6;
        if (this.path.dist(x, y, 26 + r * 0.7) < 26 + r * 0.7) continue;
        if (this.stream.dist(x, y, 30 + r * 0.7) < 30 + r * 0.7) continue;
        if (nearGrove(x, y, r)) continue;
        // plain white or yellow blooms: a colour on a tree means a subject
        const tint = kind === "bush" && hash2(ix, iy, 16) < 0.5 ? this.pal.flowers[hash2(ix, iy, 17) < 0.5 ? 0 : 1] : null;
        trees.push({ x, y, r, kind, v: Math.floor(hash2(ix, iy, 18) * VARIANTS), tint, z: (r * 1.25) / FOCAL });
      }
    }
    trees.sort((a, b) => a.y - b.y);
    this.trees = trees;

    // ── Shore life: rocks, reeds, lanterns (clear of the dock, path and stream)
    const clear = (x: number, y: number) =>
      this.path.dist(x, y, 48) >= 48 &&
      this.stream.dist(x, y, 48) >= 48 &&
      !(Math.abs(x) < dw * 2.6 && y > this.dock.y1 - 30 && y < this.dock.y0 + 30);
    const rs = rng(23);
    this.rocks = [];
    for (let i = 0; i < clamp(Math.round(circ / 300), 5, 70); i++) {
      const a = rs() * TAU;
      const r = padR * (0.22 + rs() * 0.3);
      const [x, y] = this.shorePoint(a, this.band * 0.25);
      if (clear(x, y)) this.rocks.push([x, y, r]);
    }
    this.reeds = [];
    for (let i = 0; i < clamp(Math.round(circ / 240), 6, 90); i++) {
      const a = rs() * TAU;
      const [x, y] = this.shorePoint(a, -this.band * 0.4);
      if (clear(x, y)) this.reeds.push([x, y, a]);
    }
    this.lanterns = [
      [-dw / 2 - 7, this.dock.y1 + 6],
      [dw / 2 + 7, this.dock.y1 + 6],
    ];
    for (let i = 0; i < clamp(Math.round(circ / 650), 3, 30); i++) {
      const [x, y] = this.shorePoint(rs() * TAU, this.band * 0.72);
      if (clear(x, y)) this.lanterns.push([x, y]);
    }

    // ── Little things scattered on the ground (painted into the tiles)
    const fr = rng(17);
    this.flowers = [];
    for (let i = 0; i < clamp(Math.round((circ * this.meadow) / 1500), 40, 5000); i++) {
      const [x, y] = this.shorePoint(fr() * TAU, this.band + 16 + fr() * this.meadow * 0.9);
      const ci = Math.floor(fr() * 5);
      if (this.path.dist(x, y, 22) >= 22) this.flowers.push([x, y, ci, i * 7.3]);
    }
    for (const [cx, cy, cr] of this.clearings) {
      for (let i = 0; i < Math.round((cr * cr) / 900); i++) {
        const a = fr() * TAU;
        const d = Math.sqrt(fr()) * cr;
        this.flowers.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.floor(fr() * 5), 9000 + this.flowers.length * 7.3]);
      }
    }
    const sr = rng(11);
    this.pebbles = Array.from({ length: clamp(Math.round(circ / 20), 90, 4000) }, (_, i) => {
      const [x, y] = this.shorePoint(sr() * TAU, this.band * (0.3 + sr() * 0.6));
      return [x, y, i * 3.9] as [number, number, number];
    });
    this.bedStones = Array.from({ length: clamp(Math.round(circ / 70), 26, 1500) }, (_, i) => {
      const [x, y] = this.shorePoint(sr() * TAU, -this.band * (0.6 + sr() * 2.2));
      return [x, y, i * 5.1] as [number, number, number];
    });
    this.bedPlants = Array.from({ length: clamp(Math.round(circ / 200), 9, 500) }, (_, i) => {
      const [x, y] = this.shorePoint(sr() * TAU, -this.band * (1.4 + sr() * 2));
      return [x, y, i * 6.7] as [number, number, number];
    });
    this.pathStones = this.path.pts.slice(1).map(([x, y], i) => [x + (hash(i * 1.7) - 0.5) * 16, y + (hash(i * 2.9) - 0.5) * 20, i * 4.3]);

    // ── Koi (swim under the pads), sparkles and wind on the water, insects
    const area = Math.PI * rx * ry;
    const rk = rng(31);
    const inLake = (maxR: number): Pt => {
      const a = rk() * TAU;
      const R = Math.sqrt(rk()) * maxR * this.shoreK(a);
      return [Math.cos(a) * R * rx, Math.sin(a) * R * ry];
    };
    this.koi = Array.from({ length: clamp(Math.round(area / 110000), 5, 40) }, (_, i) => {
      // the first few circle close around Havi, the rest all over the lake
      const [cx, cy] = i < 3 ? [(rk() - 0.5) * padR * 2, (rk() - 0.5) * padR * 2] : inLake(0.66);
      const ax = padR * (i < 3 ? 3.4 + i * 1.3 : 2.6 + rk() * 3.2);
      const [body, patch] = KOI[i % KOI.length];
      return {
        cx,
        cy,
        ax,
        ay: ax * (0.62 + rk() * 0.4),
        sp: ((0.022 + rk() * 0.016) / ax) * (i % 2 ? 1 : -1),
        ph: rk() * TAU,
        len: padR * (1 + rk() * 0.35),
        body,
        patch,
        seed: i * 3.7,
      };
    });
    this.glints = Array.from({ length: clamp(Math.round(area / 20000), 18, 600) }, () => [...inLake(0.86), rk()] as [number, number, number]);
    this.dashes = Array.from({ length: clamp(Math.round(area / 12000), 14, 900) }, () => [...inLake(0.78), rk()] as [number, number, number]);
    this.flutters = clamp(Math.round(circ / 650), 3, 30);
    this.fireflies = clamp(Math.round(circ / 75), 26, 180);
    const span = 2 * (Math.max(this.cx, this.cy) + Math.max(w, h));
    this.cloudShadows = Array.from({ length: clamp(Math.round((4 * this.cx * this.cy) / 1.2e6), 3, 18) }, () => [
      rk() * span,
      (rk() - 0.5) * 2 * this.cy,
      0.7 + rk() * 0.6,
    ]);
  }

  // Every subject with enough sessions gets a grove on the shore: one tree per
  // SESSIONS_PER_TREE sessions, planted along the shore in rows. The groves are
  // spread evenly round the lake (skipping the dock and the stream), in the order
  // the subjects were first studied, and a grove grows along the shore.
  private layoutGroves(n: number): { trees: Tree[]; rows: number } {
    const groves = groveList(this.inp.padSpecs, n);
    this.groveSig = groves.map((gr) => `${gr.key}:${gr.trees}`).join(",");
    if (!groves.length) return { trees: [], rows: 0 };

    const rG = this.padR * 1.12; // a grove tree's radius
    const step = rG * 2.1; // along the shore
    const rowStep = rG * 1.7; // away from the shore
    const out0 = this.band + rG + 8; // the first row: canopies just past the sand
    // arc length round the first row, to space the trees evenly
    const M = 1440;
    const cum = new Float64Array(M + 1);
    let [px, py] = this.shorePoint(0, out0);
    for (let i = 1; i <= M; i++) {
      const [x, y] = this.shorePoint((i / M) * TAU, out0);
      cum[i] = cum[i - 1] + Math.hypot(x - px, y - py);
      px = x;
      py = y;
    }
    const L = cum[M];
    const arcAt = (a: number) => cum[Math.round((mod(a, TAU) / TAU) * M)];
    const angAt = (s: number) => {
      s = mod(s, L);
      let lo = 0;
      let hi = M;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= s) lo = mid;
        else hi = mid;
      }
      return ((lo + (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo])) / M) * TAU;
    };
    // the usable shore: from the dock round to the stream, then back to the dock
    const gap = 60 + rG;
    const aDock = arcAt(Math.PI / 2);
    const toStream = mod(arcAt(STREAM_A) - aDock, L);
    const spans = (
      [
        [aDock + gap, aDock + toStream - gap],
        [aDock + toStream + gap, aDock + L - gap],
      ] as Pt[]
    ).filter(([a, b]) => b > a);
    const U = spans.reduce((t, [a, b]) => t + b - a, 0);
    const arcOf = (u: number) => {
      for (const [a, b] of spans) {
        if (u <= b - a) return a + u;
        u -= b - a;
      }
      return spans.length ? spans[spans.length - 1][1] : 0;
    };
    const colsFor = (r: number) => groves.reduce((t, gr) => t + Math.ceil(gr.trees / r), 0);
    let rows = 1;
    while (rows < 6 && (colsFor(rows) + groves.length) * step > U) rows++;
    const gapG = Math.max(0, U - colsFor(rows) * step) / groves.length;
    const trees: Tree[] = [];
    let u = gapG / 2;
    for (const gr of groves) {
      const cols = Math.ceil(gr.trees / rows);
      const base = hashStr(gr.key);
      for (let i = 0; i < gr.trees; i++) {
        const col = Math.floor(i / rows);
        const row = i % rows;
        const sd = base + i * 17;
        // odd rows sit between the trees of the row in front
        const along = Math.min(u + (col + 0.5 + (row % 2) * 0.5) * step, u + cols * step - step * 0.25);
        const [x, y] = this.shorePoint(angAt(arcOf(along)), out0 + row * rowStep + (hash(sd) - 0.5) * rG * 0.35);
        const r = rG * (0.88 + hash(sd + 1) * 0.24);
        trees.push({
          x: x + (hash(sd + 2) - 0.5) * rG * 0.3,
          y: y + (hash(sd + 3) - 0.5) * rG * 0.3,
          r,
          kind: "grove",
          v: Math.floor(hash(sd + 4) * VARIANTS),
          tint: gr.color,
          z: (r * 1.3) / FOCAL,
        });
      }
      u += cols * step + gapG;
    }
    return { trees, rows };
  }

  // ── Ground tiles ──────────────────────────────────────────────────────────
  private lodFor(s: number): number {
    return clamp(Math.floor(Math.log2(this.ts0 / (s * this.inp.dpr * 0.85))), 0, MAX_LOD);
  }
  private tileSpan(lod: number): number {
    return TILE_PX / (this.ts0 / 2 ** lod); // world units per tile
  }
  private viewBox(cam: Camera, pad = 0): Box {
    const { w, h } = this.inp;
    const c = Math.abs(Math.cos(cam.rot));
    const s = Math.abs(Math.sin(cam.rot));
    const hx = ((w / 2) * c + (h / 2) * s) / cam.s + pad;
    const hy = ((w / 2) * s + (h / 2) * c) / cam.s + pad;
    return [cam.x - hx, cam.y - hy, cam.x + hx, cam.y + hy];
  }
  /** The tiles covering a camera's view at a level of detail, centre first. */
  private tilesFor(cam: Camera, lod: number, pad = 0): Array<[number, number, number]> {
    const span = this.tileSpan(lod);
    const [x0, y0, x1, y1] = this.viewBox(cam, pad);
    const out: Array<[number, number, number]> = [];
    for (let ty = Math.floor(y0 / span); ty <= Math.floor(y1 / span); ty++)
      for (let tx = Math.floor(x0 / span); tx <= Math.floor(x1 / span); tx++) out.push([lod, tx, ty]);
    const d = (t: [number, number, number]) => Math.hypot((t[1] + 0.5) * span - cam.x, (t[2] + 0.5) * span - cam.y);
    return out.sort((a, b) => d(a) - d(b));
  }

  private paintTiles(cam: Camera, lod: number, budgetMs: number): void {
    const view = this.tilesFor(cam, lod);
    const wish = this.wishes.flatMap((c) => this.tilesFor(c, this.lodFor(c.s)));
    const ring = this.tilesFor(cam, lod, this.tileSpan(lod) * 0.5);
    const order = this.wishFirst ? [...wish, ...view, ...ring] : [...view, ...wish, ...ring];
    const deadline = performance.now() + budgetMs;
    for (const [l, tx, ty] of order) {
      const key = `${l}:${tx}:${ty}`;
      const tile = this.tiles.get(key);
      if (tile) {
        tile.used = this.frameNo;
        continue;
      }
      if (budgetMs <= 0 || performance.now() > deadline) continue;
      const c = this.paintTile(l, tx, ty);
      const bytes = c.width * c.height * 4;
      this.tiles.set(key, { c, used: this.frameNo, bytes });
      this.tileBytes += bytes;
    }
    if (this.tileBytes > this.tileBudget) {
      // forget the tiles seen longest ago (never the ones this frame needs)
      const old = [...this.tiles].filter(([, t]) => t.used < this.frameNo).sort((a, b) => a[1].used - b[1].used);
      for (const [key, t] of old) {
        if (this.tileBytes <= this.tileBudget * 0.85) break;
        release(t.c);
        this.tiles.delete(key);
        this.tileBytes -= t.bytes;
      }
    }
  }

  private paintTile(lod: number, tx: number, ty: number): HTMLCanvasElement {
    const sc = this.ts0 / 2 ** lod;
    const span = TILE_PX / sc;
    const b = BLEED / sc;
    const [c, g] = makeCanvas(TILE_PX + BLEED * 2, TILE_PX + BLEED * 2);
    const x0 = tx * span - b;
    const y0 = ty * span - b;
    g.setTransform(sc, 0, 0, sc, -x0 * sc, -y0 * sc);
    this.paintGround(g, x0, y0, x0 + span + 2 * b, y0 + span + 2 * b, lod);
    return c;
  }

  private dropTiles(): void {
    for (const t of this.tiles.values()) release(t.c);
    this.tiles.clear();
    this.tileBytes = 0;
  }

  private paintBase(): void {
    release(this.base);
    const side = 2 * this.E;
    const bs = Math.min(0.6, BASE_MAX / side);
    const [c, g] = makeCanvas(side * bs, side * bs);
    g.setTransform(bs, 0, 0, bs, this.E * bs, this.E * bs);
    this.paintGround(g, -this.E, -this.E, this.E, this.E, BASE_LOD);
    this.base = c;
  }

  /** The ground of the view: tiles, falling back to a coarser or finer tile,
   *  or the low-resolution base, while a tile is still being painted. */
  private drawGround(ctx: CanvasRenderingContext2D, cam: Camera, lod: number): void {
    const draw = (l: number, tx: number, ty: number, t: Tile) => {
      const span = this.tileSpan(l);
      const b = BLEED / (this.ts0 / 2 ** l);
      ctx.drawImage(t.c, tx * span - b, ty * span - b, span + 2 * b, span + 2 * b);
    };
    const got: Array<[number, number, number, Tile]> = [];
    const coarse = new Map<string, [number, number, number, Tile]>();
    const fine: Array<[number, number, number, Tile]> = [];
    let needBase = false;
    for (const [l, tx, ty] of this.tilesFor(cam, lod)) {
      const t = this.tiles.get(`${l}:${tx}:${ty}`);
      if (t) {
        got.push([l, tx, ty, t]);
        continue;
      }
      let done = false;
      for (let up = l + 1; up <= Math.min(MAX_LOD, l + 3) && !done; up++) {
        const f = 2 ** (up - l);
        const key = `${up}:${Math.floor(tx / f)}:${Math.floor(ty / f)}`;
        const pt = this.tiles.get(key);
        if (pt) {
          coarse.set(key, [up, Math.floor(tx / f), Math.floor(ty / f), pt]);
          done = true;
        }
      }
      if (!done && l > 0) {
        const kids: Array<[number, number, number, Tile]> = [];
        for (let j = 0; j < 4; j++) {
          const kx = tx * 2 + (j & 1);
          const ky = ty * 2 + (j >> 1);
          const kt = this.tiles.get(`${l - 1}:${kx}:${ky}`);
          if (kt) kids.push([l - 1, kx, ky, kt]);
        }
        if (kids.length === 4) {
          fine.push(...kids);
          done = true;
        }
      }
      if (!done) needBase = true;
    }
    if (needBase && this.base) ctx.drawImage(this.base, -this.E, -this.E, this.E * 2, this.E * 2);
    for (const [l, tx, ty, t] of [...coarse.values()].sort((a, b) => b[0] - a[0])) draw(l, tx, ty, t);
    for (const [l, tx, ty, t] of fine) draw(l, tx, ty, t);
    for (const [l, tx, ty, t] of got) draw(l, tx, ty, t);
  }

  /** True when the rectangle is all deep water (no shallow band to paint). */
  private deepInside(x0: number, y0: number, x1: number, y1: number): boolean {
    const lim = -(this.band * 4.6);
    const xm = (x0 + x1) / 2;
    const ym = (y0 + y1) / 2;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [xm, y0], [xm, y1], [x0, ym], [x1, ym]] as Pt[]) {
      if (this.shoreDist(x, y) > lim) return false;
    }
    return true;
  }

  private paintGround(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, lod: number) {
    const p = this.pal;
    const fine = lod <= 1;
    const mid = lod <= 3;
    const inR = (x: number, y: number, m: number) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
    const hits = (b: Box, m = 0) => b[2] + m > x0 && b[0] - m < x1 && b[3] + m > y0 && b[1] - m < y1;

    // forest floor, the open meadow around the lake (soft edge) and far clearings
    ctx.fillStyle = p.floor;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const meadowOut = this.band + this.meadow;
    const clr = this.clearings.filter(([cx, cy, cr]) => inR(cx, cy, cr + 60));
    ctx.fillStyle = p.grass;
    for (const [extra, a] of [[80, 0.3], [40, 0.55], [0, 1]] as Pt[]) {
      ctx.globalAlpha = a;
      if (hits(this.lakeBox(meadowOut + extra))) ctx.fill(this.shoreAt(meadowOut + extra));
      if (clr.length) {
        ctx.beginPath();
        for (const [cx, cy, cr] of clr) addCircle(ctx, cx, cy, cr + extra * 0.6);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // soft light/dark patches so the grass isn't flat
    if (lod <= 4) {
      const C = 150;
      const light = new Path2D();
      const dark = new Path2D();
      for (let iy = Math.floor((y0 - 130) / C); iy <= Math.floor((y1 + 130) / C); iy++) {
        for (let ix = Math.floor((x0 - 130) / C); ix <= Math.floor((x1 + 130) / C); ix++) {
          const k = hash2(ix, iy, 1);
          if (k > 0.62) continue;
          const x = (ix + hash2(ix, iy, 2)) * C;
          const y = (iy + hash2(ix, iy, 3)) * C;
          const ex = 40 + hash2(ix, iy, 4) * 90;
          const ey = 26 + hash2(ix, iy, 5) * 60;
          if (!inR(x, y, ex)) continue;
          const rot = hash2(ix, iy, 6) * 3;
          const path = k < 0.31 ? light : dark;
          path.moveTo(x + ex * Math.cos(rot), y + ex * Math.sin(rot));
          path.ellipse(x, y, ex, ey, rot, 0, TAU);
        }
      }
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = p.grassLight;
      ctx.fill(light);
      ctx.fillStyle = p.grassDark;
      ctx.fill(dark);
      ctx.globalAlpha = 1;
    }

    if (fine) {
      // grass tufts, batched into two paths
      const C = 26;
      const dark = new Path2D();
      const light = new Path2D();
      for (let iy = Math.floor((y0 - 8) / C); iy <= Math.floor((y1 + 8) / C); iy++) {
        for (let ix = Math.floor((x0 - 8) / C); ix <= Math.floor((x1 + 8) / C); ix++) {
          const x = (ix + hash2(ix, iy, 7)) * C;
          const y = (iy + hash2(ix, iy, 8)) * C;
          if (!inR(x, y, 8) || this.shoreDist(x, y) < this.band + 4) continue;
          const t = hash2(ix, iy, 10) < 0.5 ? dark : light;
          const s = 3 + hash2(ix, iy, 9) * 3;
          t.moveTo(x - s * 0.6, y);
          t.lineTo(x - s * 0.9, y - s);
          t.moveTo(x, y);
          t.lineTo(x, y - s * 1.25);
          t.moveTo(x + s * 0.6, y);
          t.lineTo(x + s * 0.9, y - s);
        }
      }
      ctx.lineCap = "round";
      ctx.lineWidth = 1.3;
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = p.grassDark;
      ctx.stroke(dark);
      ctx.strokeStyle = p.grassLight;
      ctx.stroke(light);
      ctx.globalAlpha = 1;
    }

    // meadow flowers (tiny five-petal clusters close up, dots from higher up)
    for (const [x, y, ci, sd] of this.flowers) {
      if (!inR(x, y, 14)) continue;
      const col = p.flowers[ci];
      const k = 2 + Math.floor(hash(sd) * 4);
      if (!fine) {
        ctx.fillStyle = col;
        ctx.beginPath();
      }
      for (let j = 0; j < k; j++) {
        const fx = x + (hash(sd + j * 2.3) - 0.5) * 16;
        const fy = y + (hash(sd + j * 4.1) - 0.5) * 12;
        if (fine) drawTinyFlower(ctx, fx, fy, 2.2 + hash(sd + j * 6.7) * 1.2, col);
        else addCircle(ctx, fx, fy, 3);
      }
      if (!fine) ctx.fill();
    }

    // the dirt path to the dock
    if (hits(this.path.box, 24)) {
      strokePoly(ctx, this.path.pts, p.pathEdge, 36);
      strokePoly(ctx, this.path.pts, p.path, 28);
      if (fine) {
        ctx.fillStyle = p.pathEdge;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        for (const [x, y, sd] of this.pathStones) {
          if (!inR(x, y, 6)) continue;
          const rot = hash(sd + 2) * 3;
          const ex = 2 + hash(sd) * 2;
          ctx.moveTo(x + ex * Math.cos(rot), y + ex * Math.sin(rot));
          ctx.ellipse(x, y, ex, 1.4 + hash(sd + 1) * 1.4, rot, 0, TAU);
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // the beach (dry sand, then wet sand at the waterline)
    if (hits(this.lakeBox(this.band))) {
      ctx.fillStyle = p.sand;
      ctx.fill(this.shoreAt(this.band));
      ctx.fillStyle = p.sandWet;
      ctx.fill(this.shoreAt(this.band * 0.32));
      if (fine) {
        ctx.fillStyle = p.pebble;
        ctx.beginPath();
        for (const [x, y, sd] of this.pebbles) {
          if (!inR(x, y, 4)) continue;
          const rot = hash(sd + 2) * 3;
          const ex = 1 + hash(sd) * 1.6;
          ctx.moveTo(x + ex * Math.cos(rot), y + ex * Math.sin(rot));
          ctx.ellipse(x, y, ex, 0.8 + hash(sd + 1), rot, 0, TAU);
        }
        ctx.fill();
      }
    }

    // the stream: sandy banks, then water, then a pale current line
    if (hits(this.stream.box, 26)) {
      strokePoly(ctx, this.stream.pts, p.sand, 48);
      strokePoly(ctx, this.stream.pts, p.sandWet, 38);
      strokePoly(ctx, this.stream.pts, p.shallow, 27);
      ctx.globalAlpha = 0.35;
      strokePoly(ctx, this.stream.pts, p.shallowHi, 7);
      ctx.globalAlpha = 1;
    }

    // the lake: deep water, a soft shallow band hugging the shore, a darker core
    if (hits(this.lakeBox(0))) {
      const shore = this.shoreAt(0);
      ctx.fillStyle = p.deep;
      ctx.fill(shore);
      ctx.save();
      ctx.clip(shore);
      if (!this.deepInside(x0, y0, x1, y1)) {
        // many thin, faint passes read as a smooth gradient rather than bands
        ctx.strokeStyle = p.shallow;
        ctx.globalAlpha = 0.14;
        for (let i = 0; i < 12; i++) {
          ctx.lineWidth = this.band * (8 - i * 0.6);
          ctx.stroke(shore);
        }
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.scale(1, this.ry / this.rx);
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, this.rx * 0.72);
      core.addColorStop(0, p.deepCore);
      core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = core;
      ctx.fillRect(-this.rx, -this.rx, this.rx * 2, this.rx * 2);
      ctx.restore();
      if (mid) {
        // stones and water plants on the lake bed, seen through the water
        ctx.fillStyle = p.night ? "rgba(0,10,8,0.28)" : "rgba(20,60,55,0.22)";
        ctx.beginPath();
        for (const [x, y, sd] of this.bedStones) {
          if (!inR(x, y, 10)) continue;
          const rot = hash(sd + 2) * 3;
          const ex = 3 + hash(sd) * 6;
          ctx.moveTo(x + ex * Math.cos(rot), y + ex * Math.sin(rot));
          ctx.ellipse(x, y, ex, 2 + hash(sd + 1) * 4, rot, 0, TAU);
        }
        ctx.fill();
        ctx.strokeStyle = p.night ? "rgba(20,70,45,0.45)" : "rgba(40,105,70,0.32)";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (const [x, y, sd] of this.bedPlants) {
          if (!inR(x, y, 16)) continue;
          for (let j = 0; j < 4; j++) {
            const a = hash(sd + j * 1.9) * TAU;
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(x + Math.cos(a + 0.5) * 8, y + Math.sin(a + 0.5) * 8, x + Math.cos(a) * 14, y + Math.sin(a) * 14);
          }
        }
        ctx.stroke();
      }
      // the sky's soft reflection across the upper water
      ctx.globalAlpha = p.night ? 0.05 : 0.08;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(-this.rx * 0.25, -this.ry * 0.35, this.rx * 0.55, this.ry * 0.22, -0.35, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      // the foam line where the water meets the sand
      ctx.globalAlpha = p.night ? 0.3 : 0.55;
      ctx.strokeStyle = p.foam;
      ctx.lineWidth = 2;
      ctx.stroke(shore);
      ctx.globalAlpha = 1;
    }

    const { y0: dy0, y1: dy1, w: dw } = this.dock;
    if (hits([-dw * 3, dy1 - dw * 1.4, dw * 4, dy0 + 10])) this.paintDock(ctx);

    if (mid) {
      for (const [x, y, r] of this.rocks) if (inR(x, y, r * 2)) drawRock(ctx, x, y, r, p.night);
      for (const [x, y, a] of this.reeds) if (inR(x, y, 30)) drawReeds(ctx, x, y, a, p);
      for (const [x, y] of this.lanterns) if (inR(x, y, 16)) drawLanternPost(ctx, x, y, p);
    }

    // each grove tree is planted in a little garden bed ringed with flowers in
    // its subject's colour, so a grove reads as planted even when the colour is
    // close to the forest's greens
    for (const t of this.trees) {
      if (t.kind !== "grove" || !inR(t.x, t.y, t.r * 1.6)) continue;
      const bx = t.x + t.r * 0.12;
      const by = t.y + t.r * 0.16;
      ctx.fillStyle = p.pathEdge;
      ctx.beginPath();
      ctx.ellipse(bx, by, t.r * 1.36, t.r * 1.2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = p.path;
      ctx.beginPath();
      ctx.ellipse(bx, by, t.r * 1.28, t.r * 1.12, 0, 0, TAU);
      ctx.fill();
      const col = t.tint ?? p.flowers[0];
      const k = 9;
      if (!fine) {
        ctx.fillStyle = col;
        ctx.beginPath();
      }
      for (let i = 0; i < k; i++) {
        const a = (i / k) * TAU + hash(t.x + i) * 0.4;
        const fx = bx + Math.cos(a) * t.r * 1.2;
        const fy = by + Math.sin(a) * t.r * 1.04;
        if (fine) drawTinyFlower(ctx, fx, fy, 3.2, col);
        else addCircle(ctx, fx, fy, 3.6);
      }
      if (!fine) ctx.fill();
    }

    // tree shadows, cast to the lower right (light from the upper left); the
    // trees themselves stand up from the ground every frame
    ctx.fillStyle = p.shadow;
    ctx.beginPath();
    for (const t of this.trees) {
      const sx = t.x + t.r * 0.3;
      const sy = t.y + t.r * 0.42;
      if (!inR(sx, sy, t.r)) continue;
      ctx.moveTo(sx + t.r, sy);
      ctx.ellipse(sx, sy, t.r, t.r * 0.86, 0, 0, TAU);
    }
    ctx.fill();
  }

  private paintDock(ctx: CanvasRenderingContext2D) {
    const p = this.pal;
    const { y0, y1, w: dw } = this.dock;
    const endW = dw * 1.7;
    const endH = dw * 0.75;
    const deck = () => {
      ctx.beginPath();
      ctx.rect(-dw / 2, y1 + endH * 0.5, dw, y0 - y1 - endH * 0.5);
      ctx.rect(-endW / 2, y1 - endH * 0.5, endW, endH);
    };
    // shadow on the water
    ctx.save();
    ctx.translate(5, 7);
    ctx.fillStyle = p.shadow;
    deck();
    ctx.fill();
    ctx.restore();
    inked(ctx, deck, p.wood, 2.2, false);
    // planks
    ctx.save();
    deck();
    ctx.clip();
    ctx.strokeStyle = p.woodDark;
    ctx.lineWidth = 1;
    let row = 0;
    for (let y = y1 - endH * 0.5; y < y0; y += 7, row++) {
      if (row % 2) {
        ctx.fillStyle = p.woodLight;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(-endW / 2, y, endW, 7);
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.moveTo(-endW / 2, y);
      ctx.lineTo(endW / 2, y);
      ctx.stroke();
    }
    ctx.restore();
    // posts
    const posts: Pt[] = [
      [-endW / 2, y1 - endH * 0.5], [endW / 2, y1 - endH * 0.5],
      [-endW / 2, y1 + endH * 0.5], [endW / 2, y1 + endH * 0.5],
    ];
    for (let y = y1 + endH; y < y0 - 6; y += 34) posts.push([-dw / 2, y], [dw / 2, y]);
    for (const [x, y] of posts) {
      ctx.fillStyle = p.woodDark;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    // a rowboat tied up beside the end of the dock
    const bx = endW / 2 + dw * 0.75;
    const by = y1 + endH * 0.9;
    ctx.strokeStyle = p.night ? "#8a7a5a" : "#e9dcc0";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(endW / 2, y1 + endH * 0.5);
    ctx.quadraticCurveTo(bx - dw * 0.3, by - dw * 0.1, bx - dw * 0.25, by - dw * 0.55);
    ctx.stroke();
    this.paintBoat(ctx, bx, by, dw);
  }

  private paintBoat(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
    const p = this.pal;
    const L = s * 2.1;
    const W = s * 0.9;
    const hull = (k: number) => {
      ctx.beginPath();
      ctx.moveTo(0, (-L / 2) * k);
      ctx.bezierCurveTo((W / 2) * 1.25 * k, -L * 0.22 * k, (W / 2) * k, L * 0.32 * k, 0, (L / 2) * k);
      ctx.bezierCurveTo((-W / 2) * k, L * 0.32 * k, (-W / 2) * 1.25 * k, -L * 0.22 * k, 0, (-L / 2) * k);
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.22);
    ctx.save();
    ctx.translate(4, 6);
    ctx.fillStyle = p.shadow;
    hull(1);
    ctx.fill();
    ctx.restore();
    inked(ctx, () => hull(1), p.woodDark, 2, false);
    hull(0.8);
    ctx.fillStyle = p.wood;
    ctx.fill();
    ctx.fillStyle = p.woodLight;
    for (const sy of [-0.16, 0.14]) ctx.fillRect(-W * 0.36, L * sy - 2.5, W * 0.72, 5);
    // an oar resting across the seats
    ctx.strokeStyle = p.woodLight;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-W * 0.55, -L * 0.3);
    ctx.lineTo(W * 0.35, L * 0.3);
    ctx.stroke();
    ctx.restore();
  }

  // ── Sprites (one per look and level of detail) ────────────────────────────
  private sprite(key: string, rb: number, size: number, lod: number, paint: (g: CanvasRenderingContext2D) => void): Sprite {
    let sp = this.sprites.get(key);
    if (!sp) {
      const sc = this.ts0 / 2 ** lod;
      const [c, g] = makeCanvas(size * sc, size * sc);
      g.setTransform(sc, 0, 0, sc, (size / 2) * sc, (size / 2) * sc);
      paint(g);
      sp = { c, size, rb };
      this.sprites.set(key, sp);
    }
    return sp;
  }

  private padSprite(spec: GrovePadSpec, bug: boolean, lod: number): Sprite {
    const rb = this.padR * 1.16;
    const night = this.pal.night;
    return this.sprite(`p|${spec.species}|${spec.flower}|${spec.color}|${bug ? 1 : 0}|${lod}`, rb, Math.ceil(rb * 3), lod, (g) => {
      drawGrovePad(g, 0, 0, rb, spec.species, night);
      if (spec.color) drawGroveBloom(g, -rb * 0.06, -rb * 0.06, rb * 0.74, spec.flower, spec.color);
      if (bug) drawLadybug(g, rb * 0.42, -rb * 0.18, Math.max(0.85, rb / 26));
      if (night) nightShade(g, Math.ceil(rb * 3));
    });
  }

  private homeSprite(lod: number): Sprite {
    const r = this.homeR;
    const night = this.pal.night;
    return this.sprite(`home|${lod}`, r, Math.ceil(r * 3), lod, (g) => {
      drawLilyPad(g, { cx: 0, cy: 0, rx: r, ry: r * 0.86, hasFlower: false, opacity: 1, dying: 0 });
      if (night) nightShade(g, Math.ceil(r * 3));
    });
  }

  private treeSprite(t: Tree, lod: number): Sprite {
    const rb = t.kind === "bush" ? 20 : 40;
    const p = this.pal;
    const detail = lod <= 2;
    return this.sprite(`t|${t.kind}|${t.v}|${t.tint ?? ""}|${lod}`, rb, Math.ceil(rb * 2.5), lod, (g) => {
      const seed = t.v * 7919 + KIND_SEED[t.kind];
      if (t.kind === "pine") drawPineTop(g, 0, 0, rb, seed, p.pine, detail);
      else if (t.kind === "grove") {
        // a flowering tree in its subject's colour
        const leaf = leafFrom(t.tint ?? "#6a9451", p.night);
        drawCanopy(g, 0, 0, rb, seed, leaf, detail);
        drawBushBlooms(g, 0, 0, rb * 0.9, seed, p.night ? "#d8d2c0" : "#fffaf0");
      } else {
        drawCanopy(g, 0, 0, rb, seed, t.kind === "blossom" ? p.blossom : t.kind === "bush" ? p.bush : p.leaf, detail);
        if (t.tint) drawBushBlooms(g, 0, 0, rb, seed, t.tint);
      }
    });
  }

  // ── A frame ───────────────────────────────────────────────────────────────
  /** Draws a frame, spending up to `budgetMs` painting missing ground tiles. */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, now: number, showHavi: boolean, budgetMs: number): void {
    if (!this.base) return;
    const { w, h, dpr, reducedMotion: rm } = this.inp;
    const p = this.pal;
    const t = rm ? 0 : now;
    this.frameNo++;
    const lod = this.lodFor(cam.s);
    this.paintTiles(cam, lod, budgetMs);
    const view = this.viewBox(cam);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = p.floor;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(cam.rot);
    ctx.scale(cam.s, cam.s);
    ctx.translate(-cam.x, -cam.y);
    this.drawGround(ctx, cam, lod);
    this.drawWater(ctx, t, now, view);
    this.drawPads(ctx, t, cam, view, Math.min(lod, 4));
    this.drawHome(ctx, now, showHavi, Math.min(lod, 4));
    this.drawTrees(ctx, t, cam, view, Math.min(lod, 4), rm);
    this.drawAir(ctx, t, rm, cam, view);
    ctx.restore();
    if (showHavi) this.drawHaviMarker(ctx, cam, t);

    // light for the time of day, then a soft vignette
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (p.tint) {
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = p.tint;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    }
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, p.night ? "rgba(2,10,8,0.5)" : "rgba(8,28,22,0.3)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  /** A veil of the sky's colour over the ground (see `hazeAlpha`). */
  drawHaze(ctx: CanvasRenderingContext2D, alpha: number): void {
    if (alpha <= 0.001) return;
    const { w, h, dpr } = this.inp;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.pal.haze;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  private drawWater(ctx: CanvasRenderingContext2D, t: number, now: number, v: Box) {
    const p = this.pal;
    const inV = (x: number, y: number, m: number) => x > v[0] - m && x < v[2] + m && y > v[1] - m && y < v[3] + m;
    // ripples where the student tapped
    this.ripples = this.ripples.filter((r) => now - r.t0 < 1300);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = p.night ? "#b8f0d8" : "#ffffff";
    for (const r of this.ripples) {
      const age = (now - r.t0) / 1300;
      for (let i = 0; i < 2; i++) {
        const a = age - i * 0.18;
        if (a <= 0) continue;
        ctx.globalAlpha = (1 - a) * 0.7;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, 4 + a * 44, (4 + a * 44) * 0.8, 0, 0, TAU);
        ctx.stroke();
      }
    }
    // rings spreading out from Havi's pad
    const rp = (t * 0.00032) % 1;
    for (let i = 0; i < 2; i++) {
      const fr = (rp + i / 2) % 1;
      const rr = this.homeR * (1.1 + fr * 1.7);
      ctx.globalAlpha = (1 - fr) * (p.night ? 0.3 : 0.26);
      ctx.beginPath();
      ctx.ellipse(0, 0, rr, rr * 0.88, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // koi gliding under the surface (under the pads)
    for (const k of this.koi) {
      const th = k.ph + t * k.sp;
      const x = k.cx + k.ax * Math.cos(th) + Math.sin(t * 0.0007 + k.seed) * 10;
      const y = k.cy + k.ay * Math.sin(th);
      if (!inV(x, y, k.len)) continue;
      const ang = Math.atan2(k.ay * Math.cos(th) * k.sp, -k.ax * Math.sin(th) * k.sp);
      drawKoi(ctx, x, y, ang, k.len, t, k.seed, k.body, k.patch, p.night);
    }

    // little wind ripples drifting across the water, each fading in and out
    ctx.strokeStyle = p.night ? "#bff0d8" : "#ffffff";
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    for (const [x0, y0, ph] of this.dashes) {
      if (!inV(x0, y0, 50)) continue;
      const life = (t * 0.00011 + ph) % 1;
      const a = Math.sin(life * Math.PI);
      if (a < 0.05) continue;
      const x = x0 + life * 28;
      const L = 7 + ph * 11;
      ctx.globalAlpha = a * (p.night ? 0.2 : 0.34);
      ctx.beginPath();
      ctx.moveTo(x - L, y0);
      ctx.quadraticCurveTo(x, y0 - 3.5, x + L, y0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // the surface: sun glints by day, the moon's reflection + stars by night
    if (!p.night) {
      ctx.fillStyle = "#ffffff";
      for (const [x, y, ph] of this.glints) {
        if (!inV(x, y, 8)) continue;
        const tw = Math.sin(t * 0.0021 + ph * 40);
        if (tw < 0.6) continue;
        const a = (tw - 0.6) / 0.4;
        ctx.globalAlpha = a * 0.9;
        sparkle(ctx, x, y, 2.5 + a * 3.5);
      }
    } else {
      // the moon's reflection, a little way from Havi
      const R = this.padR * 3.4;
      const mx = this.padR * 4.6;
      const my = -this.padR * 4;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, R);
      mg.addColorStop(0, "rgba(250,230,160,0.34)");
      mg.addColorStop(1, "rgba(250,230,160,0)");
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(mx, my, R, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(252,236,180,0.7)";
      ctx.lineCap = "round";
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const off = Math.sin(t * 0.0015 + i * 1.3) * 4;
        const ww = (1 - Math.abs(i - 2) / 3) * R * 0.35;
        ctx.globalAlpha = 0.5 + Math.sin(t * 0.002 + i) * 0.2;
        ctx.beginPath();
        ctx.moveTo(mx - ww + off, my + (i - 2) * 7);
        ctx.lineTo(mx + ww + off, my + (i - 2) * 7);
        ctx.stroke();
      }
      ctx.fillStyle = "#f7efc8";
      for (const [x, y, ph] of this.glints) {
        if (!inV(x, y, 4)) continue;
        ctx.globalAlpha = 0.25 + (Math.sin(t * 0.003 + ph * 30) * 0.5 + 0.5) * 0.55;
        ctx.beginPath();
        ctx.arc(x, y, 1.3, 0, TAU);
        ctx.fill();
      }
    }
    // the foam line breathing against the sand (two lines trading places)
    const b = Math.sin(t * 0.0011) * 0.5 + 0.5;
    ctx.strokeStyle = p.foam;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = (p.night ? 0.2 : 0.35) * b;
    ctx.stroke(this.shoreAt(-2.5));
    ctx.globalAlpha = (p.night ? 0.2 : 0.35) * (1 - b);
    ctx.stroke(this.shoreAt(-5));
    ctx.globalAlpha = 1;
  }

  private drawPads(ctx: CanvasRenderingContext2D, t: number, cam: Camera, v: Box, lod: number) {
    const m = this.padR * 2;
    const still = cam.s < 0.3; // too far away to see them bob
    const fk = this.filterKey;
    for (const pd of this.pads) {
      if (pd.x < v[0] - m || pd.x > v[2] + m || pd.y < v[1] - m || pd.y > v[3] + m) continue;
      const sp = ((pd.sp ??= [])[lod] ??= this.padSprite(pd.spec, pd.bug, lod));
      const size = sp.size * (pd.r / sp.rb);
      ctx.globalAlpha = fk && pd.spec.key !== fk ? 0.16 : 1;
      if (still) {
        ctx.drawImage(sp.c, pd.x - size / 2, pd.y - size / 2, size, size);
        continue;
      }
      ctx.save();
      ctx.translate(pd.x, pd.y + Math.sin(t * 0.0012 + pd.seed * 1.7) * 1.4);
      ctx.rotate(Math.sin(t * 0.0004 + pd.seed) * 0.06);
      ctx.drawImage(sp.c, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawHome(ctx: CanvasRenderingContext2D, now: number, showHavi: boolean, lod: number) {
    const { c, size } = this.homeSprite(lod);
    ctx.drawImage(c, -size / 2, -size / 2, size, size);
    if (!showHavi) return;
    const mood = now < this.reactUntil ? "celebrating" : "idle";
    const scale = clamp(this.homeR / 44, 0.62, 1.3);
    drawGroveHavi(ctx, 0, -this.homeR * 0.12, scale, Math.floor(now / 66), mood);
  }

  // The trees stand up from the ground: each leans out from the middle of the
  // view as if seen by a real camera (taller trees more), and sways in the wind.
  private drawTrees(ctx: CanvasRenderingContext2D, t: number, cam: Camera, v: Box, lod: number, rm: boolean) {
    const m = this.padR * 3;
    const list = this.trees;
    // trees are sorted by y: find the first one in view
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].y < v[1] - m) lo = mid + 1;
      else hi = mid;
    }
    const sway = !rm && cam.s > 0.3;
    for (let i = lo; i < list.length; i++) {
      const tr = list[i];
      if (tr.y > v[3] + m) break;
      if (tr.x < v[0] - m || tr.x > v[2] + m) continue;
      const sp = ((tr.sp ??= [])[lod] ??= this.treeSprite(tr, lod));
      const k = 1 / (1 - tr.z * cam.s);
      let x = cam.x + (tr.x - cam.x) * k;
      let y = cam.y + (tr.y - cam.y) * k;
      if (sway) {
        const gust = 0.55 + 0.45 * Math.sin(t * 0.00045 - (tr.x + tr.y) * 0.0016);
        const a = (tr.r / 40) * 1.1 * gust;
        x += Math.sin(t * 0.0011 + tr.x * 0.013) * a;
        y += Math.cos(t * 0.0009 + tr.y * 0.011) * a * 0.6;
      }
      const size = sp.size * (tr.r / sp.rb) * k;
      ctx.drawImage(sp.c, x - size / 2, y - size / 2, size, size);
    }
  }

  private drawAir(ctx: CanvasRenderingContext2D, t: number, rm: boolean, cam: Camera, v: Box) {
    const p = this.pal;
    const tick = t / 66;
    const inV = (x: number, y: number, m: number) => x > v[0] - m && x < v[2] + m && y > v[1] - m && y < v[3] + m;
    if (p.night) {
      // lanterns glow, fireflies drift along the shore
      ctx.globalCompositeOperation = "lighter";
      this.lanterns.forEach(([x, y], i) => {
        if (!inV(x, y, 60)) return;
        const fl = 0.85 + Math.sin(t * 0.013 + i) * 0.08 + Math.sin(t * 0.031 + i * 2) * 0.05;
        drawGlow(ctx, x, y, 58, 0.42 * fl, "255,200,110");
      });
      const n = rm ? Math.ceil(this.fireflies / 3) : this.fireflies;
      for (let i = 0; i < n; i++) {
        const a = hash(i * 3.1) * TAU + t * 0.00004 * (i % 2 ? 1 : -1);
        const [bx, by] = this.shorePoint(a, (hash(i * 7.7) - 0.35) * this.meadow);
        const x = bx + Math.sin(t * 0.0011 + i * 1.7) * 16;
        const y = by + Math.cos(t * 0.0009 + i * 2.3) * 12;
        if (!inV(x, y, 10)) continue;
        const pulse = 0.3 + (Math.sin(t * 0.004 + i * 2.1) * 0.5 + 0.5) * 0.65;
        drawGlow(ctx, x, y, 8, pulse, "200,255,170");
      }
      ctx.globalCompositeOperation = "source-over";
    } else if (!rm) {
      // butterflies over the meadow, cloud shadows sliding across, birds passing
      for (let i = 0; i < this.flutters; i++) {
        const a = (i / this.flutters) * TAU + i * 0.7 + t * 0.00011 * (i % 2 ? 1 : -1) * (340 / Math.max(340, this.rx));
        const [x, y] = this.shorePoint(a, this.band + 26 + Math.sin(t * 0.001 + i) * 16);
        if (!inV(x, y, 20)) continue;
        drawButterfly(ctx, x, y + Math.sin(t * 0.004 + i) * 5, tick, i * 2.5, BUTTERFLIES[i % BUTTERFLIES.length]);
      }
      this.drawCloudShadows(ctx, t, v);
      this.drawBirds(ctx, t, cam);
    }
    if (!rm) {
      // a dragonfly patrolling round Havi
      const th = t * 0.0003;
      const ax = this.padR * 6;
      const ay = this.padR * 4.6;
      const x = Math.cos(th) * ax;
      const y = Math.sin(th * 1.3) * ay;
      const ang = Math.atan2(Math.cos(th * 1.3) * ay * 1.3, -Math.sin(th) * ax);
      drawDragonfly(ctx, x, y, ang, tick, p.night);
    }
  }

  private drawCloudShadows(ctx: CanvasRenderingContext2D, t: number, v: Box) {
    const sp = this.cloudShadow;
    if (!sp) return;
    const size = Math.max(this.inp.w, this.inp.h) * 0.6;
    const span = 2 * (Math.max(this.cx, this.cy) + Math.max(this.inp.w, this.inp.h));
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.5;
    for (const [x0, y, sp2] of this.cloudShadows) {
      const x = mod(x0 + t * 0.011 * sp2, span) - span / 2;
      if (x + size / 2 < v[0] || x - size / 2 > v[2] || y + size / 2 < v[1] || y - size / 2 > v[3]) continue;
      ctx.drawImage(sp, x - size / 2, y - size * 0.35, size, size * 0.7);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private drawBirds(ctx: CanvasRenderingContext2D, t: number, cam: Camera) {
    const PERIOD = 17000;
    const FLIGHT = 7000;
    const cyc = Math.floor(t / PERIOD);
    const q = (t % PERIOD) / FLIGHT;
    if (q > 1) return;
    const r = rng(cyc * 7 + 3);
    const ang = -0.5 + r() * 1.0 + (r() < 0.5 ? Math.PI : 0);
    const { w, h } = this.inp;
    const view = Math.hypot(w, h) / 2 / cam.s;
    const span = view * 1.2;
    const k = Math.max(1, 0.7 / cam.s); // birds fly high: they stay a readable size
    const hx = Math.cos(ang);
    const hy = Math.sin(ang);
    const off = (r() - 0.5) * (h / cam.s) * 0.5;
    const cx0 = cam.x - hx * span - hy * off;
    const cy0 = cam.y - hy * span + hx * off;
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const row = Math.ceil(i / 2);
      const side = i % 2 ? 1 : -1;
      const x = cx0 + hx * span * 2 * q - (hx * row * 22 + hy * side * row * 18) * k;
      const y = cy0 + hy * span * 2 * q - (hy * row * 22 - hx * side * row * 18) * k;
      drawBird(ctx, x + 30 * k, y + 44 * k, ang, t + i * 90, this.pal.shadow, 0.9 * k);
      drawBird(ctx, x, y, ang, t + i * 90, "#f6f4ee", k);
    }
  }

  // From high up, a soft pulsing ring shows where Havi is.
  private drawHaviMarker(ctx: CanvasRenderingContext2D, cam: Camera, t: number) {
    const a = smooth(0.5, 0.3, cam.s);
    if (a <= 0.01) return;
    const { w, h, dpr } = this.inp;
    const dx = -cam.x * cam.s;
    const dy = (-this.homeR * 0.1 - cam.y) * cam.s;
    const c = Math.cos(cam.rot);
    const s = Math.sin(cam.rot);
    const x = w / 2 + dx * c - dy * s;
    const y = h / 2 + dx * s + dy * c;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const q = (t * 0.0008) % 1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.globalAlpha = a * (1 - q) * 0.75;
    ctx.beginPath();
    ctx.arc(x, y, 11 + q * 16, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = a * 0.9;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// ── The sky: the dive's clouds, and thin clouds below the highest zoom level ──
// Clouds hang at heights z (in camera-altitude units, the ground is 0); one at
// height z is drawn at scale 1 / (A − z) while the camera is at altitude A > z.
// A dive cloud hangs around the point the camera passes when it falls to the
// cloud's height (ax, ay), offset by (dx, dy); the offset widens as they part.
interface Cloud { ax: number; ay: number; dx: number; dy: number; z: number; r: number; sprite: number; ang: number }
interface Wisp { x: number; y: number; r: number; sprite: number; ang: number; v: number }

export class Sky {
  private sprites: HTMLCanvasElement[] = [];
  private clouds: Cloud[] = [];
  private wisps: Wisp[] = [];
  private wispZ = 0;
  private wispRoom = 1;
  private wispSpan = 1;
  private f = 1; // how much higher than usual the dive starts
  private night = false;

  /** `camAt(A)` = where the dive camera is at altitude A, `top` = the altitude
   *  it starts at (see LakeWorld). */
  build(w: number, h: number, night: boolean, camAt: (A: number) => Pt, top: number, levels: number[]): void {
    if (!this.sprites.length || night !== this.night) {
      for (const c of this.sprites) release(c);
      this.sprites = [0, 1, 2, 3, 4].map((i) => cloudSprite(i, night));
      this.night = night;
    }
    const r = rng(99);
    const M = Math.max(w, h);
    // the cloud layers were tuned for a dive from altitude 1/S0; a higher dive
    // scales them all up alike, so the sky looks the same on the way down
    const f = (this.f = top * S0);
    const cs: Cloud[] = [];
    const add = (count: number, dMin: number, dMax: number, zMin: number, zMax: number, rMin: number, rMax: number) => {
      for (let i = 0; i < count; i++) {
        const a = r() * TAU;
        const d = (dMin + r() * (dMax - dMin)) * f;
        const z = (zMin + r() * (zMax - zMin)) * f;
        const [ax, ay] = camAt(z + 0.3 * f);
        // spread to the screen's shape, so a tall phone gets clouds too
        const cr = M * (rMin + r() * (rMax - rMin)) * f;
        cs.push({ ax, ay, dx: Math.cos(a) * d * w, dy: Math.sin(a) * d * h, z, r: cr, sprite: i % 5, ang: r() * TAU });
      }
    };
    add(12, 0, 0.25, 2.75, 3.2, 0.2, 0.32); // a thick layer: the dive starts inside it
    add(22, 0.08, 0.55, 1.2, 2.6, 0.14, 0.26); // open sky the camera falls past
    add(9, 0.25, 0.6, 0.4, 1.1, 0.08, 0.14); // low wisps that part and slide off the edges
    this.clouds = cs;

    // thin clouds halfway between the two highest zoom levels: the camera rises
    // through them into the top view and they drift slowly below it there
    const A1 = 1 / levels[Math.max(0, levels.length - 2)];
    const A2 = 1 / levels[levels.length - 1];
    this.wispZ = (A1 + A2) / 2;
    this.wispRoom = Math.max(0.05, A2 - this.wispZ);
    this.wispSpan = w * this.wispRoom * 1.1;
    const rw = rng(57);
    this.wisps = Array.from({ length: 7 }, (_, i) => ({
      x: (rw() - 0.5) * 2 * this.wispSpan,
      y: (rw() - 0.5) * h * this.wispRoom * 1.6,
      r: M * this.wispRoom * (0.2 + rw() * 0.16),
      sprite: i % 5,
      ang: rw() * TAU,
      v: this.wispRoom * 0.01 * (0.6 + rw() * 0.8),
    }));
  }

  dispose(): void {
    for (const c of this.sprites) release(c);
    this.sprites = [];
  }

  drawDive(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, cam: Camera, p: number): void {
    const A = 1 / cam.s;
    const part = 1 + easeOutCubic(p) * 1.1; // the clouds drift apart as we fall through
    const fadeAll = 1 - smooth(0.8, 1, p);
    if (fadeAll <= 0) return;
    const reach = Math.hypot(w, h) / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(cam.rot);
    const order = this.clouds
      .map((c) => ({ c, d: A - c.z }))
      .filter((o) => o.d > 0.05 * this.f)
      .sort((a, b) => b.d - a.d);
    for (const { c, d } of order) {
      const alpha = smooth(0.05 * this.f, 0.3 * this.f, d) * fadeAll;
      if (alpha < 0.01) continue;
      const k = 1 / d;
      const x = (c.ax + c.dx * part - cam.x) * k;
      const y = (c.ay + c.dy * part - cam.y) * k;
      const size = c.r * 2 * k;
      if (Math.hypot(x, y) - size * 0.5 > reach) continue;
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(c.ang);
      ctx.drawImage(this.sprites[c.sprite], -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawWisps(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, cam: Camera, t: number): void {
    const d = 1 / cam.s - this.wispZ;
    if (!this.wisps.length || d <= 0.01) return;
    const k = 1 / d;
    const alpha = smooth(0.01, this.wispRoom * 0.7, d) * (this.night ? 0.3 : 0.42);
    if (alpha < 0.01) return;
    const S = this.wispSpan;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(cam.rot);
    ctx.globalAlpha = alpha;
    for (const c of this.wisps) {
      const wx = mod(c.x + t * c.v + S, 2 * S) - S;
      const x = (wx - cam.x) * k;
      const y = (c.y - cam.y) * k;
      const size = c.r * 2 * k;
      if (Math.abs(x) - size / 2 > w || Math.abs(y) - size / 2 > h) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(c.ang);
      ctx.drawImage(this.sprites[c.sprite], -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// A cumulus seen from above: soft puffs with a feathered edge, shaded on the
// lower right where the cloud sits in its own shadow.
function cloudSprite(seed: number, night: boolean): HTMLCanvasElement {
  const S = 320;
  const [c, g] = makeCanvas(S, S);
  const r = rng(200 + seed);
  const base = night ? "148,163,182" : "255,255,255";
  // puffs strung along the cloud's length, fattest in the middle
  for (let i = 0; i < 20; i++) {
    const t = r();
    const mid = 1.2 - Math.abs(t - 0.5);
    const x = S / 2 + (t - 0.5) * S * 0.5 + (r() - 0.5) * S * 0.08;
    const y = S / 2 + (r() - 0.5) * S * 0.24 * mid;
    const pr = S * (0.06 + r() * 0.07) * mid;
    const gr = g.createRadialGradient(x, y, pr * 0.25, x, y, pr);
    gr.addColorStop(0, `rgba(${base},1)`);
    gr.addColorStop(0.65, `rgba(${base},0.85)`);
    gr.addColorStop(1, `rgba(${base},0)`);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, pr, 0, TAU);
    g.fill();
  }
  g.globalCompositeOperation = "source-atop";
  const sh = g.createLinearGradient(S * 0.25, S * 0.2, S * 0.8, S * 0.85);
  sh.addColorStop(0, "rgba(255,255,255,0)");
  sh.addColorStop(1, night ? "rgba(52,66,90,0.6)" : "rgba(160,182,205,0.55)");
  g.fillStyle = sh;
  g.fillRect(0, 0, S, S);
  return c;
}

// A soft, dark blob for cloud shadows sliding over the land (multiplied).
function cloudShadowSprite(): HTMLCanvasElement {
  const S = 256;
  const [c, g] = makeCanvas(S, S);
  const r = rng(77);
  for (let i = 0; i < 9; i++) {
    const x = S / 2 + (r() - 0.5) * S * 0.4;
    const y = S / 2 + (r() - 0.5) * S * 0.3;
    const pr = S * (0.14 + r() * 0.1);
    const gr = g.createRadialGradient(x, y, 0, x, y, pr);
    gr.addColorStop(0, "rgba(40,70,70,0.32)");
    gr.addColorStop(1, "rgba(40,70,70,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, pr, 0, TAU);
    g.fill();
  }
  return c;
}

// ── Small drawing helpers ────────────────────────────────────────────────────
// Dims a pad sprite for the night so its cream outline doesn't glow on dark water.
function nightShade(g: CanvasRenderingContext2D, size: number) {
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = "rgba(8,26,34,0.34)";
  g.fillRect(-size / 2, -size / 2, size, size);
  g.globalCompositeOperation = "source-over";
}

function strokePoly(ctx: CanvasRenderingContext2D, pts: Pt[], color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

export function drawTinyFlower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    addCircle(ctx, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5);
  }
  ctx.fill();
  ctx.fillStyle = "#f2c94c";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.3, 0, TAU);
  ctx.fill();
}

// A round tree crown seen from above: a cluster of puffs with one ink outline
// around the whole shape, lit from the upper left.
export function drawCanopy(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, col: Leaf, detail: boolean) {
  const n = 5 + Math.floor(hash(seed) * 3);
  const puffs: Array<[number, number, number]> = [[0, 0, r * 0.6]];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash(seed + i + 1) * 0.6;
    const d = r * (0.4 + hash(seed + i + 20) * 0.14);
    puffs.push([Math.cos(a) * d, Math.sin(a) * d, r * (0.36 + hash(seed + i + 40) * 0.14)]);
  }
  const fillPuffs = (color: string, dx: number, dy: number, k: number, grow = 0, every = 1) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    puffs.forEach(([px, py, pr], i) => {
      if (i % every === 0) addCircle(ctx, x + px + pr * dx, y + py + pr * dy, pr * k + grow);
    });
    ctx.fill();
  };
  if (detail) fillPuffs(INK, 0, 0, 1, 1.8);
  fillPuffs(col.dark, 0, 0, 1);
  fillPuffs(col.mid, -0.14, -0.16, 0.76);
  fillPuffs(col.light, -0.34, -0.36, 0.34, 0, 2);
  if (detail) {
    // leafy flecks on the shaded side
    ctx.strokeStyle = col.deep;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [px, py, pr] of puffs) {
      const cx = x + px + pr * 0.18;
      const cy = y + py + pr * 0.18;
      ctx.moveTo(cx + Math.cos(0.2) * pr * 0.55, cy + Math.sin(0.2) * pr * 0.55);
      ctx.arc(cx, cy, pr * 0.55, 0.2, 1.4);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// A pine seen from above: stacked star-shaped tiers of needles.
function drawPineTop(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, col: Leaf, detail: boolean) {
  const rot = hash(seed) * TAU;
  const tiers: Array<[number, string]> = [[1, col.dark], [0.72, col.mid], [0.44, col.light]];
  for (const [k, c] of tiers) {
    const n = 9;
    ctx.beginPath();
    for (let i = 0; i <= n * 2; i++) {
      const a = rot + k * 0.7 + (i / (n * 2)) * TAU;
      const rr = i % 2 ? r * k * 0.64 : r * k;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    if (detail && k === 1) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  }
  ctx.fillStyle = col.deep;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.1, 0, TAU);
  ctx.fill();
}

// Little blooms dotted over a canopy.
export function drawBushBlooms(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, col: string) {
  for (let i = 0; i < 6; i++) {
    const a = hash(seed + i * 5) * TAU;
    const d = r * (0.15 + hash(seed + i * 9) * 0.55);
    drawTinyFlower(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(2, r * 0.13), col);
  }
}

// A clump of reeds with cattails, seen from above.
function drawReeds(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, p: Pal) {
  ctx.lineCap = "round";
  for (let i = 0; i < 11; i++) {
    const ang = a + Math.PI + (hash(x + i) - 0.5) * 2.6;
    const len = 12 + hash(y + i * 3) * 12;
    ctx.strokeStyle = i % 2 ? p.reed : p.reedHi;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(ang + 0.3) * len * 0.5, y + Math.sin(ang + 0.3) * len * 0.5, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
    if (i % 4 === 0) {
      ctx.fillStyle = p.cattail;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(ang) * len, y + Math.sin(ang) * len, 3.4, 1.8, ang, 0, TAU);
      ctx.fill();
    }
  }
}

// A lantern post seen from above: a little roof with a window of light.
function drawLanternPost(ctx: CanvasRenderingContext2D, x: number, y: number, p: Pal) {
  ctx.fillStyle = p.shadow;
  ctx.beginPath();
  ctx.ellipse(x + 5, y + 7, 7, 5, 0, 0, TAU);
  ctx.fill();
  inked(ctx, () => {
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 6, 12, 12, 3);
  }, p.woodDark, 1.6, false);
  ctx.fillStyle = p.night ? "#ffd98a" : "#efe2b8";
  ctx.fillRect(x - 3, y - 3, 6, 6);
}

// A koi seen from above: a tapered body, a waving tail and a couple of patches.
function drawKoi(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, L: number, t: number, seed: number, body: string, patch: string, night: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha = night ? 0.6 : 0.92;
  // its shadow on the lake bed
  ctx.fillStyle = "rgba(6,28,30,0.4)";
  ctx.beginPath();
  ctx.ellipse(-L * 0.05 + 3, 5, L * 0.46, L * 0.13, 0, 0, TAU);
  ctx.fill();
  const wig = Math.sin(t * 0.009 + seed) * 0.4;
  ctx.save();
  ctx.translate(-L * 0.32, 0);
  ctx.rotate(wig);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-L * 0.16, -L * 0.2, -L * 0.3, -L * 0.15);
  ctx.quadraticCurveTo(-L * 0.2, 0, -L * 0.3, L * 0.15);
  ctx.quadraticCurveTo(-L * 0.16, L * 0.2, 0, 0);
  ctx.fill();
  ctx.restore();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(L * 0.16, s * L * 0.13, L * 0.08, L * 0.035, s * 0.7, 0, TAU);
    ctx.fill();
  }
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(L * 0.5, 0);
    ctx.bezierCurveTo(L * 0.46, -L * 0.15, L * 0.08, -L * 0.17, -L * 0.34, -L * 0.04);
    ctx.lineTo(-L * 0.34, L * 0.04);
    ctx.bezierCurveTo(L * 0.08, L * 0.17, L * 0.46, L * 0.15, L * 0.5, 0);
    ctx.closePath();
  };
  bodyPath();
  ctx.fill();
  ctx.save();
  bodyPath();
  ctx.clip();
  ctx.fillStyle = patch;
  ctx.beginPath();
  ctx.ellipse(L * 0.14, -L * 0.05, L * 0.14, L * 0.09, 0.3, 0, TAU);
  ctx.ellipse(-L * 0.14, L * 0.05, L * 0.1, L * 0.07, -0.2, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// A bird gliding with flapping wings (its shadow is the same shape, darker).
function drawBird(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, t: number, col: string, k: number) {
  const span = 11 * (0.65 + Math.abs(Math.cos(t * 0.012)) * 0.35);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(k, k);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 2.2, 0, 0, TAU);
  for (const s of [-1, 1]) {
    ctx.moveTo(2, 0);
    ctx.quadraticCurveTo(-1, s * span * 0.6, -5, s * span);
    ctx.quadraticCurveTo(-2, s * span * 0.4, -3, 0);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}
