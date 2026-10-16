"use client";

// A section that opens in place: its height springs open, then what is inside
// arrives one after another (wrap each part in <DisclosureItem>). Closing
// takes the parts out of the tab order at once, then folds away.

import { AnimatePresence, motion, useIsPresent, type Variants } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { EXIT, POP, stagger } from "./springs";

const ITEM: Variants = {
  out: { opacity: 0, y: 6, scale: 0.97 },
  in: (i: number = 0) => ({ opacity: 1, y: 0, scale: 1, transition: { ...POP, delay: 0.05 + stagger(i) } }),
};

export function Disclosure({ open, children, className = "", style }: {
  open: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && <Body key="open" className={className} style={style}>{children}</Body>}
    </AnimatePresence>
  );
}

function Body({ children, className, style }: { children: ReactNode; className: string; style?: CSSProperties }) {
  const present = useIsPresent();
  return (
    <motion.div inert={!present} style={{ overflow: "hidden" }}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
      exit={{ height: 0, opacity: 0, overflow: "hidden", transition: { ...EXIT, duration: 0.2 } }}
      transition={{ height: { type: "spring", bounce: 0, visualDuration: 0.3 }, opacity: { duration: 0.18 } }}>
      <motion.div className={className} style={style} initial="out" animate="in">{children}</motion.div>
    </motion.div>
  );
}

/** One part of a Disclosure; `index` sets its turn. */
export function DisclosureItem({ index = 0, children, className }: { index?: number; children: ReactNode; className?: string }) {
  return <motion.div custom={index} variants={ITEM} className={className}>{children}</motion.div>;
}
