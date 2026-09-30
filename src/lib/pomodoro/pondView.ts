// The pond window at the top of the Pomodoro page: the shore of the student's
// lake seen from the side, the same place as "your lake" (lakeWorld.ts), with
// its colours, trees, dock and subject groves. Pure canvas, no React.
//
// Back to front: the sky (sun or moon, stars, clouds, birds), two hazy ridges,
// the far bank (a forest, the student's subject groves, the dock with its
// rowboat, lanterns and reeds), painted once into a strip that repeats as the
// camera travels, then the water. The water mirrors everything above it,
// rippled and fading with depth, carries a path of light under the sun or moon,
// and drifting ripples in perspective. On it floats one lily pad per finished
// focus session, in a row with the reading direction (left → right, right → left
// in Arabic: the whole scene is mirrored, the timer and Havi aren't), with Havi
// on the newest. While a session runs, the next pad rises from the water with
// the timer; near the end a bud in the subject's colour comes up on it, and it
// opens once the session is done.
// Near reeds pass in front and leaves hang into the top corners. Every layer
// moves at its own speed with the camera and the mouse, so the scene has depth.
//
// Light follows the real clock: the land and the pads take the lake's morning,
// evening and night light. Havi himself is never tinted.
//
// The window fills the page, and the timer is written into its sky: big
// numerals in the time of day's ink with a soft halo, a thin line that fills
// with the session (a small light at its head), a line of state under it, and
// the numerals mirrored faintly in the water. The sun or moon keeps clear of it.

import { SKY_PALETTES, type SkyPalette, type TimeOfDay } from "./timeOfDay";
import {
  INK,
  inked,
  drawLilyPad,
  drawHaviSprite,
  drawButterfly,
  drawDragonfly,
  type HaviMood,
  type GrovePadSpec,
} from "./pondRenderer";
import { clamp, smooth, hash, lerp, mod, easeInOut, mixColor } from "./math";
import {
  makeCanvas,
  release,
  drawGlow,
  lakePalette,
  leafFrom,
  groveList,
  type Grove,
  drawCanopy,
  drawBushBlooms,
  drawTinyFlower,
  type Pal,
  type Leaf,
} from "./lakeWorld";

export interface PondInput {
  w: number; // window, CSS px
  h: number;
  dpr: number;
  tod: TimeOfDay;
  padSpecs: GrovePadSpec[]; // the subject of each recorded session, oldest first
  count: number; // finished focus sessions (one pad each, after the home pad)
  haviPad: number; // the far bank is laid out so its groves face this pad
  reducedMotion: boolean;
  rtl: boolean; // the row runs right → left
}

export interface TrailPad {
  i: number; // 0 = the home pad, then one per session
  alpha: number;
  grow: number; // size while it rises from the water, 0..1
  dying: number; // 0..1 while an abandoned pad browns and sinks
  bud: number; // a bud in its subject's colour comes up, 0..1
  open: number; // …and opens, 0..1
  color?: string | null; // the pad being grown: the subject studied right now
}

export interface PondFrame {
  now: number; // ms (the animation clock)
  tick: number; // Havi's pixel animation step, 15 a second
  camX: number; // world x at the window's left edge
  look: number; // mouse look-around, −1..1
  pads: TrailPad[];
  havi: { pad: number; jump: { from: number; to: number; p: number } | null; mood: HaviMood; fish: number } | null;
  rise: number; // 0..1 the camera rises into the clouds (opening "your lake")
  hud: PondHud | null;
}

/** The timer written into the sky. */
export interface PondHud {
  clock: string; // "25:00"
  progress: number; // 0..1 along the line
  label: string; // under the line: "الجلسة 1 من 4", "استراحة قصيرة"…
  color: string | null; // the line's colour (the subject's), else the sky's ink
  dim: boolean; // paused: the numerals rest at half strength
  pulse: number; // 0..1 a swell of light through the numerals (a session done)
}

/** Where the timer sits, in CSS px from the window's top. */
export interface HudBox {
  top: number; // the numerals' band
  cy: number;
  size: number; // font size of the numerals
  width: number;
  lineY: number;
  labelY: number;
  label: number; // font size of the line of state
  chipTop: number; // where the page puts its task chip, under the timer
}

// ── Tunables ────────────────────────────────────────────────────────────────
const HORIZON = 0.47; // the far bank meets the water this far down the window (room for the timer above)
const FIRST = 170; // the home pad's x (× u)
const SPACING = 250; // from one pad to the next (× u)
// how far each layer moves with the camera (the pads = 1); the sun, moon and
// stars are infinitely far, so they only follow the look-around
const P_CLOUD = 0.05;
const P_FAR = 0.07;
const P_NEAR = 0.13;
const P_BANK = 0.25;
const P_FRONT = 1.3;
const LOOK = 16; // look-around reach at the pads (× u)
const HAVI_PX = 3; // one of Havi's sprite pixels (× u); he is 28 × 21 of them
const FLOWER = 19; // a pad's flower (× u)…
const FLOWER_X = 0.55; // …at the back right of the pad, clear of Havi and the slit
const FLOWER_Y = 0.2;
const BANK_H = 84; // height of the far-bank strip above the water (× u)
const MAX_STRIP_PX = 8192; // widest strip canvas, device px
const BANK_FADE_MS = 1500; // the bank cross-fades when a grove grows
const FADE_MS = 1500; // the whole window cross-fades when the time of day turns
// the timer in the sky
const HUD_TOP = 60; // room for the page's buttons along the top
const HUD_CHIP = 38; // the page's task chip under the timer…
const HUD_CHIP_GAP = 12; // …and the space above it
const DIGIT = 0.6; // each digit's box (× the font size), so they never shift
const COLON = 0.3;
const NUM_BAND = 0.74; // the numerals' band (× the font size)
const REFLECT_AT = 0.5; // the numerals' reflection: how far down the water…
const REFLECT_SQUASH = 0.55; // …and how flat
const NUM_FONT = 'Fraunces, Georgia, "Times New Roman", serif';
const LABEL_FONT = 'Tajawal, "IBM Plex Sans Arabic", Inter, "Segoe UI", sans-serif';
const TAU = Math.PI * 2;


// A cartoon cloud: rounded puffs under one ink outline and a cream halo.
const CLOUD_PUFFS: Array<[number, number, number, number]> = [
  [0, 0, 34, 20],
  [-30, 6, 22, 15],
  [30, 6, 24, 16],
  [6, -10, 20, 15],
];

interface PadSprite { c: HTMLCanvasElement; ox: number; oy: number; w: number; h: number; rb: number }
interface Cloud { c: HTMLCanvasElement; x: number; y: number; w: number; h: number; v: number }
interface Corner { c: HTMLCanvasElement; w: number; h: number; right: boolean; seed: number }
interface Strip { c: HTMLCanvasElement; P: number; phase: number; lanterns: Array<[number, number]> }

export class PondView {
  /** Scene scale: 1 on a desktop window, smaller on a phone. */
  u = 1;
  /** Where Havi sits across the window (0..1), so the next pad stays in view. */
  anchor = 0.36;

  private inp!: PondInput;
  private hz = 0; // where the far bank meets the water
  private padY0 = 0;
  private pal!: Pal;
  private sky!: SkyPalette;
  private light: string | null = null; // the time of day's light over the land and pads
  private groveSig = "";
  private above?: HTMLCanvasElement; // everything above the water, redrawn each frame
  private aCtx?: CanvasRenderingContext2D;
  private strip?: Strip;
  private oldStrip?: Strip & { t0: number };
  private stars: Array<[number, number, number]> = [];
  private bigStars: Array<[number, number, number]> = [];
  private clouds: Cloud[] = [];
  private softCloud?: HTMLCanvasElement;
  private corners: Corner[] = [];
  private padSprites = new Map<string, PadSprite>();
  private lit: number[] = []; // screen x of the lanterns in view this frame
  private bodyX = 0; // the sun or moon, for its path of light on the water
  private rings: Array<{ wx: number; y: number; t0: number }> = [];
  private nextRing = 0;
  private fade?: { c: HTMLCanvasElement; t0: number };
  private hudBox!: HudBox;
  private num?: { key: string; c: HTMLCanvasElement; pad: number };
  private stateLine?: { key: string; c: HTMLCanvasElement; w: number; h: number };
  private skyFill?: CanvasGradient;
  private waterFill?: CanvasGradient; // made on the first frame, with the window's own context

  build(inp: PondInput): void {
    this.inp = inp;
    const { w, h, dpr, tod } = inp;
    this.u = clamp(Math.min(w / 440, h / 380), 0.6, 1.4);
    this.anchor = w < 640 ? 0.3 : 0.36;
    this.hz = Math.round(h * HORIZON);
    this.padY0 = this.hz + (h - this.hz) * 0.56;
    this.pal = lakePalette(tod);
    this.sky = SKY_PALETTES[tod];
    this.light =
      tod === "night" ? "rgba(8,26,34,0.44)" : tod === "evening" ? "rgba(236,132,64,0.16)" : tod === "morning" ? "rgba(255,221,158,0.1)" : null;
    release(this.above);
    [this.above, this.aCtx] = makeCanvas(w * dpr, this.hz * dpr);
    this.skyFill = this.aCtx.createLinearGradient(0, 0, 0, this.hz);
    this.skyFill.addColorStop(0, this.sky.top);
    this.skyFill.addColorStop(1, this.sky.bottom);
    this.waterFill = undefined;
    for (const s of this.padSprites.values()) release(s.c);
    this.padSprites.clear();
    this.buildSky();
    this.buildCorners();
    this.layoutHud();
    release(this.strip?.c);
    release(this.oldStrip?.c);
    this.strip = this.oldStrip = undefined;
    this.setData(inp.padSpecs, inp.count, inp.haviPad);
  }

