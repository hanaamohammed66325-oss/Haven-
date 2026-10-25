'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InkStroke, NoteElement, Notebook } from '@/lib/notes/types';
import { convertedElements, handwritingCrops, handwritingLines, isWritingInk, DEFAULT_HANDWRITING, type HandwritingSettings } from '@/lib/notes/handwriting';
import { loadNoteFont } from '@/lib/notes/fonts';
import { prepareHandwriting, recognizeHandwriting, type RecognitionStatus } from '@/lib/notes/handwritingClient';
import { readNotesPreferences, saveNotesPreferences } from '@/lib/notes/notesPreferences';

export function useHandwriting({ scope, notebookId, pageId, active, getNotebook, changePage }: {
  scope: string; notebookId: string; pageId: string; active: boolean;
  getNotebook: () => Notebook; changePage: (id: string, elements: NoteElement[]) => void;
}) {
  const [settings, setSettings] = useState(DEFAULT_HANDWRITING), [status, setStatus] = useState<RecognitionStatus>('idle');
  const latest = useRef({ settings, getNotebook, changePage, pageId, active }); latest.current = { settings, getNotebook, changePage, pageId, active };
  const generation = useRef(0), mounted = useRef(true), writing = useRef(false), running = useRef(false);
  const pending = useRef<{ pageId: string; ids: Set<string> } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dueAt = useRef(0);
  const scheduleRef = useRef<() => void>(() => {});
  const cancel = useCallback(() => { generation.current++; clearTimeout(timer.current); pending.current = null; writing.current = false; if (mounted.current) setStatus('idle'); }, []);
  useEffect(() => {
    mounted.current = true; cancel();
    setSettings(readNotesPreferences(scope).handwriting ?? DEFAULT_HANDWRITING);
    return () => { cancel(); mounted.current = false; };
  }, [scope, notebookId, cancel]);
  useEffect(() => { cancel(); }, [pageId, active, cancel]);
  useEffect(() => {
    if (settings.enabled && active) void prepareHandwriting().catch(() => {});
  }, [settings.enabled, active]);

  const convert = async (targetId: string, strokes: InkStroke[], automatic = false) => {
    if (running.current || !strokes.length) return;
    const notebook = latest.current.getNotebook(), page = notebook.pages.find(item => item.id === targetId);
    if (!page || notebook.documentSettings?.locked || !latest.current.active) return;
    running.current = true;
    const ticket = ++generation.current, options = { ...latest.current.settings };
    const current = () => mounted.current && ticket === generation.current && !writing.current && latest.current.active
      && latest.current.pageId === targetId && (!automatic || latest.current.settings.enabled)
      && !latest.current.getNotebook().documentSettings?.locked
      && latest.current.getNotebook().pages.find(item => item.id === targetId)?.elements === page.elements;
    try {
      const lines = handwritingLines(strokes, page.elements);
      if (!lines.length) { pending.current = null; setStatus('idle'); return; }
      setStatus('loading'); await loadNoteFont(scope, options.fontFamily);
      if (!current()) return;
      const crops = await handwritingCrops(lines, current);
      const texts = await recognizeHandwriting(crops, setStatus, current);
      if (!current()) return;
      const elements = convertedElements(page, lines, texts, options.fontFamily, options.fontSize);
      if (!elements) throw new Error('recognitionFailed');
      pending.current = null; latest.current.changePage(targetId, elements); setStatus('idle');
    } catch {
      if (current()) { pending.current = null; setStatus('error'); }
    } finally {
      running.current = false;
      if (mounted.current && pending.current && !writing.current) scheduleRef.current();
    }
  };
  scheduleRef.current = () => {
    clearTimeout(timer.current);
    if (!pending.current || !latest.current.settings.enabled || writing.current || !latest.current.active) return;
    timer.current = setTimeout(() => {
      const batch = pending.current;
      if (!batch || running.current || writing.current) return;
      const page = latest.current.getNotebook().pages.find(item => item.id === batch.pageId);
      const strokes = page?.elements.filter((element): element is InkStroke => batch.ids.has(element.id) && isWritingInk(element)) ?? [];
      if (!strokes.length) { pending.current = null; return; }
      void convert(batch.pageId, strokes, true);
    }, Math.max(0, dueAt.current - performance.now()));
  };
  const begin = useCallback(() => {
    generation.current++; writing.current = true; clearTimeout(timer.current);
    if (latest.current.settings.enabled) void prepareHandwriting().catch(() => {});
    if (mounted.current) setStatus('idle');
  }, []);
  const end = useCallback(() => { writing.current = false; dueAt.current = performance.now() + latest.current.settings.delayMs; scheduleRef.current(); }, []);
  const record = (targetId: string, before: NoteElement[], after: NoteElement[]) => {
    if (!latest.current.settings.enabled) return;
    if (after.length <= before.length || !before.every((element, index) => after[index] === element)) { cancel(); return; }
    const added = after.slice(before.length).filter(isWritingInk);
    if (!added.length) return;
    if (pending.current?.pageId !== targetId) pending.current = { pageId: targetId, ids: new Set() };
    added.forEach(stroke => pending.current!.ids.add(stroke.id));
    dueAt.current = performance.now() + latest.current.settings.delayMs;
    generation.current++; scheduleRef.current();
  };
  const update = (change: Partial<HandwritingSettings>) => {
    cancel(); const next = { ...latest.current.settings, ...change }; setSettings(next); saveNotesPreferences(scope, { handwriting: next });
  };
  return { settings, status, update, record, begin, end, cancel, convert };
}
