// ---------------------------------------------------------------------------
// Group study: the session lake and the group's achievement lake, on one canvas.
//
// Built from the approved preview (src/lib/study-preview/groupScene.ts). The
// lakes, their growth and the sky are LakeWorld's, exactly as on the student's
// own lake map; this file adds the desks, the Havis, the centre leaf, the river
// trip between the two lakes, and the lake map's camera and gestures (the
// camera section is GroveModal's, unchanged).
//
// The screen gives it a SceneModel every frame (who sits where, who is awake,
// the phase); the scene shows the difference from the last one: a desk rising
// out of the water or sinking into it with spreading water, a Havi coming out
// of the water to sit, or hopping back in when he leaves.
//
// The lake and the desks fit how many desks stand (her decision, 2026-10-06,
// replacing fixed places): the desks share a ring around the centre leaf,
// evenly, and the lake is sized for them. When a desk rises the others glide
// aside to make room, and when one has sunk they close up; the lake fades to
// its new size.
// ---------------------------------------------------------------------------

import { LakeWorld, Sky, ZOOM_MS, type Camera, type LakeInput } from "@/lib/pomodoro/lakeWorld";
import { clamp, lerp, smooth, easeInOut } from "@/lib/pomodoro/math";
import { drawGroupLotus, drawGrovePad, drawGroveBloom, type GrovePadSpec } from "@/lib/pomodoro/pondRenderer";
import {
  ARRIVE_MS,
  DESK_RISE_MS,
  DESK_SINK_MS,
  LEAVE_MS,
  POKE_MS,
  drawDeskAt,
  drawPreparedDesk,
  drawSocialHavi,
  drawSpreadingWater,
  drawWaterArrival,
  drawWaterLeave,
  type DeskPose,
} from "./havi";
import { deskOffset, type DeskSlot } from "./rules";

import { lakeCameraFrame, lakeZoomTarget, type Flight } from "@/lib/pomodoro/lakeCamera";

type Pt = { x: number; y: number };
// A camera move between zoom levels (or back to the middle), exactly as on the
// student's own lake map (GroveModal): the camera rises or comes down along a
// log-scale zoom, turns a little on the way and settles.
export interface CameraUi { landed: boolean; level: number; count: number; away: boolean }
const ease = (q: number) => 1 - (1 - clamp(q, 0, 1)) ** 3;

export type SceneView = "session" | "achievement";
/** "closed": no sitting open, open water. */
export type ScenePhase = "closed" | "waiting" | "study" | "paused" | "break";

export interface SceneMember {
  cosmetics?: readonly string[];
  /** Havi's colour. */
  color: string;
  /** The flower colour of the member's pads. */
  flower: string;
}

export interface SceneModel {
  readyGlowAt?: number;
  /** Shared server time for synchronized rest activities. */
  serverTime?: number;
  night: boolean;
  reduced: boolean;
  view: SceneView;
  phase: ScenePhase;
  /** 0 to 1 through the study time (the centre leaf grows with it). */
  progress: number;
  /** Desks by place (rules.planDesks); null is open water. */
  places: readonly (DeskSlot | null)[];
  /** Active members by user id. */
  members: ReadonlyMap<string, SceneMember>;
  /** On the page and awake. A member missing here (page hidden, phone in a pocket) sleeps at the desk. */
  awake: ReadonlyMap<string, boolean>;
  /** The group lake's pads, oldest first, by owner's user id. */
  harvest: readonly string[];
  /** Flower colour per pad owner, former members included. */
  harvestFlowers: ReadonlyMap<string, string>;
  /** Owners whose pads are highlighted on the group lake (none = all shown). */
  selected: ReadonlySet<string>;
  /** The pointer over the canvas (CSS px), for the names on hover. */
  pointer: Pt | null;
}

// ---------------------------------------------------------------------------
// Where things are
// ---------------------------------------------------------------------------

/** A desk's spot on its ring: the ellipse angle, and the ring's radii at the design size (1200 x 860). */
export interface Spot { a: number; rx: number; ry: number }

/** The ring `n` desks share around the centre leaf: just big enough for them
 *  (about 104 apart at ten), never so small that a desk touches the leaf. */
export function ringFor(n: number) {
  return { rx: Math.max(110, 20.5 * n), ry: Math.max(86, 12.2 * n) };
}

const ringSpotsCache = new Map<number, Spot[]>();
/**
 * The spots of `n` desks, evenly apart along their ring, in row order: the
 * first just left of the front (the dock's side), round by the left and the
 * back, the last just right of the front. The front keeps a gap, so the
 * centre leaf shows; two desks stand either side of it.
 */
export function ringSpots(n: number): Spot[] {
  const known = ringSpotsCache.get(n);
  if (known) return known;
  const { rx, ry } = ringFor(n);
  const step = 0.001, speed = (a: number) => Math.hypot(rx * Math.sin(a), ry * Math.cos(a));
  let around = 0;
  for (let a = 0; a < Math.PI * 2; a += step) around += speed(a) * step;
  const out: Spot[] = [];
  let a = Math.PI / 2, run = 0;
  for (let j = 0; j < n; j++) {
    const want = (around * (j + 0.5)) / n;
    while (run < want) { run += speed(a) * step; a += step; }
    out.push({ a, rx, ry });
  }
  ringSpotsCache.set(n, out);
  return out;
}

/** Where a spot is on the session lake. */
export function spotPoint(s: Spot, u = 1): Pt {
  return { x: Math.cos(s.a) * s.rx * u, y: Math.sin(s.a) * s.ry * u };
}

