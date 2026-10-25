import { getStroke } from "perfect-freehand";
import type { InkPoint, InkStroke, NoteElement, NoteText, NoteTransform } from "./types";
import { isShapeTool, shapePaths } from "./shapes";
import { writingOutline } from './inkGeometry';
import { noteFontSpec } from './fonts';

export interface Bounds { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }
export type ResizeCorner = 'nw' | 'ne' | 'se' | 'sw';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function strokeExtents(stroke: InkStroke): Bounds {
  if (!stroke.points.length) return { x: 0, y: 0, w: 0, h: 0 };
  if ((stroke.renderer === 2 || stroke.renderer === 3 || stroke.renderer === 4) && !isShapeTool(stroke.tool)) {
    const outline = savedOutline(stroke);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const [x, y] of outline) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    return { x: left, y: top, w: right - left, h: bottom - top };
  }
  const points = isShapeTool(stroke.tool) ? shapePaths(stroke).flatMap(path => path.points) : stroke.points;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
  }
  const pad = Math.max(.5, stroke.width / 2);
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

function unrotatedBounds(element: NoteElement): Bounds {
  if (element.kind === "stroke") return strokeExtents(element);
  if (element.kind === "text") return {
    x: element.x, y: element.y, w: Math.max(0, element.w),
    h: Math.max(0, element.h, measureTextElement(element.text, element.fontSize, element.w, element)),
  };
  return { x: element.x, y: element.y, w: Math.max(0, element.w), h: Math.max(0, element.h) };
}

const radians = (degrees: number) => degrees * Math.PI / 180;
const centerOf = (bounds: Bounds): Point => ({ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 });
const transformCenter = (element: NoteElement): Point => element.kind === 'stroke' && element.transformOrigin
  ? { x: element.transformOrigin[0], y: element.transformOrigin[1] } : centerOf(unrotatedBounds(element));
export const elementTransformCenter = transformCenter;

export function rotatePoint(point: Point, center: Point, degrees: number): Point {
  const angle = radians(degrees), cosine = Math.cos(angle), sine = Math.sin(angle);
  const x = point.x - center.x, y = point.y - center.y;
  return { x: center.x + x * cosine - y * sine, y: center.y + x * sine + y * cosine };
}

function elementCorners(element: NoteElement): Point[] {
  const bounds = unrotatedBounds(element), center = transformCenter(element);
  const corners = [
    { x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.w, y: bounds.y },
    { x: bounds.x + bounds.w, y: bounds.y + bounds.h }, { x: bounds.x, y: bounds.y + bounds.h },
  ];
  return corners.map(point => transformPoint(point, element, center));
}

function transformPoint(point: Point, element: NoteElement, center = transformCenter(element)): Point {
  const [a, b, c, d] = element.transform ?? [1, 0, 0, 1];
  const x = point.x - center.x, y = point.y - center.y;
  return rotatePoint({ x: center.x + a * x + c * y, y: center.y + b * x + d * y }, center, element.rotation ?? 0);
}

export function elementBounds(element: NoteElement): Bounds {
  const corners = elementCorners(element);
  const x = Math.min(...corners.map(point => point.x)), y = Math.min(...corners.map(point => point.y));
  return { x, y, w: Math.max(...corners.map(point => point.x)) - x, h: Math.max(...corners.map(point => point.y)) - y };
}

function unrotatePoint(point: Point, element: NoteElement): Point {
  const center = transformCenter(element);
  const local = rotatePoint(point, center, -(element.rotation ?? 0));
  if (!element.transform) return local;
  const [a, b, c, d] = element.transform, determinant = a * d - b * c;
  const x = local.x - center.x, y = local.y - center.y;
  return { x: center.x + (d * x - c * y) / determinant, y: center.y + (a * y - b * x) / determinant };
}

function rotateContext(ctx: CanvasRenderingContext2D, element: NoteElement): void {
  if (!element.rotation && !element.transform) return;
  const center = transformCenter(element);
  ctx.translate(center.x, center.y); ctx.rotate(radians(element.rotation ?? 0));
  if (element.transform) ctx.transform(...element.transform, 0, 0);
  ctx.translate(-center.x, -center.y);
}

