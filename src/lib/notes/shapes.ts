import { NOTE_SHAPES, type DrawingTool, type InkStroke, type NoteShapeTool } from './types';

export interface ShapePoint { x: number; y: number }
export interface ShapePath { points: ShapePoint[]; closed: boolean; fill: boolean }

export function isShapeTool(tool: DrawingTool): tool is NoteShapeTool {
  return NOTE_SHAPES.includes(tool as NoteShapeTool);
}

export function constrainShapeEnd(tool: DrawingTool, start: ShapePoint, end: ShapePoint, snap = false): ShapePoint {
  if (snap && (tool === 'line' || tool === 'arrow')) {
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const step = Math.PI / 12;
    const angle = Math.round(Math.atan2(end.y - start.y, end.x - start.x) / step) * step;
    return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
  }
  if (tool !== 'square' && tool !== 'circle') return end;
  const dx = end.x - start.x, dy = end.y - start.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + Math.sign(dx || 1) * side, y: start.y + Math.sign(dy || 1) * side };
}

function regularPolygon(cx: number, cy: number, rx: number, ry: number, sides: number, inner = 1): ShapePoint[] {
  const count = inner < 1 ? sides * 2 : sides;
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    const radius = inner < 1 && index % 2 ? inner : 1;
    return { x: cx + Math.cos(angle) * rx * radius, y: cy + Math.sin(angle) * ry * radius };
  });
}

function roundedRectangle(left: number, top: number, right: number, bottom: number, requested: number): ShapePoint[] {
  const radius = Math.max(0, Math.min(requested, (right - left) / 2, (bottom - top) / 2));
  if (radius === 0) return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
  const corners: [number, number, number][] = [
    [right - radius, top + radius, -Math.PI / 2],
    [right - radius, bottom - radius, 0],
    [left + radius, bottom - radius, Math.PI / 2],
    [left + radius, top + radius, Math.PI],
  ];
  return corners.flatMap(([cx, cy, start]) => Array.from({ length: 7 }, (_, index) => {
    const angle = start + index * Math.PI / 12;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  }));
}

export function shapePaths(stroke: InkStroke): ShapePath[] {
  if (!isShapeTool(stroke.tool) || !stroke.points.length) return [];
  if (stroke.shapePath) return [{ points: stroke.points, closed: stroke.shapePath.closed, fill: stroke.shapePath.closed }];
  const start = stroke.points[0], end = stroke.points[stroke.points.length - 1];
  const left = Math.min(start.x, end.x), right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y), bottom = Math.max(start.y, end.y);
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  const rx = (right - left) / 2, ry = (bottom - top) / 2;
  const closed = (points: ShapePoint[]): ShapePath[] => [{ points, closed: true, fill: true }];
  if (stroke.tool === 'line') return [{ points: [start, end], closed: false, fill: false }];
  if (stroke.tool === 'arrow') {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const head = Math.min(24, Math.hypot(end.x - start.x, end.y - start.y) * .3);
    const wing = (offset: number) => ({ x: end.x - head * Math.cos(angle + offset), y: end.y - head * Math.sin(angle + offset) });
    return [{ points: [start, end], closed: false, fill: false }, { points: [wing(.48), end, wing(-.48)], closed: false, fill: false }];
  }
  if (stroke.tool === 'rectangle' || stroke.tool === 'square') return closed(roundedRectangle(left, top, right, bottom, stroke.cornerRadius ?? 0));
  if (stroke.tool === 'ellipse' || stroke.tool === 'circle') return closed(regularPolygon(cx, cy, rx, ry, 64));
  if (stroke.tool === 'triangle') return closed(regularPolygon(cx, cy, rx, ry, 3));
  if (stroke.tool === 'diamond') return closed(regularPolygon(cx, cy, rx, ry, 4));
  if (stroke.tool === 'pentagon') return closed(regularPolygon(cx, cy, rx, ry, 5));
  if (stroke.tool === 'star') return closed(regularPolygon(cx, cy, rx, ry, 5, .44));
  return closed(regularPolygon(cx, cy, rx, ry, 6));
}

function distanceToSegment(point: ShapePoint, start: ShapePoint, end: ShapePoint): number {
  const dx = end.x - start.x, dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - start.x - fraction * dx, point.y - start.y - fraction * dy);
}

function pathError(points: ShapePoint[], vertices: ShapePoint[]): number {
  return points.reduce((sum, point) => sum + Math.min(...vertices.map((vertex, index) => distanceToSegment(point, vertex, vertices[(index + 1) % vertices.length]))), 0) / points.length;
}

