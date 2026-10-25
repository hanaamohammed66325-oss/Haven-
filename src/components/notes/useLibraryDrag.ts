'use client';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { NotesLibrary } from '@/lib/notes/types';
import { canMoveLibraryItem, type LibraryItemRef, type LibraryDestination } from '@/lib/notes/libraryActions';

interface DropTarget extends LibraryDestination { valid: boolean }

/** Touch uses a dedicated grip; desktop can also use native card dragging. */
export function useLibraryDrag(library: NotesLibrary | null, onMove: (item: LibraryItemRef, destination: LibraryDestination) => void) {
  const live = useRef({ library, onMove }); live.current = { library, onMove };
  const payload = useRef<LibraryItemRef | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState<LibraryItemRef | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const targetRef = useRef<DropTarget | null>(null);
  const findTarget = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-notes-drop-section]');
    const destination = element ? { dividerId: element.dataset.notesDropSection!, folderId: element.dataset.notesDropFolder || null } : null;
    const next = destination ? { ...destination, valid: !!live.current.library && !!payload.current && canMoveLibraryItem(live.current.library, payload.current, destination) } : null;
    targetRef.current = next;
    setTarget(current => current?.folderId === next?.folderId && current?.dividerId === next?.dividerId && current?.valid === next?.valid ? current : next);
  };
  const reset = () => { payload.current = null; targetRef.current = null; setDragging(null); setPoint(null); setTarget(null); };
  const finish = () => { const item = payload.current, destination = targetRef.current; reset(); if (item && destination?.valid) live.current.onMove(item, destination); };
  useEffect(() => () => cleanup.current?.(), []);
  const startPointer = (event: ReactPointerEvent<HTMLButtonElement>, item: LibraryItemRef) => {
    if (event.button !== 0) return;
    cleanup.current?.();
    event.preventDefault(); event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    let started = false;
    const move = (next: PointerEvent) => {
      if (next.pointerId !== start.id) return;
      if (!started && Math.hypot(next.clientX - start.x, next.clientY - start.y) < 6) return;
      if (!started) { started = true; payload.current = item; setDragging(item); }
      next.preventDefault(); setPoint({ x: next.clientX, y: next.clientY }); findTarget(next.clientX, next.clientY);
    };
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', cancel); window.removeEventListener('keydown', escape); cleanup.current = null; };
    const end = (next: PointerEvent) => { if (next.pointerId !== start.id) return; stop(); if (started) { findTarget(next.clientX, next.clientY); finish(); } };
    const cancel = () => { stop(); reset(); };
    const escape = (next: KeyboardEvent) => { if (next.key === 'Escape') cancel(); };
    cleanup.current = cancel;
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', cancel); window.addEventListener('keydown', escape);
  };
  return {
    dragging, point, target,
    startPointer,
    startNative(event: DragEvent, item: LibraryItemRef) { payload.current = item; setDragging(item); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); },
    over(event: DragEvent) { if (!payload.current) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; findTarget(event.clientX, event.clientY); },
    drop(event: DragEvent) { if (!payload.current) return; event.preventDefault(); findTarget(event.clientX, event.clientY); finish(); },
    cancel: reset,
  };
}
