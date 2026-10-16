"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { ChevronDown } from "@/components/motion/icons";
import { openingDateLabel } from "@/lib/featureFlags";
import { useT } from "@/i18n";
import { GLASS } from "@/components/pomodoro/glass";
import { StudyGroups, groupHref } from "./StudyGroups";
import { MotionRoot, Press } from "@/components/motion/Press";
import { EXIT, POP, SURFACE } from "@/components/motion/springs";

interface Place { left: number; top: number; width: number; maxHeight: number; origin: string }

// The groups menu on the Pomodoro page: it grows out of its button (Motion,
// scaled from the button's own spot), the groups inside arrive one after
// another, and it folds back into the button when closed.
export function StudyGroupsMenu({ open, onToggle, onClose, disabled, soon = false }: {
  soon?: boolean; open: boolean; onToggle: () => void; onClose: () => void; disabled: boolean;
}) {
  const { t, dir } = useT();
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const shown = open && !disabled;
  const close = useRef(onClose); close.current = onClose;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [position, setPosition] = useState<Place | null>(null);
  useEffect(() => {
    if (!shown) return;
    let frame = 0;
    const fit = () => {
      const r = trigger.current?.getBoundingClientRect();
      if (!r) return;
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
      const panelWidth = Math.min(360, width - 24);
      const x = Math.max(left + 12, Math.min(dir === "rtl" ? r.right - panelWidth : r.left, left + width - panelWidth - 12));
      const y = Math.min(r.bottom + 8, top + height - 100);
      setPosition({ left: x, top: y, width: panelWidth, maxHeight: Math.max(76, Math.min(height * .65, top + height - r.bottom - 20)),
        // Grow from the point under the button's middle.
        origin: `${Math.round(Math.max(0, Math.min(panelWidth, r.left + r.width / 2 - x)))}px 0px` });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; fit(); }); };
    const outside = (event: PointerEvent) => {
      const el = event.target;
      if (el instanceof Node && !trigger.current?.contains(el) && !panel.current?.contains(el) && !(el instanceof Element && el.closest("[role='dialog'],dialog"))) close.current();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !(event.target instanceof Element && event.target.closest("[role='dialog'],dialog"))) { close.current(); trigger.current?.focus(); } };
    fit();
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    window.addEventListener("scroll", schedule, true); window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("resize", schedule); };
  }, [shown, dir]);

  return <MotionRoot><div className="pointer-events-auto relative">
    <Press ref={trigger} disabled={disabled} aria-expanded={shown} aria-controls="study-groups-menu"
      onClick={onToggle} className="flex items-center gap-2 rounded-full px-3 py-2 text-sm disabled:opacity-50" style={GLASS}>
      {t("study_title")}
      <motion.span className="grid" animate={{ rotate: shown ? 180 : 0 }} transition={POP}><ChevronDown size={15} /></motion.span>
    </Press>
    {mounted && createPortal(<MotionRoot><AnimatePresence>
      {shown && position && <Menu key="menu" soon={soon} panel={panel} place={position} dir={dir} label={t("study_title")}
        onSelect={(id) => { onClose(); router.push(groupHref(id)); }} />}
    </AnimatePresence></MotionRoot>, document.body)}
  </div></MotionRoot>;
}

function Menu({ soon, panel, place, dir, label, onSelect }: {
  soon: boolean; panel: RefObject<HTMLDivElement | null>; place: Place; dir: "rtl" | "ltr"; label: string; onSelect: (id: string) => void;
}) {
  const present = useIsPresent();
  const { origin, ...box } = place;
  return (
    <motion.div ref={panel} id="study-groups-menu" data-study-floating dir={dir} role="region" aria-label={label} inert={!present}
      className="fixed z-40 w-[min(360px,calc(100vw-24px))] overflow-auto overscroll-contain rounded-2xl shadow-xl"
      style={{ ...box, transformOrigin: origin, background: "var(--color-surface)", color: "var(--color-ink)" }}
      initial={{ opacity: 0, scale: 0.88, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: -6, transition: EXIT }} transition={SURFACE}>
      {soon ? <SoonNote /> : <StudyGroups onSelect={onSelect} />}
    </motion.div>
  );
}

function SoonNote() {
  const { t, lang } = useT();
  return <p className="p-4 text-sm" style={{ color: "var(--color-muted)" }}>{t("study_soonBody", { date: openingDateLabel(lang) })}</p>;
}
