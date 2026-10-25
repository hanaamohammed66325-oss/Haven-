import { getStroke } from 'perfect-freehand';
import type { InkStroke } from './types';
import { stabilizeInk, stabilizeWriting } from './inkFilter';

const unit = (value: number) => Math.max(0, Math.min(1, value));

/** Versioned nib geometry: existing version2 strokes retain their exact outline. */
export function writingOutline(stroke: InkStroke): number[][] {
  if (!stroke.points.length) return [];
  const tuning = stroke.tuning;
  const highlight = stroke.tool === 'highlighter';
  const ball = stroke.tool === 'pen' && tuning?.style === 'ball';
  const modern = stroke.renderer === 3 || stroke.renderer === 4;
  const fountain = modern && stroke.tool === 'pen' && (!tuning || tuning.style === 'fountain');
  const strength = highlight ? stroke.highlight?.stabilization ?? .28 : tuning?.streamline ?? .28;
  const response = modern ? highlight ? stroke.highlight?.response ?? 0 : tuning?.response ?? 0 : 0;
  const filtered = highlight && stroke.highlight?.straight ? stroke.points : (stroke.renderer === 4 ? stabilizeWriting : stabilizeInk)(stroke.points, strength, response);
  const angle = (stroke.nibAngle ?? stroke.points[0].angle ?? 325) * Math.PI / 180;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const aspect = highlight || ball ? 1 : 1 - (fountain ? .72 : .6) * unit(tuning?.tipFlatness ?? 0);
  const origin = filtered[0];
  const expressiveness = highlight || ball ? 0 : stroke.tool === 'pencil' ? .48 : tuning?.style === 'brush' ? .84 : fountain ? .9 : .7;
  const sensitivity = stroke.pressure ? unit(tuning?.pressureSensitivity ?? .5) : 0;
  let travel = 0;
  const points = filtered.map((point, index) => {
    const before = filtered[Math.max(0, index - 1)];
    const step = Math.hypot(point.x - before.x, point.y - before.y);
    travel += step;
    const speed = step / Math.max(1, point.t - before.t);
    // A smooth pressure curve preserves both light marks and gradual changes.
    const force = fountain ? Math.pow(unit(point.p), .72) : Math.sqrt(unit(point.p));
    const speedReduction = highlight || ball ? 0 : unit(tuning?.speedSensitivity ?? 0) * .3 * speed / (speed + 1);
    const diameter = Math.max(fountain ? .18 : .32, 1 + expressiveness * sensitivity * (2 * force - 1) - speedReduction);
    const x = point.x - origin.x, y = point.y - origin.y;
    return [x * cosine + y * sine, (-x * sine + y * cosine) / aspect, diameter / 2];
  });
  const restore = ([x, y]: number[]) => [origin.x + x * cosine - y * aspect * sine, origin.y + x * sine + y * aspect * cosine];
  const direct = Math.hypot(filtered[filtered.length - 1].x - origin.x, filtered[filtered.length - 1].y - origin.y);
  const short = travel < Math.max(8, stroke.width * 4);
  const compact = short && filtered.every(point => Math.hypot(point.x - origin.x, point.y - origin.y) < Math.max(1.5, stroke.width));
  if (travel < .5 || short && (compact || travel <= direct * 1.05 + .1)) {
    // A slightly moving Pencil tap is still a dot. Double taper can collapse
    // short paths when the outline library discards their interior samples.
    const radius = Math.max(.75, stroke.width * points[points.length - 1][2]);
    const minor = Math.max(.65, radius * aspect);
    const end = points[points.length - 1];
    return Array.from({ length: 24 }, (_, index) => {
      const theta = index * Math.PI / 12;
      const x = Math.cos(theta), y = Math.sin(theta), useEnd = end[0] * x / radius + end[1] * y * aspect / minor > 0;
      return restore([(useEnd ? end[0] : 0) + x * radius, (useEnd ? end[1] : 0) + y * minor / aspect]);
    });
  }
  const sharpness = highlight || ball ? 0 : unit(tuning?.tipSharpness ?? 0);
  const taper = sharpness * Math.min(stroke.width * (fountain ? 4 : 3), travel * (fountain ? .22 : .16));
  return getStroke(points, {
    size: Math.max(.5, stroke.width), thinning: highlight || ball ? 0 : 1,
    smoothing: highlight ? .55 : unit(tuning?.smoothing ?? .58), streamline: 0,
    simulatePressure: false, last: true,
    start: { cap: true, taper: taper * (fountain ? .38 : .55), ...(fountain ? { easing: (t: number) => t ** .65 } : {}) },
    end: { cap: true, taper, ...(fountain ? { easing: (t: number) => t ** .75 } : {}) },
  }).map(restore);
}
