import type { InkStroke, NoteElement, NotePage, NoteText } from './types';
import { newId } from './types';
import { drawStrokeOpaque, elementBounds, elementTransformCenter, measureTextElement, selectionBounds, type Bounds } from './ink';
import type { NoteFontFamily } from './fonts';
import { recognizeHeldShape } from './shapes';
export interface HandwritingSettings { enabled: boolean; fontFamily: NoteFontFamily; fontSize: number; delayMs: number }
export const DEFAULT_HANDWRITING: HandwritingSettings = { enabled: false, fontFamily: 'caveat', fontSize: 24, delayMs: 500 };

export type InkLine = { strokes: InkStroke[]; bounds: Bounds };
export const isWritingInk = (element: NoteElement): element is InkStroke => element.kind === 'stroke' && (element.tool === 'pen' || element.tool === 'pencil');
/** Conservative line grouping keeps delayed dots/crossbars with nearby letters. */
export function handwritingLines(strokes: InkStroke[], context: readonly NoteElement[] = []): InkLine[] {
  if (!strokes.length || strokes.length > 256 || strokes.reduce((n, stroke) => n + stroke.points.length, 0) > 100000) throw new Error('recognitionTooLarge');
  const candidates = strokes.filter(isWritingInk).map(stroke => ({ stroke, bounds: elementBounds(stroke) }));
  const entries = candidates.filter(({ stroke, bounds }) => {
    const peers = candidates.filter(peer => peer.stroke !== stroke && peer.bounds.h > Math.max(5, peer.stroke.width * 2));
    const nearLetter = peers.some(peer => {
      const vertical = Math.min(bounds.y + bounds.h, peer.bounds.y + peer.bounds.h) - Math.max(bounds.y, peer.bounds.y);
      const gap = Math.max(0, peer.bounds.x - bounds.x - bounds.w, bounds.x - peer.bounds.x - peer.bounds.w);
      const smallMark = bounds.w <= stroke.width * 3 && bounds.h <= stroke.width * 3;
      return vertical > Math.min(bounds.h, peer.bounds.h) * .35 && gap < Math.max(bounds.h, peer.bounds.h) * 1.3
        || smallMark && vertical > -peer.bounds.h * .7 && gap < peer.bounds.h * .4;
    });
    const horizontal = bounds.w >= 35 && bounds.w > bounds.h * 7;
    const underline = horizontal && context.some(element => {
      if (element.kind !== 'text') return false;
      const text = elementBounds(element), below = bounds.y - text.y - text.h;
      return below >= -text.h * .25 && below <= Math.max(18, text.h * .7) && bounds.x < text.x + text.w && bounds.x + bounds.w > text.x;
    });
    if (underline || horizontal && !nearLetter) return false;
    // Isolated dots and confidently geometric paths stay editable ink. Nearby
    // letters protect I/l/O/0 and delayed dots/crossbars from shape filtering.
    if (!nearLetter && bounds.w <= stroke.width * 3 && bounds.h <= stroke.width * 3) return false;
    // Geometry classification does not need every high-frequency Pencil sample.
    const shapePoints = stroke.points.length <= 128 ? stroke.points : Array.from({ length: 128 }, (_, i) => stroke.points[Math.round(i * (stroke.points.length - 1) / 127)]);
    const shape = !nearLetter || bounds.w >= 45 && bounds.h >= 45 ? recognizeHeldShape({ ...stroke, points: shapePoints }, false) : null;
    if (shape && shape.tool !== 'line') {
      const encloses = [...peers.map(peer => peer.bounds), ...context.filter(element => element.kind === 'text').map(elementBounds)]
        .some(peer => peer.h < bounds.h * .7 && peer.x > bounds.x && peer.y > bounds.y && peer.x + peer.w < bounds.x + bounds.w && peer.y + peer.h < bounds.y + bounds.h);
      if (encloses) return false;
    }
    // A short isolated I/l can be straight too. Hold recognition has a lower
    // size floor than OCR's geometry filter; do not lose small letter strokes.
    if (!nearLetter && shape && Math.max(bounds.w, bounds.h) >= 45) return false;
    return true;
  }).sort((a, b) => b.bounds.h - a.bounds.h);
  const heights = entries.filter(entry => entry.bounds.h > 6).map(entry => entry.bounds.h).sort((a, b) => a - b);
  const typical = heights[Math.floor(heights.length / 2)] ?? 20;
  const lines: InkLine[] = [];
  for (const entry of entries) {
    const center = entry.bounds.y + entry.bounds.h / 2;
    const candidates = lines.map(line => ({ line, distance: Math.abs(center - line.bounds.y - line.bounds.h / 2) }))
      .filter(item => item.distance < Math.max(typical * .85, item.line.bounds.h * .6)).sort((a, b) => a.distance - b.distance);
    const line = candidates[0]?.line;
    if (line) {
      line.strokes.push(entry.stroke);
      line.bounds = selectionBounds(line.strokes, line.strokes.map(stroke => stroke.id))!;
    } else lines.push({ strokes: [entry.stroke], bounds: entry.bounds });
  }
  if (lines.length > 16) throw new Error('recognitionTooLarge');
  return lines.sort((a, b) => a.bounds.y - b.bounds.y);
}

