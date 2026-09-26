"use client";

// Collapsible cards — the small arrow on Settings / Profile cards. A student can
// fold away a card they don't need; the choice is remembered on this device
// (localStorage), every card starts open. A folded card opens by itself when
// something points at it: a link to its #anchor, or expandCard(id) (e.g. the
// "turn on notifications" deep link). Inside the demo / tour everything stays
// open (NoCollapse), so the guide never points at a folded card.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useT } from "@/i18n";

const STORAGE_KEY = "haven-collapsed-cards";
const EXPAND_EVENT = "haven:expand-card";

/** Wrap demo / tour content so its cards can't be folded. */
export const NoCollapse = createContext(false);

function readCollapsed(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeCollapsed(id: string, collapsed: boolean) {
  try {
    const set = new Set(readCollapsed());
    if (collapsed) set.add(id);
    else set.delete(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* storage unavailable — the card just won't remember */
  }
}

/** Open a folded card (no-op when it's already open). */
export function expandCard(id: string) {
  window.dispatchEvent(new CustomEvent(EXPAND_EVENT, { detail: { id } }));
}

/** Open/closed state for one card. `anchor` = its DOM id, opened by #anchor links. */
export function useCardCollapse(id: string, anchor?: string) {
  const locked = useContext(NoCollapse);
  // Open on the server and first paint; the saved choice applies after mount.
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (locked) return;
    const pointedAt = () => !!anchor && window.location.hash === `#${anchor}`;
    if (readCollapsed().includes(id) && !pointedAt()) setOpen(false);
    const onExpand = (e: Event) => {
      if ((e as CustomEvent).detail?.id === id) setOpen(true);
    };
    const onHash = () => pointedAt() && setOpen(true);
    window.addEventListener(EXPAND_EVENT, onExpand);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener(EXPAND_EVENT, onExpand);
      window.removeEventListener("hashchange", onHash);
    };
  }, [id, anchor, locked]);

  const toggle = useCallback(() => {
    setOpen((o) => {
      writeCollapsed(id, o);
      return !o;
    });
  }, [id]);

  return { open: locked || open, toggle, locked };
}

/** The arrow button. Points up when open (tap to fold), down when folded. */
export function CollapseToggle({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={t(open ? "cardCollapse" : "cardExpand", { name: label })}
      title={t(open ? "cardCollapse" : "cardExpand", { name: label })}
      className="shrink-0 inline-flex items-center justify-center rounded-full w-8 h-8 transition-colors hover:bg-black/5"
      style={{ color: "var(--color-muted)" }}
    >
      <ChevronDown
        size={17}
        style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1)" }}
      />
    </button>
  );
}

/** The foldable part, with a height animation (the global reduced-motion rule
 *  snaps it). Folded content is inert, so it can't be tabbed into. */
export function CollapseBody({ open, children }: { open: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Clip only while folding/unfolding, so date pickers and popovers inside an
  // open card are never cut off.
  const [settled, setSettled] = useState(open);
  useEffect(() => {
    if (!ref.current) return;
    if (open) ref.current.removeAttribute("inert");
    else ref.current.setAttribute("inert", "");
    if (!open) {
      setSettled(false);
      return;
    }
    const id = window.setTimeout(() => setSettled(true), 380);
    return () => window.clearTimeout(id);
  }, [open]);
  return (
    <div
      ref={ref}
      aria-hidden={!open}
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transition: "grid-template-rows 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.25s ease",
      }}
    >
      <div style={{ overflow: open && settled ? "visible" : "hidden", minHeight: 0 }}>{children}</div>
    </div>
  );
}

/** A titled section whose card folds under its heading (Profile page style). */
export function CollapsibleSection({
  id,
  anchor,
  title,
  tour,
  className = "mt-8",
  children,
}: {
  id: string;
  /** DOM id; a link to #anchor opens it */
  anchor?: string;
  title: string;
  /** data-tour target name */
  tour?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { open, toggle } = useCardCollapse(id, anchor);
  return (
    <div className={`${className} scroll-mt-24`} id={anchor} {...(tour ? { "data-tour": tour } : {})}>
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: open ? "1rem" : 0, transition: "margin-bottom 0.35s ease" }}>
        <h2 className="font-display text-lg" style={{ color: "var(--color-ink)" }}>
          {title}
        </h2>
        <CollapseToggle open={open} onToggle={toggle} label={title} />
      </div>
      <CollapseBody open={open}>{children}</CollapseBody>
    </div>
  );
}