export function selectionBounds(elements: NoteElement[], ids: readonly string[]): Bounds | null {
  const wanted = new Set(ids);
  const bounds = elements.filter((element) => wanted.has(element.id)).map(elementBounds);
  if (!bounds.length) return null;
  const x = Math.min(...bounds.map((b) => b.x));
  const y = Math.min(...bounds.map((b) => b.y));
  const right = Math.max(...bounds.map((b) => b.x + b.w));
  const bottom = Math.max(...bounds.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

export function strokeOutlinePoints(stroke: InkStroke, complete = true): number[][] {
  if ((stroke.renderer === 2 || stroke.renderer === 3 || stroke.renderer === 4) && !isShapeTool(stroke.tool)) return writingOutline(stroke);
  const tuning = stroke.tuning;
  const points = stroke.points.map((point, index) => {
    let pressure = stroke.pressure ? clamp(point.p, .02, 1) : .5;
    // At the most expressive setting, very light Pencil pressure must still
    // leave a legible mark. Keep the middle of the range pressure-sensitive.
    if (stroke.pressure && tuning && tuning.pressureSensitivity > .5)
      pressure = Math.max(pressure, .15 + .5 * (tuning.pressureSensitivity - .5));
    const previous = stroke.points[index - 1];
    if (previous && tuning?.speedSensitivity) {
      const speed = distance(point, previous) / Math.max(1, point.t - previous.t);
      pressure *= 1 - tuning.speedSensitivity * clamp(speed / 2, 0, .55);
    }
    if (previous && tuning?.tipFlatness) {
      const direction = Math.atan2(point.y - previous.y, point.x - previous.x);
      const nibAngle = (point.angle ?? 325) * Math.PI / 180;
      pressure *= 1 - tuning.tipFlatness * (1 - Math.abs(Math.sin(direction - nibAngle))) * .25;
    }
    if (stroke.pressure && tuning && tuning.pressureSensitivity > .5)
      pressure = Math.max(pressure, .2 + .3 * (tuning.pressureSensitivity - .5));
    return [point.x, point.y, clamp(pressure, .02, 1)];
  });
  if (!points.length) return [];
  const style = tuning?.style ?? 'fountain';
  const travel = stroke.points.slice(1).reduce((length, point, index) => length + distance(point, stroke.points[index]), 0);
  if (travel < .5 && !isShapeTool(stroke.tool)) {
    const [x, y, pressure] = points[0];
    const radius = Math.max(.8, stroke.width * (.46 + .12 * pressure));
    return Array.from({ length: 20 }, (_, index) => {
      const angle = index * Math.PI / 10;
      return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius];
    });
  }
  const baseThinning = stroke.tool === 'highlighter' ? .18 : stroke.tool === 'pencil' ? .32 : style === 'ball' ? .1 : style === 'brush' ? .82 : .58;
  const thinning = style === 'ball' && stroke.tool === 'pen' ? 0 : stroke.pressure || tuning?.speedSensitivity || tuning?.tipFlatness
    ? Math.min(stroke.tool === 'pencil' ? .45 : style === 'brush' ? .78 : .6, baseThinning * (tuning?.pressureSensitivity ?? .5) * 2) : 0;
  const sharpness = Math.max(tuning?.tipSharpness ?? 0, style === 'brush' && tuning ? .3 : 0);
  const taper = sharpness * Math.min(stroke.width * 1.25, travel * .16);
  return getStroke(points, {
    size: Math.max(.5, stroke.width),
    // Pencil remains pressure-sensitive, but the pen's expressive thinning made
    // a light Apple Pencil sample too narrow for a 2.5pt handwriting stroke.
    thinning,
    smoothing: tuning ? Math.min(.75, tuning.smoothing) : .58,
    streamline: Math.min(.52, stroke.highlight?.stabilization ?? tuning?.streamline ?? .28),
    simulatePressure: false,
    last: complete,
    start: { cap: true, taper },
    end: { cap: true, taper },
  });
}

/** Opacity shared by committed ink and the single-frame live preview. */
export function strokeOpacity(stroke: Pick<InkStroke, "tool" | "highlight">): number {
  return stroke.highlight?.opacity ?? (stroke.tool === "highlighter" ? .24 : 1);
}

function fillOutline(ctx: CanvasRenderingContext2D, points: number[][]) {
  if (!points.length) return;
  if (points.length < 3) {
    ctx.beginPath(); ctx.arc(points[0][0], points[0][1], .5, 0, Math.PI * 2); ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i], next = points[i + 1];
    ctx.quadraticCurveTo(current[0], current[1], (current[0] + next[0]) / 2, (current[1] + next[1]) / 2);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last[0], last[1]);
  ctx.closePath();
  ctx.fill();
}

