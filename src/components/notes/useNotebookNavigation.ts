'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { canPinch, isUnambiguousPalm, type NavigationContact } from '@/lib/notes/touchNavigation';

type TouchPoint = { x: number; y: number };
type Pinch = TouchPoint & { distance: number };
type ZoomUpdate = TouchPoint & { factor: number; originX: number; originY: number };
type ZoomAt = (factor: number, x: number, y: number, originX: number, originY: number) => void;
type PullToAdd = { direction: 'vertical' | 'horizontal'; onProgress: (distance: number) => void; onCommit: () => void } | null;
export type RegisterTouchCancellation = (cancel: () => void) => () => void;

// Input can arrive more often than the display refreshes. Preserve every delta,
// but write the scroll offsets only once per display frame (also on 120Hz screens).
export function framePan(root: Pick<HTMLElement, 'scrollLeft' | 'scrollTop'>, request: typeof requestAnimationFrame, cancel: typeof cancelAnimationFrame, kinetic = false) {
  let x = 0, y = 0, frame = 0, glide = 0, lastInput = 0, vx = 0, vy = 0;
  const stopGlide = () => { if (glide) cancel(glide); glide = 0; };
  const begin = () => { stopGlide(); vx = 0; vy = 0; lastInput = 0; };
  const flush = () => {
    if (frame) cancel(frame);
    frame = 0;
    const dx = x, dy = y; x = 0; y = 0;
    if (dx) root.scrollLeft -= dx;
    if (dy) root.scrollTop -= dy;
  };
  return {
    begin,
    move(dx: number, dy: number, time = performance.now()) {
      stopGlide();
      if (kinetic) {
        const dt = lastInput ? Math.max(4, Math.min(80, time - lastInput)) : 16;
        const blend = 1 - Math.exp(-dt / 32);
        vx += blend * (dx / dt - vx); vy += blend * (dy / dt - vy); lastInput = time;
      }
      x += dx; y += dy;
      if (!frame) frame = request(flush);
    },
    flush,
    release(time = performance.now()) {
      flush();
      if (!kinetic || !lastInput || time - lastInput > 90 || Math.hypot(vx, vy) < .08) return;
      let before = time;
      const tick = (now: number) => {
        const dt = Math.max(0, now - before); before = now;
        const decay = Math.exp(-dt / 300), distance = 300 * (1 - decay);
        const oldX = root.scrollLeft, oldY = root.scrollTop;
        if (Math.abs(vx) > .01) root.scrollLeft -= vx * distance;
        if (Math.abs(vy) > .01) root.scrollTop -= vy * distance;
        if (Math.abs(root.scrollLeft - oldX) < .01) vx = 0;
        if (Math.abs(root.scrollTop - oldY) < .01) vy = 0;
        vx *= decay; vy *= decay;
        glide = Math.hypot(vx, vy) >= .02 ? request(tick) : 0;
      };
      stopGlide(); glide = request(tick);
    },
    discard() { stopGlide(); if (frame) cancel(frame); frame = 0; x = 0; y = 0; vx = 0; vy = 0; lastInput = 0; },
  };
}