  /** New sessions: pad colours follow at once; the far bank is repainted (and
   *  cross-faded) only when a grove grew or changed colour. */
  setData(padSpecs: GrovePadSpec[], count: number, haviPad: number): void {
    if (!this.inp) return;
    this.inp = { ...this.inp, padSpecs, count, haviPad };
    const groves = groveList(padSpecs);
    const sig = groves.map((g) => `${g.key}:${g.trees}:${g.color}`).join(",");
    if (sig === this.groveSig && this.strip) return;
    this.groveSig = sig;
    release(this.oldStrip?.c);
    this.oldStrip = this.strip ? { ...this.strip, t0: performance.now() } : undefined;
    this.strip = this.paintBank(groves);
  }

  /** Cross-fades from what the canvas shows now (call before a rebuild). */
  crossfade(canvas: HTMLCanvasElement): void {
    if (this.fade) release(this.fade.c);
    const [c, g] = makeCanvas(canvas.width, canvas.height);
    g.drawImage(canvas, 0, 0);
    this.fade = { c, t0: performance.now() };
  }

  dispose(): void {
    release(this.above);
    release(this.strip?.c);
    release(this.oldStrip?.c);
    release(this.softCloud);
    release(this.fade?.c);
    this.resetHud();
    for (const c of this.clouds) release(c.c);
    for (const c of this.corners) release(c.c);
    for (const s of this.padSprites.values()) release(s.c);
    this.padSprites.clear();
  }

  // ── Geometry (world x = CSS px along the row of pads) ─────────────────────
  padX(i: number): number {
    return this.u * (FIRST + i * SPACING);
  }
  padY(i: number): number {
    return this.padY0 + Math.sin(i * 0.9) * Math.min(10 * this.u, (this.inp.h - this.hz) * 0.05);
  }
  padRx(i: number): number {
    return this.u * (i === 0 ? 112 : 90 + (Math.sin(i * 2.3) * 0.5 + 0.5) * 12);
  }
  /** The camera (window's left edge) that puts Havi at `x` on his mark. */
  camFor(x: number): number {
    return x - this.anchor * this.inp.w;
  }
  /** The pads that can be on screen with the camera at `cam`. */
  padRange(cam: number): [number, number] {
    const s = SPACING * this.u;
    return [Math.floor((cam - FIRST * this.u) / s) - 1, Math.ceil((cam + this.inp.w - FIRST * this.u) / s) + 1];
  }
  /** Where Havi sits on pad `i`, on screen. */
  seat(i: number, cam: number): [number, number] {
    return [this.padX(i) - cam, this.padY(i) - this.padRx(i) * 0.07];
  }
  /** Whether a point in the scene (CSS px) is on Havi, sitting on pad `i`. */
  onHavi(i: number, cam: number, x: number, y: number): boolean {
    const [hx, hy] = this.seat(i, cam);
    const px = HAVI_PX * this.u;
    return Math.abs(x - hx) < 14 * px && y - hy > -23 * px && y - hy < 5 * px;
  }
  /** The subject colour of pad `i` (null: the home pad, or a session with no subject). */
  private colorOf(i: number): string | null {
    if (i <= 0) return null;
    const { padSpecs, count } = this.inp;
    const k = padSpecs.length - 1 - (count - i);
    return k >= 0 ? (padSpecs[k]?.color ?? null) : null;
  }
  // how deep a point of the water is: 0 at the far bank, 1 at the row of pads
  private depth(y: number): number {
    return Math.max(0, (y - this.hz) / (this.padY0 - this.hz));
  }
  // …and how far that part of the water moves with the camera
  private par(d: number): number {
    return d <= 1 ? P_BANK + (1 - P_BANK) * d : 1 + (d - 1) * 0.6;
  }
  private bob(i: number, t: number): number {
    return this.inp.reducedMotion ? 0 : Math.sin(t * 1.1 + i * 1.7) * 0.9 * this.u;
  }
  // Arabic: the scene runs right → left. Applied once per frame; the timer
  // applies it again to read the right way round.
  private mirror(ctx: CanvasRenderingContext2D) {
    if (this.inp.rtl) ctx.transform(-1, 0, 0, 1, this.inp.w, 0);
  }

