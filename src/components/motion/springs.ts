import type { Transition } from "motion/react";

// One motion language for the group study surfaces (Motion, motion.dev).
// Springs settle by feel, not by a fixed clock; exits are quick tweens so a
// closing thing never lingers in the way.

/** A press: snappy, with a small overshoot on release. */
export const PRESS: Transition = { type: "spring", stiffness: 560, damping: 24, mass: 0.6 };
/** Something arriving (an icon, a note, a menu item). */
export const POP: Transition = { type: "spring", bounce: 0.35, visualDuration: 0.32 };
/** A menu, sheet or dialog opening. */
export const SURFACE: Transition = { type: "spring", bounce: 0.2, visualDuration: 0.34 };
/** A highlight or a panel changing place or size. */
export const GLIDE: Transition = { type: "spring", bounce: 0.18, visualDuration: 0.4 };
/** Leaving. */
export const EXIT: Transition = { duration: 0.16, ease: [0.4, 0, 1, 1] };

/** Children arriving one after another: a short gap, capped so long lists stay quick. */
export const stagger = (i: number, gap = 0.035, max = 8) => Math.min(i, max) * gap;
