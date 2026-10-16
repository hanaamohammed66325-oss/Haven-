"use client";

import { forwardRef, type ComponentProps } from "react";
import { motion, type Variants } from "motion/react";
import type { LucideIcon, LucideProps } from "lucide-react";
import { PRESS } from "./springs";

type Kind = "turn" | "book" | "calendar" | "timer" | "shield" | "grid" | "quiet";
const rest = { rotate: 0, scale: 1, y: 0 };
const gestures: Record<Kind, Variants> = {
  turn: { hover: { rotate: 18 }, press: { rotate: -10, scale: 0.92 } },
  book: { hover: { rotate: -6, scale: 1.06 }, press: { rotate: 0, scale: 0.92 } },
  calendar: { hover: { y: -1.5, rotate: -3 }, press: { y: 1, scale: 0.94 } },
  timer: { hover: { rotate: -10 }, press: { rotate: 8, scale: 0.94 } },
  shield: { hover: { scale: 1.09 }, press: { scale: 0.94 } },
  grid: { hover: { rotate: -4, scale: 1.06 }, press: { rotate: 0, scale: 0.94 } },
  quiet: { hover: { y: -1 }, press: { scale: 0.94 } },
};

/** The original SVG and accessible props are preserved. Inherits gesture labels
 * from its control: decorative/static icons never animate on their own. */
export function animatedIcon(Icon: LucideIcon, kind: Kind = "quiet"): LucideIcon {
  const Svg = motion.create(Icon);
  const Component = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
    // Existing spinning loaders, directional rotations and state arrows keep
    // their original transforms instead of competing with gesture animation.
    if (props.values || props.style?.transform || /(?:animate-|rotate-|scale-|haven-nudge)/.test(props.className ?? "")) {
      return <Icon {...props} ref={ref} />;
    }
    return <Svg {...props as ComponentProps<typeof Svg>} ref={ref} initial={false}
      variants={{ rest, selected: { ...rest, scale: 1.04 }, focus: gestures[kind].hover, ...gestures[kind] }}
      transition={PRESS} style={{ ...props.style, transformOrigin: "50% 50%", transformBox: "fill-box" }} />;
  });
  Component.displayName = `Animated${Icon.displayName ?? "Icon"}`;
  return Component;
}
