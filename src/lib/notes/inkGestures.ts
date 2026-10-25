import type { EraserSettings, InkStroke, NoteElement } from './types';
import { newId } from './types';
import { elementAtPoint, elementBounds, eraseConvertedText, strokeHitTest } from './ink';
import { isShapeTool } from './shapes';

type XY = { x: number; y: number };

/** A deliberate gesture needs repeated full traversals, not just a wavy line. */
export function scratchPasses(stroke: InkStroke, mode: 'strike' | 'scribble'): XY[][] | null {
  if (stroke.tool !== 'pen' && stroke.tool !== 'pencil' || stroke.points.length < 8) return null;
  const raw = stroke.points;
  if (raw[raw.length - 1].t - raw[0].t > 2000) return null;
  const points = raw.length <= 256 ? raw : Array.from({ length: 256 }, (_, i) => raw[Math.round(i * (raw.length - 1) / 255)]);
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length, cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const xx = points.reduce((sum, p) => sum + (p.x - cx) ** 2, 0), yy = points.reduce((sum, p) => sum + (p.y - cy) ** 2, 0);
  const xy = points.reduce((sum, p) => sum + (p.x - cx) * (p.y - cy), 0), angle = Math.atan2(2 * xy, xx - yy) / 2;
  const co = Math.cos(angle), si = Math.sin(angle);
  const along = points.map(p => (p.x - cx) * co + (p.y - cy) * si), across = points.map(p => -(p.x - cx) * si + (p.y - cy) * co);
  const span = Math.max(...along) - Math.min(...along), breadth = Math.max(...across) - Math.min(...across);
  if (span < Math.max(18, stroke.width * 5) || mode === 'strike' && breadth > span * .38) return null;
  if (mode === 'scribble' && breadth < Math.max(8, span * .12)) return null;
  const turns = [0];
  let extreme = 0, direction = 0;
  const minimum = Math.max(7, span * .3);
  for (let i = 1; i < points.length; i++) {
    const delta = along[i] - along[extreme];
    if (!direction) { if (Math.abs(delta) >= minimum) { direction = Math.sign(delta); extreme = i; } }
    else if (direction * delta >= 0) extreme = i;
    else if (-direction * delta >= minimum) { turns.push(extreme); direction *= -1; extreme = i; }
  }
  turns.push(points.length - 1);
  const passes = turns.slice(1).map((end, i) => ({ points: points.slice(turns[i], end + 1), distance: Math.abs(along[end] - along[turns[i]]) }))
    .filter(pass => pass.distance >= span * .55).map(pass => pass.points);
  // At least three real sweeps distinguish strike-through from an ordinary line.
  return passes.length >= (mode === 'strike' ? 3 : 4) ? passes : null;
}

function samples(points: XY[], spacing: number): XY[] {
  const result: XY[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], count = Math.min(64, Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing)));
    for (let j = 1; j <= count; j++) result.push({ x: a.x + (b.x - a.x) * j / count, y: a.y + (b.y - a.y) * j / count });
  }
  return result;
}

/** Immutable, actual-geometry deletion. A miss remains an ordinary ink stroke. */
export function eraseByGesture(elements: NoteElement[], stroke: InkStroke, settings: EraserSettings): NoteElement[] | null {
  if (settings.scratchEnabled === false) return null;
  const passes = scratchPasses(stroke, settings.scratchMode ?? 'strike');
  if (!passes) return null;
  const radius = Math.max(2, Math.min(6, stroke.width)), probes = passes.map(pass => samples(pass, radius));
  const flat = probes.flat(), left = Math.min(...flat.map(p => p.x)), right = Math.max(...flat.map(p => p.x));
  const top = Math.min(...flat.map(p => p.y)), bottom = Math.max(...flat.map(p => p.y));
  let changed = false;
  const result: NoteElement[] = [];
  for (const element of elements) {
    const converted = element.kind === 'text' && (element.sourceInk || element.handwritingTool);
    const eligible = element.kind === 'stroke' ? settings.targets[isShapeTool(element.tool) ? 'shapes' : element.tool]
      : converted && (element.handwritingTool ? settings.targets[element.handwritingTool] : element.sourceInk!.some(ink => ink.tool === 'pen' && settings.targets.pen || ink.tool === 'pencil' && settings.targets.pencil));
    if (!eligible) { result.push(element); continue; }
    const bounds = elementBounds(element);
    if (bounds.x > right + radius || bounds.y > bottom + radius || bounds.x + bounds.w < left - radius || bounds.y + bounds.h < top - radius) { result.push(element); continue; }
    const intersects = (point: XY) => element.kind === 'stroke' ? strokeHitTest(element, point, radius) : Boolean(elementAtPoint([element], point, radius));
    if (probes.filter(pass => pass.some(intersects)).length < 3) { result.push(element); continue; }
    if (element.kind === 'text') {
      let fragments = [element];
      for (const point of flat) fragments = fragments.flatMap(fragment => eraseConvertedText(fragment, point, radius, settings.convertedText ?? 'word', newId));
      if (fragments.length !== 1 || fragments[0] !== element) changed = true;
      result.push(...fragments);
    } else changed = true;
  }
  return changed ? result : null;
}
