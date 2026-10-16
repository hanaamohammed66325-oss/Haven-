"use client";

import { AnimatePresence, motion, useIsPresent } from "motion/react";
import type { ComponentProps } from "react";
import { EXIT, SURFACE } from "./springs";

type Props = ComponentProps<"div"> & { open: boolean; fadeOnly?: boolean };

/** Positioned by the caller, animated in place. Keep the portal mounted so
 * AnimatePresence can finish closing without moving the trigger or the page. */
export function PopoverPanel({ open, ...props }: Props) {
  return <AnimatePresence initial={false}>{open && <Panel key="panel" {...props} />}</AnimatePresence>;
}

function Panel({ style, fadeOnly, ...props }: Omit<Props, "open">) {
  const present = useIsPresent();
  const positioned = fadeOnly || !!style?.transform;
  return <motion.div {...props as ComponentProps<typeof motion.div>}
    inert={!present} data-haven-popover="" style={{ ...style, animation: "none", pointerEvents: present ? style?.pointerEvents : "none", transformOrigin: "top center" }}
    initial={positioned ? { opacity: 0 } : { opacity: 0, y: 5, scale: 0.98 }}
    animate={positioned ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
    exit={positioned ? { opacity: 0, transition: EXIT } : { opacity: 0, y: 3, scale: 0.99, transition: EXIT }}
    transition={{ ...SURFACE, opacity: { duration: 0.14 } }} />;
}
