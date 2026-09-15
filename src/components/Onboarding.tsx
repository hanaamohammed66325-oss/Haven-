"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Play, Pause, RotateCcw, Sparkles,
  LayoutDashboard, BookOpen, ClipboardList, CalendarDays, ShieldCheck, Settings as SettingsIcon,
} from "lucide-react";
import { Logo } from "./Logo";
import { DemoStoreProvider } from "./DemoStore";
import { TourHavi } from "./tour/TourHavi";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/translations/en";
import DashboardPage from "@/app/(app)/dashboard/page";
import CoursesPage from "@/app/(app)/courses/page";
import TasksPage from "@/app/(app)/assignments/page";
import SchedulePage from "@/app/(app)/schedule/page";
import AttendancePage from "@/app/(app)/attendance/page";
import SettingsPage from "@/app/(app)/settings/page";

// ---------------------------------------------------------------------------
// Guided live tour — the first-run onboarding. Havi (the mascot) travels to each
// control on the REAL app pages (rendered against the demo store, so nothing
// touches the user's data), reading his books while a note beside him explains
// what it is — and on the Courses page he actually DOES things: adds a course,
// then adds a grade item field-by-field. It ends on Settings, pointing at where
// reminders are turned on. Shown once (onboardingSeen), reopenable from Settings.
// ---------------------------------------------------------------------------

type PageKey = "dashboard" | "courses" | "assignments" | "schedule" | "attendance" | "settings";

const PAGES: Record<PageKey, { Comp: React.ComponentType; nav: TranslationKey; Icon: typeof LayoutDashboard }> = {
  dashboard: { Comp: DashboardPage, nav: "nav_dashboard", Icon: LayoutDashboard },
  courses: { Comp: CoursesPage, nav: "nav_courses", Icon: BookOpen },
  assignments: { Comp: TasksPage, nav: "nav_assignments", Icon: ClipboardList },
  schedule: { Comp: SchedulePage, nav: "nav_schedule", Icon: CalendarDays },
  attendance: { Comp: AttendancePage, nav: "nav_attendance", Icon: ShieldCheck },
  settings: { Comp: SettingsPage, nav: "nav_settings", Icon: SettingsIcon },
};
const NAV_ORDER: PageKey[] = ["dashboard", "courses", "assignments", "schedule", "attendance", "settings"];

type Action =
  | { kind: "click" }
  | { kind: "type"; ar: string; en: string };

interface Beat {
  page: PageKey;
  target?: string;
  /** where the anchor lives: "page" = inside the demo scroll area (first match);
   *  "modal" = a modal the demo opened, portaled to <body> (last match). */
  scope?: "page" | "modal";
  callout?: TranslationKey;
  title?: TranslationKey;
  line?: TranslationKey;
  action?: Action;
  /** after a save click, press Escape if the modal is still open (defensive). */
  closeIfStuck?: boolean;
  hold?: number;
}

