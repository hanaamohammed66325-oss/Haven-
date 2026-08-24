/* Haven service worker
 *
 * Strategy
 *  - Build-hashed assets (/_next/static/) : cache-first (immutable by name)
 *  - Named assets (/icons/, /logo, favicon): stale-while-revalidate
 *  - Page navigations                     : network-first → cache → /offline/
 *  - Supabase / API calls                 : never cached (always live data)
 *
 * CRITICAL — CACHE_VERSION must CHANGE ON EVERY DEPLOY.
 * A browser only installs a new service worker when sw.js's BYTES differ. If
 * this string were a hand-edited constant, the worker would never update, the
 * caches would never be purged, and every user would be pinned to the first
 * build they ever loaded — seeing stale UI forever while the cloud data is
 * correct. `scripts/stamp-sw.mjs` (run by `npm run build`) rewrites the
 * __BUILD_ID__ placeholder with a per-build id, so the bytes always change.
 */

const CACHE_VERSION = "haven-__BUILD_ID__";
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

/** Content-hashed by the build — the filename changes when the bytes change,
 *  so these are safe to cache forever. */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

/** Assets served under a STABLE name (icons, logo, favicon, manifest). The
 *  bytes can change between deploys while the URL stays the same, so these
 *  must revalidate — cache-first would pin the old logo/icon forever. */
function isNamedAsset(url) {
  return (
    url.pathname.startsWith("/icons/") ||
    /^\/(?:logo(?:-\d+)?\.png|favicon\.svg|manifest\.json)$/i.test(url.pathname) ||
    /\.(?:woff2?|ttf|otf)$/i.test(url.pathname)
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
          // Only cache a GOOD response. `fetch` resolves for 404/503 too, and
          // caching a deploy-window 503 would pin the error page as this
          // route's offline copy.
          if (fresh && fresh.ok && fresh.type === "basic") {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(request, fresh.clone());
          }
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

  // Build-hashed assets: cache-first. The URL changes whenever the bytes do,
  // so a cache hit is always the right bytes.
  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
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
    return;
  }

  // Named assets (icons/logo/favicon/fonts): serve cached for speed, but ALWAYS
  // revalidate against the network so a redesigned logo or icon actually lands.
  // `cache: "no-cache"` bypasses the browser's own HTTP cache, which would
  // otherwise answer the revalidation with the same stale bytes.
  if (isNamedAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(request);
        const network = fetch(new Request(request, { cache: "no-cache" }))
          .then((fresh) => {
            if (fresh && fresh.ok) cache.put(request, fresh.clone());
            return fresh;
          })
          .catch(() => null);
        return cached || (await network) || new Response("", { status: 504 });
      })()
    );
  }
});

/* Let the page tell a waiting worker to take over immediately. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// ============ Web Push (Phase 2) ============
// NOTE: the icon lives at /icons/icon-192.png (files under public/icons/), not
// /icon-192.png — inspected the folder rather than assuming the root path.

self.addEventListener('push', (event) => {
  let data = { title: 'Haven', body: '', url: '/', id: undefined };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = {
        title: parsed.title || 'Haven',
        body: parsed.body || '',
        url: parsed.url || '/',
        id: parsed.id,
      };
    }
  } catch (e) {
    // If payload isn't JSON, use plain text as body
    try { data.body = event.data ? event.data.text() : ''; } catch (_) {}
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.id ?? 'haven-notification',
    renotify: true,
    data: { url: data.url },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Try to focus an already-open Haven tab
      for (const client of allClients) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            await client.focus();
            if ('navigate' in client) { try { await client.navigate(targetUrl); } catch (_) {} }
            return;
          }
        } catch (_) {}
      }
      // Otherwise open a new window
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
    })()
  );
});
