"use client";

// The group study dialogs and sheets: Modal's look and props, with Motion.
// A dialog springs up from slightly below; a sheet on a phone rises from the
// bottom edge; both leave quickly. While leaving, the content shown is the
// last open one (AnimatePresence keeps it) and nothing in it can be pressed.
// Focus stays inside while open and goes back to where it was after.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { X } from "lucide-react";
import { useT } from "@/i18n";
import { MotionRoot } from "./Press";
import { EXIT, PRESS, SURFACE } from "./springs";
import { useOverlayLifecycle } from "./overlayLifecycle";

interface MotionModalProps {
  /** Compact release walkthrough; existing dialogs retain their usual geometry. */
  compact?: boolean;
  tone?: "lake";
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** "sheet": rises from the bottom edge on phones (a centered dialog from sm up) */
  variant?: "dialog" | "sheet";
}


export function MotionModal(props: MotionModalProps) {
  const { open } = props;
  const [mounted, setMounted] = useState(false);
  // Open, or still leaving: the scroll lock and keys hold until it has gone.
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  const layer = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  useEffect(() => setMounted(true), []);

  useOverlayLifecycle(present, mounted, layer, live);
  // Into the dialog on each opening, also one reopened while still leaving.
  useEffect(() => {
    if (open && mounted) layer.current?.querySelector<HTMLElement>("button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex='0']")?.focus({ preventScroll: true });
  }, [open, mounted]);

  if (!mounted) return null;
  return createPortal(
    <MotionRoot>
      <AnimatePresence onExitComplete={() => { if (!live.current.open) setPresent(false); }}>
        {open && <Layer key="modal" layerRef={layer} {...props} />}
      </AnimatePresence>
    </MotionRoot>,
    document.body,
  );
}

function Layer({ layerRef, onClose, title, children, footer, tone, compact, variant = "dialog" }: MotionModalProps & { layerRef: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useT();
  const present = useIsPresent();
  const sheet = variant === "sheet";
  // A sheet sits on the bottom edge only on phones; from sm up it is a dialog.
  const [phoneSheet] = useState(() => sheet && window.matchMedia("(max-width: 639px)").matches);
  const panel = phoneSheet
    ? { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] as const } } }
    : { initial: { opacity: 0, scale: 0.98, y: 10 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.99, y: 5, transition: EXIT } };

  return (
    <motion.div ref={layerRef} tabIndex={-1} inert={!present}
      className={`fixed inset-0 ${compact ? "z-[95]" : "z-50"} flex justify-center ${sheet ? "items-end sm:items-center sm:p-4" : "items-center p-4"}`}
      style={{ color:tone === "lake"?"#f8f5e8":undefined, ...(tone === "lake" ? {"--color-surface":"#173e37f5","--color-ink":"#f8f5e8","--color-muted":"#c7d3c6","--color-border":"#ffffff26"} as React.CSSProperties : {}), background: "rgba(36, 54, 64, 0.32)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", pointerEvents: present ? undefined : "none" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ duration: 0.2 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog" aria-modal="true" aria-label={title}>
      <motion.div {...panel} transition={SURFACE}
        className={`w-full max-w-md overflow-hidden flex flex-col ${sheet ? "rounded-t-3xl sm:rounded-2xl" : "rounded-2xl"}`}
        style={{
          maxHeight: compact ? "min(580px, calc(100dvh - 32px))" : sheet ? "85dvh" : "90dvh",
          background: "var(--color-surface)",
          boxShadow: "0 20px 60px rgba(36,54,64,0.22)",
          paddingBottom: sheet ? "env(safe-area-inset-bottom)" : undefined,
        }}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="font-display text-lg" style={{ color: "var(--color-ink)" }}>{title}</h2>
          <motion.button type="button" onClick={onClose} aria-label={t("close")}
            className={`rounded-full ${compact ? "p-3" : "p-1.5"} transition-colors hover:bg-black/5`}
            whileHover={{ rotate: 90 }} whileTap={{ scale: 0.86 }} transition={PRESS}>
            <X size={18} style={{ color: "var(--color-muted)" }} />
          </motion.button>
        </div>
        <motion.div className={`flex-1 min-h-0 overflow-y-auto ${compact ? "px-5 py-4" : "px-6 py-6"}`}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SURFACE, delay: 0.06 }}>
          {children}
        </motion.div>
        {footer && (
          <div className="shrink-0 border-t px-6 py-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
            {footer}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
