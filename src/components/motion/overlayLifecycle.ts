"use client";

import { useEffect, useRef } from "react";
import { acquireBodyScrollLock } from "./bodyScroll";

const layers: symbol[] = [];
const focusable = "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex='0']";

/** Shared dialogs keep body scrolling locked until the last exit completes. */
export function useOverlayLifecycle(present: boolean, mounted: boolean,
  layer: React.RefObject<HTMLDivElement | null>, live: React.RefObject<{ open: boolean; onClose: () => void }>) {
  const token = useRef(Symbol("dialog"));
  useEffect(() => {
    if (!present || !mounted) return;
    const id = token.current;
    const before = document.activeElement;
    const releaseScroll = acquireBodyScrollLock();
    layers.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (layers.at(-1) !== id || !live.current.open || e.defaultPrevented) return;
      if (e.key === "Escape") { e.preventDefault(); live.current.onClose(); }
      if (e.key !== "Tab") return;
      const all = Array.from(layer.current?.querySelectorAll<HTMLElement>(focusable) ?? [])
        .filter(el => el.getClientRects().length > 0 && !el.closest("[inert]"));
      const first = all[0], last = all.at(-1);
      if (!first) { e.preventDefault(); layer.current?.focus(); return; }
      const outside = !layer.current?.contains(document.activeElement);
      if (outside || (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        e.preventDefault(); (e.shiftKey ? last : first)?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      const wasTop = layers.at(-1) === id;
      const index = layers.indexOf(id);
      if (index >= 0) layers.splice(index, 1);
      document.removeEventListener("keydown", onKey);
      releaseScroll();
      if (wasTop && before instanceof HTMLElement && before.isConnected && !before.closest("[inert]")) before.focus({ preventScroll: true });
    };
  }, [present, mounted, layer, live]);
}
