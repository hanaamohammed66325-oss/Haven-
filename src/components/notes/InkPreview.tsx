'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { drawStroke } from '@/lib/notes/ink';
import { strokeInputPoints } from '@/lib/notes/strokeInput';
import type { HighlighterTuning, InkStroke, InkTuning } from '@/lib/notes/types';
import s from './notes.module.css';
import { acceptedLineEnglish, handwritingCrops, handwritingLines } from '@/lib/notes/handwriting';
import { loadNoteFont, noteFontFamily, type NoteFontFamily } from '@/lib/notes/fonts';
import { recognizeHandwriting } from '@/lib/notes/handwritingClient';

interface PreviewProps {
  color: string; width: number; tool: 'pen' | 'pencil' | 'highlighter'; tuning: InkTuning;
  highlight?: HighlighterTuning; pressure: boolean; label: string; clearLabel: string; hint: string;
  conversion?: { scope: string; fontFamily: NoteFontFamily; label: string; busyLabel: string; errorLabel: string };
}

/** A disposable writing surface using the same input and geometry as the page. */
export function InkPreview({ color, width, tool, tuning, highlight, pressure, label, clearLabel, hint, conversion }: PreviewProps) {
  const [sampleCount, setSampleCount] = useState(0), [result, setResult] = useState(''), [converting, setConverting] = useState(false), [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<InkStroke[]>([]);
  const active = useRef<{ pointerId: number; stroke: InkStroke } | null>(null);
  const frame = useRef<number | null>(null);
  const options = useRef({ color, width, tool, tuning, highlight, pressure });
  options.current = { color, width, tool, tuning, highlight, pressure };
  const paint = useCallback(() => {
    const surface = canvas.current, ctx = surface?.getContext('2d');
    if (!surface || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, surface.width, surface.height);
    ctx.setTransform(surface.width / 320, 0, 0, surface.height / 140, 0, 0);
    const current = options.current;
    const demo: InkStroke = { id: 'sample', kind: 'stroke', tool: current.tool, color: current.color, width: current.width, pressure: current.pressure,
      points: Array.from({ length: 64 }, (_, i) => ({ x: 14 + i * 4.6, y: 70 + Math.sin(i * .14) * 25, p: .06 + .94 * i / 63, t: i * 8, angle: 325 })) };
    const samples = strokes.current.length || active.current ? [...strokes.current, ...(active.current ? [active.current.stroke] : [])] : [demo];
    for (const stroke of samples) drawStroke(ctx, { ...stroke, tool: current.tool, color: current.color, width: current.width, renderer: 4, nibAngle: stroke.nibAngle ?? 325,
      pressure: current.pressure && stroke.pressure, tuning: current.tuning, highlight: current.tool === 'highlighter' ? current.highlight : undefined }, false);
  }, []);
  const schedule = () => { if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; paint(); }); };
  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    const resize = () => {
      const rect = surface.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
      surface.width = Math.max(1, Math.round(rect.width * dpr)); surface.height = Math.max(1, Math.round(rect.height * dpr)); paint();
    };
    const observer = new ResizeObserver(resize); observer.observe(surface); resize();
    return () => { observer.disconnect(); generation.current++; if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; };
  }, [paint]);
  useEffect(() => { paint(); }, [color, width, tool, tuning, highlight, pressure, paint]);
  useEffect(() => { generation.current++; setResult(''); setFailed(false); setConverting(false); }, [width, tool, tuning, pressure, conversion?.fontFamily]);
  const tryConversion = async () => {
    if (!conversion || active.current || !strokes.current.length) return;
    const ticket = ++generation.current, snapshot = strokes.current;
    const current = () => ticket === generation.current && !active.current && snapshot === strokes.current;
    setConverting(true); setFailed(false); setResult('');
    try {
      await loadNoteFont(conversion.scope, conversion.fontFamily);
      if (!current()) return;
      const samples = snapshot.map(stroke => ({ ...stroke, renderer: 4 as const, tuning, width, pressure: pressure && stroke.pressure }));
      const lines = handwritingLines(samples);
      const texts = await recognizeHandwriting(await handwritingCrops(lines, current), () => {}, current);
      if (!current()) return;
      const accepted = texts.map((text, index) => acceptedLineEnglish(text, lines[index].bounds));
      if (accepted.some(text => !text)) throw new Error('recognitionFailed');
      setResult(accepted.join('\n'));
    } catch { if (current()) setFailed(true); }
    finally { if (current()) setConverting(false); }
  };
  const collect = (event: React.PointerEvent<HTMLCanvasElement>, stroke: InkStroke) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    stroke.points.push(...strokeInputPoints(event.nativeEvent, stroke.points[stroke.points.length - 1], (x, y) => ({ x: (x - rect.left) * 320 / rect.width, y: (y - rect.top) * 140 / rect.height }), tool === 'highlighter' ? highlight?.response : tuning.response));
    if (stroke.nibAngle === undefined) stroke.nibAngle = stroke.points[0]?.angle ?? 325;
  };
  return <div className={s.inkTest}>
    <div className={s.inkTestHeader}><span>{label}</span><button type="button" onClick={() => { generation.current++; active.current = null; strokes.current = []; setSampleCount(0); setResult(''); setFailed(false); setConverting(false); paint(); }}>{clearLabel}</button></div>
    <canvas ref={canvas} aria-label={label} style={{ background: color.toLowerCase() === '#ffffff' ? '#243442' : '#fffef9' }}
      onPointerDown={event => {
        if (active.current || event.pointerType === 'mouse' && event.button !== 0) return;
        generation.current++; setConverting(false); setResult(''); setFailed(false);
        event.preventDefault(); event.stopPropagation();
        const stroke: InkStroke = { id: 'test', kind: 'stroke', tool, color, width, pressure: event.pointerType === 'pen', renderer: 4, points: [] };
        collect(event, stroke); active.current = { pointerId: event.pointerId, stroke }; event.currentTarget.setPointerCapture(event.pointerId); paint();
      }}
      onPointerMove={event => { if (active.current?.pointerId !== event.pointerId) return; event.preventDefault(); event.stopPropagation(); collect(event, active.current.stroke); schedule(); }}
      onPointerUp={event => {
        if (active.current?.pointerId !== event.pointerId) return;
        event.preventDefault(); event.stopPropagation(); collect(event, active.current.stroke);
        strokes.current = [...strokes.current.slice(-29), active.current.stroke]; active.current = null; setSampleCount(strokes.current.length); paint();
      }}
      onPointerCancel={() => { active.current = null; paint(); }} onContextMenu={event => event.preventDefault()} />
    <small>{hint}</small>
    {conversion && tool !== 'highlighter' && <div className={s.inkConversionTest}><button type="button" disabled={!sampleCount || converting} onClick={() => void tryConversion()}>{converting ? conversion.busyLabel : conversion.label}</button>{result && <output dir="ltr" style={{ fontFamily: noteFontFamily(conversion.fontFamily) }}>{result}</output>}{failed && <small role="status">{conversion.errorLabel}</small>}</div>}
  </div>;
}
