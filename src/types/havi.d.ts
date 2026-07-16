export {};

/**
 * HaviMascot exposes a small imperative API on `window.havi` once mounted.
 * Declared here so TS pages can call it (the component itself is plain JSX).
 */
declare global {
  interface Window {
    havi?: {
      /** celebrate if ratio >= threshold (default 0.9) */
      celebrate: (ratio?: number) => void;
      sleep: () => void;
      watch: () => void;
      write: () => void;
      /** recompute placement after cards mount / change */
      refresh: () => void;
    };
  }
}
