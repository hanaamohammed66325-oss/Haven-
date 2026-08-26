"use client";

/**
 * Registers the service worker and — critically — makes sure a NEW build
 * actually reaches the user.
 *
 * Without the update plumbing below, an installed PWA can run for days without
 * a single navigation request, so it never notices a new deploy. Combined with
 * a cache-first shell that means a user stays pinned to whatever build they
 * first loaded, seeing stale UI while their cloud data is perfectly current.
 *
 * What this does:
 *  - `updateViaCache: "none"` — never let the HTTP cache answer the sw.js
 *    request; the whole update check depends on fetching it fresh.
 *  - Promote a waiting worker immediately (sw.js listens for SKIP_WAITING).
 *  - Reload once when the new worker takes control, so the user lands on the
 *    new build instead of a half-old page.
 *  - Poll for updates hourly and whenever the app returns to the foreground —
 *    the only way an installed PWA learns about a deploy.
 *
 * Deliberately skipped in development: a cached shell during `next dev`
 * shadows your edits and makes changes look like they didn't apply.
 */

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let cleanup = () => {};

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          updateViaCache: "none",
        });

        // When the new worker takes over, reload once so the page and the
        // worker are from the same build. The guard prevents a reload loop.
        let reloading = false;
        const onControllerChange = () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        };
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          onControllerChange
        );

        // Ask a worker that's installed-and-waiting to activate now.
        const promote = () => {
          if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
        };
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // Only promote when there's already a controller — on a first-ever
            // install the worker activates on its own and no reload is wanted.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              promote();
            }
          });
        });
        promote();

        // An installed PWA may never navigate, so poll for a new sw.js.
        const poll = () => { reg.update().catch(() => {}); };
        // Check immediately on load — catches deploys the user missed.
        poll();
        const periodic = window.setInterval(poll, 10 * 60 * 1000);
        const onVisible = () => {
          if (document.visibilityState === "visible") poll();
        };
        document.addEventListener("visibilitychange", onVisible);

        cleanup = () => {
          navigator.serviceWorker.removeEventListener(
            "controllerchange",
            onControllerChange
          );
          document.removeEventListener("visibilitychange", onVisible);
          window.clearInterval(periodic);
        };
      } catch {
        /* registration failed — the app still works, just without offline */
      }
    };

    /* On this static export the document is usually already "complete" by the
       time React hydrates, so waiting for `load` alone means the event has
       been and gone and the worker never registers. Register straight away in
       that case, and only listen when the page genuinely hasn't loaded yet. */
    if (document.readyState === "complete") {
      void register();
    } else {
      const onLoad = () => { void register(); };
      window.addEventListener("load", onLoad);
      const prev = cleanup;
      cleanup = () => { window.removeEventListener("load", onLoad); prev(); };
    }

    return () => cleanup();
  }, []);

  return null;
}