function strokeEndpoints(stroke: InkStroke): [InkPoint, InkPoint] | null {
  if (!stroke.points.length) return null;
  return [stroke.points[0], stroke.points[stroke.points.length - 1]];
}

const savedOutlines = new WeakMap<InkStroke, { points: InkPoint[]; count: number; last?: InkPoint; outline: number[][] }>();
function savedOutline(stroke: InkStroke): number[][] {
  const cached = savedOutlines.get(stroke), last = stroke.points[stroke.points.length - 1];
  if (cached?.points === stroke.points && cached.count === stroke.points.length && cached.last === last) return cached.outline;
  const outline = strokeOutlinePoints(stroke);
  savedOutlines.set(stroke, { points: stroke.points, count: stroke.points.length, last, outline });
  return outline;
}

function drawStrokeGeometry(ctx: CanvasRenderingContext2D, stroke: InkStroke, complete: boolean): void {
  const ends = strokeEndpoints(stroke);
  if (!ends) return;
  if (isShapeTool(stroke.tool)) {
    for (const path of shapePaths(stroke)) {
      if (!path.points.length) continue;
      ctx.beginPath(); ctx.moveTo(path.points[0].x, path.points[0].y);
      for (const point of path.points.slice(1)) ctx.lineTo(point.x, point.y);
      if (path.closed) ctx.closePath();
      if (path.fill && (stroke.fillOpacity ?? 0) > 0) {
        ctx.save(); ctx.fillStyle = stroke.fillColor ?? stroke.color;
        ctx.globalAlpha *= stroke.fillOpacity ?? 0; ctx.fill(); ctx.restore();
      }
      ctx.stroke();
    }
  } else {
    // A highlighter is one filled polygon. Its alpha is therefore applied once,
    // rather than once per input segment, so slow writing never creates dark joins.
    fillOutline(ctx, complete ? savedOutline(stroke) : strokeOutlinePoints(stroke, false));
  }
}

function prepareStrokeContext(ctx: CanvasRenderingContext2D, stroke: InkStroke, alpha: number) {
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = Math.max(.5, stroke.width);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha *= alpha;
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: InkStroke, complete = true): void {
  ctx.save();
  rotateContext(ctx, stroke);
  prepareStrokeContext(ctx, stroke, strokeOpacity(stroke));
  drawStrokeGeometry(ctx, stroke, complete);
  ctx.restore();
}

/** Opaque geometry for the live mask. Alpha is applied once when compositing. */
export function drawStrokeOpaque(ctx: CanvasRenderingContext2D, stroke: InkStroke, complete = true): void {
  ctx.save();
  rotateContext(ctx, stroke);
  prepareStrokeContext(ctx, stroke, 1);
  drawStrokeGeometry(ctx, stroke, complete);
  ctx.restore();
}

function strongDirection(text: string): CanvasDirection {
  for (const character of text) {
    if (/[֐-ࣿ]/u.test(character)) return "rtl";
    if (/[A-Za-z]/.test(character)) return "ltr";
  }
  return "inherit";
}

function wrappedLines(text: string, width: number, measure: (value: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph) { lines.push(""); continue; }
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > width) { lines.push(line); line = word; }
      else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function fallbackTextWidth(value: string, fontSize: number) {
  let units = 0;
  for (const character of value) units += /[֐-ࣿ]/u.test(character) ? .62 : /\s/.test(character) ? .32 : .56;
  return units * fontSize;
}

const textFont = (size: number, options: Partial<NoteText>) => noteFontSpec(size, options);
const textLineHeight = (size: number, options: Partial<NoteText>) => size * (options.lineSpacing ?? 1.35);

/** Height used by the editor and renderer for the same multiline wrapping rule. */
export function measureTextElement(text: string, fontSize: number, width: number, options: Partial<NoteText> = {}): number {
  const size = Math.max(6, fontSize), available = Math.max(1, width);
  let measure = (value: string) => fallbackTextWidth(value, size);
  if (typeof document !== "undefined") {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.font = textFont(size, options);
      measure = (value) => ctx.measureText(value).width;
    }
  }
  const lines = wrappedLines(text, available, measure);
  return Math.max(textLineHeight(size, options), lines.length * textLineHeight(size, options));
}

