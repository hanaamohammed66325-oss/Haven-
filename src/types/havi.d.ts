export {};

/**
 * HaviMascot exposes a small imperative API on `window.havi` once mounted.
 * Declared here so TS pages can call it (the component itself is plain JSX).
 */
declare global {
  interface Window {
    havi?: {
      /**
       * Celebrate if the grade is within 3 points of full (>= threshold, default 0.9).
       * Accepts any form: ratio 0.95, percentage 95, no argument, or an object with
       * { score, max } plus optional targeting hints (courseId/selector/el) so v5
       * lands on the right course card.
       */
      celebrate: (
        input?:
          | number
          | {
              score?: number;
              max?: number;
              ratio?: number;
              courseId?: string | number;
              selector?: string;
              el?: Element;
            }
      ) => void;
      sleep: () => void;
      watch: () => void;
      write: () => void;
      /** recompute placement after cards mount / change */
      refresh: () => void;
      /** hop Havi to an element or selector, leaning left/right (v6) */
      jumpTo?: (elOrSelector: Element | string, corner?: "left" | "right") => void;
      /** play the doorway "enter page" animation (v7) */
      enterPage?: () => void;
      /** return to home base at the bottom of the sidebar (v7) */
      goHome?: () => void;
    };
  }
}
