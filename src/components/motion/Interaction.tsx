"use client";

import Link from "next/link";
import { motion, type HTMLMotionProps } from "motion/react";
import type { ComponentProps, CSSProperties } from "react";
import { PRESS } from "./springs";

const LinkSurface = motion.create(Link);
const colours = "background-color .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease, opacity .18s ease, filter .18s ease";

// Small controls compress less than a decorative spring. No entrance animation:
// controls remain available immediately, including during a long form render.
const variants = {
  rest: { scale: 1 },
  hover: { scale: 1 },
  press: { scale: 0.97 },
  focus: { scale: 1 },
  selected: { scale: 1 },
};

function surfaceStyle(style?: CSSProperties): CSSProperties {
  return { ...style, transition: colours };
}

/** Native button semantics, refs and event handlers; shared gesture labels let
 * icons respond to the same interaction without their own event listeners. */
export function InteractionButton({ style, disabled, children, ...props }: ComponentProps<"button">) {
  // Positioned controls and drag handles retain ownership of their transform.
  const fixedTransform = !!style?.transform || !!props["onPointerMove"];
  const off = disabled || props["aria-disabled"] === true || props["aria-disabled"] === "true";
  const selected = props["aria-pressed"] === true || props["aria-checked"] === true;
  return <motion.button {...props as HTMLMotionProps<"button">}
    data-haven-interaction="button" disabled={disabled}
    style={surfaceStyle(style)} initial={false} animate={selected && !off ? "selected" : "rest"}
    variants={fixedTransform ? undefined : variants}
    whileHover={off ? undefined : "hover"}
    whileTap={off ? undefined : "press"}
    whileFocus={off ? undefined : "focus"} transition={PRESS}>
    {children}
  </motion.button>;
}

/** Only used for navigation rows and links styled as controls, not inline prose. */
export function InteractionLink({ style, children, ...props }: ComponentProps<typeof Link>) {
  const selected = props["aria-current"] === "page";
  const off = props["aria-disabled"] === true || props["aria-disabled"] === "true";
  return <LinkSurface {...props as ComponentProps<typeof LinkSurface>}
    data-haven-interaction="link" style={surfaceStyle(style)} initial={false}
    animate={selected ? "selected" : "rest"} variants={style?.transform ? undefined : variants}
    whileHover={off ? undefined : "hover"} whileTap={off ? undefined : "press"} whileFocus={off ? undefined : "focus"} transition={PRESS}>
    {children}
  </LinkSurface>;
}

/** External links styled as controls keep native anchor navigation/downloads. */
export function InteractionAnchor({ style, children, ...props }: ComponentProps<"a">) {
  const off = props["aria-disabled"] === true || props["aria-disabled"] === "true";
  return <motion.a {...props as HTMLMotionProps<"a">}
    data-haven-interaction="anchor" style={surfaceStyle(style)} initial={false} animate="rest"
    variants={style?.transform ? undefined : variants}
    whileHover={off ? undefined : "hover"} whileTap={off ? undefined : "press"} whileFocus={off ? undefined : "focus"} transition={PRESS}>
    {children}
  </motion.a>;
}