/** The desks' centres for `n` desks, in row order. */
export function deskLayout(n: number, u = 1): Pt[] {
  return ringSpots(n).map((s) => spotPoint(s, u));
}

// The session lake at the screen's real size, as the lake map is drawn: desks
// take the lake map's pad size (lakeWorld: clamp(min(w, h) * 0.048, 22, 34) px,
// 34 = the design), and the lake keeps the design's room around `n` desks
// (bigger as more stand). LakeWorld caps the lake at the screen-fit size, so on
// a narrow screen a fuller lake takes slightly smaller desks instead.
export function sessionSizing(w: number, h: number, n: number) {
  const design = 0.5 + clamp(n, 2, 10) * 0.018; // the compact lake at 1200 x 860 (0.68 for ten)
  const fit = Math.min(w * 0.42, h * 0.74);
  const roomFor = (u: number) => design * u * Math.max(504 / fit, 860 / h);
  let u = clamp(Math.min(w, h) * 0.048, 22, 34) / 34;
  let lake = roomFor(u);
  if (lake > 1) { u /= lake; lake = 1; }
  return { u, lakeScale: clamp(lake, 0.45, 1) };
}

/** The target under a canvas point, or null. */
function hitTest<K>(pointer: Pt | null, cam: Camera, w: number, h: number, targets: { x: number; y: number; r: number; key: K }[]): K | null {
  if (!pointer) return null;
  const dx = pointer.x - w / 2, dy = pointer.y - h / 2;
  const x = (Math.cos(cam.rot) * dx + Math.sin(cam.rot) * dy) / cam.s + cam.x;
  const y = (-Math.sin(cam.rot) * dx + Math.cos(cam.rot) * dy) / cam.s + cam.y;
  let closest = Infinity, found: K | null = null;
  for (const t of targets) {
    const d = Math.hypot(x - t.x, y - t.y);
    if (d <= t.r + 5 && d < closest) { closest = d; found = t.key; }
  }
  return found;
}

// ---------------------------------------------------------------------------
// What each desk place is doing on screen
// ---------------------------------------------------------------------------

interface PlaceAnim {
  /** A desk stands here (or is rising); false while it sinks. */
  desk: boolean;
  /** When it began rising or sinking. */
  deskAt: number;
  /** Who sits here, and when they come out of the water. */
  who: string | null;
  whoAt: number;
  /** Who is hopping off into the water, and since when. */
  gone: string | null;
  goneAt: number;
  /** Its spot on the ring, gliding from `from` to `to` since `moveAt`. */
  from: Spot;
  to: Spot;
  moveAt: number;
}

const NEVER = -1e12;
/** The desks gliding to their new spots, and the desks' size following the lake. */
const GLIDE_MS = 1200;
/** A desk rising between others waits for them to start making room. */
const RISE_AFTER_GLIDE_MS = 500;
/** The lake fading from its old size to its new one. */
const LAKE_FADE_MS = 1100;
/** The river trip between the two lakes. */
const TRIP_MS = 1400;
/** Arrivals on landing come out of the water one after the other. */
const LANDING_STAGGER_MS = 180;
/** A rising desk is nearly up when its member comes out of the water. */
const SIT_AFTER_RISE = 0.8;
/** How long a waking Havi stretches before studying again. */
const WAKE_MS = 3000;

export class StudyScene {
  private session = new LakeWorld(); private harvest = new LakeWorld();
  private sessionSky = new Sky(); private harvestSky = new Sky();
  private sessionSig = ""; private harvestSig = ""; private harvestRef: readonly string[] | null = null;
  private started = -1; private arrivalAt = 0;
  private view: SceneView = "session"; private travelFrom: SceneView | null = null;
  private lastCam: Camera = { x: 0, y: 0, s: 1, rot: 0 };
  private departure: Camera = this.lastCam;
  // The session lake's size as built, the desks' size on it (gliding to a new
  // size with the desks), and the lake it replaced while that fades out.
  private lakeScale = 0.68;
  private uAnim = { from: 1, to: 1, at: NEVER };
  private oldLake: LakeWorld | null = null; private fadeAt = NEVER;
  private fadeCanvas: HTMLCanvasElement | null = null;
  private hovered: string | null = null;
  private padHover: number | null = null;
  // The landed camera, as on the lake map: the zoom level, where it rests, a
  // flight in progress, the glide left over after a drag, and a little
  // look-around that follows the mouse.
  private level = 0; private base: Pt = { x: 0, y: 0 }; private flight: Flight | null = null;
  private vel: Pt = { x: 0, y: 0 }; private dragging = false;
  private look = { x: 0, y: 0, tx: 0, ty: 0 };
  private landed = false; private reduced = false; private lastFrame = 0;
  private camUi: CameraUi = { landed: false, level: 0, count: 1, away: false };
  // Pointer gestures: the pressed point, fingers for a pinch, the last tap
  // (for a double tap) and one wheel step per scroll gesture.
  private down: { x: number; y: number; t: number; lx: number; ly: number; lt: number } | null = null;
  private pts = new Map<number, Pt>(); private pinch: number | null = null;
  private lastTap = { t: -1e9, x: 0, y: 0 };
  private wheelAcc = 0; private wheelLast = 0; private wheelDone = false;
  // The desks, the Havis' last taps and when each fell asleep or woke.
  private places: (PlaceAnim | undefined)[] = [];
  private placesSynced = false;
  /** The places on the ring now (standing, rising or still sinking), and its key. */
  private ring = new Set<number>(); private ringKey = "";
  private pokes = new Map<string, number>();
  private sleep = new Map<string, { awake: boolean; at: number }>();
  private appearances = new Map<string, SceneMember>();

