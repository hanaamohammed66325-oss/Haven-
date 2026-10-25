"use client";

import { useCallback, useEffect, useRef } from "react";
import type { DrawingTool, EraserSettings, HighlighterTuning, InkPoint, InkStroke, InkTuning, NoteElement, NotePage, NoteTool, ShapeHoldSetting } from "@/lib/notes/types";
import { newId, NOTE_SHAPES } from "@/lib/notes/types";
import { constrainShapeEnd, isShapeTool, recognizeHeldShape } from "@/lib/notes/shapes";
import { strokeInputPoints } from "@/lib/notes/strokeInput";
import { eraseByGesture } from '@/lib/notes/inkGestures';
import type { RegisterTouchCancellation } from './useNotebookNavigation';
import {
  drawElements,
  drawStroke,
  drawStrokeOpaque,
  eraseStrokeSegments,
  eraseConvertedText,
  strokeOpacity,
  elementAtPoint,
  elementIntersectsPolygon,
  expandSelectionGroups,
  selectionBounds,
  resizeCornerAtPoint,
  resizeCornerPoint,
  resizeElementsFromCorner,
  rotateElements,
  strokeHitTest,
  translateElements,
  type ResizeCorner,
  type Point,
} from "@/lib/notes/ink";

interface InkCanvasProps {
  fontRevision?: number;
  onInkStart?: () => void;
  onInkEnd?: () => void;
  page: NotePage;
  tool: NoteTool;
  color: string;
  width: number;
  pressure: boolean;
  tuning: InkTuning;
  highlighterTuning: HighlighterTuning;
  shapeHold: ShapeHoldSetting;
  eraserSettings: EraserSettings;
  fillColor: string;
  fillOpacity: number;
  cornerRadius: number;
  allowTouch: boolean;
  nativeScroll?: boolean;
  palmRejection: boolean;
  scale: number;
  rasterScale: number;
  images: Record<string, HTMLImageElement>;
  selectionIds: string[];
  hiddenElementId?: string;
  aspectLocked: boolean;
  onChange: (elements: NoteElement[]) => void;
  onSelect: (ids: string[]) => void;
  onTextRequest: (point: { x: number; y: number }, existingId?: string) => void;
  onPan: (dx: number, dy: number) => void;
  onEraserUsed: () => void;
  registerTouchCancellation: RegisterTouchCancellation;
}

type DrawGesture = { kind: "draw"; pointerId: number; stroke: InkStroke; recognition?: InkStroke; holdTimer?: ReturnType<typeof setTimeout>; holdAnchor?: Point; previewIndex?: number };
type EraseGesture = { kind: "erase"; pointerId: number; draft: NoteElement[]; changed: boolean };
type LassoGesture = { kind: "lasso"; pointerId: number; points: Point[] };
type DragGesture = { kind: "drag"; pointerId: number; start: Point; last: Point; base: NoteElement[]; fromTextTool?: boolean; editOnTap?: boolean; moved?: boolean };
type ResizeGesture = { kind: "resize"; pointerId: number; start: Point; last: Point; base: NoteElement[]; corner: ResizeCorner; aspectLocked: boolean };
type RotateGesture = { kind: "rotate"; pointerId: number; last: Point; base: NoteElement[]; center: Point; startAngle: number };
type PanGesture = { kind: "pan"; pointerId: number; clientX: number; clientY: number };
type TextGesture = { kind: "text"; pointerId: number; start: Point; clientX: number; clientY: number; moved: boolean; pointerType: string };
type Gesture = DrawGesture | EraseGesture | LassoGesture | DragGesture | ResizeGesture | RotateGesture | PanGesture | TextGesture;

function clearDrawHold(gesture: Gesture | null): void {
  if (gesture?.kind === 'draw' && gesture.holdTimer) clearTimeout(gesture.holdTimer);
}

const usesStraightPoints = (stroke: InkStroke) => isShapeTool(stroke.tool) || (stroke.tool === 'highlighter' && stroke.highlight?.straight);

const DRAWING_TOOLS = new Set<NoteTool>(["pen", "pencil", "highlighter", ...NOTE_SHAPES]);
const MAX_BACKING_PIXELS = 12_000_000;
const PALM_SIZE = 30;
const GHOST_TOUCH_MS = 650;

function canvasContext(canvas: HTMLCanvasElement | null, page: NotePage) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(canvas.width / page.width, 0, 0, canvas.height / page.height, 0, 0);
  return ctx;
}

function clearCanvas(canvas: HTMLCanvasElement | null, page: NotePage) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(canvas.width / page.width, 0, 0, canvas.height / page.height, 0, 0);
}

