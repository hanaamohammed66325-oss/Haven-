"use client";

// ---------------------------------------------------------------------------
// Drag-to-reorder built on POINTER events.
//
// HTML5 drag-and-drop (`draggable` + dragstart/drop) is mouse-only in iOS
// Safari — it never fires for touch, so drag handles simply did nothing on an
// iPad. Pointer events cover mouse, touch and stylus through one code path.
//
// Two things make touch work, and both matter:
//   1. `touch-action: none` on the HANDLE (see `handleProps().style`), so
//      Safari doesn't claim the gesture as a page scroll. Scoping it to the
//      handle keeps normal scrolling everywhere else.
//   2. Pointer capture, so moves keep arriving once the finger slides off the
//      handle.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/** Distance from a viewport edge at which we start auto-scrolling. */
const EDGE_PX = 80;
/** Peak auto-scroll speed, px per frame. */
const EDGE_MAX_SPEED = 14;

export interface PointerReorder {
  /** id currently being dragged, or null */
  dragId: string | null;
  /** id currently hovered as the drop target, or null */
  overId: string | null;
  /** ref callback: give each reorderable row's element to the hook */
  registerEl: (id: string, el: HTMLElement | null) => void;
  /** spread onto the drag handle of the row with this id */
  handleProps: (id: string) => {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
    style: { touchAction: "none" };
  };
}

/**
 * @param ids      current order, top to bottom
 * @param onReorder called with the full new order when a drag completes
 */
export function usePointerReorder(
  ids: string[],
  onReorder: (nextIds: string[]) => void
): PointerReorder {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Mirrors, so the move handler never reads a stale closure.
  const dragIdRef = useRef<string | null>(null);
  const overIdRef = useRef<string | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const idsRef = useRef(ids);
  idsRef.current = ids;

  // Edge auto-scroll: a finger pinned to the handle can't scroll the page, so
  // without this you can't drag to a position that's off screen.
  const raf = useRef<number | null>(null);
  const dy = useRef(0);

  const registerEl = useCallback((id: string, el: HTMLElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  }, []);

  const stopAutoScroll = useCallback(() => {
    dy.current = 0;
    if (raf.current != null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  }, []);

  const startAutoScroll = useCallback(() => {
    if (raf.current != null) return;
    const tick = () => {
      if (dy.current !== 0) window.scrollBy(0, dy.current);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  /** Which row sits under this viewport y? */
  const rowAt = (y: number) => {
    for (const [id, el] of els.current) {
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) return id;
    }
    return null;
  };

  const finish = useCallback(
    (commit: boolean) => {
      const from = dragIdRef.current;
      const to = overIdRef.current;
      dragIdRef.current = null;
      overIdRef.current = null;
      setDragId(null);
      setOverId(null);
      stopAutoScroll();

      if (!commit || !from || !to || from === to) return;
      const list = [...idsRef.current];
      const i = list.indexOf(from);
      const j = list.indexOf(to);
      if (i === -1 || j === -1) return;
      list.splice(i, 1);
      list.splice(j, 0, from);
      onReorder(list);
    },
    [onReorder, stopAutoScroll]
  );

  const handleProps = useCallback(
    (id: string) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        // Mouse: left button only. Touch/pen have no meaningful button.
        if (e.pointerType === "mouse" && e.button !== 0) return;
        // Keep receiving moves after the finger leaves the handle. Guarded:
        // capture throws for a pointer id the browser isn't tracking.
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          /* non-fatal — dragging still works without capture */
        }
        e.preventDefault();
        dragIdRef.current = id;
        overIdRef.current = id;
        setDragId(id);
        setOverId(id);
        startAutoScroll();
      },

      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
        if (!dragIdRef.current) return;
        e.preventDefault();
        const y = e.clientY;

        const over = rowAt(y);
        if (over && over !== overIdRef.current) {
          overIdRef.current = over;
          setOverId(over);
        }

        const h = window.innerHeight;
        if (y < EDGE_PX) dy.current = -EDGE_MAX_SPEED * (1 - y / EDGE_PX);
        else if (y > h - EDGE_PX) dy.current = EDGE_MAX_SPEED * (1 - (h - y) / EDGE_PX);
        else dy.current = 0;
      },

      onPointerUp: () => finish(true),
      onPointerCancel: () => finish(false),
      style: { touchAction: "none" as const },
    }),
    [finish, startAutoScroll]
  );

  return { dragId, overId, registerEl, handleProps };
}