/** Arc-length sampling avoids recognizing the device's sample rate as a corner. */
function resample(points: ShapePoint[], count: number, closed = false): ShapePoint[] {
  const input = closed ? [...points, points[0]] : points;
  const lengths = [0];
  for (let i = 1; i < input.length; i++) lengths.push(lengths[i - 1] + Math.hypot(input[i].x - input[i - 1].x, input[i].y - input[i - 1].y));
  const total = lengths[lengths.length - 1];
  if (!total) return [input[0]];
  let at = 1;
  return Array.from({ length: count }, (_, i) => {
    const distance = total * i / (closed ? count : count - 1);
    while (at < lengths.length - 1 && lengths[at] < distance) at++;
    const t = (distance - lengths[at - 1]) / Math.max(.000001, lengths[at] - lengths[at - 1]);
    return { x: input[at - 1].x + (input[at].x - input[at - 1].x) * t, y: input[at - 1].y + (input[at].y - input[at - 1].y) * t };
  });
}

function simplify(points: ShapePoint[], tolerance: number): ShapePoint[] {
  if (points.length < 3) return points;
  let greatest = tolerance, at = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const error = distanceToSegment(points[i], points[0], points[points.length - 1]);
    if (error > greatest) { greatest = error; at = i; }
  }
  if (at < 0) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)];
}

function corners(points: ShapePoint[], tolerance: number): ShapePoint[] {
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length, cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  let start = 0;
  for (let i = 1; i < points.length; i++) if (Math.hypot(points[i].x - cx, points[i].y - cy) > Math.hypot(points[start].x - cx, points[start].y - cy)) start = i;
  const ring = [...points.slice(start), ...points.slice(0, start)];
  let opposite = 1;
  for (let i = 2; i < ring.length; i++) if (Math.hypot(ring[i].x - ring[0].x, ring[i].y - ring[0].y) > Math.hypot(ring[opposite].x - ring[0].x, ring[opposite].y - ring[0].y)) opposite = i;
  const polygon = [...simplify(ring.slice(0, opposite + 1), tolerance).slice(0, -1), ...simplify([...ring.slice(opposite), ring[0]], tolerance).slice(0, -1)];
  // Resampling can straddle a sharp corner, producing two nearby vertices.
  // Merge that tiny edge before matching a polygon's side count.
  for (let pass = 0; pass < 12 && polygon.length > 3; pass++) {
    const at = polygon.findIndex((point, i) => Math.hypot(point.x - polygon[(i + 1) % polygon.length].x, point.y - polygon[(i + 1) % polygon.length].y) < tolerance * 3);
    if (at < 0) break;
    const next = (at + 1) % polygon.length, a = polygon[at], b = polygon[next];
    polygon[next] = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    polygon.splice(at, 1);
  }
  // The start of a stroke may sit halfway along an edge, including the closing edge.
  return polygon.filter((point, i) => distanceToSegment(point, polygon[(i + polygon.length - 1) % polygon.length], polygon[(i + 1) % polygon.length]) > tolerance);
}

function symmetricError(points: ShapePoint[], polygon: ShapePoint[]): number {
  return (pathError(points, polygon) + pathError(resample(polygon, 48, true), points)) / 2;
}

function fitRegular(vertices: ShapePoint[], inner = 1, step = 1): ShapePoint[] {
  const n = vertices.length, cx = vertices.reduce((sum, p) => sum + p.x, 0) / n, cy = vertices.reduce((sum, p) => sum + p.y, 0) / n;
  const area = vertices.reduce((sum, p, i) => sum + p.x * vertices[(i + 1) % n].y - p.y * vertices[(i + 1) % n].x, 0);
  const base = regularPolygon(0, 0, 1, 1, inner < 1 ? n / 2 : n, inner);
  const ideal = base.map((_, i) => base[(i * step) % n]);
  if (area < 0) ideal.reverse();
  let a = 0, b = 0, denominator = 0;
  for (let i = 0; i < n; i++) {
    a += ideal[i].x * (vertices[i].x - cx) + ideal[i].y * (vertices[i].y - cy);
    b += ideal[i].x * (vertices[i].y - cy) - ideal[i].y * (vertices[i].x - cx);
    denominator += ideal[i].x ** 2 + ideal[i].y ** 2;
  }
  a /= denominator; b /= denominator;
  return ideal.map(p => ({ x: cx + a * p.x - b * p.y, y: cy + b * p.x + a * p.y }));
}

function fittedPath(stroke: InkStroke, points: ShapePoint[], closed: boolean, tool: NoteShapeTool = 'polygon'): InkStroke {
  return { ...stroke, tool, pressure: false, rotation: 0, shapePath: { closed },
    points: points.map((point, i) => ({ ...stroke.points[Math.round(i * (stroke.points.length - 1) / Math.max(1, points.length - 1))], ...point })) };
}

