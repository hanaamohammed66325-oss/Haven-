"use client";

// Buttons that answer the hand: a spring press with a small bounce back, a
// 2 px rise under a mouse, and the hover light from motion.module.css. Touch
// never triggers the hover (Motion filters it), so phones only feel the press.

import Link from "next/link";
import { AnimatePresence, MotionConfig, motion, type HTMLMotionProps } from "motion/react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { PRESS } from "./springs";
import css from "./motion.module.css";

/** Students who turn motion off on their device get fades only, no movement. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

// Motion owns the transform. A CSS transition on it (Tailwind's `transition`,
// .haven-btn) would smear every frame, so CSS eases only colours and shadows.
export const EASE_COLOURS = "background-color .18s ease, border-color .18s ease, color .18s ease, box-shadow .22s ease, opacity .18s ease, filter .22s ease";

type Lift = "glass" | "soft" | "none";
const FEEDBACK = { rest: { y: 0, scale: 1 }, hover: { y: -1, scale: 1 }, press: { scale: 0.97, y: 0 }, focus: { y: 0, scale: 1 } };
const liftClass = (lift: Lift, className?: string) => [css.press, lift !== "none" && css[lift], className].filter(Boolean).join(" ");

export type PressProps = HTMLMotionProps<"button"> & {
  /** "glass" over the lake, "soft" on the app's own surfaces, "none" for no hover light. */
  lift?: Lift;
};

export function Press({ lift = "glass", className, style, disabled, type = "button", ...rest }: PressProps) {
  const off = disabled === true;
  return (
    <motion.button type={type} disabled={disabled}
      initial={false} animate="rest" variants={FEEDBACK}
      whileHover={off ? undefined : "hover"} whileTap={off ? undefined : "press"} whileFocus={off ? undefined : "focus"} transition={PRESS}
      className={liftClass(lift, className)} style={{ transition: EASE_COLOURS, ...style }} {...rest} />
  );
}

const MotionLink = motion.create(Link);
export function PressLink({ lift = "soft", className, style, ...rest }: ComponentProps<typeof MotionLink> & { lift?: Lift }) {
  return (
    <MotionLink initial={false} animate="rest" variants={FEEDBACK} whileHover="hover" whileTap="press" whileFocus="focus" transition={PRESS}
      className={liftClass(lift, className)} style={{ transition: EASE_COLOURS, ...style }} {...rest} />
  );
}

/**
 * Inside the one clear action (open, start, resume): a slow light sweep while
 * it can be pressed, and a ring that rings out once when it becomes available.
 * The button needs `relative isolate`; the sweep sits under its text.
 */
export function ActionLight({ ready }: { ready: boolean }) {
  const [rings, setRings] = useState(0);
  const was = useRef(ready);
  useEffect(() => {
    if (ready && !was.current) setRings((n) => n + 1);
    was.current = ready;
  }, [ready]);
  return (
    <>
      {ready && <span aria-hidden className={`${css.sheen} -z-10`} />}
      <AnimatePresence>
        {rings > 0 && (
          <motion.span key={rings} aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ boxShadow: "0 0 0 2px rgba(255,255,255,.75)" }}
            initial={{ opacity: 0.9, scale: 1 }} animate={{ opacity: 0, scale: 1.35 }} transition={{ duration: 0.7, ease: "easeOut" }} />
        )}
      </AnimatePresence>
    </>
  );
}

/** A small "something is playing" mark: three moving bars. */
export function PlayingBars({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`${css.bars} ${className}`}><i /><i /><i /></span>;
}

/** The breathing dot of a group that is live now. */
export function LiveDot({ color = "currentColor" }: { color?: string }) {
  return <span aria-hidden className={`${css.breathe} inline-block h-1.5 w-1.5 shrink-0 rounded-full`} style={{ background: color }} />;
}
