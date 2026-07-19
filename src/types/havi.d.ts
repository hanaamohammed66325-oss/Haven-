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
       * v3 accepts any form: ratio 0.95, percentage 95, { score, max }, or no argument.
       */
      celebrate: (input?: number | { score: number; max: number }) => void;
      sleep: () => void;
      watch: () => void;
      write: () => void;
      /** recompute placement after cards mount / change */
      refresh: () => void;
    };
  }
}
