"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { usePathname } from "next/navigation";
import { freeReturnPosition, returnBoxClear, returnMotionClear, type Box } from "@/lib/study/returnPlacement";

interface Placement { box: Box; compact: boolean; smooth: boolean; visible: boolean }
const SETTLE = 150, FADE = 170;
const PROTECTED = "button,a,input,select,textarea,[role='button'],[role='dialog'],dialog[open],[data-study-floating],.haven-card,.haven-topbar,.haven-sidebar,nav,h1,h2,h3,p,label,td,th,span";
const CONTAINER = "button,a,input,select,textarea,[role='button'],[role='dialog'],dialog[open],[data-study-floating],.haven-card,.haven-topbar,.haven-sidebar,nav,p,label,td,th";

export function useReturnPlacement(full: RefObject<HTMLElement | null>, compact: RefObject<HTMLElement | null>, surface: RefObject<HTMLElement | null>, enabled: boolean, folded: boolean) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const previous = useRef<Placement | null>(null);
  const lastFolded = useRef(folded);
  const hiddenSince = useRef(0);
  const path = usePathname();
  useEffect(() => {
    const opening = lastFolded.current && !folded;
    lastFolded.current = folded;
    if (!enabled) { previous.current = null; hiddenSince.current = 0; setPlacement(null); return; }
    let frame = 0, settle = 0, delayed = 0, scrolling = false;
    let dirty = true, elements: Element[] = [], allowExpand = opening;
    const viewport = window.visualViewport;
    const publish = (next: Placement | null) => {
      const old = previous.current;
      previous.current = next;
      if (old?.box.x === next?.box.x && old?.box.y === next?.box.y && old?.box.width === next?.box.width && old?.box.height === next?.box.height &&
        old?.compact === next?.compact && old?.smooth === next?.smooth && old?.visible === next?.visible) return;
      setPlacement(next);
    };
    const hide = (current?: Box) => {
      const old = previous.current;
      if (old?.visible) {
        hiddenSince.current = performance.now();
        // Freeze any in-flight glide at the drawn position before fading.
        publish({ ...old, box: current ?? old.box, smooth: false, visible: false });
      }
    };
    const scan = () => {
      const safeStyle = full.current ? getComputedStyle(full.current) : null;
      const safe = (edge: string) => Number.parseFloat(safeStyle?.getPropertyValue(`--return-safe-${edge}`) ?? "0") || 0;
      const main = document.querySelector("main.haven-main")?.getBoundingClientRect();
      const left = Math.max((viewport?.offsetLeft ?? 0) + safe("left"), main?.left ?? 0);
      const top = (viewport?.offsetTop ?? 0) + safe("top");
      const right = Math.min((viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth) - safe("right"), main?.right ?? innerWidth);
      const area = { x: left, y: top, width: right - left, height: (viewport?.height ?? innerHeight) - safe("top") - safe("bottom") };
      const blocked: Box[] = [];
      if (dirty) {
        elements = Array.from(document.querySelectorAll(PROTECTED)).filter(el => !el.closest("[data-study-return]") && !el.parentElement?.closest(CONTAINER));
        dirty = false;
      }
      let modal = false;
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom < top || rect.top > top + area.height || el.closest("[inert],[aria-hidden='true']")) continue;
        if (el.checkVisibility) {
          if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        } else {
          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
        }
        blocked.push({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
        if (el.matches("[role='dialog'],dialog[open]")) modal = true;
      }
      const old = previous.current;
      const rect = old && surface.current?.getBoundingClientRect();
      const current = rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : old?.box;
      // Scrolling never chooses destinations or changes the expanded/compact mode.
      // Release the hit target and fade once when content reaches the dock; wait
      // for the gesture to settle before looking for the nearest new pocket.
      if (modal || scrolling) {
        if (modal || !old || !current || !returnBoxClear(area, current, blocked) || !returnBoxClear(area, old.box, blocked)) hide(current);
        return;
      }
      const fullSize = full.current && { width: full.current.offsetWidth, height: full.current.offsetHeight };
      const smallSize = compact.current && { width: compact.current.offsetWidth, height: compact.current.offsetHeight };
      // Automatic compact fallback stays compact. Only an explicit unfold may
      // expand again, so whitespace fluctuations cannot repeatedly morph it.
      let small = folded || (!!old?.compact && !allowExpand);
      let box = !small && fullSize ? freeReturnPosition(area, fullSize.width, fullSize.height, blocked, old?.box) : null;
      if (!box && smallSize) { box = freeReturnPosition(area, smallSize.width, smallSize.height, blocked, old?.box); small = true; }
      if (!box) { hide(current); return; }
      const smooth = !!old?.visible && !!current && returnBoxClear(area, current, blocked) && returnMotionClear(current, box, blocked);
      const moved = !!old && (old.box.x !== box.x || old.box.y !== box.y || old.box.width !== box.width || old.box.height !== box.height);
      // Leave at the old position before entering elsewhere: no visible teleport
      // and no animated crossing over another control.
      if (moved && old?.visible && !smooth) hide(current);
      const remaining = FADE - (performance.now() - hiddenSince.current);
      if (!previous.current?.visible && hiddenSince.current && remaining > 0) {
        clearTimeout(delayed); delayed = window.setTimeout(schedule, remaining); return;
      }
      publish({ box, compact: small, smooth, visible: true });
      allowExpand = false;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; scan(); });
    };
    const onScroll = () => {
      scrolling = true;
      clearTimeout(settle);
      settle = window.setTimeout(() => { scrolling = false; schedule(); }, SETTLE);
      schedule();
    };
    const observer = new MutationObserver(records => {
      const relevant = records.filter(r => {
        const target = r.target instanceof Element ? r.target : r.target.parentElement;
        if (target?.closest("[data-study-return]")) return false;
        if (r.type === "attributes" && target instanceof HTMLElement && (target.tagName === "CANVAS" || (target.style.pointerEvents === "none" && target.querySelector("canvas") && !target.querySelector("button,a,input,select")))) return false;
        return true;
      });
      if (relevant.some(r => r.type === "childList" || r.attributeName !== "style")) dirty = true;
      if (relevant.length) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "open", "hidden", "aria-hidden", "inert"], characterData: true });
    const resize = new ResizeObserver(schedule);
    for (const el of [full.current, compact.current, document.querySelector("main.haven-main")]) if (el) resize.observe(el);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true }); window.addEventListener("resize", onScroll);
    viewport?.addEventListener("resize", onScroll); viewport?.addEventListener("scroll", onScroll);
    schedule();
    return () => { clearTimeout(settle); clearTimeout(delayed); cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onScroll); viewport?.removeEventListener("resize", onScroll); viewport?.removeEventListener("scroll", onScroll); };
  }, [enabled, folded, path, full, compact, surface]);
  return placement;
}