const BEATS: Beat[] = [
  { page: "dashboard", title: "ob_welcome_t", line: "tour_haviIntro", hold: 2600 },
  { page: "dashboard", title: "ob_dash_t", line: "ob_dash_p1", hold: 2400 },
  { page: "dashboard", title: "ob_dash_t", line: "ob_dash_p3", hold: 2200 },

  { page: "courses", title: "ob_courses_t", line: "ob_courses_p3", hold: 2200 },
  { page: "courses", target: "add-course", callout: "tour_addCourseBtn", action: { kind: "click" }, hold: 500 },
  { page: "courses", target: "course-name", scope: "modal", callout: "tour_courseName", action: { kind: "type", ar: "الأحياء", en: "Biology" }, hold: 500 },
  { page: "courses", target: "course-credits", scope: "modal", callout: "tour_courseCredits", action: { kind: "type", ar: "3", en: "3" }, hold: 500 },
  { page: "courses", target: "course-save", scope: "modal", callout: "tour_courseSave", action: { kind: "click" }, hold: 800 },
  { page: "courses", title: "ob_courses_t", line: "tour_courseAdded", hold: 2200 },

  { page: "courses", title: "ob_grades_t", line: "ob_grades_p1", hold: 2200 },
  { page: "courses", target: "add-component", callout: "tour_addComponent", action: { kind: "click" }, hold: 600 },
  { page: "courses", target: "item-name", scope: "modal", callout: "tour_itemName", action: { kind: "type", ar: "كويز ٣", en: "Quiz 3" }, hold: 500 },
  { page: "courses", target: "item-type", scope: "modal", callout: "tour_itemType", hold: 1900 },
  { page: "courses", target: "item-weight", scope: "modal", callout: "tour_itemWeight", action: { kind: "type", ar: "40", en: "40" }, hold: 600 },
  { page: "courses", target: "item-total", scope: "modal", callout: "tour_itemTotal", action: { kind: "type", ar: "10", en: "10" }, hold: 600 },
  { page: "courses", target: "item-score", scope: "modal", callout: "tour_itemScore", action: { kind: "type", ar: "9", en: "9" }, hold: 600 },
  { page: "courses", target: "item-save", scope: "modal", callout: "tour_itemSave", action: { kind: "click" }, closeIfStuck: true, hold: 800 },
  { page: "courses", title: "ob_grades_t", line: "tour_itemAdded", hold: 2200 },

  { page: "attendance", title: "ob_att_t", line: "ob_att_p1", hold: 2400 },
  { page: "attendance", title: "ob_att_t", line: "ob_att_p2", hold: 2600 },
  { page: "attendance", title: "ob_att_t", line: "ob_att_p3", hold: 2200 },

  { page: "schedule", title: "ob_sched_t", line: "ob_sched_p1", hold: 2600 },
  { page: "schedule", title: "ob_sched_t", line: "ob_sched_p2", hold: 2600 },
  { page: "schedule", title: "ob_sched_t", line: "ob_sched_p3", hold: 2200 },

  { page: "assignments", title: "ob_tasks_t", line: "ob_tasks_p1", hold: 2400 },

  { page: "settings", target: "notif-section", callout: "tour_notifHere", hold: 3200 },

  { page: "dashboard", title: "ob_finish_t", line: "ob_finish_p1", hold: 2600 },
];

