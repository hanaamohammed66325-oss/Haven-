"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useOverlayLifecycle } from "./overlayLifecycle";
import { EXIT, SURFACE } from "./springs";

type Props = { open: boolean; onClose: () => void; label: string; rtl?: boolean; className?: string; panelClassName?: string; children: ReactNode };

export function NavigationDrawer(props: Props) {
  const [mounted, setMounted] = useState(false);
  const [present, setPresent] = useState(props.open);
  if (props.open && !present) setPresent(true);
  const layer = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!props.open) return;
    const desktop = window.matchMedia(props.className === "md:hidden" ? "(min-width: 768px)" : "(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) live.current.onClose(); };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [props.open, props.className]);
  useOverlayLifecycle(present, mounted, layer, live);
  useEffect(() => {
    if (props.open && mounted) layer.current?.querySelector<HTMLElement>("button,a[href]")?.focus({ preventScroll: true });
  }, [props.open, mounted]);
  if (!mounted) return null;
  return createPortal(<AnimatePresence onExitComplete={() => { if (!live.current.open) setPresent(false); }}>
    {props.open && <Layer key="drawer" {...props} layerRef={layer} />}
  </AnimatePresence>, document.body);
}

function Layer({ onClose, label, rtl, className = "lg:hidden", panelClassName = "w-[86vw] max-w-[320px]", children, layerRef }: Props & { layerRef: React.RefObject<HTMLDivElement | null> }) {
  const present = useIsPresent();
  return <motion.div ref={layerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} inert={!present}
    className={`fixed inset-0 z-50 ${className}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={EXIT}>
    <div className="absolute inset-0 bg-black/40" onClick={onClose} />
    <motion.div className={`absolute inset-y-0 start-0 shadow-2xl ${panelClassName}`}
      initial={{ x: rtl ? "100%" : "-100%" }} animate={{ x: 0 }} exit={{ x: rtl ? "100%" : "-100%", transition: EXIT }} transition={SURFACE}>
      {children}
    </motion.div>
  </motion.div>;
}
