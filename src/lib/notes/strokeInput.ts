import type { InkPoint } from './types';

type Position = { x: number; y: number };
export type PointerSample = Pick<PointerEvent, 'clientX' | 'clientY' | 'pressure' | 'timeStamp'> & Partial<Pick<PointerEvent, 'twist' | 'tiltX' | 'tiltY' | 'azimuthAngle' | 'altitudeAngle'>>;

/** Convert one pointer event and its coalesced history to ordered page points. */
export function strokeInputPoints(
  event: PointerSample & { getCoalescedEvents?: () => PointerSample[] },
  previous: InkPoint | undefined,
  position: (clientX: number, clientY: number) => Position,
  response = 0,
): InkPoint[] {
  const samples = event.getCoalescedEvents?.() ?? [];
  const input = samples.length ? [...samples, event] : [event];
  const output: InkPoint[] = [];
  let last = previous;
  for (const sample of input) {
    if (!Number.isFinite(sample.clientX) || !Number.isFinite(sample.clientY)) continue;
    const { x, y } = position(sample.clientX, sample.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const distance = last ? Math.hypot(x - last.x, y - last.y) : 0;
    const rawPressure = sample.pressure > 0 && Number.isFinite(sample.pressure)
      ? Math.max(.02, Math.min(1, sample.pressure)) : last?.p ?? .5;
    const hasAzimuth = typeof sample.azimuthAngle === 'number' && Number.isFinite(sample.azimuthAngle)
      && (sample.azimuthAngle !== 0 || typeof sample.altitudeAngle === 'number' && sample.altitudeAngle < Math.PI / 2 - .01);
    const rawAngle = hasAzimuth ? (sample.azimuthAngle! * 180 / Math.PI + 360) % 360
      : sample.tiltX || sample.tiltY ? (Math.atan2(sample.tiltY ?? 0, sample.tiltX ?? 0) * 180 / Math.PI + 360) % 360
        : typeof sample.twist === 'number' && Number.isFinite(sample.twist) ? sample.twist : undefined;
    const angle = rawAngle ?? last?.angle;
    const time = Math.max(last?.t ?? 0, Number.isFinite(sample.timeStamp) ? sample.timeStamp : last?.t ?? 0);
    if (last && distance < .04 && (time <= last.t || Math.abs(rawPressure - last.p) < .001 && angle === last.angle)) continue;
    // The response follows elapsed time, rather than the event sampling rate.
    const responseMs = 6 * (1 - .8 * Math.max(0, Math.min(1, response)));
    const blend = last ? 1 - Math.exp(-Math.max(1, time - last.t) / responseMs) : 1;
    const pressure = last ? last.p + (rawPressure - last.p) * blend : rawPressure;
    const steps = last ? Math.min(64, Math.max(1, Math.ceil(distance / 3))) : 1;
    for (let step = 1; step <= steps; step++) {
      const factor = step / steps;
      const next: InkPoint = last
        ? { x: last.x + (x - last.x) * factor, y: last.y + (y - last.y) * factor,
            p: last.p + (pressure - last.p) * factor, t: last.t + (time - last.t) * factor,
            ...(angle === undefined ? {} : { angle: last.angle === undefined ? angle : (last.angle + (((angle - last.angle + 540) % 360) - 180) * factor + 360) % 360 }) }
        : { x, y, p: pressure, t: time, ...(angle === undefined ? {} : { angle }) };
      output.push(next);
    }
    last = output[output.length - 1];
  }
  return output;
}
