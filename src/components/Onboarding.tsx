"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "./Logo";
import { DemoStoreProvider } from "./DemoStore";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/translations/en";
import DashboardPage from "@/app/(app)/dashboard/page";
import CoursesPage from "@/app/(app)/courses/page";
import TasksPage from "@/app/(app)/assignments/page";
import SchedulePage from "@/app/(app)/schedule/page";
import AttendancePage from "@/app/(app)/attendance/page";

// ---------------------------------------------------------------------------
// Guided live tour — the first-run onboarding. Instead of a slideshow of text,
// an animated cursor drives the REAL app pages (rendered against the demo store,
// so nothing touches the user's data): it navigates page to page, and on the
// Courses page it actually adds a course — clicking "Add course", typing the
// name, setting the hours, hitting Save — with a callout explaining each control
// as it goes. Shown once (gated by onboardingSeen), reopenable from Settings via
// the "haven:onboarding" event.
// ---------------------------------------------------------------------------

type PageKey = "dashboard" | "courses" | "assignments" | "schedule" | "attendance";

const PAGES: Record<PageKey, { Comp: React.ComponentType; nav: TranslationKey; Icon: typeof LayoutDashboard }> = {
  dashboard: { Comp: DashboardPage, nav: "nav_dashboard", Icon: LayoutDashboard },
  courses: { Comp: CoursesPage, nav: "nav_courses", Icon: BookOpen },
  assignments: { Comp: TasksPage, nav: "nav_assignments", Icon: ClipboardList },
  schedule: { Comp: SchedulePage, nav: "nav_schedule", Icon: CalendarDays },
  attendance: { Comp: AttendancePage, nav: "nav_attendance", Icon: ShieldCheck },
};
const NAV_ORDER: PageKey[] = ["dashboard", "courses", "assignments", "schedule", "attendance"];

type Action =
  | { kind: "click" }
  | { kind: "type"; ar: string; en: string };

interface Beat {
  page: PageKey;
  /** data-tour anchor to point at; omitted = a centered page-intro. */
  target?: string;
  /** element-level callout key (used with target). */
  callout?: TranslationKey;
  /** page-intro title + line (used without target). */
  title?: TranslationKey;
  line?: TranslationKey;
  action?: Action;
  hold?: number;
}