/** Same font, wrapping and alignment as Canvas text; boxes stay in page space. */
export function textWordBoxes(element: NoteText): { text: string; x: number; y: number; w: number; h: number }[] {
  const size = Math.max(6, element.fontSize);
  let measure = (value: string) => fallbackTextWidth(value, size);
  if (typeof document !== 'undefined') {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) { ctx.font = textFont(size, element); measure = value => ctx.measureText(value).width; }
  }
  const rtl = strongDirection(element.text) === 'rtl';
  const alignment = element.alignment && element.alignment !== 'auto' ? element.alignment : rtl ? 'right' : 'left';
  const height = textLineHeight(size, element);
  return wrappedLines(element.text, Math.max(1, element.w), measure).flatMap((line, index) => {
    const lineWidth = measure(line);
    const left = alignment === 'center' ? element.x + (element.w - lineWidth) / 2 : alignment === 'right' ? element.x + element.w - lineWidth : element.x;
    return [...line.matchAll(/\S+/g)].map(match => {
      const before = measure(line.slice(0, match.index)), width = measure(match[0]);
      return { text: match[0], x: rtl ? left + lineWidth - before - width : left + before, y: element.y + index * height, w: Math.max(1, width), h: height };
    });
  });
}

/** Only converted handwriting is erasable; ordinary text and PDF content stay intact. */
export function eraseConvertedText(element: NoteText, point: Point, radius: number, mode: 'word' | 'line', makeId: () => string): NoteText[] {
  if (!element.sourceInk && !element.handwritingTool) return [element];
  const words = textWordBoxes(element), center = transformCenter(element);
  const hit = words.map(word => {
    const corners = [{ x: word.x, y: word.y }, { x: word.x + word.w, y: word.y }, { x: word.x + word.w, y: word.y + word.h }, { x: word.x, y: word.y + word.h }].map(p => transformPoint(p, element, center));
    return pointInPolygon(point, corners) || corners.some((corner, index) => pointSegmentDistance(point, corner, corners[(index + 1) % corners.length]) <= radius);
  });
  if (!hit.some(Boolean)) return [element];
  if (mode === 'line') return [];
  return words.flatMap((word, index) => {
    if (hit[index]) return [];
    const local = { x: word.x + word.w / 2, y: word.y + word.h / 2 }, world = transformPoint(local, element, center);
    // Keep every surviving word at its old visual position: no reflow under
    // a moving eraser. Undo restores the full source-ink snapshot atomically.
    return [{ ...element, id: makeId(), text: word.text, x: word.x + world.x - local.x, y: word.y + world.y - local.y,
      w: word.w, h: word.h, sourceInk: undefined, handwritingTool: element.handwritingTool ?? (element.sourceInk?.[0]?.tool === 'pencil' ? 'pencil' : 'pen') }];
  });
}

export function drawElements(ctx: CanvasRenderingContext2D, elements: NoteElement[], images: Record<string, HTMLImageElement>): void {
  for (const element of elements) {
    if (element.kind === "stroke") { drawStroke(ctx, element); continue; }
    if (element.kind === "image") {
      const image = images[element.assetId];
      if (image?.complete && image.naturalWidth > 0) {
        ctx.save(); rotateContext(ctx, element);
        ctx.drawImage(image, element.x, element.y, element.w, element.h);
        ctx.restore();
      }
      continue;
    }
    ctx.save();
    rotateContext(ctx, element);
    ctx.fillStyle = element.color;
    ctx.font = textFont(Math.max(6, element.fontSize), element);
    ctx.textBaseline = "top";
    ctx.direction = strongDirection(element.text);
    const alignment = element.alignment && element.alignment !== 'auto'
      ? element.alignment : ctx.direction === 'rtl' ? 'right' : 'left';
    ctx.textAlign = alignment;
    const x = alignment === 'center' ? element.x + element.w / 2 : alignment === 'right' ? element.x + element.w : element.x;
    const lineHeight = textLineHeight(element.fontSize, element);
    const lines = wrappedLines(element.text, Math.max(1, element.w), (value) => ctx.measureText(value).width);
    for (let i = 0; i < lines.length; i++) {
      const baseline = element.y + i * lineHeight;
      ctx.fillText(lines[i], x, baseline);
      if (!lines[i] || (!element.underline && !element.strikethrough)) continue;
      const lineWidth = ctx.measureText(lines[i]).width;
      const left = alignment === 'center' ? x - lineWidth / 2 : alignment === 'right' ? x - lineWidth : x;
      ctx.strokeStyle = element.color; ctx.lineWidth = Math.max(1, element.fontSize / 16);
      if (element.underline) { ctx.beginPath(); ctx.moveTo(left, baseline + element.fontSize * 1.04); ctx.lineTo(left + lineWidth, baseline + element.fontSize * 1.04); ctx.stroke(); }
      if (element.strikethrough) { ctx.beginPath(); ctx.moveTo(left, baseline + element.fontSize * .52); ctx.lineTo(left + lineWidth, baseline + element.fontSize * .52); ctx.stroke(); }
    }
    ctx.restore();
  }
}