  /** Called when my tap lands on a Havi and he reacts (the screen tells the others). */
  onTap: ((userId: string) => void) | null = null;

  get hoveredMember() { return this.hovered; }
  get hoveredPad() { return this.padHover; }
  get ui() { return this.camUi; }
  /** Something on screen is moving: draw every frame, not at the idle rate. */
  get moving() {
    const now = performance.now();
    if (!this.landed || this.flight !== null || this.dragging || Math.abs(this.vel.x) + Math.abs(this.vel.y) > 0.002) return true;
    for (const t of this.pokes.values()) if (now - t < POKE_MS) return true;
    if (this.oldLake || now - this.uAnim.at < GLIDE_MS) return true;
    return this.places.some((p) => p && (now - p.deskAt < 2000 || now - p.whoAt < ARRIVE_MS || now - p.goneAt < LEAVE_MS || now - p.moveAt < GLIDE_MS));
  }

  private w: number; private h: number; private dpr: number;
  constructor(w: number, h: number, dpr: number) {
    this.w = w; this.h = h; this.dpr = dpr;
  }

  dispose() { this.appearances.clear(); this.dropOldLake(); this.session.dispose(); this.harvest.dispose(); this.sessionSky.dispose(); this.harvestSky.dispose(); }

  /** The canvas changed size (CSS px): both lakes are rebuilt for it. */
  resize(w: number, h: number, dpr: number) {
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.sessionSig = ""; this.harvestSig = "";
  }

  /** Restart immediately; taps during arrival are ignored until Havi is seated. */
  poke(userId: string, now = performance.now()): boolean {
    const p = this.places.find((pl) => pl?.who === userId);
    if (!p || now < p.whoAt + (this.reduced ? 0 : ARRIVE_MS)) return false;
    this.pokes.set(userId, now);
    return true;
  }

  // ── Camera (GroveModal's, unchanged) ─────────────────────────────────────
  private resetCamera() {
    this.level = this.view === "session" ? 2 : 0; this.base = { x: 0, y: 0 }; this.flight = null;
    this.vel = { x: 0, y: 0 }; this.dragging = false; this.down = null;
  }
  /** After a lake is rebuilt: keep the level and spot if they still fit. */
  private refit(world: LakeWorld) {
    if (this.flight) { this.base = { x: this.flight.x1, y: this.flight.y1 }; this.flight = null; }
    this.level = Math.min(this.level, world.levels.length - 1);
    [this.base.x, this.base.y] = world.clampCam(this.base.x, this.base.y, world.levels[this.level]);
  }
  private fly(x1: number, y1: number, next: number, dir: number, dur = ZOOM_MS) {
    const world = this.world(this.view), s1 = world.levels[next], cam = this.lastCam;
    [x1, y1] = world.clampCam(x1, y1, s1);
    this.flight = { x0: cam.x, y0: cam.y, s0: cam.s, r0: cam.rot, x1, y1, s1, t0: performance.now(), dur: this.reduced ? 0 : dur, dir };
    this.level = next; this.vel = { x: 0, y: 0 };
  }
  /** One zoom step (dir +1 = closer), about a canvas point if given. */
  zoomStep(dir: 1 | -1, at?: Pt) {
    if (!this.landed) return;
    const world = this.world(this.view), next = this.level - dir;
    if (next < 0 || next >= world.levels.length) return;
    const s1 = world.levels[next], cam = this.lastCam;
    const { x: x1, y: y1 } = lakeZoomTarget(cam, this.base, this.flight, s1, this.w, this.h, at);
    this.fly(x1, y1, next, dir);
  }
  /** Back to the middle of the lake, at the landing view. */
  home() {
    if (!this.landed) return;
    this.fly(0, 0, 0, this.level > 0 ? 1 : 0, this.level > 0 ? ZOOM_MS : ZOOM_MS * 0.7);
  }
  private landedCamera(world: LakeWorld, now: number): Camera {
    const dt = this.lastFrame ? Math.min(64, now - this.lastFrame) : 16;
    this.lastFrame = now;
    const result = lakeCameraFrame(world, this.level, this.base, this.vel, this.look,
      this.dragging, this.reduced, now, dt, this.flight);
    this.flight = result.flight;
    return result.camera;
  }

  private pushUi(cam: Camera) {
    const world = this.world(this.view);
    // "back to the middle" once the middle is near the edge of the screen or off it
    const away = this.landed && (Math.abs(cam.x) * cam.s > this.w * 0.42 || Math.abs(cam.y) * cam.s > this.h * 0.38);
    const next = { landed: this.landed, level: this.level, count: world.levels.length, away };
    const ui = this.camUi;
    if (next.landed !== ui.landed || next.level !== ui.level || next.count !== ui.count || next.away !== ui.away) this.camUi = next;
  }

