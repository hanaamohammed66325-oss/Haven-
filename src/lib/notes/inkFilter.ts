import type { InkPoint } from './types';

const alpha = (seconds: number, cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * seconds));

/** Time-aware, speed-adaptive stabilization. Original samples stay untouched. */
export function stabilizeInk(points: readonly InkPoint[], strength: number, response = 0): InkPoint[] {
  if (points.length < 2 || strength <= 0) return points.map(point => ({ ...point }));
  const amount = Math.max(0, Math.min(1, strength));
  const quickness = Math.max(0, Math.min(1, response));
  const minCutoff = (1.6 + 24 * (1 - amount) ** 2) * (1 + 2 * quickness);
  const speedGain = (.035 + .045 * (1 - amount)) * (1 + 4 * quickness);
  const output: InkPoint[] = [{ ...points[0] }];
  let speed = 0;
  for (let i = 1; i < points.length; i++) {
    const input = points[i], before = points[i - 1], last = output[i - 1];
    const dt = Math.max(1 / 1000, Math.min(.1, (input.t - before.t) / 1000 || 1 / 240));
    const rawSpeed = Math.hypot(input.x - before.x, input.y - before.y) / dt;
    speed += alpha(dt, 5) * (rawSpeed - speed);
    const blend = alpha(dt, minCutoff + speedGain * speed);
    output.push({ ...input, x: last.x + blend * (input.x - last.x), y: last.y + blend * (input.y - last.y) });
  }
  return output;
}

/** Renderer4: estimate signed velocity before its magnitude, so tremor cannot
 * masquerade as fast intentional motion and disable high stabilization. */
export function stabilizeWriting(points: readonly InkPoint[], strength: number, response = 0): InkPoint[] {
  const amount = Math.max(0, Math.min(1, strength));
  if (points.length < 2 || !amount) return points.map(point => ({ ...point }));
  const quickness = Math.max(0, Math.min(1, response));
  const output: InkPoint[] = [{ ...points[0] }];
  let vx = 0, vy = 0;
  for (let i = 1; i < points.length; i++) {
    const input = points[i], before = points[i - 1], last = output[i - 1];
    const dt = Math.max(.001, Math.min(.1, (input.t - before.t) / 1000 || 1 / 240));
    const derivativeBlend = alpha(dt, 2);
    vx += derivativeBlend * ((input.x - before.x) / dt - vx);
    vy += derivativeBlend * ((input.y - before.y) / dt - vy);
    // Response reduces lag within the selected stabilization strength; it
    // cannot turn the maximum setting into an almost unfiltered signal.
    const cutoff = (4 + 96 * (1 - amount) ** 3 + Math.min(18, Math.hypot(vx, vy) * .008 * (1 - .8 * amount))) * (1 + .35 * quickness);
    const blend = alpha(dt, cutoff);
    output.push({ ...input, x: last.x + blend * (input.x - last.x), y: last.y + blend * (input.y - last.y) });
  }
  // Bring the trailing tip to the actual sample without changing the original
  // points or leaving a gap where the next stroke/shape begins.
  const end = points[points.length - 1], tail = output[output.length - 1];
  const dx = end.x - tail.x, dy = end.y - tail.y;
  for (let i = output.length - 1; i > 0; i--) {
    const age = end.t - points[i].t;
    if (age >= 32) break;
    const t = Math.max(0, 1 - age / 32), weight = t * t * (3 - 2 * t);
    output[i].x += dx * weight; output[i].y += dy * weight;
  }
  output[output.length - 1] = { ...end };
  return output;
}
