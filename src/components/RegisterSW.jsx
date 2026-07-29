"use client";

/**
 * Registers the service worker — production only.
 *
 * Deliberately skipped in development: a cached app shell during `next dev`
 * shadows your edits and makes changes look like they didn't apply.
 * Registration waits for `load` so it never competes with the first paint.
 */

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };

    /* On this static export the document is usually already "complete" by the
       time React hydrates, so waiting for `load` alone means the event has
       been and gone and the worker never registers. Register straight away in
       that case, and only listen when the page genuinely hasn't loaded yet. */
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