export function translateElements(elements: NoteElement[], ids: string[], dx: number, dy: number): NoteElement[] {
  const selected = new Set(ids);
  return elements.map((element) => {
    if (!selected.has(element.id)) return element;
    if (element.kind === "stroke") return { ...element,
      ...(element.transformOrigin ? { transformOrigin: [element.transformOrigin[0] + dx, element.transformOrigin[1] + dy] as [number, number] } : {}),
      points: element.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })) };
    return { ...element, x: element.x + dx, y: element.y + dy };
  });
}

export function expandSelectionGroups(elements: NoteElement[], ids: string[]): string[] {
  const selected = new Set(ids);
  const groups = new Set(elements.filter(element => selected.has(element.id) && element.groupId).map(element => element.groupId));
  return elements.filter(element => selected.has(element.id) || (element.groupId && groups.has(element.groupId))).map(element => element.id);
}

export function groupElements(elements: NoteElement[], ids: string[], groupId: string): NoteElement[] {
  const selected = new Set(expandSelectionGroups(elements, ids));
  return elements.map(element => selected.has(element.id) ? { ...element, groupId } : element);
}

export function ungroupElements(elements: NoteElement[], ids: string[]): NoteElement[] {
  const selected = new Set(ids);
  const groups = new Set(elements.filter(element => selected.has(element.id) && element.groupId).map(element => element.groupId));
  return elements.map(element => element.groupId && groups.has(element.groupId) ? { ...element, groupId: undefined } : element);
}

export function reorderElements(elements: NoteElement[], ids: string[], direction: 'forward' | 'backward'): NoteElement[] {
  const selected = new Set(expandSelectionGroups(elements, ids));
  const ordered = [...elements];
  if (direction === 'forward') {
    for (let index = ordered.length - 2; index >= 0; index--) {
      if (selected.has(ordered[index].id) && !selected.has(ordered[index + 1].id)) [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]];
    }
  } else {
    for (let index = 1; index < ordered.length; index++) {
      if (selected.has(ordered[index].id) && !selected.has(ordered[index - 1].id)) [ordered[index - 1], ordered[index]] = [ordered[index], ordered[index - 1]];
    }
  }
  return ordered;
}