const HAVI = 66;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function setNativeValue(el: HTMLInputElement, value: string) {
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  desc?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

interface CursorState { x: number; y: number; pose: "books" | "write"; visible: boolean; }
interface CalloutState { text: string; x: number; y: number; title?: string; }

export function Onboarding() {
  const { hydrated, onboardingSeen, completeOnboarding } = useStore();
  const { t, lang } = useT();

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [page, setPage] = useState<PageKey>("dashboard");
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [havi, setHavi] = useState<CursorState>({ x: 0, y: 0, pose: "books", visible: false });
  const [callout, setCallout] = useState<CalloutState | null>(null);
  const [reduced, setReduced] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const runToken = useRef(0);
  const pausedRef = useRef(false);
  const openRef = useRef(false);
  const currentPage = useRef<PageKey | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const u = () => setReduced(m.matches);
    u(); m.addEventListener("change", u);
    return () => m.removeEventListener("change", u);
  }, []);

  useEffect(() => {
    if (hydrated && !onboardingSeen) setOpen(true);
  }, [hydrated, onboardingSeen]);
  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener("haven:onboarding", reopen);
    return () => window.removeEventListener("haven:onboarding", reopen);
  }, []);

  const finish = useCallback(() => {
    runToken.current++;
    setOpen(false);
    setCallout(null);
    setHavi((c) => ({ ...c, visible: false }));
    completeOnboarding();
  }, [completeOnboarding]);

  // Place Havi next to the element (or bottom-centre for a page-intro) with the
  // note anchored just above him. Viewport coordinates: Havi + note ride a
  // top-level portal above every app modal.
  const aimAt = useCallback((el: HTMLElement | null, text: string, title: string | undefined, pose: "books" | "write") => {
    const CW = 252, NOTE_H = 96;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!el) {
      const box = boxRef.current?.getBoundingClientRect();
      const hx = (box ? box.left + box.width / 2 : vw / 2) - HAVI / 2;
      const hy = box ? box.top + box.height * 0.5 : vh * 0.5;
      setHavi({ x: hx, y: hy, pose, visible: true });
      setCallout({ text, title, x: Math.min(vw - CW - 12, Math.max(12, hx + HAVI / 2 - CW / 2)), y: Math.max(12, hy - NOTE_H - 10) });
      return;
    }
    const r = el.getBoundingClientRect();
    let hx = r.left - HAVI - 10;
    if (hx < 10) hx = Math.min(vw - HAVI - 10, r.right + 10);
    const hy = Math.max(10, Math.min(vh - HAVI - 10, r.top + r.height / 2 - HAVI / 2));
    const cx = hx + HAVI / 2;
    let ny = hy - NOTE_H - 8;
    if (ny < 8) ny = hy + HAVI + 8;
    setHavi({ x: hx, y: hy, pose, visible: true });
    setCallout({ text, title, x: Math.max(12, Math.min(vw - CW - 12, cx - CW / 2)), y: ny });
  }, []);

  const locate = useCallback((name: string, scope: "page" | "modal"): HTMLElement | null => {
    if (scope === "modal") {
      const els = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
      return els.length ? els[els.length - 1] : null;
    }
    return scrollRef.current?.querySelector<HTMLElement>(`[data-tour="${name}"]`) ?? null;
  }, []);

  const waitFor = useCallback((name: string, scope: "page" | "modal", timeout = 2500): Promise<HTMLElement | null> => {
    return new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        const el = locate(name, scope);
        if (el) return res(el);
        if (performance.now() - t0 > timeout) return res(null);
        requestAnimationFrame(tick);
      };
      tick();
    });
  }, [locate]);

  const typeInto = useCallback(async (host: HTMLElement, value: string, alive: () => boolean) => {
    const input = (host.matches?.("input,textarea,select") ? host : host.querySelector<HTMLElement>("input,textarea,select")) as HTMLInputElement | HTMLSelectElement | null;
    if (!input) return;
    input.focus();
    if (input.tagName === "SELECT") {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
      setter?.set?.call(input, value);
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const inp = input as HTMLInputElement;
    for (let i = 1; i <= value.length; i++) {
      if (!alive()) return;
      setNativeValue(inp, value.slice(0, i));
      await sleep(72);
    }
    // Commit patterns for controlled + custom (BoundedNumberInput) fields.
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    inp.dispatchEvent(new Event("focusout", { bubbles: true }));
    inp.blur();
  }, []);

  // The scripted run.
  useEffect(() => {
    if (!open || !mounted) return;
    const token = ++runToken.current;
    const alive = () => token === runToken.current && openRef.current;

    (async () => {
      currentPage.current = null;
      await sleep(350);
      for (let k = 0; k < BEATS.length; k++) {
        if (!alive()) return;
        setIdx(k);
        const beat = BEATS[k];
        const pageChanged = beat.page !== currentPage.current;
        currentPage.current = beat.page;
        setPage(beat.page);
        await sleep(pageChanged ? 700 : 280);
        if (!alive()) return;

        const scope = beat.scope ?? "page";
        const el = beat.target ? await waitFor(beat.target, scope) : null;
        if (beat.target && !el) { setCallout(null); setHavi((c) => ({ ...c, visible: false })); continue; }
        if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); await sleep(260); }
        if (!alive()) return;

        const pose: "books" | "write" = beat.action ? "write" : "books";
        aimAt(el, beat.callout ? t(beat.callout) : beat.line ? t(beat.line) : "", beat.title ? t(beat.title) : undefined, pose);
        await sleep(el ? 900 : 550);

        if (beat.action && el) {
          if (!alive()) return;
          if (beat.action.kind === "click") {
            (el as HTMLElement).click();
            if (beat.closeIfStuck) {
              await sleep(500);
              // If the modal didn't close (e.g. a field didn't validate), close
              // it via its Cancel button so the tour never stalls behind a modal.
              if (alive() && locate("item-name", "modal")) {
                locate("item-cancel", "modal")?.click();
              }
            }
          } else {
            await typeInto(el, lang === "ar" ? beat.action.ar : beat.action.en, alive);
          }
          await sleep(450);
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  const replay = () => {
    setPaused(false);
    setIdx(0);
    runToken.current++;
    setOpen(false);
    requestAnimationFrame(() => setOpen(true));
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, finish]);

  if (!open || !mounted) return null;
  const Current = PAGES[page].Comp;

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6"
          style={{ background: "rgba(20,30,36,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          role="dialog" aria-modal="true" aria-label={t("ob_welcome_t")}
        >
          <div
            ref={boxRef}
            className="relative flex flex-col w-[96vw] max-w-[1160px] h-[90vh] max-h-[880px] rounded-3xl overflow-hidden"
            style={{ background: "var(--color-surface)", boxShadow: "0 30px 90px rgba(0,0,0,0.45)" }}
          >
            <button onClick={finish} aria-label={t("close")}
              className="absolute top-3 end-3 z-30 flex items-center justify-center h-9 w-9 rounded-full"
              style={{ background: "var(--color-surface)", color: "var(--color-muted)", boxShadow: "var(--shadow-card)" }}>
              <X size={18} />
            </button>
            <div className="absolute top-4 start-4 z-30 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
              style={{ background: "var(--color-brass-soft)", color: "var(--color-brass)" }}>
              <Sparkles size={12} />{t("tour_sample")}
            </div>

            <DemoStoreProvider>
              <div className="flex-1 min-h-0 flex" style={{ background: "var(--color-canvas)" }}>
                <aside className="haven-sidebar hidden md:flex shrink-0 flex-col" style={{ width: 208, padding: 18 }}>
                  <div className="flex items-center gap-2 mb-6 px-1">
                    <Logo size={26} mono />
                    <span className="font-display text-xl text-white">{t("appName")}</span>
                  </div>
                  <nav className="flex flex-col gap-1">
                    {NAV_ORDER.map((k) => {
                      const active = k === page; const Icon = PAGES[k].Icon;
                      return (
                        <div key={k}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${active ? "haven-nav-active text-white" : ""}`}
                          style={active ? undefined : { color: "rgba(231,239,240,0.7)" }}>
                          <Icon size={17} style={active ? { color: "var(--color-brass)" } : undefined} />
                          <span>{t(PAGES[k].nav)}</span>
                        </div>
                      );
                    })}
                  </nav>
                </aside>

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
                <button onClick={() => setPaused((p) => !p)} aria-label={paused ? t("tour_play") : t("tour_pause")}
                  className="shrink-0 flex items-center justify-center h-9 w-9 rounded-full hover:bg-black/5" style={{ color: "var(--color-ink)" }}>
                  {paused ? <Play size={17} /> : <Pause size={17} />}
                </button>
                <button onClick={replay} aria-label={t("tour_replay")}
                  className="shrink-0 flex items-center justify-center h-9 w-9 rounded-full hover:bg-black/5" style={{ color: "var(--color-muted)" }}>
                  <RotateCcw size={16} />
                </button>
                <div className="flex-1 flex items-center justify-center gap-1.5 flex-wrap">
                  {BEATS.map((_, i) => (
                    <span key={i} className="h-2 rounded-full transition-all"
                      style={{ width: i === idx ? 18 : 6, background: i === idx ? "var(--color-primary)" : "var(--color-border)" }} />
                  ))}
                </div>
                <button onClick={finish} className="haven-btn shrink-0 rounded-xl px-4 py-2 text-sm font-semibold">
                  {idx >= BEATS.length - 1 ? t("ob_finish") : t("ob_skip")}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Havi guide + note — top-level portal above every app modal. */}
      {createPortal(
        <div className="pointer-events-none fixed inset-0 z-[80]" aria-hidden={!havi.visible}>
          <div style={{
            position: "fixed", left: 0, top: 0,
            transform: `translate(${havi.x}px, ${havi.y}px)`,
            transition: "transform 0.75s cubic-bezier(0.5,0,0.2,1)",
            opacity: havi.visible ? 1 : 0,
          }}>
            <TourHavi pose={havi.pose} size={HAVI} reduced={reduced} />
          </div>
          {callout && (
            <div className="max-w-[252px] rounded-2xl px-4 py-3"
              style={{
                position: "fixed", left: callout.x, top: callout.y,
                background: "var(--color-ink)", color: "#fff",
                boxShadow: "0 12px 34px rgba(0,0,0,0.32)",
                transition: "left 0.55s ease, top 0.55s ease",
              }} role="note">
              {callout.title && <div className="font-display text-[15px] mb-1" style={{ color: "var(--color-brass)" }}>{callout.title}</div>}
              <div className="text-[13px] leading-relaxed">{callout.text}</div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
