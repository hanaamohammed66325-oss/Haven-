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
import HaviMascot from "./HaviMascot";
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
  const modalBoxRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const pointerDownRef = useRef<HTMLSpanElement>(null);
  const pointerUpRef = useRef<HTMLSpanElement>(null);

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

  // Anchor the Havi caption bubble to the mascot himself: it follows him, sits
  // just above him (or below, if there's no room), and points at him — instead
  // of being pinned to the bottom corner over the Go Premium card. Tracked each
  // frame so it stays glued as he emerges from behind a card and settles.
  useEffect(() => {
    if (!open || !mounted) return;
    let raf = 0;
    const GAP = 12;
    const PAD = 12;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const bubble = bubbleRef.current;
      const modal = modalBoxRef.current;
      if (!bubble || !modal) return;
      if (bubble.offsetParent === null) return; // hidden (small screens)
      const canvas = (scrollRef.current?.querySelector(
        'canvas[aria-label="Havi"]'
      ) ?? null) as HTMLElement | null;
      // Use the mascot's container (grandparent of the canvas) so we read a
      // stable box — the canvas itself carries his idle-bob transform.
      const avatar = canvas?.parentElement?.parentElement ?? canvas;
      if (!avatar) {
        bubble.style.opacity = "0";
        return;
      }
      const ar = avatar.getBoundingClientRect();
      if (ar.width === 0 || ar.height === 0) {
        bubble.style.opacity = "0";
        return;
      }
      const mb = modal.getBoundingClientRect();
      const cx = ar.left + ar.width / 2 - mb.left; // Havi's centre, in modal coords
      const topRel = ar.top - mb.top;
      const botRel = ar.bottom - mb.top;
      const bw = bubble.offsetWidth;
      const bh = bubble.offsetHeight;
      const above = topRel - GAP - bh >= 6;
      const top = above ? topRel - GAP - bh : botRel + GAP;
      const left = Math.max(PAD, Math.min(mb.width - bw - PAD, cx - bw / 2));
      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
      bubble.style.opacity = "1";
      // Point the little arrow at Havi's centre, clamped inside the bubble.
      const pLeft = Math.max(12, Math.min(bw - 12, cx - left));
      const down = pointerDownRef.current;
      const up = pointerUpRef.current;
      if (down && up) {
        down.style.display = above ? "block" : "none";
        up.style.display = above ? "none" : "block";
        (above ? down : up).style.left = `${pLeft}px`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, mounted]);

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
        ref={modalBoxRef}
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
              {/* Havi — a separate instance scoped to this scroll container so he
                  perches on the real demo cards without escaping onto the page
                  behind. Shown to everyone (demoMode), no auth/premium needed. */}
              <HaviMascot scopeRef={scrollRef} demoMode excludePaths={[]} size={46} />
            </div>
          </div>
        </DemoStoreProvider>

        {/* Havi caption bubble — introduces the feature. Anchored to the Havi
            mascot (see the tracking effect above): hovers just above him and
            points at him, so it's clear the note is about Havi. */}
        <div
          ref={bubbleRef}
          className="pointer-events-none absolute z-20 hidden sm:block max-w-[240px] rounded-xl px-3 py-2 text-[11px] font-medium leading-snug"
          style={{
            left: 0,
            top: 0,
            opacity: 0,
            transition: "opacity 0.3s ease",
            background: "var(--color-surface)",
            color: "var(--color-muted)",
            border: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-card)",
          }}
          role="note"
        >
          {t("haviDemoCaption")}
          {/* Little arrow pointing at Havi (down when the bubble is above him,
              up when it flips below). Its horizontal offset is set each frame. */}
          <span
            ref={pointerDownRef}
            aria-hidden
            style={{
              position: "absolute",
              bottom: -7,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "7px solid transparent",
              borderRight: "7px solid transparent",
              borderTop: "7px solid var(--color-surface)",
            }}
          />
          <span
            ref={pointerUpRef}
            aria-hidden
            style={{
              position: "absolute",
              top: -7,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "7px solid transparent",
              borderRight: "7px solid transparent",
              borderBottom: "7px solid var(--color-surface)",
              display: "none",
            }}
          />
        </div>

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
        <Logo size={26} mono />
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