function resizeBacking(canvas: HTMLCanvasElement, page: NotePage, scale: number) {
  const cssWidth = Math.max(1, page.width * scale);
  const cssHeight = Math.max(1, page.height * scale);
  const nativeDpr = Math.max(1, window.devicePixelRatio || 1);
  const budgetDpr = Math.sqrt(MAX_BACKING_PIXELS / (cssWidth * cssHeight));
  const dpr = Math.max(.25, Math.min(nativeDpr, budgetDpr));
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function boundsContain(bounds: { x: number; y: number; w: number; h: number }, point: Point, padding = 0) {
  return point.x >= bounds.x - padding && point.x <= bounds.x + bounds.w + padding
    && point.y >= bounds.y - padding && point.y <= bounds.y + bounds.h + padding;
}

function rotationHandlePoint(bounds: { x: number; y: number; w: number; h: number }, scale: number): Point {
  return { x: bounds.x + bounds.w / 2, y: bounds.y >= 42 / scale ? bounds.y - 30 / scale : bounds.y + bounds.h + 30 / scale };
}

function rotationDegrees(gesture: RotateGesture): number {
  const angle = Math.atan2(gesture.last.y - gesture.center.y, gesture.last.x - gesture.center.x);
  return (angle - gesture.startAngle) * 180 / Math.PI;
}

function drawSelection(ctx: CanvasRenderingContext2D, elements: NoteElement[], ids: string[], scale: number) {
  const bounds = selectionBounds(elements, ids);
  if (!bounds) return;
  const lineWidth = 1.5 / scale, handleRadius = 7 / scale;
  ctx.save();
  ctx.strokeStyle = "#3478c7";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([6 / scale, 4 / scale]);
  ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.setLineDash([]);
  for (const corner of ['nw', 'ne', 'se', 'sw'] as ResizeCorner[]) {
    const point = resizeCornerPoint(bounds, corner);
    ctx.beginPath(); ctx.arc(point.x, point.y, handleRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  const handle = rotationHandlePoint(bounds, scale);
  const attachmentY = handle.y < bounds.y ? bounds.y : bounds.y + bounds.h;
  ctx.beginPath(); ctx.moveTo(handle.x, attachmentY); ctx.lineTo(handle.x, handle.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(handle.x, handle.y, 8 / scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(handle.x, handle.y, 3 / scale, -.8 * Math.PI, .5 * Math.PI); ctx.stroke();
  ctx.restore();
}

export function InkCanvas({
  page, tool, color, width, pressure, tuning, highlighterTuning, shapeHold, eraserSettings, fillColor, fillOpacity, cornerRadius, allowTouch, nativeScroll = false, palmRejection, scale, rasterScale, images, selectionIds, hiddenElementId, aspectLocked,
  onChange, onSelect, onTextRequest, onPan, onEraserUsed, registerTouchCancellation, fontRevision, onInkStart, onInkEnd,
}: InkCanvasProps) {
  const committedRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const previewMaskRef = useRef<HTMLCanvasElement | null>(null);
  const pageRef = useRef(page);
  const imagesRef = useRef(images);
  const selectionRef = useRef(selectionIds);
  const gestureRef = useRef<Gesture | null>(null);
  const frameRef = useRef<number | null>(null);
  const lassoPaintedIndexRef = useRef(0);
  const touchPointerRef = useRef<number | null>(null);
  const activePenRef = useRef<number | null>(null);
  const lastPenAtRef = useRef(-Infinity);
  const paintedRef = useRef<{ elements: NoteElement[]; images: Record<string, HTMLImageElement>; width: number; height: number; pageId: string } | null>(null);

  pageRef.current = page;
  imagesRef.current = images;
  selectionRef.current = selectionIds;

  const renderCommitted = useCallback((elements = pageRef.current.elements) => {
    const canvas = committedRef.current, current = pageRef.current;
    if (!canvas) return;
    const visible = hiddenElementId ? elements.filter(element => element.id !== hiddenElementId) : elements;
    const painted = paintedRef.current;
    const canAppend = painted && painted.pageId === current.id && painted.width === canvas.width && painted.height === canvas.height
      && painted.images === imagesRef.current && painted.elements.length <= visible.length
      && painted.elements.every((element, index) => element === visible[index]);
    if (!canAppend) clearCanvas(canvas, current);
    const ctx = canvasContext(canvas, current);
    if (ctx) {
      drawElements(ctx, canAppend ? visible.slice(painted.elements.length) : visible, imagesRef.current);
      paintedRef.current = { elements: visible, images: imagesRef.current, width: canvas.width, height: canvas.height, pageId: current.id };
    }
  }, [hiddenElementId]);

  const renderDecorations = useCallback((elements = pageRef.current.elements, ids = selectionRef.current) => {
    const canvas = liveRef.current, current = pageRef.current;
    if (canvas) canvas.style.opacity = '1';
    clearCanvas(canvas, current);
    if (ids.length) {
      if (canvas) resizeBacking(canvas, current, rasterScale);
      const selectionContext = canvasContext(canvas, current);
      if (selectionContext) drawSelection(selectionContext, elements, ids, scale);
    } else if (canvas && !gestureRef.current) {
      // Idle pages need no full-page transparent interaction bitmap.
      canvas.width = 1; canvas.height = 1;
    }
  }, [scale, rasterScale]);

  const clearPreviewMask = useCallback(() => {
    const mask = previewMaskRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, mask.width, mask.height);
  }, []);

  const previewMask = useCallback(() => {
    const live = liveRef.current;
    if (!live) return null;
    const mask = previewMaskRef.current ?? document.createElement("canvas");
    previewMaskRef.current = mask;
    if (mask.width !== live.width || mask.height !== live.height) {
      mask.width = live.width;
      mask.height = live.height;
    }
    return mask;
  }, []);

  const schedule = useCallback((work: () => void) => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => { frameRef.current = null; work(); });
  }, []);

  const pointFromClient = useCallback((clientX: number, clientY: number): Point => {
    const rect = liveRef.current?.getBoundingClientRect();
    const current = pageRef.current;
    if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 };
    return { x: (clientX - rect.left) * current.width / rect.width, y: (clientY - rect.top) * current.height / rect.height };
  }, []);

  const eventPoints = useCallback((event: PointerEvent, previous?: InkPoint): InkPoint[] => {
    const rect = liveRef.current?.getBoundingClientRect(), current = pageRef.current;
    if (!rect?.width || !rect.height) return [];
    return strokeInputPoints(event, previous, (x, y) => ({ x: (x - rect.left) * current.width / rect.width, y: (y - rect.top) * current.height / rect.height }), tool === 'highlighter' ? highlighterTuning.response : tuning.response);
  }, [tool, highlighterTuning.response, tuning.response]);

  const renderDrawingPreview = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.kind !== "draw") return;
    const canvas = liveRef.current, current = pageRef.current;
    if (!canvas) return;
    const ctx = canvasContext(canvas, current);
    if (!ctx) return;
    const stroke = gesture.recognition ?? gesture.stroke;
    if (!gesture.recognition && !stroke.renderer && stroke.tool === 'highlighter' && !stroke.highlight?.straight) {
      const points = stroke.points;
      const from = gesture.previewIndex ?? 0;
      if (from === 0) {
        clearCanvas(canvas, current);
        canvas.style.opacity = String(strokeOpacity(stroke));
      }
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (points.length === 1) {
        ctx.beginPath(); ctx.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2); ctx.fill();
      } else if (from < points.length) {
        ctx.beginPath();
        const start = Math.max(0, from - 1);
        ctx.moveTo(points[start].x, points[start].y);
        for (let index = start + 1; index < points.length; index++) ctx.lineTo(points[index].x, points[index].y);
        ctx.stroke();
      }
      ctx.restore();
      gesture.previewIndex = points.length;
      return;
    }
    canvas.style.opacity = '1';
    if (gesture.recognition) {
      clearPreviewMask(); clearCanvas(canvas, current);
      ctx.save(); ctx.globalAlpha = .65; drawStroke(ctx, stroke); ctx.restore();
      return;
    }
    if (isShapeTool(stroke.tool)) {
      clearPreviewMask();
      clearCanvas(canvas, current);
      drawStroke(ctx, stroke, false);
      return;
    }
    if ((stroke.renderer === 2 || stroke.renderer === 3 || stroke.renderer === 4) && stroke.tool === 'highlighter') {
      clearCanvas(canvas, current);
      canvas.style.opacity = String(strokeOpacity(stroke));
      drawStrokeOpaque(ctx, stroke, false);
      return;
    }
    // Every frame uses the same full geometry as the committed stroke. Drawing
    // tiny independent tails created visible seams and detached end caps.
    clearCanvas(canvas, current);
    if (stroke.tool === "highlighter") {
      const mask = previewMask();
      const maskCtx = canvasContext(mask, current);
      if (!mask || !maskCtx) return;
      clearPreviewMask();
      drawStrokeOpaque(maskCtx, stroke, false);
      const liveCtx = canvas.getContext("2d");
      if (!liveCtx) return;
      liveCtx.save();
      liveCtx.setTransform(1, 0, 0, 1, 0, 0);
      liveCtx.globalAlpha = strokeOpacity(stroke);
      liveCtx.drawImage(mask, 0, 0);
      liveCtx.restore();
    } else {
      // Pencil is fully opaque, so the offscreen mask is identical to drawing
      // its complete geometry directly, while avoiding a second full canvas
      // clear, polygon fill, and image composite per active frame.
      drawStroke(ctx, stroke, false);
    }
  }, [clearPreviewMask, previewMask]);

  const renderLassoPreview = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.kind !== "lasso") return;
    const canvas = liveRef.current, current = pageRef.current;
    const ctx = canvasContext(canvas, current);
    if (!ctx || !gesture.points.length) return;
    const from = Math.max(0, lassoPaintedIndexRef.current - 1);
    if (from >= gesture.points.length - 1) return;
    ctx.save(); ctx.strokeStyle = "#3478c7"; ctx.lineWidth = 1.5 / scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(gesture.points[from].x, gesture.points[from].y);
    for (let i = from + 1; i < gesture.points.length; i++) ctx.lineTo(gesture.points[i].x, gesture.points[i].y);
    ctx.stroke(); ctx.restore();
    lassoPaintedIndexRef.current = gesture.points.length;
  }, [scale]);

  const renderDragPreview = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.kind !== "drag") return;
    const dx = gesture.last.x - gesture.start.x, dy = gesture.last.y - gesture.start.y;
    const selected = new Set(selectionRef.current);
    const moved = translateElements(gesture.base.filter(element => selected.has(element.id)), selectionRef.current, dx, dy);
    const canvas = liveRef.current, current = pageRef.current;
    clearCanvas(canvas, current);
    const ctx = canvasContext(canvas, current);
    if (!ctx) return;
    drawElements(ctx, moved.filter((element) => selected.has(element.id)), imagesRef.current);
    drawSelection(ctx, moved, selectionRef.current, scale);
  }, [scale]);

  const renderResizePreview = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.kind !== "resize") return;
    const baseBounds = selectionBounds(gesture.base, selectionRef.current);
    if (!baseBounds) return;
    const corner = resizeCornerPoint(baseBounds, gesture.corner);
    const dragged = { x: corner.x + gesture.last.x - gesture.start.x, y: corner.y + gesture.last.y - gesture.start.y };
    const selected = new Set(selectionRef.current);
    const resized = resizeElementsFromCorner(gesture.base.filter(element => selected.has(element.id)), selectionRef.current, gesture.corner, dragged, gesture.aspectLocked);
    const canvas = liveRef.current, current = pageRef.current;
    clearCanvas(canvas, current);
    const ctx = canvasContext(canvas, current);
    if (!ctx) return;
    drawElements(ctx, resized.filter(element => selected.has(element.id)), imagesRef.current);
    drawSelection(ctx, resized, selectionRef.current, scale);
  }, [scale]);

  const renderRotatePreview = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.kind !== "rotate") return;
    const selected = new Set(selectionRef.current);
    const rotated = rotateElements(gesture.base.filter(element => selected.has(element.id)), selectionRef.current, rotationDegrees(gesture));
    const canvas = liveRef.current, current = pageRef.current;
    clearCanvas(canvas, current);
    const ctx = canvasContext(canvas, current);
    if (!ctx) return;
    drawElements(ctx, rotated.filter(element => selected.has(element.id)), imagesRef.current);
    drawSelection(ctx, rotated, selectionRef.current, scale);
  }, [scale]);

  // A deferred resolution upgrade can arrive after the next pen stroke starts.
  // Restore its preview immediately; resizing a canvas clears all its pixels.
  const restorePreviewRef = useRef<() => void>(() => {});
  restorePreviewRef.current = () => {
    const gesture = gestureRef.current;
    if (!gesture) { renderDecorations(); return; }
    if (gesture.kind === "draw") { gesture.previewIndex = 0; renderDrawingPreview(); }
    else if (gesture.kind === "lasso") { lassoPaintedIndexRef.current = 0; renderLassoPreview(); }
    else if (gesture.kind === "drag" || gesture.kind === "resize" || gesture.kind === "rotate") {
      const chosen = new Set(selectionRef.current);
      renderCommitted(gesture.base.filter(element => !chosen.has(element.id)));
      if (gesture.kind === "drag") renderDragPreview();
      else if (gesture.kind === "resize") renderResizePreview();
      else renderRotatePreview();
    }
    else if (gesture.kind === "erase") renderCommitted(gesture.draft);
  };

  useEffect(() => {
    const committed = committedRef.current, live = liveRef.current;
    if (!committed || !live) return;
    resizeBacking(committed, pageRef.current, rasterScale);
    if (gestureRef.current || selectionRef.current.length) resizeBacking(live, pageRef.current, rasterScale);
    else { live.width = 1; live.height = 1; }
    clearPreviewMask(); renderCommitted(); restorePreviewRef.current();
  }, [page.id, page.width, page.height, rasterScale, clearPreviewMask, renderCommitted]);

  useEffect(() => { if (!gestureRef.current) renderCommitted(page.elements); }, [page.elements, images, renderCommitted]);
  useEffect(() => { paintedRef.current = null; if (!gestureRef.current) renderCommitted(); }, [fontRevision, renderCommitted]);
  // Page navigation can create a new empty selection array without changing
  // anything on this surface. Do not clear a full-resolution canvas for that.
  const selectionKey = JSON.stringify(selectionIds);
  useEffect(() => { if (!gestureRef.current) renderDecorations(page.elements, selectionRef.current); }, [page.elements, selectionKey, rasterScale, renderDecorations]);
  useEffect(() => registerTouchCancellation(() => {
    if (touchPointerRef.current === null) return;
    if (gestureRef.current?.pointerId === touchPointerRef.current) {
      clearDrawHold(gestureRef.current);
      gestureRef.current = null;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      clearPreviewMask(); renderCommitted(); renderDecorations();
      onInkEnd?.();
    }
    touchPointerRef.current = null;
  }), [registerTouchCancellation, clearPreviewMask, renderCommitted, renderDecorations, onInkEnd]);
  useEffect(() => {
    const committed = committedRef.current, live = liveRef.current;
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      clearDrawHold(gestureRef.current);
      for (const canvas of [committed, live, previewMaskRef.current]) if (canvas) { canvas.width = 0; canvas.height = 0; }
    };
  }, []);
  useEffect(() => {
    const canvas = liveRef.current;
    if (!canvas) return;
    const suppressSelection = (event: Event) => event.preventDefault();
    canvas.addEventListener("selectstart", suppressSelection);
    return () => canvas.removeEventListener("selectstart", suppressSelection);
  }, []);

  const commitElements = useCallback((elements: NoteElement[]) => {
    pageRef.current = { ...pageRef.current, elements };
    onChange(elements);
    renderCommitted(elements);
    renderDecorations(elements, selectionRef.current);
  }, [onChange, renderCommitted, renderDecorations]);

  const eraseAt = useCallback((gesture: EraseGesture, point: Point) => {
    const radius = eraserSettings.mode === 'precision' ? eraserSettings.size / 4 : eraserSettings.size / 2;
    const draft: NoteElement[] = [];
    for (const element of gesture.draft) {
      if (element.kind === 'text' && (element.sourceInk || element.handwritingTool)) {
        const targets = element.sourceInk?.map(stroke => stroke.tool) ?? [element.handwritingTool!];
        if (!targets.some(tool => (tool === 'pen' || tool === 'pencil') && eraserSettings.targets[tool])) { draft.push(element); continue; }
        const fragments = eraseConvertedText(element, point, radius, eraserSettings.convertedText ?? 'word', newId);
        if (fragments.length !== 1 || fragments[0] !== element) gesture.changed = true;
        draft.push(...fragments); continue;
      }
      if (element.kind !== 'stroke' || !eraserSettings.targets[isShapeTool(element.tool) ? 'shapes' : element.tool]) {
        draft.push(element); continue;
      }
      if (!strokeHitTest(element, point, radius)) { draft.push(element); continue; }
      if (eraserSettings.mode === 'stroke' || isShapeTool(element.tool)) {
        gesture.changed = true;
        continue;
      }
      const fragments = eraseStrokeSegments(element, point, radius, newId);
      if (fragments.length !== 1 || fragments[0] !== element) gesture.changed = true;
      draft.push(...fragments);
    }
    gesture.draft = draft;
    renderCommitted(draft);
  }, [eraserSettings, renderCommitted]);

  const finishGesture = useCallback((event: PointerEvent, cancelled: boolean) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      if (activePenRef.current === event.pointerId) { activePenRef.current = null; lastPenAtRef.current = performance.now(); }
      return;
    }
    clearDrawHold(gesture);
    gestureRef.current = null;
    clearPreviewMask();
    if (gesture.kind === "draw") {
      if (!cancelled) {
        const stroke = gesture.recognition ?? gesture.stroke;
        if (!gesture.recognition) {
          const last = stroke.points[stroke.points.length - 1];
          const ending = eventPoints(event, last);
          if (usesStraightPoints(stroke)) {
            const final = ending[ending.length - 1] ?? last;
            const first = stroke.points[0];
            stroke.points = [first, { ...final, ...constrainShapeEnd(stroke.tool, first, final, event.shiftKey) }];
          } else stroke.points.push(...ending);
        }
        const erased = !gesture.recognition ? eraseByGesture(pageRef.current.elements, stroke, eraserSettings) : null;
        const next = erased ?? [...pageRef.current.elements, stroke];
        onSelect([]); selectionRef.current = [];
        commitElements(next);
      } else { renderCommitted(); renderDecorations(); }
    } else if (gesture.kind === "erase") {
      if (!cancelled && gesture.changed) {
        const kept = new Set(gesture.draft.map(element => element.id));
        const selected = selectionRef.current.filter(id => kept.has(id));
        selectionRef.current = selected; onSelect(selected); commitElements(gesture.draft);
        onEraserUsed();
      } else { renderCommitted(); renderDecorations(); }
    } else if (gesture.kind === "lasso") {
      if (!cancelled && gesture.points.length > 2) {
        const ids = expandSelectionGroups(pageRef.current.elements, pageRef.current.elements.filter((element) => elementIntersectsPolygon(element, gesture.points)).map((element) => element.id));
        selectionRef.current = ids; onSelect(ids); renderDecorations(pageRef.current.elements, ids);
      } else renderDecorations();
    } else if (gesture.kind === "drag") {
      if (!cancelled && gesture.fromTextTool && !gesture.moved) {
        renderCommitted(); renderDecorations();
        if (gesture.editOnTap) onTextRequest(gesture.start, selectionRef.current[0]);
      } else if (!cancelled) {
        const next = translateElements(pageRef.current.elements, selectionRef.current, gesture.last.x - gesture.start.x, gesture.last.y - gesture.start.y);
        commitElements(next);
      } else { renderCommitted(); renderDecorations(); }
    } else if (gesture.kind === "resize") {
      if (!cancelled) {
        const bounds = selectionBounds(gesture.base, selectionRef.current);
        if (bounds) {
          const corner = resizeCornerPoint(bounds, gesture.corner);
          const dragged = { x: corner.x + gesture.last.x - gesture.start.x, y: corner.y + gesture.last.y - gesture.start.y };
          commitElements(resizeElementsFromCorner(gesture.base, selectionRef.current, gesture.corner, dragged, gesture.aspectLocked));
        }
      } else { renderCommitted(); renderDecorations(); }
    } else if (gesture.kind === "rotate") {
      if (!cancelled) {
        gesture.last = pointFromClient(event.clientX, event.clientY);
        const degrees = rotationDegrees(gesture);
        if (Math.abs(degrees) > .1) commitElements(rotateElements(gesture.base, selectionRef.current, degrees));
        else { renderCommitted(); renderDecorations(); }
      } else { renderCommitted(); renderDecorations(); }
    } else if (gesture.kind === "text") {
      if (!cancelled && !gesture.moved) {
        const point = pointFromClient(event.clientX, event.clientY);
        const hit = elementAtPoint(pageRef.current.elements, point, 2);
        if (hit?.kind === "text" && selectionRef.current.includes(hit.id)) onTextRequest(point, hit.id);
        else if (hit?.kind === "text") {
          selectionRef.current = [hit.id]; onSelect([hit.id]); renderDecorations(pageRef.current.elements, [hit.id]);
        } else onTextRequest(point);
      } else renderDecorations();
    }
    if (activePenRef.current === event.pointerId) { activePenRef.current = null; lastPenAtRef.current = performance.now(); }
    onInkEnd?.();
  }, [clearPreviewMask, commitElements, eventPoints, onSelect, onTextRequest, onEraserUsed, pointFromClient, renderCommitted, renderDecorations, onInkEnd, eraserSettings]);

  const startToolGesture = useCallback((event: PointerEvent) => {
    onInkStart?.();
    if (liveRef.current && tool !== "hand") resizeBacking(liveRef.current, pageRef.current, scale);
    const point = pointFromClient(event.clientX, event.clientY);
    if (tool === "hand") {
      gestureRef.current = { kind: "pan", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
      return;
    }
    if (tool === "text") {
      const hit = elementAtPoint(pageRef.current.elements, point, 2);
      if (hit?.kind === 'text') {
        const editOnTap = selectionRef.current.includes(hit.id);
        selectionRef.current = [hit.id]; onSelect([hit.id]);
        gestureRef.current = { kind: 'drag', pointerId: event.pointerId, start: point, last: point, base: pageRef.current.elements, fromTextTool: true, editOnTap, moved: false };
        renderDecorations(pageRef.current.elements, [hit.id]);
        return;
      }
      gestureRef.current = {
        kind: "text", pointerId: event.pointerId, start: point,
        clientX: event.clientX, clientY: event.clientY, moved: false, pointerType: event.pointerType,
      };
      return;
    }
    if (tool === "eraser") {
      if (event.pointerType === 'pen' && eraserSettings.ignoreStylus) return;
      const gesture: EraseGesture = { kind: "erase", pointerId: event.pointerId, draft: pageRef.current.elements, changed: false };
      gestureRef.current = gesture; eraseAt(gesture, point); return;
    }
    if (tool === "lasso") {
      const selectedBounds = selectionBounds(pageRef.current.elements, selectionRef.current);
      const rotateHandle = selectedBounds && rotationHandlePoint(selectedBounds, scale);
      const corner = selectedBounds && resizeCornerAtPoint(selectedBounds, point, 12 / scale);
      if (selectedBounds && rotateHandle && Math.hypot(point.x - rotateHandle.x, point.y - rotateHandle.y) <= 13 / scale) {
        const center = { x: selectedBounds.x + selectedBounds.w / 2, y: selectedBounds.y + selectedBounds.h / 2 };
        gestureRef.current = { kind: "rotate", pointerId: event.pointerId, last: point, base: pageRef.current.elements, center, startAngle: Math.atan2(point.y - center.y, point.x - center.x) };
      } else if (selectedBounds && corner) {
        gestureRef.current = { kind: "resize", pointerId: event.pointerId, start: point, last: point, base: pageRef.current.elements, corner, aspectLocked };
      } else if (selectedBounds && boundsContain(selectedBounds, point, 8 / scale)) {
        gestureRef.current = { kind: "drag", pointerId: event.pointerId, start: point, last: point, base: pageRef.current.elements };
      } else {
        selectionRef.current = []; onSelect([]);
        gestureRef.current = { kind: "lasso", pointerId: event.pointerId, points: [point] };
        lassoPaintedIndexRef.current = 0;
        clearCanvas(liveRef.current, pageRef.current);
        renderLassoPreview();
      }
      if (gestureRef.current?.kind === 'drag' || gestureRef.current?.kind === 'resize' || gestureRef.current?.kind === 'rotate') {
        const chosen = new Set(selectionRef.current);
        renderCommitted(pageRef.current.elements.filter(element => !chosen.has(element.id)));
      }
      return;
    }
    if (!DRAWING_TOOLS.has(tool)) return;
    selectionRef.current = []; onSelect([]); clearPreviewMask(); clearCanvas(liveRef.current, pageRef.current);
    const first = eventPoints(event)[0] ?? { ...point, p: .5, t: event.timeStamp };
    const stroke: InkStroke = {
      id: newId(), kind: "stroke", tool: tool as DrawingTool, color, width: Math.max(.5, width),
      points: [first], pressure: pressure && event.pointerType === "pen",
      ...(tool === 'pen' || tool === 'pencil' ? { tuning, renderer: 4 as const, nibAngle: first.angle ?? 325 } : {}),
      ...(tool === 'highlighter' ? { renderer: 4 as const } : {}),
      ...(tool === 'highlighter' ? { highlight: highlighterTuning } : {}),
      ...(isShapeTool(tool as DrawingTool) ? { fillColor, fillOpacity, cornerRadius } : {}),
    };
    gestureRef.current = { kind: "draw", pointerId: event.pointerId, stroke };
    renderDrawingPreview();
  }, [aspectLocked, clearPreviewMask, color, width, pressure, tuning, highlighterTuning, eraserSettings, fillColor, fillOpacity, cornerRadius, scale, tool, pointFromClient, eventPoints, eraseAt, onSelect, renderDrawingPreview, renderLassoPreview, renderCommitted, renderDecorations, onInkStart]);

  const touchStartsSelectionGesture = useCallback((event: PointerEvent) => {
    if (tool !== 'lasso' || !selectionRef.current.length) return false;
    const bounds = selectionBounds(pageRef.current.elements, selectionRef.current);
    if (!bounds) return false;
    const point = pointFromClient(event.clientX, event.clientY);
    const rotateHandle = rotationHandlePoint(bounds, scale);
    return Math.hypot(point.x - rotateHandle.x, point.y - rotateHandle.y) <= 13 / scale
      || !!resizeCornerAtPoint(bounds, point, 12 / scale)
      || boundsContain(bounds, point, 8 / scale);
  }, [pointFromClient, scale, tool]);

  const pointerDown = useCallback((reactEvent: React.PointerEvent<HTMLCanvasElement>) => {
    const event = reactEvent.nativeEvent;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.pointerType === "touch") {
      if ((palmRejection && Math.max(event.width, event.height) >= PALM_SIZE) || activePenRef.current !== null || performance.now() - lastPenAtRef.current < GHOST_TOUCH_MS) return;
      if (nativeScroll) return;
      touchPointerRef.current = event.pointerId;
      try { reactEvent.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
      reactEvent.preventDefault();
      if (tool === "text" || touchStartsSelectionGesture(event)) startToolGesture(event);
      else if ((!allowTouch && !(tool === 'eraser' && eraserSettings.ignoreStylus)) || tool === "hand") gestureRef.current = { kind: "pan", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
      else startToolGesture(event);
      return;
    }
    if (event.pointerType === "pen") {
      if (tool === 'eraser' && eraserSettings.ignoreStylus) return;
      const currentGesture = gestureRef.current;
      const interruptedTouch = !!currentGesture && touchPointerRef.current === currentGesture.pointerId;
      touchPointerRef.current = null;
      if (interruptedTouch) {
        clearDrawHold(currentGesture);
        gestureRef.current = null;
        clearPreviewMask();
        renderCommitted(); renderDecorations();
      }
      activePenRef.current = event.pointerId;
      lastPenAtRef.current = performance.now();
    }
    try { reactEvent.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
    reactEvent.preventDefault();
    startToolGesture(event);
  }, [nativeScroll, allowTouch, palmRejection, eraserSettings.ignoreStylus, clearPreviewMask, renderCommitted, renderDecorations, startToolGesture, tool, touchStartsSelectionGesture]);

  const pointerMove = useCallback((reactEvent: React.PointerEvent<HTMLCanvasElement>) => {
    const event = reactEvent.nativeEvent;
    if (event.pointerType === "touch" && (activePenRef.current !== null || performance.now() - lastPenAtRef.current < GHOST_TOUCH_MS)) {
      touchPointerRef.current = null;
      if (gestureRef.current?.pointerId === event.pointerId) { clearDrawHold(gestureRef.current); gestureRef.current = null; }
      return;
    }
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    reactEvent.preventDefault();
    if (gesture.kind === "pan") {
      onPan(event.clientX - gesture.clientX, event.clientY - gesture.clientY);
      gesture.clientX = event.clientX; gesture.clientY = event.clientY;
    } else if (gesture.kind === "text") {
      const moved = Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY);
      if (gesture.pointerType === "touch" && moved > 6) {
        gestureRef.current = { kind: "pan", pointerId: gesture.pointerId, clientX: event.clientX, clientY: event.clientY };
        onPan(event.clientX - gesture.clientX, event.clientY - gesture.clientY);
      } else if (moved > 4) gesture.moved = true;
    } else if (gesture.kind === "draw") {
      const previous = gesture.stroke.points[gesture.stroke.points.length - 1];
      const points = eventPoints(event, previous);
      if (usesStraightPoints(gesture.stroke) && points.length) {
        const first = gesture.stroke.points[0], last = points[points.length - 1];
        gesture.stroke.points = [first, { ...last, ...constrainShapeEnd(gesture.stroke.tool, first, last, event.shiftKey) }];
      }
      else gesture.stroke.points.push(...points);
      schedule(renderDrawingPreview);
      if (shapeHold.enabled && (gesture.stroke.tool === 'pen' || gesture.stroke.tool === 'pencil' || gesture.stroke.tool === 'highlighter') && points.length) {
        const latest = gesture.stroke.points[gesture.stroke.points.length - 1];
        const moved = !gesture.holdAnchor || Math.hypot(latest.x - gesture.holdAnchor.x, latest.y - gesture.holdAnchor.y) > Math.max(.75, 4 / scale);
        if (moved) {
          clearDrawHold(gesture);
          gesture.recognition = undefined;
          gesture.holdAnchor = { x: latest.x, y: latest.y };
          gesture.holdTimer = setTimeout(() => {
            if (gestureRef.current !== gesture) return;
            const recognized = recognizeHeldShape(gesture.stroke, true);
            if (recognized) { gesture.recognition = recognized; renderDrawingPreview(); }
          }, shapeHold.delayMs);
        }
      }
    } else if (gesture.kind === "erase") {
      for (const point of eventPoints(event)) eraseAt(gesture, point);
    } else if (gesture.kind === "lasso") {
      const point = pointFromClient(event.clientX, event.clientY), last = gesture.points[gesture.points.length - 1];
      if (!last || distanceBetween(last, point) >= 1) gesture.points.push(point);
      schedule(renderLassoPreview);
    } else if (gesture.kind === "drag") {
      gesture.last = pointFromClient(event.clientX, event.clientY);
      if (!gesture.fromTextTool || gesture.moved || Math.hypot(gesture.last.x - gesture.start.x, gesture.last.y - gesture.start.y) > 4 / scale) {
        if (gesture.fromTextTool && !gesture.moved) {
          gesture.moved = true;
          const chosen = new Set(selectionRef.current);
          renderCommitted(gesture.base.filter(element => !chosen.has(element.id)));
        }
        schedule(renderDragPreview);
      }
    } else if (gesture.kind === "resize") {
      gesture.last = pointFromClient(event.clientX, event.clientY);
      gesture.aspectLocked = aspectLocked !== event.shiftKey;
      schedule(renderResizePreview);
    } else if (gesture.kind === "rotate") {
      gesture.last = pointFromClient(event.clientX, event.clientY);
      schedule(renderRotatePreview);
    }
  }, [aspectLocked, eraseAt, eventPoints, onPan, pointFromClient, renderCommitted, renderDragPreview, renderDrawingPreview, renderLassoPreview, renderResizePreview, renderRotatePreview, schedule, shapeHold, scale]);

  const pointerUp = useCallback((reactEvent: React.PointerEvent<HTMLCanvasElement>) => {
    const event = reactEvent.nativeEvent;
    finishGesture(event, false);
    if (touchPointerRef.current === event.pointerId) touchPointerRef.current = null;
  }, [finishGesture]);

  const pointerCancel = useCallback((reactEvent: React.PointerEvent<HTMLCanvasElement>) => {
    const event = reactEvent.nativeEvent;
    if (touchPointerRef.current === event.pointerId) touchPointerRef.current = null;
    finishGesture(event, true);
  }, [finishGesture]);

  const cursor = tool === "hand" ? "grab" : tool === "text" ? "text" : tool === "eraser" ? "cell" : "crosshair";
  return (
    <div data-havi-avoid style={{ position: "absolute", inset: 0, overflow: "hidden", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
      <canvas ref={committedRef} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }} />
      <canvas
        data-note-ink
        ref={liveRef}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerCancel}
        onContextMenu={(event) => event.preventDefault()}
        onLostPointerCapture={(event) => {
          const native = event.nativeEvent;
          if (touchPointerRef.current === native.pointerId) touchPointerRef.current = null;
          finishGesture(native, true);
        }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", touchAction: nativeScroll ? "pan-x pan-y" : "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", cursor }}
      />
    </div>
  );
}

function distanceBetween(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
