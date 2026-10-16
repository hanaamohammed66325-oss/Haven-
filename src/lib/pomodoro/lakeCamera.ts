import type { Camera } from "./lakeWorld";
import { clamp, easeInOut, lerp, smooth } from "./math";

export interface Flight { x0: number; y0: number; s0: number; r0: number; x1: number; y1: number; s1: number; t0: number; dur: number; dir: number }
type Point = { x: number; y: number };
export interface CameraWorld {
  levels: readonly number[];
  clampCam(x: number, y: number, scale: number): [number, number];
  plan(cameras: Camera[], immediate: boolean): void;
}

/** Shared by the personal and group lakes. Mutates the existing rest/glide/look
 * objects so the callers keep their gesture state and frame timing unchanged. */
export function lakeCameraFrame(world: CameraWorld, level: number, base: Point, vel: Point,
  look: Point & { tx: number; ty: number }, dragging: boolean, reduced: boolean,
  now: number, dt: number, flight: Flight | null): { camera: Camera; flight: Flight | null } {
  if (flight) {
    const f = flight, q = f.dur > 0 ? clamp((now - f.t0) / f.dur, 0, 1) : 1, e = easeInOut(q);
    const settle = Math.sin(Math.PI * smooth(0.62, 1, q));
    const s = Math.exp(lerp(Math.log(f.s0), Math.log(f.s1), e)) * (1 + f.dir * 0.022 * settle);
    world.plan([{ x: f.x1, y: f.y1, s: f.s1, rot: 0 }], true);
    if (q >= 1) { base.x = f.x1; base.y = f.y1; }
    return { camera: { x: lerp(f.x0, f.x1, e), y: lerp(f.y0, f.y1, e), s,
      rot: f.r0 * (1 - e) - f.dir * 0.05 * Math.sin(Math.PI * q) }, flight: q >= 1 ? null : f };
  }
  const s = world.levels[level];
  if (!dragging && Math.abs(vel.x) + Math.abs(vel.y) > 0.002) {
    base.x += vel.x * dt; base.y += vel.y * dt;
    const k = 0.92 ** (dt / 16); vel.x *= k; vel.y *= k;
  }
  const [cx, cy] = world.clampCam(base.x, base.y, s);
  if (cx !== base.x) vel.x = 0;
  if (cy !== base.y) vel.y = 0;
  base.x = cx; base.y = cy;
  look.x += (look.tx - look.x) * 0.08; look.y += (look.ty - look.y) * 0.08;
  const drift = reduced ? 0 : 1;
  const near: Camera[] = [];
  for (const l of [level + 1, level - 1]) {
    if (l < 0 || l >= world.levels.length) continue;
    const [x, y] = world.clampCam(base.x, base.y, world.levels[l]);
    near.push({ x, y, s: world.levels[l], rot: 0 });
  }
  world.plan(near, false);
  return { camera: {
    x: base.x + (look.x * 22 + Math.sin(now * 0.00031) * 3 * drift) / s,
    y: base.y + (look.y * 16 + Math.cos(now * 0.00027) * 2.4 * drift) / s,
    s, rot: 0,
  }, flight: null };
}

/** Keep the point beneath a finger/cursor stationary during a zoom step. */
export function lakeZoomTarget(cam: Camera, base: Point, flight: Flight | null,
  scale: number, width: number, height: number, at?: Point): Point {
  if (!at) return { x: flight?.x1 ?? base.x, y: flight?.y1 ?? base.y };
  const ox = at.x - width / 2, oy = at.y - height / 2;
  return { x: cam.x + ox / cam.s - ox / scale, y: cam.y + oy / cam.s - oy / scale };
}