function normalizeRotation(degrees: number): number {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

export function rotateElements(elements: NoteElement[], ids: string[], degrees: number): NoteElement[] {
  const group = selectionBounds(elements, ids);
  if (!group || !Number.isFinite(degrees) || degrees === 0) return elements;
  const selected = new Set(ids), groupCenter = centerOf(group);
  return elements.map(element => {
    if (!selected.has(element.id)) return element;
    const center = transformCenter(element);
    const rotatedCenter = rotatePoint(center, groupCenter, degrees);
    const dx = rotatedCenter.x - center.x, dy = rotatedCenter.y - center.y;
    const rotation = normalizeRotation((element.rotation ?? 0) + degrees);
    if (element.kind === 'stroke') return {
      ...element, rotation,
      ...(element.transformOrigin ? { transformOrigin: [element.transformOrigin[0] + dx, element.transformOrigin[1] + dy] as [number, number] } : {}),
      points: element.points.map(point => ({ ...point, x: point.x + dx, y: point.y + dy })),
    };
    return { ...element, x: element.x + dx, y: element.y + dy, rotation };
  });
}

export function resizeElements(elements: NoteElement[], ids: string[], factor: number): NoteElement[] {
  const selected = new Set(ids);
  const group = selectionBounds(elements, ids);
  if (!group || !Number.isFinite(factor) || factor <= 0) return elements;
  const chosen = elements.filter((element) => selected.has(element.id));
  let safeFactor = factor;
  for (const element of chosen) {
    const b = elementBounds(element);
    const minimum = element.kind === "image" ? 24 : element.kind === "text" ? 18 : 2;
    if (b.w > 0) safeFactor = Math.max(safeFactor, minimum / b.w);
    if (b.h > 0) safeFactor = Math.max(safeFactor, minimum / b.h);
  }
  safeFactor = clamp(safeFactor, .02, 100);
  const cx = group.x + group.w / 2, cy = group.y + group.h / 2;
  const scalePoint = (point: Point) => ({ x: cx + (point.x - cx) * safeFactor, y: cy + (point.y - cy) * safeFactor });
  return elements.map((element) => {
    if (!selected.has(element.id)) return element;
    if (element.kind === "stroke") return {
      ...element,
      width: Math.max(.5, element.width * safeFactor),
      ...(element.transformOrigin ? { transformOrigin: [scalePoint({ x: element.transformOrigin[0], y: element.transformOrigin[1] }).x, scalePoint({ x: element.transformOrigin[0], y: element.transformOrigin[1] }).y] as [number, number] } : {}),
      points: element.points.map((point) => ({ ...point, ...scalePoint(point) })),
    };
    const origin = scalePoint(element);
    if (element.kind === "text") return {
      ...element, ...origin,
      w: Math.max(18, element.w * safeFactor), h: Math.max(18, element.h * safeFactor),
      fontSize: Math.max(6, element.fontSize * safeFactor),
    };
    return { ...element, ...origin, w: Math.max(24, element.w * safeFactor), h: Math.max(24, element.h * safeFactor) };
  });
}

export function resizeCornerPoint(bounds: Bounds, corner: ResizeCorner): Point {
  return {
    x: corner === 'ne' || corner === 'se' ? bounds.x + bounds.w : bounds.x,
    y: corner === 'sw' || corner === 'se' ? bounds.y + bounds.h : bounds.y,
  };
}

export function resizeCornerAtPoint(bounds: Bounds, point: Point, radius: number): ResizeCorner | null {
  const corners: ResizeCorner[] = ['nw', 'ne', 'se', 'sw'];
  return corners.find(corner => distance(point, resizeCornerPoint(bounds, corner)) <= radius) ?? null;
}

export function resizeElementsFromCorner(elements: NoteElement[], ids: string[], corner: ResizeCorner, dragged: Point, lockAspect: boolean): NoteElement[] {
  const selected = new Set(ids);
  const group = selectionBounds(elements, ids);
  if (!group) return elements;
  const fixed = resizeCornerPoint(group, corner === 'nw' ? 'se' : corner === 'ne' ? 'sw' : corner === 'se' ? 'nw' : 'ne');
  const horizontal = corner === 'ne' || corner === 'se' ? 1 : -1;
  const vertical = corner === 'sw' || corner === 'se' ? 1 : -1;
  const chosen = elements.filter(element => selected.has(element.id));
  let minX = .02, minY = .02;
  for (const element of chosen) {
    const bounds = elementBounds(element);
    const minimum = element.kind === 'image' ? 24 : element.kind === 'text' ? 18 : 2;
    if (bounds.w > 0) minX = Math.max(minX, minimum / bounds.w);
    if (bounds.h > 0) minY = Math.max(minY, minimum / bounds.h);
  }
  let scaleX = Math.max(minX, horizontal * (dragged.x - fixed.x) / Math.max(.01, group.w));
  let scaleY = Math.max(minY, vertical * (dragged.y - fixed.y) / Math.max(.01, group.h));
  if (lockAspect) {
    const factor = Math.max(scaleX, scaleY);
    scaleX = factor; scaleY = factor;
  }
  scaleX = clamp(scaleX, .02, 100);
  scaleY = clamp(scaleY, .02, 100);
  const nextWidth = group.w * scaleX, nextHeight = group.h * scaleY;
  const x = horizontal > 0 ? fixed.x : fixed.x - nextWidth;
  const y = vertical > 0 ? fixed.y : fixed.y - nextHeight;
  const scalePoint = (point: Point) => ({ x: x + (point.x - group.x) * scaleX, y: y + (point.y - group.y) * scaleY });
  // Nonuniform world scaling of rotated geometry includes shear. Preserve that
  // exact transform instead of approximating it with a different rectangle.
  return elements.map(element => {
    if (!selected.has(element.id)) return element;
    const center = transformCenter(element), nextCenter = scalePoint(center);
    const dx = nextCenter.x - center.x, dy = nextCenter.y - center.y;
    const angle = radians(element.rotation ?? 0), cosine = Math.cos(angle), sine = Math.sin(angle);
    // R^-1 * S * R * T keeps the explicit rotation independently editable.
    const aa = scaleX * cosine * cosine + scaleY * sine * sine;
    const bb = (scaleY - scaleX) * sine * cosine;
    const dd = scaleX * sine * sine + scaleY * cosine * cosine;
    const [a, b, c, d] = element.transform ?? [1, 0, 0, 1];
    const transform: NoteTransform = [aa * a + bb * b, bb * a + dd * b, aa * c + bb * d, bb * c + dd * d];
    if (element.kind === 'stroke') return { ...element, transform,
      ...(element.transformOrigin ? { transformOrigin: [element.transformOrigin[0] + dx, element.transformOrigin[1] + dy] as [number, number] } : {}),
      points: element.points.map(point => ({ ...point, x: point.x + dx, y: point.y + dy })) };
    return { ...element, transform, x: element.x + dx, y: element.y + dy };
  });
}

function pointSegmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return distance(point, a);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return distance(point, { x: a.x + dx * t, y: a.y + dy * t });
}