  // ── Frame ─────────────────────────────────────────────────────────────────
  draw(ctx: CanvasRenderingContext2D, f: PondFrame): void {
    const { w, h, dpr } = this.inp;
    const t = f.now / 1000;
    const e = f.rise <= 0 ? 0 : f.rise >= 1 ? 1 : easeInOut(f.rise);
    const lift = e * h * 0.65; // the camera tilts up: the scene slides down
    const cam = f.camX + f.look * LOOK * this.u;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    this.mirror(ctx);
    if (e < 1) {
      this.paintAbove(cam, f, t);
      if (lift > 0) {
        ctx.fillStyle = this.sky.top;
        ctx.fillRect(0, 0, w, lift + 1);
      }
      ctx.save();
      ctx.translate(0, lift);
      ctx.drawImage(this.above!, 0, 0, w, this.hz);
      this.drawHud(ctx, f, t);
      this.drawWater(ctx, cam, f, t);
      this.drawPads(ctx, cam, f, t);
      this.drawHavi(ctx, cam, f, t);
      this.drawLife(ctx, f, t);
      this.drawFront(ctx, cam, f, t);
      ctx.restore();
      this.drawCorners(ctx, f, t, lift);
    }
    if (e > 0) this.drawRise(ctx, e);
    if (this.fade) {
      const a = 1 - (f.now - this.fade.t0) / FADE_MS;
      if (a <= 0) {
        release(this.fade.c);
        this.fade = undefined;
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = a;
        ctx.drawImage(this.fade.c, 0, 0);
        ctx.globalAlpha = 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
  }

  // Sky, ridges and the far bank: into their own canvas, so the water can
  // mirror them.
  private paintAbove(cam: number, f: PondFrame, t: number) {
    const g = this.aCtx!;
    const { w, dpr, tod, reducedMotion: rm } = this.inp;
    const { hz, u, sky } = this;
    const night = this.pal.night;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = this.skyFill!;
    g.fillRect(0, 0, w, hz);

    const look = -f.look * u;
    if (night) {
      for (const [x, y, k] of this.stars) {
        const tw = rm ? 0 : Math.sin(t * 0.75 + k * 20) * 0.5;
        g.globalAlpha = clamp(0.4 + k * 0.4 + tw * 0.15, 0.15, 1);
        g.fillStyle = "#eaf3d6";
        g.beginPath();
        g.arc(x + look, y, (1 + (k > 0.66 ? 0.7 : 0)) * Math.min(1, u + 0.2), 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
      for (const [x, y, r0] of this.bigStars) {
        if (f.hud && this.clearOfHud(x, y, r0 * u) !== x) continue; // not over the timer
        const r = r0 * u * (rm ? 1 : 0.85 + Math.sin(t * 0.9 + x) * 0.15);
        g.fillStyle = "#fbf3dd";
        fourPointStar(g, x + look, y, r + 2);
        g.fill();
        g.fillStyle = "#f4c74e";
        fourPointStar(g, x + look, y, r);
        g.fill();
      }
      const R = Math.min(30 * u, w * 0.058);
      const my = hz * 0.32;
      this.bodyX = (f.hud ? this.clearOfHud(w * 0.7, my, R) : w * 0.7) + look;
      drawMoon(g, this.bodyX, my, R);
    } else {
      const evening = tod === "evening";
      const R = (evening ? 26 : 19) * u;
      const bx = w * (tod === "morning" ? 0.3 : evening ? 0.6 : 0.66);
      const by = hz * (tod === "morning" ? 0.44 : evening ? 0.6 : 0.3);
      this.bodyX = (f.hud ? this.clearOfHud(bx, by, R) : bx) + look;
      drawSun(g, this.bodyX, by, R, sky.celestial, sky.celestialGlow, evening, rm ? 0 : t);
      const hb = this.hudBox;
      for (const c of this.clouds) {
        const x = mod(c.x - (rm ? 0 : t * c.v) - cam * P_CLOUD, w + c.w * 2) - c.w;
        // a cloud drifting behind the timer thins out, so the numerals stay clear
        const behind = f.hud && c.y + c.h / 2 > hb.top && c.y - c.h / 2 < hb.lineY;
        const reach = (hb.width + c.w) / 2;
        g.globalAlpha = behind ? 0.35 + 0.65 * smooth(reach * 0.55, reach, Math.abs(x - w / 2)) : 1;
        g.drawImage(c.c, x - c.w / 2, c.y - c.h / 2, c.w, c.h);
      }
      g.globalAlpha = 1;
      if (!rm) this.drawBirds(g, f.now);
    }

    // two ridges fading into the sky
    ridge(g, w, hz, cam * P_FAR, hz * 0.5, 900 * u, 1.3, mixColor(sky.hillFar, sky.bottom, 0.45));
    ridge(g, w, hz, cam * P_NEAR, hz * 0.36, 620 * u, 4.1, mixColor(sky.hillNear, sky.bottom, 0.22));

    // the far bank (and the old one fading out, after a grove grew)
    const top = hz - BANK_H * u;
    this.lit.length = 0;
    const put = (s: Strip, alpha: number, lanterns: boolean) => {
      const x0 = -mod(cam * P_BANK - s.phase, s.P);
      g.globalAlpha = alpha;
      for (let x = x0; x < w; x += s.P) {
        g.drawImage(s.c, Math.round(x * dpr) / dpr, top, s.P, BANK_H * u);
        if (lanterns) for (const [lx] of s.lanterns) if (x + lx > -20 && x + lx < w + 20) this.lit.push(x + lx);
      }
      g.globalAlpha = 1;
    };
    put(this.strip!, 1, true);
    if (this.oldStrip) {
      const a = 1 - (f.now - this.oldStrip.t0) / BANK_FADE_MS;
      if (a <= 0) {
        release(this.oldStrip.c);
        this.oldStrip = undefined;
      } else put(this.oldStrip, a, false);
    }
    if (night) {
      // lantern glows along the far bank
      const ly = hz - 19.5 * u;
      for (const x of this.lit) {
        const fl = rm ? 1 : 0.85 + Math.sin(t * 5 + x) * 0.15;
        drawGlow(g, x, ly, 16 * u, 0.55 * fl, "255,214,130", "255,190,90");
      }
    }
  }

  private drawBirds(g: CanvasRenderingContext2D, now: number) {
    const CYCLE = 36000;
    const ph = (now % CYCLE) / 15000; // a flock crosses every 36 s
    if (ph >= 1) return;
    const { w } = this.inp;
    const { u, hz } = this;
    const k = Math.floor(now / CYCLE);
    const ltr = hash(k * 1.7) > 0.5;
    const y0 = hz * (0.2 + hash(k * 3.1) * 0.22);
    g.strokeStyle = INK;
    g.globalAlpha = 0.7;
    g.lineWidth = 1.3 * u;
    g.lineCap = "round";
    for (let b = 0; b < 4; b++) {
      const along = -40 * u + ph * (w + 80 * u) - b * 15 * u;
      const x = ltr ? along : w - along;
      const y = y0 + (b % 2) * 6 * u + Math.sin(now / 900 + b) * 2 * u;
      const s = (4 + (b === 0 ? 1 : 0)) * u;
      const flap = Math.sin(now / 110 + b * 1.3) * 0.5 + 0.5;
      g.beginPath();
      g.moveTo(x - s, y - s * (0.2 + flap * 0.6));
      g.quadraticCurveTo(x - s * 0.4, y - s * 0.1, x, y + s * 0.2);
      g.quadraticCurveTo(x + s * 0.4, y - s * 0.1, x + s, y - s * (0.2 + flap * 0.6));
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  // ── Water ─────────────────────────────────────────────────────────────────
  private drawWater(ctx: CanvasRenderingContext2D, cam: number, f: PondFrame, t: number) {
    const { w, h, dpr, tod, reducedMotion: rm } = this.inp;
    const { hz, u, sky } = this;
    const night = this.pal.night;
    const H = h - hz;
    if (!this.waterFill) {
      this.waterFill = ctx.createLinearGradient(0, hz, 0, h);
      this.waterFill.addColorStop(0, sky.waterTop);
      this.waterFill.addColorStop(1, sky.waterBottom);
    }
    ctx.fillStyle = this.waterFill;
    ctx.fillRect(0, hz, w, H + 1);

    // the mirror image of the bank and the ridges, rippled and fading with depth
    // (short enough that the clouds' outlines never sink into the water)
    const A = this.above!;
    const R = Math.min(hz * 0.62, H);
    const step = 2;
    for (let dy = 0; dy < R; dy += step) {
      const k = dy / R;
      const a = 0.62 * (1 - k) ** 1.3;
      if (a < 0.02) break;
      const sy = Math.max(0, hz - dy - step);
      const off = rm ? 0 : Math.sin(t * 1.7 + dy * 0.21) * (0.4 + dy * 0.05) * u;
      ctx.globalAlpha = a;
      ctx.drawImage(A, 0, sy * dpr, A.width, step * dpr, off, hz + dy, w, step);
    }
    ctx.globalAlpha = night ? 0.22 : 0.4;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, hz, w, 1.2 * u); // the bright line where the bank meets the water

    // a path of light under the sun or moon
    const evening = tod === "evening";
    ctx.strokeStyle = night ? "rgb(255,222,140)" : evening ? "rgb(255,190,120)" : "rgb(255,255,250)";
    ctx.lineCap = "round";
    for (let y = hz + 2 * u; y < h; ) {
      const d = this.depth(y);
      const n = rm ? 0.8 : Math.sin(t * 2.3 + y * 0.37) * 0.5 + 0.5;
      const n2 = rm ? 0.6 : Math.sin(t * 1.3 + y * 0.91 + 2) * 0.5 + 0.5;
      if (n > 0.18) {
        const half = (3 + d * 20) * u * (0.35 + 0.65 * n2) * (evening ? 1.3 : 1);
        ctx.globalAlpha = (night ? 0.55 : evening ? 0.6 : 0.4) * n * (1 - smooth(0.9, 1.6, d) * 0.7);
        ctx.lineWidth = (1 + d) * u;
        const x = this.bodyX + (rm ? 0 : Math.sin(t + y) * 2 * u * d);
        ctx.beginPath();
        ctx.moveTo(x - half, y);
        ctx.lineTo(x + half, y);
        ctx.stroke();
      }
      y += (2.4 + 3 * d) * u;
    }

    // lanterns on the far bank shine down the water
    if (night) {
      ctx.strokeStyle = "#ffd98a";
      for (const x of this.lit) {
        for (let k = 0; k < 7; k++) {
          const len = (3.5 - k * 0.35) * u * (rm ? 1 : 0.6 + 0.4 * Math.sin(t * 3 + k + x));
          ctx.globalAlpha = 0.5 * (1 - k / 7);
          ctx.lineWidth = 1.3 * u;
          ctx.beginPath();
          ctx.moveTo(x - len, hz + (2 + k * 3.2) * u);
          ctx.lineTo(x + len, hz + (2 + k * 3.2) * u);
          ctx.stroke();
        }
      }
    }

    // drifting ripples, smaller and slower toward the far bank
    ctx.strokeStyle = night ? "rgb(200,225,235)" : "rgb(240,246,244)";
    const ROWS = 10;
    for (let k = 0; k < ROWS; k++) {
      const y = hz + H * ((k + 0.6) / ROWS) ** 1.45;
      const d = this.depth(y);
      const sc = Math.max(0.3, 0.3 + 0.7 * d);
      const gap = 130 * u * sc;
      const off = cam * this.par(d) + (rm ? 0 : t * (6 + (k % 3) * 3) * u * sc);
      ctx.globalAlpha = (night ? 0.2 : 0.3) + (night ? 0.12 : 0.18) * Math.min(1, d);
      ctx.lineWidth = (0.8 + 1.4 * sc) * u;
      ctx.beginPath();
      const j0 = Math.floor(off / gap) - 1;
      for (let j = j0; j <= j0 + w / gap + 2; j++) {
        const x = j * gap + hash(j * 7.1 + k * 3.3) * gap * 0.7 - off;
        const len = (10 + hash(j + k * 9.7) * 14) * u * sc;
        const yy = y + (hash(j * 3.3 + k) - 0.5) * 8 * u * sc + (rm ? 0 : Math.sin(t * 0.8 + j) * 1.2 * u * sc);
        ctx.moveTo(x, yy);
        ctx.quadraticCurveTo(x + len / 2, yy - 1.6 * u * sc, x + len, yy);
      }
      ctx.stroke();
    }

    // now and then a fish rises: a ring spreads on the water
    if (!rm) {
      if (f.now > this.nextRing) {
        this.nextRing = f.now + 2500 + hash(f.now * 0.001) * 4000;
        const y = hz + (0.12 + hash(f.now * 0.0013) * 0.8) * H;
        this.rings.push({ wx: cam * this.par(this.depth(y)) + hash(f.now * 0.0021) * w, y, t0: f.now });
        if (this.rings.length > 4) this.rings.shift();
      }
      ctx.lineWidth = 1.2 * u;
      this.rings = this.rings.filter((r) => f.now - r.t0 < 2000);
      for (const r of this.rings) {
        const age = (f.now - r.t0) / 2000;
        const d = this.depth(r.y);
        const sc = Math.max(0.3, 0.3 + 0.7 * d);
        const x = r.wx - cam * this.par(d);
        for (const k of [1, 0.6]) {
          const rr = (3 + age * 26 * k) * u * sc;
          ctx.globalAlpha = (1 - age) * 0.45 * k;
          ctx.beginPath();
          ctx.ellipse(x, r.y, rr, rr * 0.32, 0, 0, TAU);
          ctx.stroke();
        }
      }
    }

    this.drawHudReflection(ctx, f, t);

    // Havi's reflection while he leaps between pads
    const hv = f.havi;
    if (hv?.jump) {
      const [x, y, sy] = this.haviAt(hv.jump.from, hv.jump.to, hv.jump.p, cam, t);
      ctx.globalAlpha = 0.25 * Math.sin(Math.PI * hv.jump.p);
      drawHaviSprite(ctx, x, y, HAVI_PX * u, "jumping", f.tick, 0, rm, sy);
    }
    ctx.globalAlpha = 1;
  }

  // ── Pads ──────────────────────────────────────────────────────────────────
  private drawPads(ctx: CanvasRenderingContext2D, cam: number, f: PondFrame, t: number) {
    const { w } = this.inp;
    const u = this.u;
    for (const p of f.pads) {
      const x = this.padX(p.i) - cam;
      const rx = this.padRx(p.i) * p.grow;
      if (x + rx * 1.4 < 0 || x - rx * 1.4 > w || p.alpha <= 0.01) continue;
      const y = this.padY(p.i) + this.bob(p.i, t);
      if (p.dying > 0) {
        const q = p.dying;
        ctx.save();
        ctx.translate(x, y + q * 16 * u);
        ctx.scale(u, u);
        drawLilyPad(ctx, { cx: 0, cy: 0, rx: (rx / u) * (1 - q * 0.35), ry: (rx / u) * 0.35 * (1 - q * 0.6), hasFlower: false, opacity: p.alpha, dying: q });
        ctx.restore();
        continue;
      }
      const color = p.color !== undefined ? p.color : this.colorOf(p.i);
      const settled = color && p.bud >= 1 && p.open >= 1;
      const sp = this.padSprite(p.i === 0, settled ? color : null);
      const k = (rx / (sp.rb * u)) * u; // sprite units → CSS px
      ctx.globalAlpha = p.alpha;
      ctx.drawImage(sp.c, x - sp.ox * k, y - sp.oy * k, sp.w * k, sp.h * k);
      if (color && !settled && p.bud > 0) {
        // the bud comes up with the session, then opens
        const r = FLOWER * k * (0.4 + 0.6 * p.bud);
        ctx.globalAlpha = p.alpha * Math.min(1, p.bud * 1.5);
        drawLily(ctx, x + rx * FLOWER_X, y - rx * FLOWER_Y, r, this.litColor(color), p.open);
      }
      ctx.globalAlpha = 1;
    }
  }

  // A pad (with its subject's flower, open) in the time of day's light.
  private padSprite(home: boolean, color: string | null): PadSprite {
    const key = `${home ? "h" : "p"}|${color ?? ""}`;
    const hit = this.padSprites.get(key);
    if (hit) return hit;
    const { dpr } = this.inp;
    const rb = home ? 112 : 102;
    const ryb = rb * 0.35;
    const w = rb * 2.8 + 16;
    const h = ryb * 2.8 + 56; // room above for the flower
    const ox = w / 2;
    const oy = h - ryb * 1.4 - 8;
    const k = dpr * this.u;
    const [c, g] = makeCanvas(w * k, h * k);
    g.scale(k, k);
    drawLilyPad(g, { cx: ox, cy: oy, rx: rb, ry: ryb, hasFlower: home, opacity: 1, dying: 0 });
    if (color) drawLily(g, ox + rb * FLOWER_X, oy - rb * FLOWER_Y, FLOWER, color, 1);
    if (this.light) {
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = this.light;
      g.fillRect(0, 0, w, h);
    }
    const sp = { c, ox, oy, w, h, rb };
    this.padSprites.set(key, sp);
    return sp;
  }

  // A colour drawn live over the pads, in the same light as the sprites.
  private litColor(color: string): string {
    const tod = this.inp.tod;
    if (tod === "night") return mixColor(color, "#08202a", 0.34);
    if (tod === "evening") return mixColor(color, "#ec8440", 0.14);
    return color;
  }

  // ── Havi ──────────────────────────────────────────────────────────────────
  // Where Havi is mid-leap: x, y, and the water line under him (for his reflection).
  private haviAt(from: number, to: number, p: number, cam: number, t: number): [number, number, number] {
    const e = easeInOut(p);
    const [ax, ay] = this.seat(from, cam);
    const [bx, by] = this.seat(to, cam);
    const water = lerp(this.padY(from) + this.bob(from, t), this.padY(to) + this.bob(to, t), e);
    return [lerp(ax, bx, e), lerp(ay + this.bob(from, t), by + this.bob(to, t), e) - Math.sin(Math.PI * p) * 36 * this.u, water];
  }

  private drawHavi(ctx: CanvasRenderingContext2D, cam: number, f: PondFrame, t: number) {
    const hv = f.havi;
    if (!hv) return;
    const u = this.u;
    const rm = this.inp.reducedMotion;
    if (hv.jump) {
      const [x, y] = this.haviAt(hv.jump.from, hv.jump.to, hv.jump.p, cam, t);
      drawHaviSprite(ctx, x, y, HAVI_PX * u, "jumping", f.tick, 0, rm);
      return;
    }
    const [x, y0] = this.seat(hv.pad, cam);
    const y = y0 + this.bob(hv.pad, t);
    if (this.pal.night) this.drawLamp(ctx, x - this.padRx(hv.pad) * 0.62, this.padY(hv.pad) + this.bob(hv.pad, t) - this.padRx(hv.pad) * 0.1, t);
    drawHaviSprite(ctx, x, y, HAVI_PX * u, hv.mood, f.tick, hv.fish, rm);
  }

  // A warm lantern on Havi's pad at night.
  private drawLamp(ctx: CanvasRenderingContext2D, bx: number, baseY: number, t: number) {
    const u = this.u;
    const bulbY = baseY - 34 * u;
    const fl = this.inp.reducedMotion ? 1 : 0.85 + Math.sin(t * 4.5) * 0.15;
    const R = 58 * u;
    const glo = ctx.createRadialGradient(bx, bulbY, 3 * u, bx, bulbY, R);
    glo.addColorStop(0, `rgba(255,214,130,${0.5 * fl})`);
    glo.addColorStop(0.5, `rgba(255,190,90,${0.16 * fl})`);
    glo.addColorStop(1, "rgba(255,190,90,0)");
    ctx.fillStyle = glo;
    ctx.fillRect(bx - R, bulbY - R, R * 2, R * 2);
    ctx.fillStyle = "#3a2f26";
    ctx.fillRect(bx - 1.5 * u, bulbY, 3 * u, baseY - bulbY);
    ctx.fillRect(bx - 5 * u, baseY - 2 * u, 10 * u, 3 * u);
    ctx.fillStyle = "#241d16";
    ctx.beginPath();
    ctx.moveTo(bx - 7 * u, bulbY + 2 * u);
    ctx.lineTo(bx + 7 * u, bulbY + 2 * u);
    ctx.lineTo(bx + 5 * u, bulbY - 8 * u);
    ctx.lineTo(bx - 5 * u, bulbY - 8 * u);
    ctx.closePath();
    ctx.fill();
    const bg = ctx.createRadialGradient(bx, bulbY - 2 * u, u, bx, bulbY - 2 * u, 6 * u);
    bg.addColorStop(0, "#fff3c8");
    bg.addColorStop(1, "#ffca66");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(bx, bulbY - 2 * u, 5 * u, 0, TAU);
    ctx.fill();
  }

  // ── Life over the water ───────────────────────────────────────────────────
  private drawLife(ctx: CanvasRenderingContext2D, f: PondFrame, t: number) {
    const { w, h, reducedMotion: rm } = this.inp;
    const { u, hz } = this;
    const night = this.pal.night;
    if (night) {
      const n = rm ? 6 : Math.max(10, Math.round(w / 60));
      for (let i = 0; i < n; i++) {
        const x = hash(i * 21.13) * w + (rm ? 0 : Math.sin(t * 0.3 + i * 1.7) * 22 * u);
        const y = hz + 8 * u + hash(i * 47.71) * (h - hz - 24 * u) + (rm ? 0 : Math.cos(t * 0.26 + i * 2.3) * 14 * u);
        const pulse = rm ? 0.4 : 0.3 + (Math.sin(t * 1.2 + i * 2.1) * 0.5 + 0.5) * 0.6;
        drawGlow(ctx, x, y, 7 * u, pulse, "226,255,150");
        ctx.fillStyle = `rgba(240,255,190,${Math.min(1, pulse + 0.2)})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.3 * u, 0, TAU);
        ctx.fill();
      }
    }
    if (rm) return;
    const scaled = (x: number, y: number, draw: () => void) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(u, u);
      draw();
      ctx.restore();
    };
    if (!night) {
      // two butterflies wander over the water
      ([[0, "#f2a65a"], [2.5, "#e88bb5"]] as Array<[number, string]>).forEach(([seed, col]) => {
        const tt = t * 0.45 + seed;
        const x = w * (0.3 + 0.4 * (Math.sin(tt * 0.5 + seed) * 0.5 + 0.5)) + Math.sin(tt * 2) * 10 * u;
        const y = hz + 16 * u + (Math.sin(tt * 0.8 + seed * 2) * 0.5 + 0.5) * (h - hz - 64 * u);
        scaled(x, y, () => drawButterfly(ctx, 0, 0, f.tick, seed, col));
      });
    }
    // a dragonfly darts from spot to spot and hovers
    const LEG = 2600;
    const leg = Math.floor(f.now / LEG);
    const q = clamp(((f.now % LEG) / LEG) * 2.2, 0, 1);
    const spot = (n: number): [number, number] => [w * (0.12 + hash(n * 3.7) * 0.76), hz + (14 + hash(n * 5.3) * 0.7 * (this.padY0 - hz - 30 * u) / u) * u];
    const [ax, ay] = spot(leg);
    const [bx, by] = spot(leg + 1);
    const e = easeInOut(q);
    const hover = Math.sin(t * 6) * 1.5 * u;
    scaled(lerp(ax, bx, e), lerp(ay, by, e) + hover, () => drawDragonfly(ctx, 0, 0, Math.atan2(by - ay, bx - ax), f.tick, night));
  }

  // Reeds right in front of us, passing faster than the pads.
  private drawFront(ctx: CanvasRenderingContext2D, cam: number, f: PondFrame, t: number) {
    const { w, h, reducedMotion: rm } = this.inp;
    const { u, pal } = this;
    const gap = 420 * u;
    const off = cam * P_FRONT;
    const hx = f.havi ? this.seat(f.havi.pad, cam)[0] : -1e9;
    const j0 = Math.floor(off / gap) - 1;
    for (let j = j0; j <= j0 + w / gap + 2; j++) {
      if (hash(j * 7.3 + 1) < 0.35) continue;
      const x = j * gap + hash(j * 2.9) * gap * 0.4 - off;
      if (x < -80 * u || x > w + 80 * u) continue;
      // fade where it would hide Havi
      ctx.globalAlpha = 1 - 0.6 * (1 - smooth(60 * u, 110 * u, Math.abs(x - hx)));
      for (let b = 0; b < 6; b++) {
        const bx = x + (b - 2.5) * 7 * u;
        const ht = (34 + hash(j * 11 + b) * 26) * u;
        const lean = (hash(j * 5 + b * 3) - 0.5) * 20 * u + (rm ? 0 : Math.sin(t * 1.3 + j + b * 0.7) * 3 * u);
        const col = b % 2 ? pal.reed : pal.reedHi;
        inked(ctx, () => {
          ctx.beginPath();
          ctx.moveTo(bx - 3 * u, h + 4);
          ctx.quadraticCurveTo(bx + lean * 0.5, h - ht * 0.6, bx + lean, h - ht);
          ctx.quadraticCurveTo(bx + lean * 0.5 + 2.5 * u, h - ht * 0.6, bx + 3 * u, h + 4);
          ctx.closePath();
        }, col, 1.6 * u, false);
        if (b === 1 || b === 4) {
          ctx.fillStyle = pal.cattail;
          ctx.beginPath();
          ctx.ellipse(bx + lean * 0.8, h - ht * 0.82, 2.4 * u, 6 * u, lean * 0.02, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.2 * u;
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // Leaves hanging into the top corners, from trees just out of the window.
  private drawCorners(ctx: CanvasRenderingContext2D, f: PondFrame, t: number, lift: number) {
    const { w, reducedMotion: rm } = this.inp;
    const u = this.u;
    for (const c of this.corners) {
      const sway = rm ? 0 : Math.sin(t * 0.8 + c.seed) * 0.022;
      ctx.save();
      ctx.translate((c.right ? w : 0) - f.look * 24 * u, lift * 1.3);
      ctx.rotate(c.right ? -sway : sway);
      ctx.drawImage(c.c, c.right ? -c.w + 4 * u : -4 * u, -6 * u, c.w, c.h);
      ctx.restore();
    }
  }

  // Up into the clouds (opening the lake), or back down out of them.
  private drawRise(ctx: CanvasRenderingContext2D, e: number) {
    const { w, h } = this.inp;
    const c = this.softCloud!;
    const big = Math.max(w, h);
    ctx.globalAlpha = smooth(0, 0.45, e) * 0.95;
    for (let i = 0; i < 8; i++) {
      const s = (0.5 + hash(i * 1.9) * 0.45) * big * (0.7 + e);
      const x = hash(i * 3.7) * w;
      const y = h * (-0.7 + hash(i * 5.3) * 0.5) + e * h * (0.7 + hash(i * 2.1) * 0.6);
      ctx.drawImage(c, x - s / 2, y - s * 0.3, s, s * 0.6);
    }
    ctx.globalAlpha = smooth(0.4, 0.95, e);
    ctx.fillStyle = this.pal.haze; // the colour the lake's dive starts in
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  // ── The timer in the sky ──────────────────────────────────────────────────
  /** Where the timer sits, for the page to lay its task chip under it. */
  hud(): HudBox {
    return this.hudBox;
  }

  /** Repaint the numerals and the line of state (a font has just arrived). */
  resetHud(): void {
    release(this.num?.c);
    release(this.stateLine?.c);
    this.num = this.stateLine = undefined;
  }

  // Centred in the sky between the page's top buttons and the far bank, with
  // room under it for the task chip.
  private layoutHud() {
    const { w } = this.inp;
    const { u, hz } = this;
    const avail = Math.max(120, hz - BANK_H * u - 8 - HUD_TOP);
    const size = clamp(Math.min(w * (w < 640 ? 0.19 : 0.2), avail * 0.62), 56, 150);
    const band = size * NUM_BAND;
    const gap1 = size * 0.17;
    const gap2 = 10 + size * 0.06;
    const label = clamp(size * 0.12, 12.5, 15);
    const total = band + gap1 + gap2 + label + HUD_CHIP_GAP + HUD_CHIP;
    const top = HUD_TOP + Math.max(0, (avail - total) / 2);
    const lineY = top + band + gap1;
    const labelY = lineY + gap2 + label / 2;
    this.hudBox = {
      top,
      cy: top + band / 2,
      size,
      width: size * (DIGIT * 4 + COLON),
      lineY,
      labelY,
      label,
      chipTop: labelY + label / 2 + HUD_CHIP_GAP,
    };
    this.resetHud();
  }

  // The numerals with their halo, painted into their own canvas once a second,
  // so a frame only copies them (and the water can mirror them).
  private numerals(clock: string): { c: HTMLCanvasElement; pad: number } {
    if (this.num?.key === clock) return this.num;
    const { dpr } = this.inp;
    const { size, width } = this.hudBox;
    const band = size * NUM_BAND;
    const pad = Math.ceil(size * 0.35);
    // the same size every second: clear last second's canvas and reuse it
    let c = this.num?.c;
    let g: CanvasRenderingContext2D;
    if (c) {
      g = c.getContext("2d")!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.width, c.height);
    } else [c, g] = makeCanvas((width + pad * 2) * dpr, (band + pad * 2) * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.font = `400 ${size}px ${NUM_FONT}`;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    const asc = g.measureText("0").actualBoundingBoxAscent || size * 0.7;
    const base = pad + (band + asc) / 2;
    const put = () => {
      let x = pad;
      for (const ch of clock) {
        const bw = size * (ch === ":" ? COLON : DIGIT);
        g.fillText(ch, x + bw / 2, base);
        x += bw;
      }
    };
    g.fillStyle = this.sky.hudInk;
    g.shadowColor = this.sky.hudGlow;
    g.shadowBlur = size * 0.22 * dpr;
    put();
    g.shadowColor = "transparent";
    put();
    this.num = { key: clock, c, pad };
    return this.num;
  }

  private drawHud(ctx: CanvasRenderingContext2D, f: PondFrame, t: number) {
    const hud = f.hud;
    if (!hud) return;
    const { w, dpr, reducedMotion: rm, rtl } = this.inp;
    const b = this.hudBox;
    const ink = this.sky.hudInk;
    const strength = hud.dim ? 0.5 : 1;
    ctx.save();
    this.mirror(ctx);

    // a session done: a swell of warm light through the numerals
    if (hud.pulse > 0) {
      const gl = ctx.createRadialGradient(w / 2, b.cy, 0, w / 2, b.cy, b.width * 0.8);
      gl.addColorStop(0, `rgba(255,232,160,${0.42 * hud.pulse})`);
      gl.addColorStop(1, "rgba(255,232,160,0)");
      ctx.fillStyle = gl;
      ctx.fillRect(w / 2 - b.width, b.cy - b.width * 0.8, b.width * 2, b.width * 1.6);
    }
    const { c, pad } = this.numerals(hud.clock);
    const cw = b.width + pad * 2;
    const ch = b.size * NUM_BAND + pad * 2;
    const grow = 1 + 0.035 * hud.pulse;
    ctx.globalAlpha = strength;
    ctx.drawImage(c, w / 2 - (cw / 2) * grow, b.cy - (ch / 2) * grow, cw * grow, ch * grow);

    // the line: a faint track, filled with the session in the subject's colour
    const lw = Math.min(b.width, w - 48);
    const lx = w / 2 - lw / 2;
    const th = clamp(b.size * 0.028, 2.5, 4);
    ctx.lineCap = "round";
    ctx.lineWidth = th;
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.22 * strength;
    ctx.beginPath();
    ctx.moveTo(lx, b.lineY);
    ctx.lineTo(lx + lw, b.lineY);
    ctx.stroke();
    const p = clamp(hud.progress, 0, 1);
    if (p > 0) {
      const fill = hud.color ? (this.pal.night || this.inp.tod === "evening" ? hud.color : mixColor(hud.color, ink, 0.2)) : ink;
      const x0 = rtl ? lx + lw : lx;
      const x1 = rtl ? x0 - lw * p : x0 + lw * p;
      ctx.globalAlpha = strength;
      ctx.strokeStyle = fill;
      ctx.beginPath();
      ctx.moveTo(x0, b.lineY);
      ctx.lineTo(x1, b.lineY);
      ctx.stroke();
      if (p < 1) {
        // a small light travelling at its head
        const breath = rm || hud.dim ? 1 : 0.8 + Math.sin(t * 2.4) * 0.2;
        ctx.shadowColor = fill;
        ctx.shadowBlur = th * 4 * breath * dpr;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(x1, b.lineY, th * 1.1, 0, TAU);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
      }
    }

    // the line of state under it
    if (hud.label) {
      const s = this.labelSprite(hud.label);
      ctx.globalAlpha = 0.86;
      ctx.drawImage(s.c, w / 2 - s.w / 2, b.labelY - s.h / 2, s.w, s.h);
    }
    ctx.restore();
  }

  // The line of state with its halo, painted once each time it changes.
  private labelSprite(text: string): { c: HTMLCanvasElement; w: number; h: number } {
    if (this.stateLine?.key === text) return this.stateLine;
    release(this.stateLine?.c);
    const { dpr, rtl } = this.inp;
    const size = this.hudBox.label;
    const font = `500 ${size}px ${LABEL_FONT}`;
    const halo = 12; // room for the glow
    const [, m] = makeCanvas(1, 1);
    m.font = font;
    const lw = Math.ceil(m.measureText(text).width) + halo * 2;
    const lh = Math.ceil(size * 1.6) + halo * 2;
    const [c, g] = makeCanvas(lw * dpr, lh * dpr);
    g.scale(dpr, dpr);
    g.font = font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.direction = rtl ? "rtl" : "ltr";
    g.fillStyle = this.sky.hudInk;
    g.shadowColor = this.sky.hudGlow;
    g.shadowBlur = 8 * dpr;
    g.fillText(text, lw / 2, lh / 2);
    this.stateLine = { key: text, c, w: lw, h: lh };
    return this.stateLine;
  }

  // The numerals mirrored faintly in the open water under the far bank, rippled.
  private drawHudReflection(ctx: CanvasRenderingContext2D, f: PondFrame, t: number) {
    if (!f.hud || !this.num) return;
    const { w, dpr, reducedMotion: rm } = this.inp;
    const { hz, u } = this;
    const b = this.hudBox;
    const { c, pad } = this.num;
    const cw = b.width + pad * 2;
    const ch = b.size * NUM_BAND + pad * 2;
    const y0 = hz + (hz - (b.cy + ch / 2)) * REFLECT_AT;
    const rows = ch * REFLECT_SQUASH;
    const peak = (this.pal.night ? 0.24 : 0.18) * (f.hud.dim ? 0.5 : 1);
    const step = 2;
    ctx.save();
    this.mirror(ctx);
    for (let k = 0; k < rows; k += step) {
      const src = ch - (k + step) / REFLECT_SQUASH;
      if (src < 0) break;
      const off = rm ? 0 : Math.sin(t * 1.7 + k * 0.35) * (0.6 + k * 0.05) * u;
      ctx.globalAlpha = peak * (1 - k / rows) ** 1.2;
      ctx.drawImage(c, 0, src * dpr, c.width, (step / REFLECT_SQUASH) * dpr, w / 2 - cw / 2 + off, y0 + k, cw, step);
    }
    ctx.restore();
  }

  // The sun or moon keeps clear of the timer and the chip under it.
  private clearOfHud(x: number, y: number, R: number): number {
    const { w } = this.inp;
    const b = this.hudBox;
    const m = R + (w < 640 ? 24 : b.size * 0.6); // a phone has little room to spare
    const left = w / 2 - b.width / 2 - m;
    const right = w / 2 + b.width / 2 + m;
    if (x <= left || x >= right || y <= b.top - m || y >= b.chipTop + HUD_CHIP + m) return x;
    let nx = x >= w / 2 ? right : left;
    if (nx + R > w - 10) nx = left;
    if (nx - R < 10) nx = right;
    return nx;
  }

  // ── Built once per size / time of day ─────────────────────────────────────
  private buildSky() {
    const { w, dpr, tod } = this.inp;
    const { u, hz } = this;
    this.stars = Array.from({ length: Math.max(14, Math.round(w / 30)) }, (_, i) => [
      hash(i * 12.99) * w,
      (0.06 + hash(i * 78.23) * 0.62) * hz,
      hash(i * 3.1),
    ]);
    this.bigStars = Array.from({ length: Math.max(3, Math.round(w / 230)) }, (_, i) => [
      (0.04 + hash(i * 5.31 + 1.2) * 0.92) * w,
      (0.12 + hash(i * 9.17 + 2.7) * 0.4) * hz,
      6 + hash(i * 3.3) * 5,
    ]);
    for (const c of this.clouds) release(c.c);
    this.clouds = [];
    if (tod !== "night") {
      const fill = tod === "evening" ? "#f8dcc6" : tod === "morning" ? "#fbf5ea" : "#fbf9f2";
      for (let i = 0; i < 4; i++) {
        const sc = (0.5 + hash(i * 4.4) * 0.35) * u;
        const cw = 150 * sc;
        const ch = 76 * sc;
        const [c, g] = makeCanvas(cw * dpr, ch * dpr);
        g.scale(dpr, dpr);
        g.translate(cw / 2, ch * 0.58);
        const blob = (color: string, grow: number) => {
          g.fillStyle = color;
          for (const [dx, dy, ex, ey] of CLOUD_PUFFS) {
            g.beginPath();
            g.ellipse(dx * sc, dy * sc, (ex + grow) * sc, (ey + grow) * sc, 0, 0, TAU);
            g.fill();
          }
        };
        blob("#fbf7ec", 3.5);
        blob(INK, 2);
        blob(fill, 0);
        this.clouds.push({ c, x: hash(i * 7.7 + 0.3) * (w + cw * 2), y: (0.14 + hash(i * 2.2) * 0.3) * hz, w: cw, h: ch, v: (3 + hash(i) * 4) * u });
      }
    }
    release(this.softCloud);
    this.softCloud = softCloud(this.pal.night);
  }

  private buildCorners() {
    const { w, h } = this.inp;
    const u = this.u;
    for (const c of this.corners) release(c.c);
    const W = Math.min(w * 0.24, 200 * u);
    const H = Math.min(h * 0.32, 112 * u);
    this.corners = [
      { c: this.branch(W, H, false, 3), w: W, h: H, right: false, seed: 0 },
      { c: this.branch(W * 0.7, H * 0.66, true, 9), w: W * 0.7, h: H * 0.66, right: true, seed: 2 },
    ];
  }

  // A leafy branch reaching in from a top corner, hanging down toward the middle.
  private branch(W: number, H: number, right: boolean, seed: number): HTMLCanvasElement {
    const { dpr } = this.inp;
    const { u, pal } = this;
    const [c, g] = makeCanvas(W * dpr, H * dpr);
    g.scale(dpr, dpr);
    if (right) {
      g.translate(W, 0);
      g.scale(-1, 1);
    }
    const p0: [number, number] = [-4 * u, H * 0.2];
    const p1: [number, number] = [W * 0.5, H * 0.02];
    const p2: [number, number] = [W * 0.9, H * 0.58];
    const at = (s: number): [number, number] => [
      (1 - s) ** 2 * p0[0] + 2 * (1 - s) * s * p1[0] + s * s * p2[0],
      (1 - s) ** 2 * p0[1] + 2 * (1 - s) * s * p1[1] + s * s * p2[1],
    ];
    g.lineCap = "round";
    g.strokeStyle = pal.woodDark;
    for (let i = 0; i < 12; i++) {
      const [x0, y0] = at(i / 12);
      const [x1, y1] = at((i + 1) / 12);
      g.lineWidth = (3.4 - 2.4 * (i / 12)) * u;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
    const cols = [pal.leaf.dark, pal.leaf.mid, pal.leaf.light, pal.blossom.mid];
    const n = 20;
    for (let i = 0; i < n; i++) {
      const s = 0.06 + (i / n) * 0.94;
      const [x, y] = at(s);
      const up = i % 3 === 2;
      const side = i % 2 ? 1 : -1;
      const ang = (up ? -Math.PI / 2 : Math.PI / 2) + side * (0.45 + hash(seed + i) * 0.55) - 0.25;
      const len = (12 + hash(seed + i * 3) * 8) * u * (1 - s * 0.3);
      const fill = cols[Math.floor(hash(seed + i * 5) * cols.length)];
      const tx = x + Math.cos(ang) * len;
      const ty = y + Math.sin(ang) * len;
      const nx = -Math.sin(ang) * len * 0.3;
      const ny = Math.cos(ang) * len * 0.3;
      inked(g, () => {
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo((x + tx) / 2 + nx, (y + ty) / 2 + ny, tx, ty);
        g.quadraticCurveTo((x + tx) / 2 - nx, (y + ty) / 2 - ny, x, y);
        g.closePath();
      }, fill, 1.2 * u, false);
      g.strokeStyle = pal.leaf.deep;
      g.globalAlpha = 0.45;
      g.lineWidth = 0.8 * u;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (tx - x) * 0.8, y + (ty - y) * 0.8);
      g.stroke();
      g.globalAlpha = 1;
    }
    if (this.light && !pal.night) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = this.light;
      g.fillRect(0, 0, c.width, c.height);
    }
    return c;
  }

  // The far bank as one strip that repeats along the lake: a forest behind, the
  // subject groves (facing Havi), the dock with its rowboat, lanterns, reeds.
  private paintBank(groves: Grove[]): Strip {
    const { w, dpr } = this.inp;
    const { u, pal, sky } = this;
    const night = pal.night;
    const H = BANK_H * u;
    const base = H; // where the bank meets the water
    const rG = 12.5 * u; // a grove tree's canopy
    const step = rG * 1.75;
    const blocks = groves.map((gr) => {
      const rows = gr.trees <= 6 ? 1 : gr.trees <= 20 ? 2 : gr.trees <= 48 ? 3 : 4;
      const cols = Math.ceil(gr.trees / rows);
      return { gr, rows, cols, wd: cols * step + rG * 1.5 };
    });
    const gapG = 70 * u;
    const grovesW = blocks.reduce((t, b) => t + b.wd, 0) + gapG * Math.max(0, blocks.length - 1);
    const dockW = 120 * u;
    const P = Math.round(Math.max(w * 1.7, 1500 * u, grovesW + dockW + 360 * u));
    const s0 = 60 * u; // where the groves start
    const dockX = s0 + grovesW + (blocks.length ? 110 * u : 0);
    const spans: Array<[number, number]> = [[dockX - 20 * u, dockX + dockW]];
    // lay the strip out so the groves (or the dock) face the camera over Havi
    const centre = blocks.length ? s0 + grovesW / 2 : dockX + dockW / 2;
    const phase = mod(this.inp.w * 0.5 - centre + this.camFor(this.padX(this.inp.haviPad)) * P_BANK, P);

    const res = Math.min(dpr, MAX_STRIP_PX / P);
    const [c, g] = makeCanvas(P * res, H * res);
    g.scale(res, res);
    // draw at x, and again one period over where it crosses an end
    const wrap = (x: number, half: number, fn: (x: number) => void) => {
      fn(x);
      if (x - half < 0) fn(x + P);
      if (x + half > P) fn(x - P);
    };
    const hazy = (l: Leaf, k: number): Leaf => ({
      deep: mixColor(l.deep, sky.bottom, k),
      dark: mixColor(l.dark, sky.bottom, k),
      mid: mixColor(l.mid, sky.bottom, k),
      light: mixColor(l.light, sky.bottom, k),
    });
    const haze = night ? 0.22 : 0.34;
    const backLeaf = hazy(pal.leaf, haze);
    const backBlossom = hazy(pal.blossom, haze);
    const backPine = hazy(pal.pine, haze);

    // 1. the forest behind, one soft row of crowns
    for (let x = 0, i = 0; x < P; i++) {
      const r = (10 + hash(i * 5.7) * 7) * u;
      const bx = x + (hash(i * 9.1) - 0.5) * 4 * u;
      const kind = hash(i * 3.1);
      wrap(bx, r * 1.5, (xx) => {
        if (kind < 0.4) sidePine(g, xx, base - 6 * u, r * 3.2, r * 1.8, backPine, 0);
        else drawCanopy(g, xx, base - 8 * u - r * 0.9, r, 700 + i * 13, kind < 0.7 ? backLeaf : backBlossom, false);
      });
      x += r * (1.05 + hash(i * 2.9) * 0.4);
    }

    // 2. a few pines on the open bank; a round crown drawn crisp on the bank is
    // always a subject's tree (the rest of the forest stays soft behind)
    const open = (x: number, pad: number) => !spans.some(([a, b]) => x > a - pad && x < b + pad);
    const groveSpan = (x: number) => blocks.length && x > s0 - 24 * u && x < s0 + grovesW + 24 * u;
    for (let j = 0; j < P / (46 * u); j++) {
      const x = j * 46 * u + hash(j * 4.1) * 20 * u;
      if (hash(j * 6.7) < 0.72 || groveSpan(x) || !open(x, 16 * u)) continue;
      const r = (8 + hash(j * 8.3) * 5) * u;
      wrap(x, r * 1.5, (xx) => sidePine(g, xx, base - 2 * u, r * 3.4, r * 1.9, pal.pine, 1.2 * u));
    }

    // 3. the groves: one tree in the subject's colour per SESSIONS_PER_TREE sessions
    let s = s0;
    const beds: Array<[number, number, string]> = [];
    for (const b of blocks) {
      const leaf = leafFrom(b.gr.color, night);
      let seed0 = 0;
      for (let i = 0; i < b.gr.key.length; i++) seed0 = (seed0 * 31 + b.gr.key.charCodeAt(i)) % 9973;
      for (let row = b.rows - 1; row >= 0; row--) {
        const k = 1 - row * 0.1;
        for (let col = 0; col < b.cols; col++) {
          const idx = col * b.rows + row; // filled column by column, like the lake
          if (idx >= b.gr.trees) continue;
          const sd = seed0 + idx * 17;
          const r = rG * k * (0.9 + hash(sd) * 0.2);
          const x = s + rG + col * step + (row % 2) * step * 0.5 + (hash(sd + 2) - 0.5) * 2 * u;
          const yb = base - 2.5 * u - row * 5 * u;
          wrap(x, r * 1.5, (xx) => {
            const cy = sideTree(g, xx, yb, r, sd, leaf, 5 * u * k, pal.woodDark);
            drawBushBlooms(g, xx, cy, r * 0.85, sd, night ? "#d8d2c0" : "#fffaf0");
          });
        }
      }
      beds.push([s, s + b.wd, b.gr.color]);
      s += b.wd + gapG;
    }

    // 4. the bank itself: a grassy lip over a strip of wet sand
    const k1 = Math.max(1, Math.round(P / (90 * u)));
    const k2 = Math.max(1, Math.round(P / (37 * u)));
    g.beginPath();
    g.moveTo(0, base);
    for (let x = 0; x <= P; x += 6 * u) {
      g.lineTo(x, base - 3.2 * u + Math.sin((x / P) * TAU * k1) * 0.8 * u + Math.sin((x / P) * TAU * k2 + 1) * 0.5 * u);
    }
    g.lineTo(P, base);
    g.closePath();
    g.fillStyle = pal.grass;
    g.fill();
    g.fillStyle = pal.sandWet;
    g.fillRect(0, base - 1.2 * u, P, 1.2 * u);

    // 5. flowers: a bed in its colour along each grove, a few wild ones elsewhere
    for (const [a, b, color] of beds) {
      for (let x = a + 3 * u, i = 0; x < b - 2 * u; x += 3.6 * u, i++) {
        const fx = x + (hash(i * 3.9 + a) - 0.5) * 2 * u;
        wrap(fx, 3 * u, (xx) => drawTinyFlower(g, xx, base - 2.4 * u - hash(i * 7.1) * 1.6 * u, 2.3 * u, color));
      }
    }
    for (let j = 0; j < P / (13 * u); j++) {
      const x = j * 13 * u + hash(j * 2.3) * 6 * u;
      if (hash(j * 9.7) < 0.6 || groveSpan(x) || !open(x, 4 * u)) continue;
      wrap(x, 2 * u, (xx) => drawTinyFlower(g, xx, base - 2.4 * u - hash(j) * 1.4 * u, 1.2 * u, pal.flowers[hash(j * 5.5) < 0.6 ? 0 : 1]));
    }

    // 6. rocks and reeds at the water's edge
    for (let j = 0; j < P / (70 * u); j++) {
      const x = j * 70 * u + hash(j * 3.3 + 5) * 30 * u;
      if (!open(x, 10 * u)) continue;
      if (hash(j * 4.9) < 0.3) {
        const rr = (3 + hash(j * 6.1) * 2.5) * u;
        wrap(x, rr * 2, (xx) =>
          inked(g, () => {
            g.beginPath();
            g.ellipse(xx, base - rr * 0.35, rr, rr * 0.6, 0, Math.PI, TAU);
            g.closePath();
          }, mixColor(pal.pebble, "#4a4a44", 0.25), 0.9 * u, false),
        );
      } else wrap(x, 8 * u, (xx) => sideReeds(g, xx, base, u, pal, j));
    }

    // 7. the dock with its rowboat, and lanterns
    const lanterns: Array<[number, number]> = [];
    const lantern = (x: number) => {
      wrap(x, 4 * u, (xx) => {
        g.fillStyle = pal.woodDark;
        g.fillRect(xx - 0.8 * u, base - 18 * u, 1.6 * u, 16 * u);
        inked(g, () => {
          g.beginPath();
          g.roundRect(xx - 2.6 * u, base - 22.5 * u, 5.2 * u, 5.8 * u, 1.2 * u);
        }, pal.woodDark, 0.9 * u, false);
        g.fillStyle = night ? "#ffd98a" : "#efe2b8";
        g.fillRect(xx - 1.5 * u, base - 21.4 * u, 3 * u, 3.4 * u);
      });
      lanterns.push([mod(x, P), base - 19.5 * u]);
    };
    const dw = 58 * u;
    wrap(dockX + dw / 2, dw, (xx) => {
      const x0 = xx - dw / 2;
      g.fillStyle = pal.woodDark;
      for (const px of [3 * u, dw / 2, dw - 3 * u]) g.fillRect(x0 + px - 1.1 * u, base - 5 * u, 2.2 * u, 5 * u);
      inked(g, () => {
        g.beginPath();
        g.rect(x0, base - 6.2 * u, dw, 2.6 * u);
      }, pal.wood, 1.1 * u, false);
      g.strokeStyle = pal.woodDark;
      g.lineWidth = 0.7 * u;
      g.beginPath();
      for (let px = 6 * u; px < dw; px += 6 * u) {
        g.moveTo(x0 + px, base - 6.2 * u);
        g.lineTo(x0 + px, base - 3.6 * u);
      }
      g.stroke();
      // the rowboat tied at the end
      const bx = x0 + dw + 5 * u;
      const bl = 30 * u;
      inked(g, () => {
        g.beginPath();
        g.moveTo(bx, base - 6.4 * u);
        g.quadraticCurveTo(bx + bl / 2, base - 4.6 * u, bx + bl, base - 6.8 * u);
        g.lineTo(bx + bl - 4 * u, base);
        g.lineTo(bx + 3.5 * u, base);
        g.closePath();
      }, pal.wood, 1.1 * u, false);
      g.strokeStyle = pal.woodLight;
      g.lineWidth = 0.9 * u;
      g.beginPath();
      g.moveTo(bx + 2 * u, base - 5.2 * u);
      g.quadraticCurveTo(bx + bl / 2, base - 3.6 * u, bx + bl - 2 * u, base - 5.6 * u);
      g.stroke();
      g.strokeStyle = pal.woodDark;
      g.lineWidth = 0.6 * u;
      g.beginPath();
      g.moveTo(x0 + dw - 3 * u, base - 6 * u);
      g.quadraticCurveTo(x0 + dw + 2 * u, base - 3 * u, bx + 1.5 * u, base - 5.8 * u);
      g.stroke();
    });
    lantern(dockX + dw - 3 * u);
    lantern(dockX + dockW + 260 * u);
    lantern(s0 - 30 * u);

    // 8. the time of day's light, and a little haze so the bank sits far away
    g.globalCompositeOperation = "source-atop";
    if (this.light && !night) {
      g.fillStyle = this.light;
      g.fillRect(0, 0, P, H);
    }
    g.globalAlpha = night ? 0.06 : 0.1;
    g.fillStyle = sky.bottom;
    g.fillRect(0, 0, P, H);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    return { c, P, phase, lanterns };
  }
}

// ── Drawing helpers ─────────────────────────────────────────────────────────

// A round tree from the side: trunk + a crown of puffs. Returns the crown's y.
function sideTree(g: CanvasRenderingContext2D, x: number, base: number, r: number, seed: number, leaf: Leaf, trunk: number, wood: string): number {
  inked(g, () => {
    g.beginPath();
    g.rect(x - r * 0.14, base - trunk - r * 0.3, r * 0.28, trunk + r * 0.3);
  }, wood, Math.max(0.8, r * 0.08), false);
  const cy = base - trunk - r * 0.8;
  drawCanopy(g, x, cy, r, seed, leaf, true);
  return cy;
}

// A pine from the side: three tiers, shaded on the left.
function sidePine(g: CanvasRenderingContext2D, x: number, base: number, ht: number, wd: number, leaf: Leaf, line: number) {
  for (let t = 0; t < 3; t++) {
    const ty = base - ht * 0.82 * (t / 3);
    const tw = wd * (1 - (t / 3.5) * 0.78);
    const ay = ty - ht * 0.42;
    const tier = () => {
      g.beginPath();
      g.moveTo(x, ay);
      g.lineTo(x - tw / 2, ty);
      g.quadraticCurveTo(x, ty + ht * 0.04, x + tw / 2, ty);
      g.closePath();
    };
    tier();
    g.fillStyle = leaf.mid;
    g.fill();
    g.beginPath();
    g.moveTo(x, ay);
    g.lineTo(x - tw / 2, ty);
    g.lineTo(x, ty);
    g.closePath();
    g.fillStyle = leaf.dark;
    g.fill();
    if (line > 0) {
      tier();
      g.strokeStyle = INK;
      g.lineWidth = line;
      g.lineJoin = "round";
      g.stroke();
    }
  }
}

// A clump of reeds with cattails at the water's edge.
function sideReeds(g: CanvasRenderingContext2D, x: number, base: number, u: number, pal: Pal, seed: number) {
  g.lineCap = "round";
  g.lineWidth = 1.2 * u;
  for (let i = 0; i < 6; i++) {
    const bx = x + (i - 2.5) * 1.4 * u;
    const ht = (7 + hash(seed * 3 + i) * 8) * u;
    const lean = (hash(seed + i * 7) - 0.5) * 5 * u;
    g.strokeStyle = i % 2 ? pal.reed : pal.reedHi;
    g.beginPath();
    g.moveTo(bx, base);
    g.quadraticCurveTo(bx + lean * 0.3, base - ht * 0.6, bx + lean, base - ht);
    g.stroke();
    if (i === 1 || i === 4) {
      g.fillStyle = pal.cattail;
      g.beginPath();
      g.ellipse(bx + lean * 0.8, base - ht * 0.84, 1.1 * u, 2.6 * u, 0, 0, TAU);
      g.fill();
    }
  }
}

// A water lily from the side: closed (a bud) at 0, fully open at 1.
function drawLily(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, open: number) {
  const edge = mixColor(color, "#3a1030", 0.5);
  const back = mixColor(color, "#3a1030", 0.12);
  const front = mixColor(color, "#ffffff", 0.28);
  const spread = 0.12 + 0.88 * clamp(open, 0, 1.15);
  const petal = (ang: number, len: number, wid: number, fill: string) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-wid, -len * 0.5, 0, -len);
    ctx.quadraticCurveTo(wid, -len * 0.5, 0, 0);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(0.8, r * 0.07);
    ctx.stroke();
    ctx.restore();
  };
  ctx.fillStyle = "#3c7336";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.04, r * 0.4 * (0.6 + 0.4 * open), r * 0.13, 0, 0, TAU);
  ctx.fill();
  for (const a of [-1.15, -0.6, 0.6, 1.15]) petal(a * spread, r * 0.92, r * 0.3, back);
  if (open > 0.35) {
    ctx.fillStyle = "#f6d84a";
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.2, r * 0.22 * Math.min(1, open), r * 0.1, 0, 0, TAU);
    ctx.fill();
  }
  for (const a of [-0.8, -0.28, 0.28, 0.8]) petal(a * spread * 0.9, r * 0.8, r * 0.3, front);
}

// Soft rounded ridges, fading into the sky.
function ridge(g: CanvasRenderingContext2D, w: number, hz: number, off: number, amp: number, period: number, seed: number, color: string) {
  g.beginPath();
  g.moveTo(0, hz);
  for (let x = 0; x <= w + 12; x += 12) {
    const X = ((x + off) / period) * TAU;
    g.lineTo(x, hz - amp * (0.62 + 0.24 * Math.sin(X + seed) + 0.14 * Math.sin(X * 2.7 + seed * 3)));
  }
  g.lineTo(w + 12, hz);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

function fourPointStar(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const inner = r * 0.34;
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (Math.PI / 4) * k - Math.PI / 2;
    const rad = k % 2 === 0 ? r : inner;
    if (k === 0) g.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    else g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
}

// A big golden crescent in a soft glow. No ink outline (like the sun): the stars
// and the sky show through the part of the disc that is cut away.
function drawMoon(g: CanvasRenderingContext2D, mx: number, my: number, R: number) {
  const glo = g.createRadialGradient(mx, my, R * 0.4, mx, my, R * 3);
  glo.addColorStop(0, "rgba(244,205,110,0.26)");
  glo.addColorStop(0.5, "rgba(244,199,78,0.07)");
  glo.addColorStop(1, "rgba(244,199,78,0)");
  g.fillStyle = glo;
  g.fillRect(mx - R * 3, my - R * 3, R * 6, R * 6);
  // the crescent: the disc less a second, offset one (even-odd clip)
  g.save();
  g.beginPath();
  g.arc(mx, my, R, 0, TAU);
  g.clip();
  g.beginPath();
  g.rect(mx - R - 2, my - R - 2, (R + 2) * 2, (R + 2) * 2);
  g.arc(mx + R * 0.62, my - R * 0.14, R * 1.06, 0, TAU);
  g.clip("evenodd");
  g.fillStyle = "#f4c74e";
  g.fillRect(mx - R - 2, my - R - 2, (R + 2) * 2, (R + 2) * 2);
  g.fillStyle = "#ffe08a";
  g.beginPath();
  g.ellipse(mx - R * 0.35, my - R * 0.1, R * 0.45, R * 0.7, 0, 0, TAU);
  g.fill();
  g.restore();
}

// A soft cartoon sun: short hand-drawn rays by day, a big warm glow at sunset.
// No ink outline: a glowing disc with a lighter heart.
function drawSun(g: CanvasRenderingContext2D, x: number, y: number, R: number, fill: string, glow: string, evening: boolean, t: number) {
  if (evening) {
    const glo = g.createRadialGradient(x, y, R * 0.5, x, y, R * 4);
    glo.addColorStop(0, "rgba(255,196,120,0.4)");
    glo.addColorStop(1, "rgba(255,170,100,0)");
    g.fillStyle = glo;
    g.fillRect(x - R * 4, y - R * 4, R * 8, R * 8);
  } else {
    g.save();
    g.strokeStyle = "#e9d99f";
    g.lineCap = "round";
    g.lineWidth = 3;
    const sway = Math.sin(t * 0.3) * 0.06;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + sway;
      const r0 = R + 7;
      const r1 = R + 7 + (i % 2 ? 9 : 14) * (R / 19);
      g.beginPath();
      g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      g.stroke();
    }
    g.restore();
  }
  const halo = g.createRadialGradient(x, y, R * 0.85, x, y, R * 1.45);
  halo.addColorStop(0, glow);
  halo.addColorStop(1, "rgba(255,240,200,0)");
  g.fillStyle = halo;
  g.beginPath();
  g.arc(x, y, R * 1.45, 0, TAU);
  g.fill();
  const disc = g.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.1, x, y, R);
  disc.addColorStop(0, mixColor(fill, "#ffffff", 0.45));
  disc.addColorStop(1, fill);
  g.fillStyle = disc;
  g.beginPath();
  g.arc(x, y, R, 0, TAU);
  g.fill();
}

// A soft white cloud (the one we rise into), in radial puffs.
function softCloud(night: boolean): HTMLCanvasElement {
  const S = 320;
  const [c, g] = makeCanvas(S, S * 0.6);
  const base = night ? "148,163,182" : "255,255,255";
  for (let i = 0; i < 22; i++) {
    const t = hash(i * 1.37);
    const mid = 1.2 - Math.abs(t - 0.5);
    const x = S / 2 + (t - 0.5) * S * 0.62;
    const y = S * 0.3 + (hash(i * 2.9) - 0.5) * S * 0.14 * mid;
    const pr = S * (0.07 + hash(i * 4.1) * 0.07) * mid;
    const gr = g.createRadialGradient(x, y, pr * 0.25, x, y, pr);
    gr.addColorStop(0, `rgba(${base},1)`);
    gr.addColorStop(0.65, `rgba(${base},0.85)`);
    gr.addColorStop(1, `rgba(${base},0)`);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, pr, 0, TAU);
    g.fill();
  }
  return c;
}
