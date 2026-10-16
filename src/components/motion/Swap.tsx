"use client";

// Things that change in place: an icon (eye, play/pause, copy -> check), a
// label, a number. The old one leaves while the new one arrives, both in the
// same grid cell, so the button never jumps.

import { AnimatePresence, motion, type Variants } from "motion/react";
import { useRef, type ReactNode } from "react";
import { EXIT, POP } from "./springs";

const BLUR = "blur(3px)", SHARP = "blur(0px)";
const KINDS: Record<"turn" | "rise" | "fade", Variants> = {
  // Icons: a quarter turn with a little blur.
  turn: {
    out: { opacity: 0, rotate: -90, scale: 0.5, filter: BLUR },
    in: { opacity: 1, rotate: 0, scale: 1, filter: SHARP },
    gone: { opacity: 0, rotate: 90, scale: 0.5, filter: BLUR, transition: EXIT },
  },
  // Labels: the new one rises in, the old one rises away.
  rise: {
    out: { opacity: 0, y: "70%", filter: BLUR },
    in: { opacity: 1, y: "0%", filter: SHARP },
    gone: { opacity: 0, y: "-70%", filter: BLUR, transition: EXIT },
  },
  fade: {
    out: { opacity: 0, scale: 0.96 },
    in: { opacity: 1, scale: 1 },
    gone: { opacity: 0, scale: 0.98, transition: EXIT },
  },
};

export function Swap({ id, children, kind = "turn", className = "" }: {
  /** What is shown: a change of id plays the swap. */
  id: string | number;
  children: ReactNode;
  kind?: keyof typeof KINDS;
  className?: string;
}) {
  return (
    <span className={`inline-grid place-items-center ${className}`}>
      <AnimatePresence initial={false}>
        <motion.span key={id} className="inline-flex items-center justify-center gap-[inherit]" style={{ gridArea: "1 / 1" }}
          variants={KINDS[kind]} initial="out" animate="in" exit="gone" transition={POP}>
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const ROLL: Variants = {
  out: (d: number) => ({ y: `${d * 90}%`, opacity: 0 }),
  in: { y: "0%", opacity: 1 },
  gone: (d: number) => ({ y: `${-d * 90}%`, opacity: 0, transition: EXIT }),
};

/** A number that rolls up when it grows and down when it shrinks. */
export function Rolling({ value, className = "" }: { value: number; className?: string }) {
  // The direction changes only when the value does (the room re-renders 4
  // times a second; a leaving digit must keep its way out).
  const last = useRef({ value, dir: 1 });
  if (last.current.value !== value) last.current = { value, dir: value > last.current.value ? 1 : -1 };
  const dir = last.current.dir;
  return (
    <span className={`inline-grid overflow-hidden ${className}`}>
      <AnimatePresence initial={false} custom={dir}>
        <motion.span key={value} custom={dir} variants={ROLL} initial="out" animate="in" exit="gone" transition={POP}
          style={{ gridArea: "1 / 1" }}>
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
