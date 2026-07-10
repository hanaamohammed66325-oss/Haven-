"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import { Logo } from "./Logo";
import { DemoStoreProvider } from "./DemoStore";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/translations/en";
import DashboardPage from "@/app/(app)/dashboard/page";
import CoursesPage from "@/app/(app)/courses/page";
import TasksPage from "@/app/(app)/assignments/page";
import SchedulePage from "@/app/(app)/schedule/page";

const PAGE_MS = 9000;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return reduced;
}

interface DemoPage {
  key: string;
  cap: TranslationKey;
  Icon: typeof LayoutDashboard;
  navKey: TranslationKey;
  Comp: React.ComponentType;
}

const PAGES: DemoPage[] = [
  { key: "dashboard", cap: "demoDashboardCap", Icon: LayoutDashboard, navKey: "nav_dashboard", Comp: DashboardPage },
  { key: "courses", cap: "demoCoursesCap", Icon: BookOpen, navKey: "nav_courses", Comp: CoursesPage },
  { key: "assignments", cap: "demoTasksLiveCap", Icon: ClipboardList, navKey: "nav_assignments", Comp: TasksPage },
  { key: "schedule", cap: "demoScheduleCap", Icon: CalendarDays, navKey: "nav_schedule", Comp: SchedulePage },
];
const PAGE_COUNT = PAGES.length;

// Map an internal href to a demo page index, so Links inside the real pages
// switch the demo instead of navigating away from the landing page.
function pageIndexForHref(href: string): number {
  const path = href.split("#")[0];
  if (path.startsWith("/courses")) return 1;
  if (path.startsWith("/assignments")) return 2;
  if (path.startsWith("/schedule")) return 3;
  if (path.startsWith("/dashboard")) return 0;
  return -1;
}

export function DemoPlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open) { setIdx(0); setPaused(false); } }, [open]);

  // body scroll lock + escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // gentle auto-advance through the pages (pause on hover / reduced motion)
  useEffect(() => {
    if (!open || reduced || paused) return;
    const id = setTimeout(() => setIdx((i) => (i + 1) % PAGE_COUNT), PAGE_MS);
    return () => clearTimeout(id);
  }, [open, idx, paused, reduced]);

  // reset scroll to top when the page changes
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [idx]);

  if (!open || !mounted) return null;

  const go = (n: number) => setIdx((n + PAGE_COUNT) % PAGE_COUNT);
  const Current = PAGES[idx].Comp;

  // Keep clicks inside the demo contained: internal links switch demo pages
  // instead of routing away; everything else works normally.
  const onContentClick = (e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("mailto")) return;
    e.preventDefault();
    const to = pageIndexForHref(href);
    if (to >= 0) setIdx(to);
  };

  return createPortal(
    <div
      ref={overlayRef}
      className="haven-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(20, 30, 36, 0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={t("land_seeDemo")}
    >
      <div
        className="haven-modal relative flex flex-col w-[94vw] max-w-[1180px] h-[88vh] max-h-[860px] rounded-3xl overflow-hidden"
        style={{ background: "var(--color-surface)", boxShadow: "0 30px 90px rgba(0,0,0,0.45)" }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label={t("close")}
          className="absolute top-3 end-3 z-20 flex items-center justify-center h-9 w-9 rounded-full transition-colors"
          style={{ background: "var(--color-surface)", color: "var(--color-muted)", boxShadow: "var(--shadow-card)" }}
        >
          <X size={18} />
        </button>

        {/* Sample-data badge */}
        <div
          className="absolute top-4 start-4 z-20 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
          style={{ background: "var(--color-brass-soft)", color: "var(--color-brass)" }}
        >
          <Sparkles size={12} />
          {t("demoSampleBadge")}
        </div>

        {/* Real app, fed by demo data */}
        <DemoStoreProvider>
          <div className="flex-1 min-h-0 flex" style={{ background: "var(--color-canvas)" }}>
            <DemoSidebar activeIdx={idx} onPick={setIdx} />
            <div ref={scrollRef} className="flex-1 min-w-0 relative overflow-y-auto" onClickCapture={onContentClick}>
              <div key={idx} className="haven-fade-in p-4 sm:p-8 min-h-full">
                <Current />
              </div>
            </div>
          </div>
        </DemoStoreProvider>

        {/* Controls */}
        <div className="shrink-0 border-t px-4 sm:px-6 py-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <div className="flex items-center gap-3">
            <button onClick={() => go(idx - 1)} aria-label={t("demoPrev")} className="shrink-0 flex items-center justify-center h-8 w-8 rounded-full transition-colors hover:bg-black/5" style={{ color: "var(--color-muted)" }}>
              <ChevronLeft size={20} className="rtl:rotate-180" />
            </button>
            <p className="flex-1 text-center text-[13px] sm:text-sm font-medium leading-snug" style={{ color: "var(--color-ink)" }}>
              {t(PAGES[idx].cap)}
            </p>
            <button onClick={() => go(idx + 1)} aria-label={t("demoNext")} className="shrink-0 flex items-center justify-center h-8 w-8 rounded-full transition-colors hover:bg-black/5" style={{ color: "var(--color-muted)" }}>
              <ChevronRight size={20} className="rtl:rotate-180" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 flex items-center justify-center gap-2">
              {PAGES.map((p, i) => (
                <button
                  key={p.key}
                  onClick={() => setIdx(i)}
                  aria-label={t(p.navKey)}
                  aria-current={i === idx}
                  className="h-2 rounded-full transition-all"
                  style={{ width: i === idx ? 22 : 8, background: i === idx ? "var(--color-primary)" : "var(--color-border)" }}
                />
              ))}
            </div>
            <Link href="/dashboard" className="haven-btn shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium">
              {t("demoOpenHaven")}
              <ArrowRight size={14} className="rtl:rotate-180" />
            </Link>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function DemoSidebar({ activeIdx, onPick }: { activeIdx: number; onPick: (i: number) => void }) {
  const { t } = useT();
  return (
    <aside className="haven-sidebar hidden md:flex shrink-0 flex-col" style={{ width: 208, padding: 18 }}>
      <div className="flex items-center gap-2 mb-6 px-1">
        <Logo size={26} stroke="#ffffff" />
        <span className="font-display text-xl text-white">{t("appName")}</span>
      </div>
      <nav className="flex flex-col gap-1">
        {PAGES.map((p, i) => {
          const active = i === activeIdx;
          return (
            <button
              key={p.key}
              onClick={() => onPick(i)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-start ${active ? "haven-nav-active text-white" : ""}`}
              style={active ? undefined : { color: "rgba(231,239,240,0.7)" }}
            >
              <p.Icon size={17} style={active ? { color: "var(--color-brass)" } : undefined} />
              <span>{t(p.navKey)}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto haven-premium-card rounded-2xl p-3">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} style={{ color: "var(--color-brass)" }} />
          <span className="text-xs font-display text-white">{t("premiumTitle")}</span>
        </div>
      </div>
    </aside>
  );
}