export function strokeHitTest(stroke: InkStroke, candidate: Point, radius = 6): boolean {
  if (!stroke.points.length) return false;
  const bounds = elementBounds(stroke);
  if (candidate.x < bounds.x - radius || candidate.x > bounds.x + bounds.w + radius
    || candidate.y < bounds.y - radius || candidate.y > bounds.y + bounds.h + radius) return false;
  const center = transformCenter(stroke);
  const world = (point: Point) => transformPoint(point, stroke, center);
  if (!isShapeTool(stroke.tool)) {
    const outline = strokeOutlinePoints(stroke).map(([x, y]) => world({ x, y }));
    if (!outline.length) return false;
    if (pointInPolygon(candidate, outline)) return true;
    return outline.some((point, index) => pointSegmentDistance(candidate, point, outline[(index + 1) % outline.length]) <= radius);
  }
  const [a, b, c, d] = stroke.transform ?? [1, 0, 0, 1];
  const determinant = Math.abs(a * d - b * c);
  const hitsPath = (path: Point[], closed: boolean) => path.some((local, index) => {
    if (!closed && index === path.length - 1) return false;
    const next = path[(index + 1) % path.length];
    const localLength = distance(local, next);
    const start = world(local), end = world(next);
    const worldLength = distance(start, end);
    const width = localLength && worldLength
      ? stroke.width * determinant * localLength / worldLength / 2
      : stroke.width / 2;
    return pointSegmentDistance(candidate, start, end) <= radius + width;
  });
  return shapePaths(stroke).some(path => {
    const points = path.points.map(world);
    if (path.fill && (stroke.fillOpacity ?? 0) > 0 && pointInPolygon(candidate, points)) return true;
    return hitsPath(path.points, path.closed);
  });
}

