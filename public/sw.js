/* Haven service worker
 *
 * Strategy
 *  - App shell + static assets  : cache-first (fast, works offline)
 *  - Page navigations           : network-first, fall back to cache, then /offline/
 *  - Supabase / API calls       : never cached (always live data)
 *
 * Bump CACHE_VERSION whenever you want every client to refetch the shell.
 */

const CACHE_VERSION = "haven-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

// Kept small on purpose: anything that 404s here aborts the whole install.
const SHELL_FILES = ["/", "/offline/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll fails atomically, so add individually and tolerate misses
      await Promise.all(
        SHELL_FILES.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

/** Never cache anything that must be live. */
function isLiveData(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase") ||
    url.hostname.includes("sentry") ||
    url.search.includes("no-cache")
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico)$/i.test(
      url.pathname
    )
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Live data: straight to the network, never cached.
  if (isLiveData(url)) return;

  // Cross-origin (fonts, CDNs): let the browser handle it.
  if (url.origin !== self.location.origin) return;

  // Page navigations: fresh when online, cached when not.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(PAGE_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch (e) {
          const cached =
            (await caches.match(request)) ||
            (await caches.match("/offline/")) ||
            (await caches.match("/"));
          return (
            cached ||
            new Response("أنت غير متصل بالإنترنت", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })()
    );
    return;
  }

  // Static assets: cache-first, refreshed in the background.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) {
          fetch(request)
            .then((fresh) => {
              if (fresh && fresh.ok) {
                caches.open(ASSET_CACHE).then((c) => c.put(request, fresh));
              }
            })
            .catch(() => {});
          return cached;
        }
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok) {
            const cache = await caches.open(ASSET_CACHE);
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch (e) {
          return new Response("", { status: 504 });
        }
      })()
    );
  }
});

/* Let the page tell a waiting worker to take over immediately. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