function smoothPath(points: ShapePoint[], closed: boolean): ShapePoint[] {
  let result = points;
  for (let pass = 0; pass < 2; pass++) {
    const next: ShapePoint[] = closed ? [] : [result[0]];
    for (let i = 0; i < result.length - (closed ? 0 : 1); i++) {
      const a = result[i], b = result[(i + 1) % result.length];
      next.push({ x: .75 * a.x + .25 * b.x, y: .75 * a.y + .25 * b.y }, { x: .25 * a.x + .75 * b.x, y: .25 * a.y + .75 * b.y });
    }
    if (!closed) next.push(result[result.length - 1]);
    result = next;
  }
  return result;
}

/** Strict by default for OCR. Only an intentional hold enables free-path fitting. */
export function recognizeHeldShape(stroke: InkStroke, regularize = false): InkStroke | null {
  if ((stroke.tool !== 'pen' && stroke.tool !== 'pencil' && stroke.tool !== 'highlighter') || stroke.points.length < 2) return null;
  // Bound work even for very long strokes. Retain the raw stroke and its metadata.
  const raw = stroke.points.length <= 512 ? stroke.points : Array.from({ length: 512 }, (_, i) => stroke.points[Math.round(i * (stroke.points.length - 1) / 511)]);
  const points = resample(raw, 96), first = raw[0], last = raw[raw.length - 1];
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  const direct = Math.hypot(last.x - first.x, last.y - first.y);
  if (length < Math.max(16, stroke.width * 3)) return null;
  const distances = points.map(point => distanceToSegment(point, first, last));
  if (direct >= Math.max(14, stroke.width * 3) && direct / length > .86 && distances.reduce((sum, d) => sum + d, 0) / points.length < Math.max(2, direct * .035)
    && Math.max(...distances) < Math.max(4, direct * .09)) {
    const angle = Math.atan2(last.y - first.y, last.x - first.x), step = Math.PI / 2, snapped = Math.round(angle / step) * step;
    const use = Math.abs(angle - snapped) < Math.PI / 30 ? snapped : angle, cx = (first.x + last.x) / 2, cy = (first.y + last.y) / 2;
    return { ...stroke, tool: 'line', pressure: false, points: [{ ...first, x: cx - Math.cos(use) * direct / 2, y: cy - Math.sin(use) * direct / 2 }, { ...last, x: cx + Math.cos(use) * direct / 2, y: cy + Math.sin(use) * direct / 2 }] };
  }
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys), w = right - left, h = bottom - top;
  const size = Math.min(w, h), diagonal = Math.hypot(w, h), tolerance = Math.max(1.5, diagonal * .025);
  const closed = direct <= Math.max(8, diagonal * .17) && length > diagonal * 1.8;
  if (!closed) {
    // One continuous arrow: a long shaft followed by two wings around its tip.
    let tipAt = 0;
    for (let i = 1; i < points.length; i++) if (Math.hypot(points[i].x - first.x, points[i].y - first.y) > Math.hypot(points[tipAt].x - first.x, points[tipAt].y - first.y)) tipAt = i;
    const tip = points[tipAt], dx = tip.x - first.x, dy = tip.y - first.y, shaft = Math.hypot(dx, dy);
    tipAt = points.findIndex(point => Math.hypot(point.x - first.x, point.y - first.y) >= shaft * .985);
    if (tipAt > 8 && tipAt < points.length - 8 && shaft > 30) {
      const head = points.slice(tipAt + 1), cross = head.map(p => (dx * (p.y - tip.y) - dy * (p.x - tip.x)) / shaft);
      const ahead = head.map(p => ((p.x - first.x) * dx + (p.y - first.y) * dy) / (shaft * shaft));
      if (Math.min(...cross) < -shaft * .07 && Math.max(...cross) > shaft * .07 && Math.min(...ahead) > .55
        && points.slice(0, tipAt).every(p => distanceToSegment(p, first, tip) < shaft * .05)) {
        return { ...stroke, tool: 'arrow', pressure: false, points: [{ ...first }, { ...last, ...tip }] };
      }
    }
    if (!regularize || diagonal < 16) return null;
    const simple = simplify(points, tolerance);
    const straight = simple.length <= 5 && simple.length > 2 && simple.slice(1, -1).every((p, i) => {
      const a = simple[i], b = simple[i + 2];
      return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > diagonal * tolerance;
    });
    return fittedPath(stroke, straight ? simple : smoothPath(simplify(points, tolerance * .45), false), false, 'line');
  }
  if (size < Math.max(12, stroke.width * 2) || raw.length < 5) return regularize ? fittedPath(stroke, simplify(points, tolerance), true) : null;
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  let box = { left, right, top, bottom, angle: 0, error: Infinity };
  for (let degrees = 0; degrees < 90; degrees += 3) {
    const angle = degrees * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
    const local = points.map(p => ({ x: cx + (p.x - cx) * cosine + (p.y - cy) * sine, y: cy - (p.x - cx) * sine + (p.y - cy) * cosine }));
    const l = Math.min(...local.map(p => p.x)), r = Math.max(...local.map(p => p.x)), t = Math.min(...local.map(p => p.y)), b = Math.max(...local.map(p => p.y));
    const error = symmetricError(local, roundedRectangle(l, t, r, b, 0));
    if (error < box.error - .01) box = { left: l, right: r, top: t, bottom: b, angle: degrees, error };
  }
  const choices: { error: number; stroke: InkStroke }[] = [];
  const boxW = box.right - box.left, boxH = box.bottom - box.top, square = Math.abs(boxW - boxH) / Math.max(boxW, boxH) < .22;
  const angle = box.angle * Math.PI / 180, fx = (box.left + box.right) / 2, fy = (box.top + box.bottom) / 2;
  const bx = cx + (fx - cx) * Math.cos(angle) - (fy - cy) * Math.sin(angle), by = cy + (fx - cx) * Math.sin(angle) + (fy - cy) * Math.cos(angle);
  const bw = square ? (boxW + boxH) / 2 : boxW, bh = square ? bw : boxH;
  choices.push({ error: box.error, stroke: { ...stroke, tool: square ? 'square' : 'rectangle', pressure: false, rotation: box.angle,
    points: [{ ...first, x: bx - bw / 2, y: by - bh / 2 }, { ...last, x: bx + bw / 2, y: by + bh / 2 }] } });
  // Principal axis supplies a rotated ellipse fit without favoring its start point.
  const mx = points.reduce((sum, p) => sum + p.x, 0) / points.length, my = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const xx = points.reduce((sum, p) => sum + (p.x - mx) ** 2, 0), yy = points.reduce((sum, p) => sum + (p.y - my) ** 2, 0);
  const xy = points.reduce((sum, p) => sum + (p.x - mx) * (p.y - my), 0), principal = Math.atan2(2 * xy, xx - yy) / 2;
  for (const angle of [0, principal]) {
    const co = Math.cos(angle), si = Math.sin(angle), local = points.map(p => ({ x: (p.x - cx) * co + (p.y - cy) * si, y: -(p.x - cx) * si + (p.y - cy) * co }));
    const l = Math.min(...local.map(p => p.x)), r = Math.max(...local.map(p => p.x)), t = Math.min(...local.map(p => p.y)), b = Math.max(...local.map(p => p.y));
    const ex = (l + r) / 2, ey = (t + b) / 2, rx = (r - l) / 2, ry = (b - t) / 2;
    const error = local.reduce((sum, p) => sum + Math.abs(Math.hypot((p.x - ex) / rx, (p.y - ey) / ry) - 1) * Math.min(rx, ry), 0) / local.length;
    const circle = Math.abs(rx - ry) / Math.max(rx, ry) < .14;
    const erx = circle ? (rx + ry) / 2 : rx, ery = circle ? erx : ry;
    const wx = cx + ex * co - ey * si, wy = cy + ex * si + ey * co;
    choices.push({ error, stroke: { ...stroke, tool: circle ? 'circle' : 'ellipse', pressure: false, rotation: angle * 180 / Math.PI,
      points: [{ ...first, x: wx - erx, y: wy - ery }, { ...last, x: wx + erx, y: wy + ery }] } });
  }
  const vertices = corners(points, tolerance);
  if (vertices.length >= 3 && vertices.length <= 12) {
    const tool: NoteShapeTool = vertices.length === 3 ? 'triangle' : vertices.length === 5 ? 'pentagon' : 'polygon';
    const ideal = fitRegular(vertices), error = symmetricError(points, ideal);
    if (vertices.length !== 4 && error < diagonal * .065) choices.push({ error, stroke: fittedPath(stroke, ideal, true, tool) });
    if (vertices.length === 5) {
      const star = fitRegular(vertices, 1, 2), error = symmetricError(points, star);
      if (error < diagonal * .065) choices.push({ error, stroke: fittedPath(stroke, star, true, 'star') });
    }
    if (vertices.length === 10) {
      // Both starting phases are valid for a five-point star.
      for (const phase of [vertices, [...vertices.slice(1), vertices[0]]]) {
        const star = fitRegular(phase, .44), error = symmetricError(points, star);
        choices.push({ error, stroke: fittedPath(stroke, star, true, 'star') });
      }
    }
    if (vertices.length === 3) choices.push({ error: symmetricError(points, vertices) + diagonal * .003, stroke: fittedPath(stroke, vertices, true, 'triangle') });
  }
  choices.sort((a, b) => a.error - b.error);
  if (choices[0]?.error < size * .10) return choices[0].stroke;
  if (!regularize) return null;
  // Unknown diagrams become tidy paths only after the user deliberately holds.
  return fittedPath(stroke, vertices.length >= 3 && vertices.length <= 12 ? vertices : smoothPath(simplify(points, tolerance), true), true);
}
