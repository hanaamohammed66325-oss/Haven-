export interface Box { x: number; y: number; width: number; height: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width + 8 && a.x + a.width + 8 > b.x && a.y < b.y + b.height + 8 && a.y + a.height + 8 > b.y;

export function returnBoxClear(area: Box, box: Box, blocked: readonly Box[]): boolean {
  return box.x >= area.x + 12 && box.y >= area.y + 12 &&
    box.x + box.width <= area.x + area.width - 12 && box.y + box.height <= area.y + area.height - 12 &&
    !blocked.some(b => overlaps(box, b));
}

/** Keep the anchor; if obstructed, take the nearest free pocket, not a far corner. */
export function freeReturnPosition(area: Box, width: number, height: number, blocked: readonly Box[], preferred?: Box | null): Box | null {
  const left = area.x + 12, right = area.x + area.width - width - 12;
  const top = area.y + 12, bottom = area.y + area.height - height - 12;
  if (right < left || bottom < top) return null;
  // Keep the same bottom/right anchor while folding or scrolling, if still safe.
  if (preferred) {
    const box = { x: preferred.x + preferred.width - width, y: preferred.y + preferred.height - height, width, height };
    if (returnBoxClear(area, box, blocked)) return box;
  }
  const anchor = preferred ? { x: preferred.x + preferred.width - width, y: preferred.y + preferred.height - height } : { x: right, y: bottom };
  // Only obstacle edges can begin a new free horizontal band. Sweep its free
  // intervals instead of checking a viewport-sized grid on every scroll tick.
  const ys = new Set([top, bottom, Math.max(top, Math.min(bottom, anchor.y))]);
  for (const b of blocked) {
    for (const y of [b.y - height - 8, b.y + b.height + 8]) if (y >= top && y <= bottom) ys.add(y);
  }
  let best: Box | null = null, distance = Infinity;
  for (const y of ys) {
    if ((y - anchor.y) ** 2 > distance) continue;
    const intervals = blocked.filter(b => y < b.y + b.height + 8 && y + height + 8 > b.y)
      .map(b => [b.x - width - 8, b.x + b.width + 8]).sort((a, b) => a[0] - b[0]);
    let start = left;
    const consider = (end: number) => {
      if (end < start) return;
      const x = Math.max(start, Math.min(end, anchor.x));
      const score = (x - anchor.x) ** 2 + (y - anchor.y) ** 2;
      if (score < distance) { best = { x, y, width, height }; distance = score; }
    };
    for (const [a, b] of intervals) {
      if (b <= start || a >= right) continue;
      if (a >= start) consider(Math.min(a, right));
      start = Math.max(start, b);
      if (start > right) break;
    }
    consider(right);
  }
  return best;
}

/** A translated surface must not sweep over a control on the way to free space. */
export function returnMotionClear(from: Box, to: Box, blocked: readonly Box[]): boolean {
  const swept = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y),
    // Position and dimensions animate independently: protect their entire envelope.
    width: Math.abs(from.x - to.x) + Math.max(from.width, to.width),
    height: Math.abs(from.y - to.y) + Math.max(from.height, to.height) };
  return !blocked.some(b => overlaps(swept, b));
}