export const acceptedEnglish = (value: string): string | null => {
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || text.length > 500 || !/[A-Za-z0-9]/.test(text) || /[^\x20-\x7e\u2018-\u201d\u2013\u2014]/.test(text)) return null;
  if (/(.{2,})\1{5,}/i.test(text)) return null;
  return text;
};
export function acceptedLineEnglish(value: string, bounds: Bounds): string | null {
  const text = acceptedEnglish(value);
  // A plausibility bound rejects sentence-like hallucinations from a short mark.
  // This is not a calibrated confidence score or a handwriting accuracy claim.
  const maximum = Math.max(8, Math.ceil(bounds.w / Math.max(8, bounds.h) * 5));
  return text && text.length <= maximum ? text : null;
}

export function convertedElements(page: NotePage, lines: InkLine[], texts: string[], fontFamily: NoteFontFamily, fontSize: number): NoteElement[] | null {
  if (!lines.length || texts.length !== lines.length) return null;
  const recognized = texts.map((text, index) => acceptedLineEnglish(text, lines[index].bounds));
  if (recognized.some(text => !text)) return null;
  const originals = new Set(lines.flatMap(line => line.strokes));
  if (![...originals].every(stroke => page.elements.includes(stroke))) return null;
  const replacements = new Map<string, NoteText>(), removed = new Set([...originals].map(stroke => stroke.id));
  lines.forEach((line, index) => {
    const first = page.elements.find(element => line.strokes.includes(element as InkStroke))!;
    const w = Math.max(24, Math.min(page.width - line.bounds.x, line.bounds.w + fontSize * 2));
    const text: NoteText = { id: newId(), kind: 'text', text: recognized[index]!, x: line.bounds.x, y: line.bounds.y, w,
      h: fontSize * 1.35, fontSize, fontFamily, color: line.strokes[0].color, alignment: 'left', lineSpacing: 1.35,
      handwritingTool: line.strokes[0].tool === 'pencil' ? 'pencil' : 'pen',
      sourceInk: line.strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) })) };
    text.h = measureTextElement(text.text, fontSize, w, text);
    replacements.set(first.id, text);
  });
  return page.elements.flatMap(element => replacements.has(element.id) ? [replacements.get(element.id)!] : removed.has(element.id) ? [] : [element]);
}

/** Restore originals at the current text position; originals retain their pressure and geometry. */
export function restoredInk(text: NoteText): InkStroke[] {
  if (!text.sourceInk?.length) return [];
  const bounds = selectionBounds(text.sourceInk, text.sourceInk.map(stroke => stroke.id))!;
  const center = { x: text.x + text.w / 2, y: text.y + text.h / 2 };
  const matrix = (element: NoteElement) => {
    const theta = (element.rotation ?? 0) * Math.PI / 180, co = Math.cos(theta), si = Math.sin(theta);
    const [a, b, c, d] = element.transform ?? [1, 0, 0, 1];
    return [co * a - si * b, si * a + co * b, co * c - si * d, si * c + co * d];
  };
  const [a, b, c, d] = matrix(text);
  return text.sourceInk.map(stroke => {
    const origin = elementTransformCenter(stroke), x = origin.x + text.x - bounds.x - center.x, y = origin.y + text.y - bounds.y - center.y;
    const nextOrigin = { x: center.x + a * x + c * y, y: center.y + b * x + d * y };
    const [e, f, g, h] = matrix(stroke), dx = nextOrigin.x - origin.x, dy = nextOrigin.y - origin.y;
    return { ...stroke, id: newId(), groupId: undefined, rotation: 0,
      transform: [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h],
      transformOrigin: [nextOrigin.x, nextOrigin.y], points: stroke.points.map(point => ({ ...point, x: point.x + dx, y: point.y + dy })) };
  });
}

/** OCR sees the same stabilized glyphs the student sees, on a clean background. */
export function recognitionInk(line: InkLine): InkStroke[] {
  return line.strokes.map(stroke => {
    const center = elementTransformCenter(stroke);
    // Replacing the displayed brush with raw unsmoothed centerlines changed
    // letter shapes and lost the appearance that the user had made legible.
    return { ...stroke, color: '#000000', transformOrigin: [center.x, center.y] };
  });
}
export async function handwritingCrops(lines: InkLine[], current = () => true): Promise<{ pixels: ArrayBuffer; width: number; height: number }[]> {
  const crops: { pixels: ArrayBuffer; width: number; height: number }[] = [];
  for (const line of lines) {
    if (!current()) throw new Error('cancelled');
    const normalizedInk = recognitionInk(line), bounds = selectionBounds(normalizedInk, normalizedInk.map(stroke => stroke.id))!;
    const scale = Math.min(3, 1920 / Math.max(1, bounds.w), 432 / Math.max(1, bounds.h));
    const pad = Math.max(4, Math.min(24, bounds.h * scale * .18));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(32, Math.ceil(bounds.w * scale + pad * 2));
    canvas.height = Math.max(32, Math.ceil(bounds.h * scale + pad * 2));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(pad, pad); ctx.scale(scale, scale); ctx.translate(-bounds.x, -bounds.y);
    let budget = 0;
    for (const stroke of normalizedInk) {
      if (!current()) { canvas.width = 0; canvas.height = 0; throw new Error('cancelled'); }
      drawStrokeOpaque(ctx, stroke); budget += stroke.points.length;
      if (budget > 2048) { budget = 0; await new Promise(resolve => setTimeout(resolve, 0)); }
    }
    // Preserve aspect ratio: the local CTC worker resamples to the official
    // 48px input height. Stretching a line to a square changes letter shapes.
    const crop = { pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer as ArrayBuffer, width: canvas.width, height: canvas.height };
    canvas.width = 0; canvas.height = 0;
    crops.push(crop);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return crops;
}
