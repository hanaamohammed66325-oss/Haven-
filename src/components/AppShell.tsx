"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Logo } from "./Logo";
import { ReminderToast } from "./ReminderToast";
import { NotifScheduler } from "./NotifScheduler";
import { TrialBanner } from "./TrialBanner";
import { Footer } from "./Footer";
import { useT } from "@/i18n";
import { runPushAutoHeal } from "@/lib/pushHealthCheck";

const STORAGE_KEY = "haven-sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // Mobile nav drawer (< lg). The desktop rail hides itself below lg and this
  // slide-in panel — the same Sidebar content — takes over.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Restore the collapsed state after mount (avoids SSR/hydration mismatch).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  // Silently re-validate/repair this device's push subscription once per app
  // session (AppShell only mounts for a signed-in user and stays mounted
  // across route changes within the app, so this empty-deps effect already
  // fires once per launch; pushHealthCheck adds its own multi-hour throttle
  // on top as a defensive backstop). Fire-and-forget — never blocks render,
  // never prompts, and is a no-op for anyone who hasn't enabled notifications.
  useEffect(() => {
    void runPushAutoHeal();
  }, []);

  // Close the drawer whenever the route changes, so tapping a nav item both
  // navigates and dismisses the drawer without threading a handler everywhere.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // While the drawer is open: lock body scroll and allow Esc to close it.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar rail — hides itself below lg via its own classes */}
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      {/* Mobile nav drawer (< lg): backdrop + slide-in panel */}
      <div
        className={`lg:hidden fixed inset-0 z-50 ${drawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          role="dialog"
          aria-modal="true"
          className={`absolute inset-y-0 start-0 w-[86vw] max-w-[320px] shadow-2xl transition-transform duration-300 ease-out ${
            drawerOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
          }`}
        >
          <Sidebar mobile collapsed={false} onToggle={() => setDrawerOpen(false)} />
        </div>
      </div>

      <main className="haven-main flex-1 min-w-0">
        {/* Mobile top bar (< lg) — hamburger + brand */}
        <div className="haven-topbar lg:hidden sticky top-0 z-30 flex items-center gap-2 px-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t("openMenu")}
            className="inline-flex items-center justify-center h-11 w-11 rounded-xl"
            style={{ color: "var(--color-ink)" }}
          >
            <Menu size={22} />
          </button>
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <Logo size={26} mono />
            <span className="font-display text-lg truncate" style={{ color: "var(--color-ink)" }}>
              {t("appName")}
            </span>
          </Link>
        </div>

        {/* Generous bottom padding (+ safe-area inset) so content never touches
            the viewport edge / hides under the phone home indicator in the PWA.
            Top/side padding is unchanged from before; only the bottom grew. */}
        <div className="mx-auto w-full max-w-[1600px] px-5 pt-6 sm:px-6 sm:pt-8 md:px-10 md:pt-12 pb-12">
          <TrialBanner />
          {children}
        </div>
        <Footer />
      </main>
      <ReminderToast />
      <NotifScheduler />
    </div>
  );
}