/** Clip freehand centerlines against a page-space eraser circle, preserving editable fragments. */
export function eraseStrokeSegments(stroke: InkStroke, candidate: Point, radius: number, makeId: () => string): InkStroke[] {
  if (stroke.tool !== 'pen' && stroke.tool !== 'pencil' && stroke.tool !== 'highlighter') return [stroke];
  if (!strokeHitTest(stroke, candidate, radius)) return [stroke];
  const [a, b, c, d] = stroke.transform ?? [1, 0, 0, 1];
  const widthScale = Math.max(Math.hypot(a, b), Math.hypot(c, d));
  const expanded = radius + stroke.width * widthScale / 2;
  const center = transformCenter(stroke);
  const world = (point: InkPoint) => transformPoint(point, stroke, center);
  if (stroke.points.length === 1) return distance(world(stroke.points[0]), candidate) <= expanded ? [] : [stroke];
  const fragments: InkPoint[][] = [];
  let current: InkPoint[] = [];
  let removed = false;
  const flush = () => { if (current.length > 1 && distance(current[0], current[current.length - 1]) >= .5) fragments.push(current); current = []; };
  const interpolate = (start: InkPoint, end: InkPoint, fraction: number): InkPoint => {
    const angle = start.angle === undefined || end.angle === undefined ? start.angle ?? end.angle
      : (start.angle + (((end.angle - start.angle + 540) % 360) - 180) * fraction + 360) % 360;
    return {
      x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction,
      p: start.p + (end.p - start.p) * fraction, t: start.t + (end.t - start.t) * fraction,
      ...(angle === undefined ? {} : { angle }),
    };
  };
  for (let index = 1; index < stroke.points.length; index++) {
    const start = stroke.points[index - 1], end = stroke.points[index];
    const first = world(start), last = world(end);
    const dx = last.x - first.x, dy = last.y - first.y;
    const x = first.x - candidate.x, y = first.y - candidate.y;
    const aa = dx * dx + dy * dy, bb = 2 * (x * dx + y * dy), cc = x * x + y * y - expanded * expanded;
    const cuts = [0, 1];
    const discriminant = bb * bb - 4 * aa * cc;
    if (aa > 0 && discriminant > 0) {
      const root = Math.sqrt(discriminant);
      for (const fraction of [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)]) if (fraction > 0 && fraction < 1) cuts.push(fraction);
    }
    cuts.sort((left, right) => left - right);
    for (let segment = 1; segment < cuts.length; segment++) {
      const from = cuts[segment - 1], to = cuts[segment];
      const middle = (from + to) / 2;
      const inside = Math.hypot(x + dx * middle, y + dy * middle) <= expanded;
      if (inside) { removed = true; flush(); continue; }
      const firstPoint = interpolate(start, end, from), lastPoint = interpolate(start, end, to);
      if (!current.length || distance(current[current.length - 1], firstPoint) > .001) current.push(firstPoint);
      if (distance(current[current.length - 1], lastPoint) > .001) current.push(lastPoint);
    }
  }
  flush();
  if (!removed) return [stroke];
  return fragments.map((points, index) => ({ ...stroke, id: index === 0 ? stroke.id : makeId(), points,
    ...((stroke.transform || stroke.rotation || stroke.transformOrigin) ? { transformOrigin: [center.x, center.y] as [number, number] } : {}) }));
}

export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x) inside = !inside;
  }
  return inside;
}

function orientation(a: Point, b: Point, c: Point) {
  return Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y));
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  return orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b);
}

export function elementIntersectsPolygon(element: NoteElement, polygon: readonly Point[]): boolean {
  if (polygon.length < 3) return false;
  const b = elementBounds(element);
  const corners = elementCorners(element);
  if (corners.some((corner) => pointInPolygon(corner, polygon))
    || pointInPolygon({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, polygon)) return true;
  if (element.kind !== "stroke") {
    const own = unrotatedBounds(element);
    if (polygon.some(point => {
      const local = unrotatePoint(point, element);
      return local.x >= own.x && local.x <= own.x + own.w && local.y >= own.y && local.y <= own.y + own.h;
    })) return true;
  }
  if (element.kind === "stroke") {
    const center = transformCenter(element);
    if (element.points.some(point => pointInPolygon(transformPoint(point, element, center), polygon))) return true;
  }
  const edges = corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]] as const);
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    if (edges.some(([a, c]) => segmentsIntersect(p, q, a, c))) return true;
  }
  return false;
}

export function elementAtPoint(elements: NoteElement[], point: Point, radius = 4): NoteElement | undefined {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i];
    if (element.kind === "stroke" ? strokeHitTest(element, point, radius) : (() => {
      const b = unrotatedBounds(element), local = unrotatePoint(point, element);
      return local.x >= b.x - radius && local.x <= b.x + b.w + radius && local.y >= b.y - radius && local.y <= b.y + b.h + radius;
    })()) return element;
  }
  return undefined;
}
