"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import { createPortal } from "react-dom";

interface InfoPopoverProps {
  /** accessible label for the trigger button */
  label: string;
  /** the trigger content (e.g. a chevron icon) */
  trigger: ReactNode;
  /** popover body content */
  children: ReactNode;
}

/**
 * A small info popover. The panel is rendered in a portal so it is never
 * clipped by overflow-hidden ancestors. Closes on outside-click, Esc, or scroll.
 */
export function InfoPopover({ label, trigger, children }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 8, left: r.left + r.width / 2 });
    };
    place();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onMove = () => setOpen(false); // close on scroll / resize

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex items-center justify-center"
      >
        {trigger}
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            role="tooltip"
            className="haven-pop fixed z-[100] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed"
            style={{
              top: pos.top,
              left: pos.left,
              transform: "translateX(-50%)",
              width: 210,
              maxWidth: "80vw",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              boxShadow: "var(--shadow-card-hover)",
              color: "var(--color-ink)",
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