// A notebook owns navigation, including fingers placed on different pages or gaps.
// Each canvas retains ownership of its one-pointer editing gesture.
export function useNotebookNavigation(viewport: RefObject<HTMLDivElement | null>, onZoom: ZoomAt, palmRejection = false, pullToAdd: PullToAdd = null, nativeScroll = true) {
  const nativeRef = useRef(nativeScroll); nativeRef.current = nativeScroll;
  const zoomRef = useRef(onZoom); zoomRef.current = onZoom;
  const palmRejectionRef = useRef(palmRejection); palmRejectionRef.current = palmRejection;
  const pullRef = useRef(pullToAdd); pullRef.current = pullToAdd;
  const cancellations = useRef(new Set<() => void>());
  const panRef = useRef<ReturnType<typeof framePan> | null>(null);
  const panBy = useCallback((dx: number, dy: number) => panRef.current?.move(dx, dy), []);
  const register = useCallback<RegisterTouchCancellation>(cancel => {
    cancellations.current.add(cancel);
    return () => { cancellations.current.delete(cancel); };
  }, []);

  useEffect(() => {
    const root = viewport.current;
    if (!root) return;
    const pan = framePan(root, requestAnimationFrame, cancelAnimationFrame, true);
    panRef.current = pan;
    const touches = new Map<number, NavigationContact>();
    const pens = new Set<number>();
    let lastPenAt = -Infinity;
    let claimed = false;
    let pinch: Pinch | null = null;
    let pull: { pointerId: number; start: TouchPoint; distance: number; direction: 'vertical' | 'horizontal' } | null = null;
    let queued: ZoomUpdate | null = null;
    let frame = 0;
    const cancelEditing = () => { for (const cancel of cancellations.current) cancel(); };
    const flush = () => {
      pan.flush();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      const update = queued; queued = null;
      // Commit the scale and scroll anchor together before the next pointer sample.
      if (update) flushSync(() => zoomRef.current(update.factor, update.x, update.y, update.originX, update.originY));
    };
    const discard = () => { pan.discard(); if (frame) cancelAnimationFrame(frame); frame = 0; queued = null; };
    const reset = () => {
      discard(); cancelEditing(); pinch = null; claimed = false; pull = null; pullRef.current?.onProgress(0);
      const ids = [...touches.keys()]; touches.clear();
      for (const id of ids) if (root.hasPointerCapture(id)) root.releasePointerCapture(id);
    };
    const blocked = () => pens.size > 0 || performance.now() - lastPenAt < 650;
    const stop = (event: PointerEvent) => { event.preventDefault(); event.stopPropagation(); };
    const pair = (): Pinch | null => {
      const [a, b] = [...touches.values()];
      return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) } : null;
    };
    const capture = (id: number) => { try { root.setPointerCapture(id); } catch { /* Synthetic tests or a completed pointer may not have capture. */ } };
    const down = (event: PointerEvent) => {
      if (event.pointerType === 'pen') { reset(); cancelNativePull(); nativePinch = false; root.removeEventListener('touchmove', preventNativeMove, true); root.scrollTop = root.scrollTop; root.scrollLeft = root.scrollLeft; pens.add(event.pointerId); lastPenAt = performance.now(); return; }
      if (event.pointerType !== 'touch') return;
      if (nativeRef.current) return;
      if (!touches.size) pan.begin();
      if (pens.size || (palmRejectionRef.current && isUnambiguousPalm(event.width, event.height))) { stop(event); return; }
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY, width: event.width, height: event.height });
      if (canPinch([...touches.values()], pens.size > 0)) {
        flush(); cancelEditing(); claimed = true; pinch = pair(); pull = null; pullRef.current?.onProgress(0);
        for (const id of touches.keys()) capture(id);
        stop(event);
      } else if (blocked() || (palmRejectionRef.current && Math.max(event.width, event.height) >= 30)) {
        // Keep the contact for a deliberate two-finger gesture, but do not
        // forward a possible palm to the page's editing canvas.
        stop(event);
      } else if (!(event.target instanceof Element) || !event.target.matches('[data-note-ink]')) {
        // Loading surfaces and whitespace still support finger navigation.
        claimed = true; capture(event.pointerId); stop(event);
        const config = pullRef.current;
        const atEnd = config?.direction === 'horizontal'
          ? root.scrollWidth - root.clientWidth - root.scrollLeft <= 4
          : root.scrollHeight - root.clientHeight - root.scrollTop <= 4;
        if (config && atEnd) {
          pull = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, distance: 0, direction: config.direction };
        }
      }
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || nativeRef.current) return;
      if (pens.size || (blocked() && !claimed)) { stop(event); return; }
      const previousPoint = touches.get(event.pointerId);
      if (!previousPoint) return;
      touches.set(event.pointerId, { ...previousPoint, x: event.clientX, y: event.clientY });
      if (!claimed) return;
      stop(event);
      if (pull && pull.pointerId === event.pointerId && touches.size === 1) {
        const forward = pull.direction === 'horizontal' ? pull.start.x - event.clientX : pull.start.y - event.clientY;
        const sideways = pull.direction === 'horizontal' ? Math.abs(pull.start.y - event.clientY) : Math.abs(pull.start.x - event.clientX);
        pull.distance = sideways > Math.max(24, forward * .7) ? 0 : Math.max(0, forward);
        pullRef.current?.onProgress(pull.distance);
        return;
      }
      const next = pair();
      if (next && pinch) {
        const factor = next.distance / pinch.distance;
        if (queued) { queued.factor *= factor; queued.x = next.x; queued.y = next.y; }
        else queued = { factor, x: next.x, y: next.y, originX: pinch.x, originY: pinch.y };
        pinch = next;
        if (!frame) frame = requestAnimationFrame(flush);
      } else {
        if (queued) flush();
        pan.move(event.clientX - previousPoint.x, event.clientY - previousPoint.y);
      }
    };
    const end = (event: PointerEvent) => {
      if (event.pointerType === 'pen') { pens.delete(event.pointerId); lastPenAt = performance.now(); return; }
      if (event.pointerType !== 'touch' || !touches.has(event.pointerId)) return;
      if (claimed) {
        stop(event);
        if (event.type === 'pointercancel') discard(); else { flush(); if (!pull && touches.size === 1) pan.release(); }
      } else {
        // The ink canvas can own a one-finger pan; retain its final movement too.
        if (event.type === 'pointercancel') pan.discard(); else if (touches.size === 1) pan.release(); else pan.flush();
      }
      if (pull?.pointerId === event.pointerId) {
        const complete = event.type === 'pointerup' && pull.distance >= 80;
        pull = null; pullRef.current?.onProgress(0);
        if (complete) pullRef.current?.onCommit();
      }
      touches.delete(event.pointerId); pinch = pair();
      if (!touches.size) claimed = false;
    };
    const lost = (event: PointerEvent) => {
      // Transferring capture from a canvas to this viewport is intentional.
      if (claimed && event.target !== root) return;
      if (touches.has(event.pointerId)) { discard(); touches.delete(event.pointerId); pinch = pair(); cancelEditing(); }
      if (pull?.pointerId === event.pointerId) { pull = null; pullRef.current?.onProgress(0); }
      if (!touches.size) claimed = false;
      if (pens.delete(event.pointerId)) lastPenAt = performance.now();
    };
    // Native finger panning is deliberately passive: Safari owns its compositor
    // fling and deceleration. Only a deliberate pinch or palm is intercepted.
    let nativePinch = false;
    let nativePull: { start: TouchPoint; remaining: number; direction: 'vertical' | 'horizontal'; distance: number; rejected: boolean } | null = null;
    const nativeContacts = (event: TouchEvent) => Array.from(event.touches)
      .filter(touch => (touch as Touch & { touchType?: string }).touchType !== 'stylus')
      .map(touch => ({ x: touch.clientX, y: touch.clientY, width: (touch.radiusX || 4) * 2, height: (touch.radiusY || 4) * 2 }));
    const cancelNativePull = () => { nativePull = null; pullRef.current?.onProgress(0); };
    const nativeBlocked = (contacts: NavigationContact[]) => pens.size > 0 || contacts.some(point => palmRejectionRef.current && isUnambiguousPalm(point.width, point.height));
    const stopTouch = (event: TouchEvent) => { if (event.cancelable) event.preventDefault(); };
    const nativePair = (contacts: NavigationContact[]): Pinch => ({ x: (contacts[0].x + contacts[1].x) / 2, y: (contacts[0].y + contacts[1].y) / 2, distance: Math.max(1, Math.hypot(contacts[0].x - contacts[1].x, contacts[0].y - contacts[1].y)) });
    const preventNativeMove = (event: TouchEvent) => { if (nativePinch) stopTouch(event); };
    const touchStart = (event: TouchEvent) => {
      if (!nativeRef.current) return;
      const contacts = nativeContacts(event);
      if (nativeBlocked(contacts)) { stopTouch(event); cancelNativePull(); return; }
      if (canPinch(contacts, pens.size > 0)) {
        stopTouch(event); cancelEditing(); cancelNativePull(); nativePinch = true; pinch = nativePair(contacts);
        root.addEventListener('touchmove', preventNativeMove, { capture: true, passive: false });
      } else if (contacts.length === 1 && !nativePinch) {
        const config = pullRef.current;
        const horizontal = config?.direction === 'horizontal';
        const max = horizontal ? root.scrollWidth - root.clientWidth : root.scrollHeight - root.clientHeight;
        const offset = horizontal ? root.scrollLeft : root.scrollTop;
        nativePull = config ? { start: contacts[0], remaining: Math.max(0, max - offset), direction: config.direction, distance: 0, rejected: false } : null;
      } else { cancelNativePull(); }
    };
    const touchMove = (event: TouchEvent) => {
      if (!nativeRef.current) return;
      const contacts = nativeContacts(event);
      if (nativeBlocked(contacts)) { cancelNativePull(); return; }
      if (nativePinch) {
        if (contacts.length !== 2 || !pinch) return;
        const next = nativePair(contacts), factor = next.distance / pinch.distance;
        if (queued) { queued.factor *= factor; queued.x = next.x; queued.y = next.y; }
        else queued = { factor, x: next.x, y: next.y, originX: pinch.x, originY: pinch.y };
        pinch = next;
        if (!frame) frame = requestAnimationFrame(flush);
      } else if (nativePull && contacts.length === 1) {
        const point = contacts[0], horizontal = nativePull.direction === 'horizontal';
        const forward = horizontal ? nativePull.start.x - point.x : nativePull.start.y - point.y;
        const sideways = horizontal ? Math.abs(nativePull.start.y - point.y) : Math.abs(nativePull.start.x - point.x);
        if (sideways > Math.max(24, Math.abs(forward) * .7)) nativePull.rejected = true;
        nativePull.distance = nativePull.rejected ? 0 : Math.max(0, forward - nativePull.remaining);
        pullRef.current?.onProgress(nativePull.distance);
      }
    };
    const touchEnd = (event: TouchEvent) => {
      if (!nativeRef.current) return;
      const contacts = nativeContacts(event);
      if (nativePinch) {
        stopTouch(event);
        if (event.type === 'touchcancel') discard(); else flush();
        if (!contacts.length) { nativePinch = false; pinch = null; root.removeEventListener('touchmove', preventNativeMove, true); }
      }
      if (!contacts.length) {
        const config = pullRef.current;
        const atEnd = config?.direction === 'horizontal'
          ? root.scrollWidth - root.clientWidth - root.scrollLeft <= 4
          : root.scrollHeight - root.clientHeight - root.scrollTop <= 4;
        const complete = event.type === 'touchend' && nativePull && nativePull.distance >= 80 && atEnd;
        cancelNativePull();
        if (complete) config?.onCommit();
      } else if (contacts.length !== 1) cancelNativePull();
    };
    const blur = () => { reset(); pens.clear(); nativePinch = false; root.removeEventListener('touchmove', preventNativeMove, true); cancelNativePull(); };
    root.addEventListener('pointerdown', down, { capture: true, passive: false });
    root.addEventListener('pointermove', move, { capture: true, passive: false });
    root.addEventListener('pointerup', end, true);
    root.addEventListener('pointercancel', end, true);
    root.addEventListener('lostpointercapture', lost, true);
    root.addEventListener('touchstart', touchStart, { capture: true, passive: false });
    root.addEventListener('touchmove', touchMove, { capture: true, passive: true });
    root.addEventListener('touchend', touchEnd, { capture: true, passive: false });
    root.addEventListener('touchcancel', touchEnd, { capture: true, passive: false });
    window.addEventListener('blur', blur);
    return () => {
      root.removeEventListener('pointerdown', down, true);
      root.removeEventListener('pointermove', move, true);
      root.removeEventListener('pointerup', end, true);
      root.removeEventListener('pointercancel', end, true);
      root.removeEventListener('lostpointercapture', lost, true);
      root.removeEventListener('touchstart', touchStart, true);
      root.removeEventListener('touchmove', touchMove, true);
      root.removeEventListener('touchmove', preventNativeMove, true);
      root.removeEventListener('touchend', touchEnd, true);
      root.removeEventListener('touchcancel', touchEnd, true);
      window.removeEventListener('blur', blur);
      discard();
      if (panRef.current === pan) panRef.current = null;
    };
  }, [viewport]);
  return { registerTouchCancellation: register, panBy };
}
