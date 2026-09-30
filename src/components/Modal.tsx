"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useT } from "@/i18n";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** optional pinned footer (e.g. Save / Cancel) that stays visible while the body scrolls */
  footer?: React.ReactNode;
  /** "sheet": rises from the bottom edge on phones (a centered dialog from sm up) */
  variant?: "dialog" | "sheet";
}

export function Modal({ open, onClose, title, children, footer, variant = "dialog" }: ModalProps) {
  const sheet = variant === "sheet";
  const overlayRef = useRef<HTMLDivElement>(null);
  const { t } = useT();
  const [mounted, setMounted] = useState(false);
  // the latest onClose, so a parent re-rendering (a ticking timer) with a new
  // function doesn't re-bind the keys and scroll lock each time
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !mounted) return null;

  // Portal to <body> so the overlay's `fixed` positioning is relative to the
  // viewport — not a page ancestor with a transform (an entrance animation
  // still running would otherwise push the modal off-screen on tall pages).
  return createPortal(
    <div
      ref={overlayRef}
      className={`haven-overlay fixed inset-0 z-50 flex justify-center ${sheet ? "items-end sm:items-center sm:p-4" : "items-center p-4"}`}
      style={{
        background: "rgba(36, 54, 64, 0.32)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`haven-modal w-full max-w-md overflow-hidden flex flex-col ${sheet ? "rounded-t-3xl sm:rounded-2xl" : "rounded-2xl"}`}
        style={{
          maxHeight: sheet ? "85dvh" : "90dvh",
          background: "var(--color-surface)",
          boxShadow: "0 20px 60px rgba(36,54,64,0.22)",
          paddingBottom: sheet ? "env(safe-area-inset-bottom)" : undefined,
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h2 className="font-display text-lg" style={{ color: "var(--color-ink)" }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 transition-colors hover:bg-black/5"
            aria-label={t("close")}
          >
            <X size={18} style={{ color: "var(--color-muted)" }} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">{children}</div>
        {footer && (
          <div
            className="shrink-0 border-t px-6 py-4"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
