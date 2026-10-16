"use client";

import { useEffect, type ReactNode } from "react";
import { motion, useAnimationControls } from "motion/react";

/** A short change cue without keying/remounting children or delaying input. */
export function ContentChange({ changeKey, children }: { changeKey: string | number; children: ReactNode }) {
  const controls = useAnimationControls();
  useEffect(() => {
    void controls.start({ opacity: [0.4, 1], transition: { duration: 0.16, ease: "easeOut" } });
    return () => controls.stop();
  }, [changeKey, controls]);
  return <motion.div initial={false} animate={controls}>{children}</motion.div>;
}
