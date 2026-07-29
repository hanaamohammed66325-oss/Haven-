import type { Metadata } from "next";
import Link from "next/link";

/**
 * Offline fallback — the service worker serves this when a page navigation
 * can't reach the network and nothing matching is in the cache.
 *
 * Static text only, in both languages: this renders with no connection, so it
 * can't wait for the client-side locale to resolve (and must never depend on
 * data). `trailingSlash` makes the route `/offline/`, which is exactly what
 * sw.js pre-caches and falls back to.
 */

export const metadata: Metadata = {
  title: "Offline",
};

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-6">
      <h1 className="font-display text-3xl mb-3" style={{ color: "var(--color-ink)" }}>
        لا يوجد اتصال بالإنترنت
      </h1>
      <p className="text-sm mb-2" style={{ color: "var(--color-muted)" }}>
        بياناتك المحفوظة بأمان، وبتتزامن تلقائيًا أول ما ترجع الشبكة.
      </p>
      <p className="text-sm mb-8" style={{ color: "var(--color-muted)" }}>
        You&rsquo;re offline. Your saved data is safe and will sync once you&rsquo;re back online.
      </p>
      <Link
        href="/dashboard"
        className="haven-btn px-5 py-2.5 rounded-xl text-sm font-medium"
      >
        إعادة المحاولة · Try again
      </Link>
    </div>
  );
}