  // ── Pointer (GroveModal's gestures; a tap on a Havi taps him) ────────────
  // Points are in CSS px from the canvas's top-left. Returns true while the map moves.
  pointerDown(id: number, q: Pt, now: number) {
    this.pts.set(id, q);
    if (this.pts.size === 2) { this.pinch = this.spread().d; this.down = null; this.dragging = false; return; }
    this.down = { x: q.x, y: q.y, t: now, lx: q.x, ly: q.y, lt: now };
    this.vel = { x: 0, y: 0 };
  }
  pointerMove(id: number, q: Pt, now: number, mouse: boolean): boolean {
    if (this.pts.has(id)) this.pts.set(id, q);
    if (this.pinch !== null && this.pts.size >= 2) {
      const sp = this.spread();
      if (sp.d / this.pinch > 1.35) { this.zoomStep(1, sp); this.pinch = sp.d; }
      else if (sp.d / this.pinch < 0.74) { this.zoomStep(-1, sp); this.pinch = sp.d; }
      return true;
    }
    const d = this.down;
    if (d) {
      if (!this.dragging && this.landed && !this.flight && Math.hypot(q.x - d.x, q.y - d.y) > 6) this.dragging = true;
      if (this.dragging) {
        const s = this.world(this.view).levels[this.level];
        const dx = (q.x - d.lx) / s, dy = (q.y - d.ly) / s;
        this.base.x -= dx; this.base.y -= dy;
        const dtm = Math.max(1, now - d.lt);
        this.vel.x = this.vel.x * 0.4 + (-dx / dtm) * 0.6; this.vel.y = this.vel.y * 0.4 + (-dy / dtm) * 0.6;
      }
      d.lx = q.x; d.ly = q.y; d.lt = now;
    } else if (mouse && !this.reduced) {
      this.look.tx = (q.x / this.w) * 2 - 1; this.look.ty = (q.y / this.h) * 2 - 1;
    }
    return this.dragging;
  }
  pointerUp(id: number, q: Pt, now: number) {
    this.pts.delete(id);
    if (this.pts.size < 2) this.pinch = null;
    const d = this.down;
    if (!d) return;
    if (!this.dragging && now - d.t < 350 && !this.flight) {
      // A tap on a Havi is always his, so two quick taps never zoom the map.
      if (this.tapAt(q, now)) this.lastTap = { t: -1e9, x: 0, y: 0 };
      else if (now - this.lastTap.t < 320 && Math.hypot(q.x - this.lastTap.x, q.y - this.lastTap.y) < 30) {
        this.zoomStep(1, q); this.lastTap = { t: -1e9, x: 0, y: 0 };
      } else this.lastTap = { t: now, x: q.x, y: q.y };
    }
    if (this.dragging && now - d.lt > 80) this.vel = { x: 0, y: 0 }; // held still before letting go
    this.dragging = false; this.down = null;
  }
  pointerCancel(id: number) {
    this.pts.delete(id);
    if (this.pts.size < 2) this.pinch = null;
    this.dragging = false; this.down = null;
  }
  pointerLeave() { if (!this.down) this.look.tx = this.look.ty = 0; }
  /** The wheel (or a trackpad pinch) steps between levels, about the cursor:
   *  one step per scroll gesture, however long its momentum runs on. */
  wheel(delta: number, at: Pt, now: number) {
    if (!this.landed) return;
    if (now - this.wheelLast > 220) { this.wheelAcc = 0; this.wheelDone = false; }
    this.wheelLast = now;
    if (this.wheelDone) return;
    this.wheelAcc += delta;
    if (Math.abs(this.wheelAcc) < 40) return;
    this.zoomStep(this.wheelAcc < 0 ? 1 : -1, at); this.wheelDone = true;
  }
  /** + / - zoom, the arrows glide the map. Returns true when the key was used. */
  key(key: string): boolean {
    if (key === "+" || key === "=") { this.zoomStep(1); return true; }
    if (key === "-" || key === "_") { this.zoomStep(-1); return true; }
    if (key.startsWith("Arrow") && this.landed && !this.flight) {
      const k = 0.9 / this.world(this.view).levels[this.level];
      if (key === "ArrowLeft") this.vel.x = -k;
      if (key === "ArrowRight") this.vel.x = k;
      if (key === "ArrowUp") this.vel.y = -k;
      if (key === "ArrowDown") this.vel.y = k;
      return true;
    }
    return false;
  }
  private spread() {
    const [a, b] = [...this.pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  /** Seated Havis, as tap and hover targets. */
  private haviTargets(now: number) {
    const u = this.uNow(now);
    const out: { x: number; y: number; r: number; key: string }[] = [];
    for (const p of this.places) {
      if (!p || !p.desk || !p.who || now < p.whoAt + (this.reduced ? 0 : ARRIVE_MS)) continue;
      out.push({ ...this.placePoint(p, now), r: 34 * u, key: p.who });
    }
    return out;
  }
  /** A tap on a member's Havi (session lake): he reacts as in the app, on
   *  every tap once seated, queueing any unfinished reactions.
   *  Returns true when the tap landed on a Havi. */
  private tapAt(q: Pt, now: number) {
    if (!this.landed || this.view !== "session") return false;
    const who = hitTest(q, this.lastCam, this.w, this.h, this.haviTargets(now));
    if (who === null) return false;
    if (this.poke(who, now)) this.onTap?.(who);
    return true;
  }

  private world(view: SceneView) { return view === "session" ? this.session : this.harvest; }
  private sky(view: SceneView) { return view === "session" ? this.sessionSky : this.harvestSky; }

  // ── The desks ────────────────────────────────────────────────────────────

  /** On the ring: standing, rising, or not yet under. */
  private onRing(p: PlaceAnim, now: number) {
    return p.desk || now - p.deskAt < DESK_SINK_MS;
  }

  /** A place's spot now, part way through its glide. */
  private spotNow(p: PlaceAnim, now: number): Spot {
    const q = easeInOut(clamp((now - p.moveAt) / GLIDE_MS, 0, 1));
    return { a: lerp(p.from.a, p.to.a, q), rx: lerp(p.from.rx, p.to.rx, q), ry: lerp(p.from.ry, p.to.ry, q) };
  }

  /** The desks' size now (it glides with them when the lake changes size). */
  private uNow(now: number) {
    const a = this.uAnim;
    return lerp(a.from, a.to, easeInOut(clamp((now - a.at) / GLIDE_MS, 0, 1)));
  }

  /** A place's centre on the session lake now. */
  private placePoint(p: PlaceAnim, now: number): Pt {
    return spotPoint(this.spotNow(p, now), this.uNow(now));
  }

  /** Compares the model's desks with what is on screen and starts the changes. */
  private syncPlaces(places: readonly (DeskSlot | null)[], now: number) {
    const landing = !this.placesSynced;
    this.placesSynced = true;
    const n = Math.max(places.length, this.places.length);
    let arrivals = 0;
    for (let i = 0; i < n; i++) {
      const slot = places[i] ?? null;
      let p = this.places[i];
      if (!p) {
        if (!slot) continue;
        const spot = { a: Math.PI / 2, rx: 0, ry: 0 }; // set when it joins the ring, below
        p = this.places[i] = { desk: false, deskAt: NEVER, who: null, whoAt: NEVER, gone: null, goneAt: NEVER, from: spot, to: spot, moveAt: NEVER };
      }
      if (slot && !p.desk) {
        p.desk = true;
        // Already there when I arrive; otherwise it rises now (from where a
        // sinking desk had got to, if it hadn't gone under yet). A new desk
        // among others waits a moment for them to start making room.
        const sunk = clamp((now - p.deskAt) / DESK_SINK_MS, 0, 1);
        const between = !this.ring.has(i) && this.ring.size > 0 && !this.reduced;
        p.deskAt = landing ? NEVER : now - (1 - sunk) * DESK_RISE_MS + (between ? RISE_AFTER_GLIDE_MS : 0);
      } else if (!slot && p.desk) {
        p.desk = false;
        const risen = clamp((now - p.deskAt) / DESK_RISE_MS, 0, 1);
        p.deskAt = now - (1 - risen) * DESK_SINK_MS;
      }
      // An away owner keeps the desk, empty, until the break.
      const who = slot && !slot.away ? slot.userId : null;
      if (who === p.who) continue;
      if (p.who && now >= p.whoAt) { p.gone = p.who; p.goneAt = now; }
      p.who = who;
      if (!who) { p.whoAt = NEVER; continue; }
      const deskUp = p.deskAt + DESK_RISE_MS * SIT_AFTER_RISE;
      p.whoAt = landing ? this.arrivalAt + arrivals++ * LANDING_STAGGER_MS : Math.max(now, deskUp);
    }

    // The ring: the desks on it share it evenly, in row order (rules.deskOffset:
    // the middle, then right and left in turn, so a new desk comes in at the
    // front, on alternate sides). When the set changes, everyone already on it
    // glides to their new spot; a new desk rises at its own.
    const onRing = this.places.flatMap((p, i) => (p && this.onRing(p, now) ? [i] : [])).sort((a, b) => deskOffset(a) - deskOffset(b));
    const key = onRing.join(",");
    if (key !== this.ringKey) {
      const spots = ringSpots(onRing.length);
      onRing.forEach((i, j) => {
        const p = this.places[i]!, target = spots[j];
        if (landing || this.reduced || !this.ring.has(i)) { p.from = p.to = target; p.moveAt = NEVER; return; }
        const from = this.spotNow(p, now);
        // the same way round the ring, never the long way
        const turn = Math.round((from.a - target.a) / (Math.PI * 2)) * Math.PI * 2;
        p.from = from; p.to = { ...target, a: target.a + turn }; p.moveAt = now;
      });
      this.ringKey = key; this.ring = new Set(onRing);
    }

    // Forget places with nothing left to show.
    while (this.places.length > 0) {
      const last = this.places[this.places.length - 1];
      if (last && (last.desk || now - last.deskAt < DESK_SINK_MS + 2000 || now - last.goneAt < LEAVE_MS)) break;
      this.places.pop();
    }
  }

  /** Havi's pose: asleep while his page is hidden, a short stretch on waking. */
  private pose(userId: string, model: SceneModel, now: number): { pose: DeskPose; since: number } {
    const awake = model.awake.get(userId) === true;
    let s = this.sleep.get(userId);
    if (!s) { s = { awake, at: NEVER }; this.sleep.set(userId, s); }
    else if (s.awake !== awake) { s.awake = awake; s.at = now; }
    const since = (now - s.at) / 1000;
    if (!awake) return { pose: "sleep", since };
    if (now - s.at < WAKE_MS) return { pose: "wake", since };
    if (model.phase === "break") {
      // Stable pseudo-random choice per member/time slot: every device sees
      // the same rest activity, without rerolling on every animation frame.
      const restTime = model.serverTime ?? now;
      let seed = Math.floor(restTime / 20_000);
      for (const ch of userId) seed = ((seed * 31) + ch.charCodeAt(0)) | 0;
      const poses: DeskPose[] = ["sleep", "phone", "look"];
      return { pose: poses[(seed >>> 0) % poses.length], since: (restTime % 20_000) / 1000 };
    }
    return { pose: model.phase === "study" ? "study" : "rest", since };
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  draw(ctx: CanvasRenderingContext2D, now: number, model: SceneModel) {
    const preparationStarted = performance.now();
    this.reduced = model.reduced;
    const base = { w: this.w, h: this.h, dpr: this.dpr, tod: model.night ? "night" as const : "morning" as const, reducedMotion: model.reduced };
    // Build the visible lake first. The other lake can wait until the camera
    // and arrivals have settled, or until its river trip is actually requested.
    const departure = this.started >= 0 && model.view !== this.view ? this.view
      : this.travelFrom && now - this.started < TRIP_MS ? this.travelFrom : null;
    const needsSession = model.view === "session" || departure === "session";
    const needsHarvest = model.view === "achievement" || departure === "achievement"
      || (this.started >= 0 && this.landed && !this.moving);
    // The session lake fits the desks on the ring (two at least; on the first
    // frame, the desks in the model).
    const want = sessionSizing(this.w, this.h, this.started < 0 ? model.places.filter(Boolean).length : this.ring.size);
    const sessionSig = `${this.w}|${this.h}|${model.night}|${model.reduced}`;
    if (needsSession && sessionSig !== this.sessionSig) {
      // first frame, a new size or theme: at once
      this.sessionSig = sessionSig;
      this.dropOldLake();
      this.buildSession(base, want.lakeScale);
      this.uAnim = { from: want.u, to: want.u, at: NEVER };
      if (this.view === "session" && this.started >= 0) this.refit(this.session);
    } else if (needsSession) {
      if (want.u !== this.uAnim.to) this.uAnim = { from: this.uNow(now), to: want.u, at: model.reduced ? NEVER : now };
      if (Math.abs(want.lakeScale - this.lakeScale) > 1e-3) this.resizeLake(base, want.lakeScale, now);
    }
    if (this.oldLake && now - this.fadeAt >= LAKE_FADE_MS) this.dropOldLake();
    const harvestSig = `${this.w}|${this.h}|${model.night}|${model.reduced}|${model.harvest.length}`;
    if (needsHarvest && (harvestSig !== this.harvestSig || model.harvest !== this.harvestRef)) {
      this.harvestSig = harvestSig; this.harvestRef = model.harvest;
      const padSpecs: GrovePadSpec[] = model.harvest.map((owner) => ({ key: owner, color: model.harvestFlowers.get(owner) ?? null, species: 0, flower: 0 }));
      this.harvest.build({ ...base, count: model.harvest.length, padSpecs, hideHomePad: true });
      this.harvestSky.build(this.w, this.h, model.night, (a) => this.harvest.cameraAtAltitude(a), this.harvest.diveTop, this.harvest.levels);
      if (this.view === "achievement" && this.started >= 0) this.refit(this.harvest);
    }
    if (this.started < 0) {
      // Cold canvas preparation must not consume the visible dive's duration.
      this.started = now + performance.now() - preparationStarted;
      this.view = model.view; this.travelFrom = null;
      this.arrivalAt = this.started + (model.reduced ? 0 : this.world(model.view).diveMs + 250);
      this.resetCamera();
    } else if (model.view !== this.view) {
      this.travelFrom = this.view; this.departure = this.lastCam; this.view = model.view;
      this.started = now + performance.now() - preparationStarted;
      this.resetCamera();
    }
    this.syncPlaces(model.places, now);

    const tripMs = this.travelFrom ? TRIP_MS : 0;
    const age = model.reduced ? Number.POSITIVE_INFINITY : Math.max(0, now - this.started);
    if (this.travelFrom && age < tripMs) {
      const q = age / tripMs, cam = this.riverCamera(this.travelFrom, q);
      this.landed = false; this.lastFrame = 0;
      this.paint(ctx, this.travelFrom, cam, now, model, true, 1 - ease(q)); this.pushUi(cam); return;
    }
    const world = this.world(this.view);
    const p = clamp((age - tripMs) / world.diveMs, 0, 1), diving = p < 1;
    this.landed = !diving;
    let cam: Camera;
    if (diving) {
      cam = world.diveCamera(p); this.lastFrame = 0;
      world.plan([{ x: 0, y: 0, s: 1, rot: 0 }, world.diveCamera(0.55)], true);
    } else cam = this.landedCamera(world, now);
    this.paint(ctx, this.view, cam, now, model, diving, p); this.lastCam = cam; this.pushUi(cam);
  }

  private buildSession(base: Omit<LakeInput, "count" | "padSpecs">, lakeScale: number) {
    this.session.build({ ...base, count: 0, padSpecs: [], lakeScale, hideHomePad: true });
    this.session.levels.unshift(2.6, 1.65);
    this.sessionSky.build(this.w, this.h, base.tod === "night", (a) => this.session.cameraAtAltitude(a), this.session.diveTop, this.session.levels);
    this.lakeScale = lakeScale;
  }

  /** The number of desks changed the lake's size: while it is on screen the
   *  new lake fades in over the old one (after the dive or the river trip,
   *  and one fade at a time); out of sight it is simply rebuilt. */
  private resizeLake(base: Omit<LakeInput, "count" | "padSpecs">, lakeScale: number, now: number) {
    const onScreen = this.view === "session" || (this.travelFrom === "session" && now - this.started < TRIP_MS);
    if (onScreen && (!this.landed || this.view !== "session" || this.oldLake)) return;
    if (onScreen && !this.reduced) {
      this.oldLake = this.session; this.fadeAt = now;
      this.session = new LakeWorld();
    }
    this.buildSession(base, lakeScale);
    if (this.view === "session" && this.started >= 0) this.refit(this.session);
  }

  private dropOldLake() {
    this.oldLake?.dispose(); this.oldLake = null;
    if (this.fadeCanvas) { this.fadeCanvas.width = this.fadeCanvas.height = 0; this.fadeCanvas = null; }
  }

  /** The old lake over the new one, fading out. */
  private drawOldLake(ctx: CanvasRenderingContext2D, cam: Camera, now: number) {
    const old = this.oldLake;
    if (!old) return;
    const c = (this.fadeCanvas ??= document.createElement("canvas"));
    const pw = Math.round(this.w * this.dpr), ph = Math.round(this.h * this.dpr);
    if (c.width !== pw) c.width = pw;
    if (c.height !== ph) c.height = ph;
    const octx = c.getContext("2d");
    if (!octx) return;
    old.draw(octx, cam, now, false, 2, true);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1 - easeInOut(clamp((now - this.fadeAt) / LAKE_FADE_MS, 0, 1));
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  }

  private riverCamera(view: SceneView, q: number): Camera {
    const { rx, ry } = this.world(view).radii;
    // distances were tuned on the 1200 x 860 design; scale them with the screen
    const m = Math.min(this.w * 0.42, this.h * 0.74) / 504;
    const a = -2.25, k = 1 + 0.06 * Math.sin(3 * a + 1.3) + 0.04 * Math.sin(5 * a + 0.4) + 0.022 * Math.sin(8 * a + 2.1);
    const mx = Math.cos(a) * (rx * k - 30 * m), my = Math.sin(a) * (ry * k - 30 * m);
    const length = Math.hypot(Math.cos(a) * rx, Math.sin(a) * ry);
    const ux = Math.cos(a) * rx / length, uy = Math.sin(a) * ry / length;
    const approach = ease(q / 0.65), along = ease((q - 0.55) / 0.45) * 220 * m;
    const wig = (Math.sin(along / m * 0.005) * 70 + Math.sin(along / m * 0.013) * 16) * m * ease(along / m / 180);
    return {
      x: this.departure.x + (mx - this.departure.x) * approach + ux * along - uy * wig,
      y: this.departure.y + (my - this.departure.y) * approach + uy * along + ux * wig,
      s: this.departure.s + (0.28 - this.departure.s) * ease((q - 0.2) / 0.8), rot: 0.36 * ease(q),
    };
  }

  private paint(ctx: CanvasRenderingContext2D, view: SceneView, cam: Camera, now: number, model: SceneModel, diving: boolean, p: number) {
    const world = this.world(view);
    world.draw(ctx, cam, now, false, diving || this.moving ? 4 : 8, true);
    if (view === "session") this.drawOldLake(ctx, cam, now);
    ctx.save(); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.translate(this.w / 2, this.h / 2); ctx.rotate(cam.rot); ctx.scale(cam.s, cam.s); ctx.translate(-cam.x, -cam.y);
    if (view === "session") {
      this.padHover = null;
      this.hovered = diving ? null : hitTest(model.pointer, cam, this.w, this.h, this.haviTargets(now));
      if (model.phase !== "closed") this.drawCenterLeaf(ctx, now, model);
      this.drawDesks(ctx, now, model);
    } else {
      this.drawGroupFlower(ctx, now, model);
      const owners = model.harvest;
      const spots = this.harvest.padSpots;
      this.padHover = diving ? null : hitTest(model.pointer, cam, this.w, this.h, spots.map((pd, i) => ({ x: pd.x, y: pd.y, r: pd.r, key: i })));
      this.hovered = this.padHover === null ? null : owners[this.padHover] ?? null;
      if (model.selected.size) for (let i = 0; i < spots.length; i++) {
        const pd = spots[i], owner = owners[i];
        ctx.save(); ctx.beginPath(); ctx.arc(pd.x, pd.y, pd.r + 3, 0, Math.PI * 2);
        if (model.selected.has(owner)) { ctx.strokeStyle = model.harvestFlowers.get(owner) ?? "#f4f1e6"; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.8; ctx.stroke(); }
        else { ctx.fillStyle = model.night ? "rgba(19,46,41,.62)" : "rgba(86,140,123,.42)"; ctx.fill(); }
        ctx.restore();
      }
    }
    ctx.restore();
    world.drawAirLayer(ctx, cam, now);
    world.drawHaze(ctx, world.hazeAlpha(cam, diving));
    const sky = this.sky(view);
    if (diving) sky.drawDive(ctx, this.w, this.h, this.dpr, cam, p);
    else sky.drawWisps(ctx, this.w, this.h, this.dpr, cam, model.reduced ? 0 : now);
  }

  private drawDesks(ctx: CanvasRenderingContext2D, now: number, model: SceneModel) {
    const u = this.uNow(now), reduced = model.reduced, t = reduced ? 0 : now / 1000;
    const padR = 34 * u, sc = 1.4 * u;
    // A removed member still wears their last clothes while diving away.
    const retained = new Set(model.members.keys());
    for (const [id, member] of model.members) this.appearances.set(id, member);
    for (const place of this.places) {
      if (place?.who) retained.add(place.who);
      if (place?.gone && now - place.goneAt < LEAVE_MS) retained.add(place.gone);
    }
    for (const id of this.appearances.keys()) if (!retained.has(id)) this.appearances.delete(id);
    const appearanceOf = (id: string) => model.members.get(id) ?? this.appearances.get(id);
    const colorOf = (id: string) => appearanceOf(id)?.color ?? "#a8d98a";
    // Back to front, so a nearer desk covers the one behind it.
    const at = this.places.map((p) => (p ? this.placePoint(p, now) : null));
    const order = this.places.map((_, i) => i).filter((i) => this.places[i]).sort((a, b) => at[a]!.y - at[b]!.y);
    for (const i of order) {
      const pl = this.places[i]!;
      const pt = at[i]!;
      const x = pt.x, y = pt.y + (reduced ? 0 : Math.sin(now * 0.0012 + i * 1.7) * 1.1 * u);
      const sinceDesk = now - pl.deskAt;
      // How far out of the water: 0 under it, 1 standing on its pad.
      const out = reduced ? (pl.desk ? 1 : 0)
        : pl.desk ? clamp(sinceDesk / DESK_RISE_MS, 0, 1) : 1 - clamp(sinceDesk / DESK_SINK_MS, 0, 1);
      if (!reduced && sinceDesk >= 0) drawSpreadingWater(ctx, x, y, padR, sinceDesk, model.night);
      if (out > 0) {
        const padOut = ease(clamp(out * 1.6, 0, 1));
        ctx.save(); ctx.globalAlpha = padOut;
        drawGrovePad(ctx, x, y, Math.max(7, padR * (0.55 + 0.45 * padOut)), 0, model.night);
        ctx.restore();
        const deskOut = ease(clamp((out - 0.2) / 0.8, 0, 1));
        const arriving = pl.who !== null && !reduced && now < pl.whoAt + ARRIVE_MS;
        if (pl.who && !arriving) {
          const who = pl.who;
          const { pose, since } = this.pose(who, model, now);
          const pokeAge = now - (this.pokes.get(who) ?? NEVER);
          drawDeskAt(ctx, x, y - 20 * u, sc, deskOut, y + 22 * u, (dx, dy) =>
            drawSocialHavi(ctx, dx, dy, sc, t + i * 1.7, pose, since, colorOf(who), reduced, pokeAge < POKE_MS ? Math.max(0, pokeAge) : -1, undefined, appearanceOf(who)?.cosmetics));
        } else {
          drawDeskAt(ctx, x, y - 20 * u, sc, deskOut, y + 22 * u, (dx, dy) => drawPreparedDesk(ctx, dx, dy, sc));
          if (arriving && now >= pl.whoAt) drawWaterArrival(ctx, x, y - 20 * u, sc, (now - pl.whoAt) / 1000, colorOf(pl.who!), appearanceOf(pl.who!)?.cosmetics);
        }
      }
      if (pl.gone && !reduced && now - pl.goneAt < LEAVE_MS) drawWaterLeave(ctx, x, y - 20 * u, sc, (now - pl.goneAt) / 1000, colorOf(pl.gone), appearanceOf(pl.gone)?.cosmetics);
    }
  }

  /** Decorative group identity; earned pads and award eligibility stay separate. */
  private drawGroupFlower(ctx: CanvasRenderingContext2D, now: number, model: SceneModel) {
    const colors = [...model.members.entries()].slice(0, 10)
      .map(([id, member]) => model.harvestFlowers.get(id) ?? member.flower);
    const radius = 38 * this.uNow(now);
    ctx.save();
    ctx.translate(0, model.reduced ? 0 : Math.sin(now / 1200) * 0.6);
    drawGrovePad(ctx, 0, 0, radius, 0, model.night);
    drawGroupLotus(ctx, 0, 0, radius * 0.9, colors);
    ctx.restore();
  }

  private drawCenterLeaf(ctx: CanvasRenderingContext2D, now: number, model: SceneModel) {
    const u = this.uNow(now);
    const progress = model.phase === "break" ? 1 : model.phase === "waiting" ? 0 : clamp(model.progress, 0, 1);
    const t = model.reduced ? 0 : now / 1000;
    // drawGrovePad needs a radius over 6 px (its inner rim is drawn 5 px inside).
    const glowAge = now - (model.readyGlowAt ?? -Infinity);
    if (glowAge >= 0 && glowAge < 2200) {
      const alpha = model.reduced ? 0.24 : Math.sin(Math.PI * glowAge / 2200) * 0.48;
      ctx.save();
      const glow = ctx.createRadialGradient(0, 0, 4 * u, 0, 0, 65 * u);
      glow.addColorStop(0, "rgba(255,208,119,.75)"); glow.addColorStop(1, "rgba(255,184,76,0)");
      ctx.globalAlpha = alpha; ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, 0, 65 * u, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    const radius = Math.max(7, (8 + 26 * ease(progress)) * u), bob = model.reduced ? 0 : Math.sin(t * 0.9) * 0.8 * u;
    for (let i = 0; i < 2; i++) {
      const wave = model.reduced ? 0.4 : ((t * 0.12 + i * 0.5) % 1);
      ctx.save(); ctx.strokeStyle = model.night ? "#9cc9b8" : "#d0e9d2"; ctx.globalAlpha = 0.14 * (1 - wave); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, bob, radius + (7 + wave * 28) * u, (radius + (7 + wave * 28) * u) * 0.8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.translate(0, bob); ctx.rotate(model.reduced ? 0 : Math.sin(t * 0.4) * 0.025);
    drawGrovePad(ctx, 0, 0, radius, 0, model.night);
    if (progress > 0.8) drawGroveBloom(ctx, 0, 0, 12 * u * ease((progress - 0.8) / 0.2), 0, "#ecd0a3");
    ctx.restore();
  }
}