const BEATS: Beat[] = [
  { page: "dashboard", title: "ob_dash_t", line: "ob_dash_p1", hold: 2200 },
  { page: "courses", target: "add-course", callout: "tour_addCourseBtn", action: { kind: "click" }, hold: 500 },
  { page: "courses", target: "course-name", callout: "tour_courseName", action: { kind: "type", ar: "الأحياء", en: "Biology" }, hold: 500 },
  { page: "courses", target: "course-credits", callout: "tour_courseCredits", action: { kind: "type", ar: "3", en: "3" }, hold: 500 },
  { page: "courses", target: "course-save", callout: "tour_courseSave", action: { kind: "click" }, hold: 700 },
  { page: "courses", title: "ob_courses_t", line: "tour_courseAdded", hold: 2400 },
  { page: "courses", title: "ob_grades_t", line: "ob_grades_p1", hold: 2400 },
  { page: "attendance", title: "ob_att_t", line: "ob_att_p2", hold: 2600 },
  { page: "schedule", title: "ob_sched_t", line: "ob_sched_p1", hold: 2600 },
  { page: "assignments", title: "ob_tasks_t", line: "ob_tasks_p1", hold: 2400 },
  { page: "dashboard", title: "ob_notif_t", line: "tour_notifWhere", hold: 2800 },
  { page: "dashboard", title: "ob_finish_t", line: "ob_finish_p1", hold: 2600 },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Set a controlled input's value the way React notices (native setter + input event). */
function setNativeValue(el: HTMLInputElement, value: string) {
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  desc?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** The LAST matching anchor in the DOM — the tour's own copy, since its overlay
 *  and any modal it opens mount after the rest of the app. */
function lastAnchor(name: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  return els.length ? els[els.length - 1] : null;
}
function waitForAnchor(name: string, timeout = 1800): Promise<HTMLElement | null> {
  return new Promise((res) => {
    const t0 = performance.now();
    const tick = () => {
      const el = lastAnchor(name);
      if (el) return res(el);
      if (performance.now() - t0 > timeout) return res(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

interface CursorState { x: number; y: number; down: boolean; visible: boolean; }
interface CalloutState { text: string; x: number; y: number; centered: boolean; title?: string; }

export function Onboarding() {
  const { hydrated, onboardingSeen, completeOnboarding } = useStore();
  const { t, lang } = useT();

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [page, setPage] = useState<PageKey>("dashboard");
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [cursor, setCursor] = useState<CursorState>({ x: 0, y: 0, down: false, visible: false });
  const [callout, setCallout] = useState<CalloutState | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const runToken = useRef(0);
  const pausedRef = useRef(false);
  const openRef = useRef(false);
  const currentPage = useRef<PageKey | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { openRef.current = open; }, [open]);

  // Auto-open once for a user who hasn't seen it; reopen on the Settings event.
  useEffect(() => {
    if (hydrated && !onboardingSeen) setOpen(true);
  }, [hydrated, onboardingSeen]);
  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener("haven:onboarding", reopen);
    return () => window.removeEventListener("haven:onboarding", reopen);
  }, []);

  const finish = useCallback(() => {
    runToken.current++; // cancel any running script
    setOpen(false);
    setCallout(null);
    setCursor((c) => ({ ...c, visible: false }));
    completeOnboarding();
  }, [completeOnboarding]);

  // Point the cursor + callout at an element (or center, for a page-intro).
  // Coordinates are in VIEWPORT space: the cursor/callout live in their own
  // top-level portal above every app modal, so they can point at fields inside
  // a modal that the demo pages open.
  const aimAt = useCallback((el: HTMLElement | null, text: string, title?: string) => {
    const CW = 250;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!el) {
      const box = boxRef.current?.getBoundingClientRect();
      const cx = box ? box.left + box.width / 2 : vw / 2;
      const cy = box ? box.top + box.height * 0.44 : vh * 0.44;
      setCursor({ x: cx, y: cy, down: false, visible: false });
      setCallout({ text, title, centered: true, x: cx - CW / 2, y: (box ? box.top + box.height / 2 : vh / 2) - 40 });
      return;
    }
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const bx = Math.max(12, Math.min(vw - CW - 12, cx - CW / 2));
    let by = r.bottom + 12;
    if (by > vh - 130) by = r.top - 96; // flip above if it would fall off-screen
    setCursor({ x: cx, y: cy, down: false, visible: true });
    setCallout({ text, title, centered: false, x: bx, y: Math.max(10, by) });
  }, []);

  const clickPulse = useCallback(async () => {
    setCursor((c) => ({ ...c, down: true }));
    await sleep(160);
    setCursor((c) => ({ ...c, down: false }));
  }, []);

  // The scripted run.
  useEffect(() => {
    if (!open || !mounted) return;
    const token = ++runToken.current;
    const alive = () => token === runToken.current && openRef.current;

    (async () => {
      currentPage.current = null;
      // small settle so the overlay + first page are laid out
      await sleep(350);
      for (let k = 0; k < BEATS.length; k++) {
        if (!alive()) return;
        setIdx(k);
        const beat = BEATS[k];
        const pageChanged = beat.page !== currentPage.current;
        currentPage.current = beat.page;
        setPage(beat.page);
        // A page switch remounts the page; give it room to render before we go
        // looking for an anchor. Same-page beats (e.g. the add-course modal
        // opening) need only a short beat.
        await sleep(pageChanged ? 650 : 280);
        if (!alive()) return;

        const el = beat.target ? await waitForAnchor(beat.target, 2500) : null;
        if (beat.target && !el) {
          // Anchor never showed — clear the previous callout so no stale text
          // lingers, and move on.
          setCallout(null);
          setCursor((c) => ({ ...c, visible: false }));
          continue;
        }
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          await sleep(220);
        }
        if (!alive()) return;

        aimAt(
          el,
          beat.callout ? t(beat.callout) : beat.line ? t(beat.line) : "",
          beat.title ? t(beat.title) : undefined
        );
        await sleep(el ? 850 : 500); // cursor glide + read

        // Perform the live action.
        if (beat.action && el) {
          if (!alive()) return;
          if (beat.action.kind === "click") {
            await clickPulse();
            (el as HTMLElement).click();
          } else {
            const value = lang === "ar" ? beat.action.ar : beat.action.en;
            (el as HTMLInputElement).focus();
            for (let i = 1; i <= value.length; i++) {
              if (!alive()) return;
              setNativeValue(el as HTMLInputElement, value.slice(0, i));
              await sleep(70);
            }
          }
          await sleep(500);
        }

        // Hold, honoring pause.
        let waited = 0;
        const hold = beat.hold ?? 1800;
        while (alive() && (pausedRef.current || waited < hold)) {
          await sleep(120);
          if (!pausedRef.current) waited += 120;
        }
      }
      if (alive()) finish();
    })();

    return () => { runToken.current++; };
    // Re-run whenever the tour (re)opens. idx/page/etc. are managed inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  const replay = () => {
    setPaused(false);
    setIdx(0);
    // bump token via a fresh run: toggle open off/on is heavy; instead re-trigger
    // by resetting page and incrementing the token through the effect path.
    runToken.current++;
    setOpen(false);
    requestAnimationFrame(() => setOpen(true));
  };

  // body scroll lock + escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, finish]);

  if (!open || !mounted) return null;
  const Current = PAGES[page].Comp;

  return (
    <>
      {createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(20,30,36,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      role="dialog"
      aria-modal="true"
      aria-label={t("ob_welcome_t")}
    >
      <div
        ref={boxRef}
        className="relative flex flex-col w-[96vw] max-w-[1160px] h-[90vh] max-h-[880px] rounded-3xl overflow-hidden"
        style={{ background: "var(--color-surface)", boxShadow: "0 30px 90px rgba(0,0,0,0.45)" }}
      >
        {/* Close */}
        <button
          onClick={finish}
          aria-label={t("close")}
          className="absolute top-3 end-3 z-30 flex items-center justify-center h-9 w-9 rounded-full transition-colors"
          style={{ background: "var(--color-surface)", color: "var(--color-muted)", boxShadow: "var(--shadow-card)" }}
        >
          <X size={18} />
        </button>
        {/* Sample-data badge */}
        <div
          className="absolute top-4 start-4 z-30 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
          style={{ background: "var(--color-brass-soft)", color: "var(--color-brass)" }}
        >
          <Sparkles size={12} />
          {t("tour_sample")}
        </div>

        {/* The real app, fed by demo data */}
        <DemoStoreProvider>
          <div className="flex-1 min-h-0 flex" style={{ background: "var(--color-canvas)" }}>
            {/* decorative sidebar highlighting the current page */}
            <aside className="haven-sidebar hidden md:flex shrink-0 flex-col" style={{ width: 208, padding: 18 }}>
              <div className="flex items-center gap-2 mb-6 px-1">
                <Logo size={26} mono />
                <span className="font-display text-xl text-white">{t("appName")}</span>
              </div>
              <nav className="flex flex-col gap-1">
                {NAV_ORDER.map((k) => {
                  const active = k === page;
                  const Icon = PAGES[k].Icon;
                  return (
                    <div
                      key={k}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${active ? "haven-nav-active text-white" : ""}`}
                      style={active ? undefined : { color: "rgba(231,239,240,0.7)" }}
                    >
                      <Icon size={17} style={active ? { color: "var(--color-brass)" } : undefined} />
                      <span>{t(PAGES[k].nav)}</span>
                    </div>
                  );
                })}
              </nav>
            </aside>

            {/* page content — pointer-events off so the auto-driven cursor owns it */}
            <div ref={scrollRef} className="flex-1 min-w-0 relative overflow-y-auto">
              <div key={page} className="haven-fade-in p-4 sm:p-8 min-h-full" style={{ pointerEvents: "none" }}>
                <Current />
              </div>
            </div>
          </div>
        </DemoStoreProvider>

        {/* Controls */}
        <div className="shrink-0 border-t px-4 sm:px-6 py-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? t("tour_play") : t("tour_pause")}
              className="shrink-0 flex items-center justify-center h-9 w-9 rounded-full transition-colors hover:bg-black/5"
              style={{ color: "var(--color-ink)" }}
            >
              {paused ? <Play size={17} /> : <Pause size={17} />}
            </button>
            <button
              onClick={replay}
              aria-label={t("tour_replay")}
              className="shrink-0 flex items-center justify-center h-9 w-9 rounded-full transition-colors hover:bg-black/5"
              style={{ color: "var(--color-muted)" }}
            >
              <RotateCcw size={16} />
            </button>

            <div className="flex-1 flex items-center justify-center gap-1.5">
              {BEATS.map((_, i) => (
                <span
                  key={i}
                  className="h-2 rounded-full transition-all"
                  style={{ width: i === idx ? 20 : 7, background: i === idx ? "var(--color-primary)" : "var(--color-border)" }}
                />
              ))}
            </div>

            <button
              onClick={finish}
              className="haven-btn shrink-0 rounded-xl px-4 py-2 text-sm font-semibold"
            >
              {idx >= BEATS.length - 1 ? t("ob_finish") : t("ob_skip")}
            </button>
          </div>
        </div>
      </div>
    </div>,
        document.body
      )}

      {/* Cursor + callout — a separate top-level portal above every app modal,
          positioned in viewport coordinates so it can point at fields inside a
          modal the demo opens (which itself sits above the tour overlay). */}
      {createPortal(
        <div className="pointer-events-none fixed inset-0 z-[80]" aria-hidden={!callout}>
          <div
            style={{
              position: "fixed", left: 0, top: 0,
              transform: `translate(${cursor.x}px, ${cursor.y}px) scale(${cursor.down ? 0.82 : 1})`,
              transition: "transform 0.7s cubic-bezier(0.5,0,0.2,1)",
              opacity: cursor.visible ? 1 : 0,
              marginLeft: -3, marginTop: -3,
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,.35))" }}>
              <path d="M5 3l14 7-6 2-2 6z" fill="#fff" stroke="#20303a" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            {cursor.down && (
              <span
                className="absolute rounded-full"
                style={{ left: -8, top: -8, height: 40, width: 40, border: "2px solid var(--color-brass)", opacity: 0.7 }}
              />
            )}
          </div>
          {callout && (
            <div
              className="max-w-[250px] rounded-2xl px-4 py-3"
              style={{
                position: "fixed", left: callout.x, top: callout.y,
                background: "var(--color-ink)", color: "#fff",
                boxShadow: "0 12px 34px rgba(0,0,0,0.32)",
                transition: "left 0.5s ease, top 0.5s ease",
              }}
              role="note"
            >
              {callout.title && (
                <div className="font-display text-[15px] mb-1" style={{ color: "var(--color-brass)" }}>{callout.title}</div>
              )}
              <div className="text-[13px] leading-relaxed">{callout.text}</div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
