"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Play, Pause, RotateCcw, Sparkles,
  LayoutDashboard, BookOpen, ClipboardList, CalendarDays, ShieldCheck, Timer, Settings as SettingsIcon,
} from "lucide-react";
import { Logo } from "./Logo";
import { DemoStoreProvider } from "./DemoStore";
import { TourHavi } from "./tour/TourHavi";
import { TourContext } from "./tour/TourContext";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/translations/en";
import DashboardPage from "@/app/(app)/dashboard/page";
import CoursesPage from "@/app/(app)/courses/page";
import TasksPage from "@/app/(app)/assignments/page";
import SchedulePage from "@/app/(app)/schedule/page";
import AttendancePage from "@/app/(app)/attendance/page";
import PomodoroPage from "@/app/(app)/pomodoro/page";
import SettingsPage from "@/app/(app)/settings/page";

// ---------------------------------------------------------------------------
// Guided live tour — the first-run onboarding. Havi (the mascot, identical to
// the in-app sprite) travels to each control on the REAL app pages (rendered
// against the demo store, so nothing touches the user's data) with a note stuck
// to his side, and actually DOES things: adds a course + grade item + a lecture,
// tags a planner week, sets a class time, logs an absence. A quick-nav bar up
// top jumps straight to the parts that matter most. Shown once (onboardingSeen),
// reopenable from Settings.
// ---------------------------------------------------------------------------

type PageKey =
  | "dashboard" | "courses" | "assignments" | "schedule"
  | "attendance" | "pomodoro" | "settings";

const PAGES: Record<PageKey, { Comp: React.ComponentType; nav: TranslationKey; Icon: typeof LayoutDashboard }> = {
  dashboard: { Comp: DashboardPage, nav: "nav_dashboard", Icon: LayoutDashboard },
  courses: { Comp: CoursesPage, nav: "nav_courses", Icon: BookOpen },
  assignments: { Comp: TasksPage, nav: "nav_assignments", Icon: ClipboardList },
  schedule: { Comp: SchedulePage, nav: "nav_schedule", Icon: CalendarDays },
  attendance: { Comp: AttendancePage, nav: "nav_attendance", Icon: ShieldCheck },
  pomodoro: { Comp: PomodoroPage, nav: "nav_pomodoro", Icon: Timer },
  settings: { Comp: SettingsPage, nav: "nav_settings", Icon: SettingsIcon },
};
const NAV_ORDER: PageKey[] = ["dashboard", "courses", "assignments", "schedule", "attendance", "pomodoro", "settings"];

type Action =
  | { kind: "click" }
  | { kind: "type"; ar: string; en: string; enter?: boolean }
  | { kind: "selectFirst" };

type Scope = "page" | "pageLast" | "modal";

interface Beat {
  page: PageKey;
  target?: string;
  /** "page" = first anchor in the demo scroll area; "pageLast" = the LAST one
   *  (e.g. the just-added course); "modal" = a modal portaled to <body>. */
  scope?: Scope;
  callout?: TranslationKey;
  title?: TranslationKey;
  line?: TranslationKey;
  action?: Action;
  /** after a save click, click item-cancel if the modal is still open (defensive). */
  closeIfStuck?: boolean;
  hold?: number;
}

const BEATS: Beat[] = [
  // ── Dashboard ────────────────────────────────────────────────────────
  { page: "dashboard", title: "ob_welcome_t", line: "tour_haviIntro", hold: 2800 },
  { page: "dashboard", target: "dash-overview", callout: "tour_dashOverview", hold: 3000 },
  { page: "dashboard", target: "dash-gpa", callout: "tour_dashGpa", hold: 3000 },
  { page: "dashboard", target: "dash-checkin", callout: "tour_dashCheckin", hold: 2800 },
  { page: "dashboard", target: "dash-smart", callout: "tour_dashSmart", hold: 2800 },
  { page: "dashboard", target: "dash-upcoming", callout: "tour_dashUpcoming", hold: 2600 },
  { page: "dashboard", target: "dash-whatif", callout: "tour_dashWhatif", hold: 2800 },

  // ── Courses: add a course live ───────────────────────────────────────
  { page: "courses", title: "ob_courses_t", line: "ob_courses_p3", hold: 2400 },
  { page: "courses", target: "add-course", callout: "tour_addCourseBtn", action: { kind: "click" }, hold: 500 },
  { page: "courses", target: "course-name", scope: "modal", callout: "tour_courseName", action: { kind: "type", ar: "الأحياء", en: "Biology" }, hold: 500 },
  { page: "courses", target: "course-credits", scope: "modal", callout: "tour_courseCredits", action: { kind: "type", ar: "3", en: "3" }, hold: 500 },
  { page: "courses", target: "course-save", scope: "modal", callout: "tour_courseSave", action: { kind: "click" }, hold: 900 },
  { page: "courses", target: "course-panel", scope: "pageLast", title: "ob_courses_t", line: "tour_courseAdded", hold: 2600 },

  // ── Grade item — added to the NEW (empty) course, field by field ─────
  { page: "courses", title: "ob_grades_t", line: "ob_grades_p1", hold: 2400 },
  { page: "courses", target: "add-component", scope: "pageLast", callout: "tour_addComponent", action: { kind: "click" }, hold: 600 },
  { page: "courses", target: "item-name", scope: "modal", callout: "tour_itemName", action: { kind: "type", ar: "كويز ١", en: "Quiz 1" }, hold: 500 },
  { page: "courses", target: "item-type", scope: "modal", callout: "tour_itemType", hold: 2000 },
  { page: "courses", target: "item-weight", scope: "modal", callout: "tour_itemWeight", action: { kind: "type", ar: "10", en: "10" }, hold: 600 },
  { page: "courses", target: "item-total", scope: "modal", callout: "tour_itemTotal", action: { kind: "type", ar: "10", en: "10" }, hold: 600 },
  { page: "courses", target: "item-score", scope: "modal", callout: "tour_itemScore", action: { kind: "type", ar: "9", en: "9" }, hold: 700 },
  { page: "courses", target: "item-save", scope: "modal", callout: "tour_itemSave", action: { kind: "click" }, closeIfStuck: true, hold: 900 },
  { page: "courses", target: "course-panel", scope: "pageLast", title: "ob_grades_t", line: "tour_itemAdded", hold: 2600 },

  // ── Lecture (session) — added to the NEW course ──────────────────────
  { page: "courses", title: "ob_lect_t", line: "ob_lect_p1", hold: 2400 },
  { page: "courses", target: "sessions-box", scope: "pageLast", callout: "tour_sessionsBox", hold: 2600 },
  { page: "courses", target: "add-session", scope: "pageLast", callout: "tour_addSession", action: { kind: "click" }, hold: 900 },
  { page: "courses", target: "sessions-box", scope: "pageLast", callout: "tour_sessionSet", hold: 3000 },

  // ── Tasks ────────────────────────────────────────────────────────────
  { page: "assignments", title: "ob_tasks_t", line: "ob_tasks_p1", hold: 2600 },
  { page: "assignments", title: "ob_tasks_t", line: "ob_tasks_p2", hold: 2600 },

  // ── Schedule: planner (add a tag live) then timetable (set a time live) ─
  { page: "schedule", title: "ob_sched_t", line: "ob_sched_p1", hold: 2600 },
  { page: "schedule", target: "planner-toolbar", callout: "tour_plannerToolbar", hold: 3000 },
  { page: "schedule", target: "planner-tag", callout: "tour_plannerAddTag", action: { kind: "click" }, hold: 1400 },
  // Open an existing dated deadline to show recolouring + a due time + reminders.
  { page: "schedule", target: "planner-note", callout: "tour_plannerOpenNote", action: { kind: "click" }, hold: 1200 },
  { page: "schedule", target: "planner-color", callout: "tour_plannerColor", action: { kind: "type", ar: "#8a6fb0", en: "#8a6fb0" }, hold: 2400 },
  { page: "schedule", target: "planner-time", callout: "tour_plannerTime", hold: 3200 },
  { page: "schedule", target: "planner-save", callout: "tour_plannerSave", action: { kind: "click" }, hold: 900 },
  { page: "schedule", title: "ob_sched_t", line: "tour_plannerAdded", hold: 2400 },
  { page: "schedule", target: "sched-tab-timetable", callout: "tour_timetableTab", action: { kind: "click" }, hold: 900 },
  { page: "schedule", target: "tt-select", callout: "tour_ttSelect", action: { kind: "selectFirst" }, hold: 900 },
  { page: "schedule", target: "tt-from", callout: "tour_ttFrom", action: { kind: "type", ar: "09:00", en: "09:00" }, hold: 700 },
  { page: "schedule", target: "tt-to", callout: "tour_ttTo", action: { kind: "type", ar: "10:00", en: "10:00" }, hold: 700 },
  { page: "schedule", target: "tt-apply", callout: "tour_ttApply", action: { kind: "click" }, hold: 900 },
  { page: "schedule", title: "ob_sched_t", line: "tour_ttDone", hold: 2400 },

  // ── Attendance: explain, then log an absence live ────────────────────
  { page: "attendance", title: "ob_att_t", line: "ob_att_p1", hold: 2600 },
  { page: "attendance", target: "att-rule", callout: "tour_attRule", hold: 2800 },
  { page: "attendance", target: "att-card", callout: "tour_attCard", hold: 3200 },
  { page: "attendance", target: "att-expand", callout: "tour_attExpand", action: { kind: "click" }, hold: 900 },
  { page: "attendance", target: "att-log", callout: "tour_attLog", action: { kind: "click" }, hold: 900 },
  { page: "attendance", target: "att-save", callout: "tour_attSave", action: { kind: "click" }, hold: 1000 },
  { page: "attendance", title: "ob_att_t", line: "tour_attDone", hold: 2400 },

  // ── Pomodoro ─────────────────────────────────────────────────────────
  { page: "pomodoro", title: "ob_pom_t", line: "ob_pom_p1", hold: 2600 },
  { page: "pomodoro", target: "pom-pond", callout: "tour_pomPond", hold: 3000 },
  { page: "pomodoro", target: "pom-focus-course", callout: "tour_pomFocus", action: { kind: "selectFirst" }, hold: 1600 },
  { page: "pomodoro", target: "pom-start", callout: "tour_pomStart", hold: 3000 },
  { page: "pomodoro", target: "pom-grove", callout: "tour_pomGrove", action: { kind: "click" }, hold: 1000 },
  { page: "pomodoro", target: "pom-lake", scope: "modal", callout: "tour_pomLake", hold: 3600 },

  // ── Settings: explain every section, end on notifications ────────────
  { page: "settings", title: "ob_settings_intro_t", line: "ob_settings_intro_p", hold: 2600 },
  { page: "settings", target: "set-haviname", callout: "tour_setHaviName", hold: 2600 },
  { page: "settings", target: "set-theme", callout: "tour_setTheme", hold: 2800 },
  { page: "settings", target: "set-dates", callout: "tour_setDates", hold: 3000 },
  { page: "settings", target: "set-attendance", callout: "tour_setAttendance", hold: 3000 },
  { page: "settings", target: "set-reminders", callout: "tour_setReminders", hold: 2800 },
  { page: "settings", target: "notif-section", callout: "tour_notifHere", hold: 3600 },
  { page: "settings", target: "set-data", callout: "tour_setData", hold: 2800 },
  { page: "settings", target: "set-guide", callout: "tour_setGuide", hold: 3000 },

  // ── Finish ───────────────────────────────────────────────────────────
  { page: "dashboard", title: "ob_finish_t", line: "ob_finish_p1", hold: 3000 },
];

// Quick-nav chips → jump straight to the beats that matter most.
const QUICK: { label: TranslationKey; anchor: string }[] = [
  { label: "tour_jump_notif", anchor: "notif-section" },
  { label: "tour_jump_course", anchor: "add-course" },
  { label: "tour_jump_item", anchor: "add-component" },
  { label: "tour_jump_lecture", anchor: "add-session" },
  { label: "tour_jump_semester", anchor: "set-dates" },
];

// Havi sprite geometry (desktop default; tourDims() derives the per-screen
// sizes). Size 72 → integer scale 3 → 84×69 px on screen.
const HAVI_SIZE = 72;
const NOTE_W = 236;
const GAP = 14;
const UNIT_H = 140; // generous estimate for vertical clamping (desktop)

// The guide unit (Havi + note) must fit — and never overlap content — on every
// screen, from a 320px phone to an iPad to desktop. On narrow viewports Havi
// shrinks and the note narrows to whatever space is left, so the whole unit
// always fits inside the window with margins. Recomputed on each placement.
function tourDims() {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const compact = vw < 640;
  const haviSize = compact ? 52 : HAVI_SIZE; // 52 → scale 2 (56×46), 72 → scale 3 (84×69)
  const scale = Math.max(2, Math.round(haviSize / 28));
  const hw = 28 * scale;
  const hh = 23 * scale; // DRAW_H rows
  const noteW = compact
    ? Math.max(150, Math.min(NOTE_W, vw - hw - GAP - 28))
    : NOTE_W;
  return { hw, hh, noteW, haviSize, unitW: hw + GAP + noteW, unitH: compact ? 124 : UNIT_H };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function setNativeValue(el: HTMLInputElement, value: string) {
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  desc?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

interface Arrow { x1: number; y1: number; x2: number; y2: number; }
interface Guide {
  x: number; y: number;
  noteFirst: boolean; // true → [note][Havi]; false → [Havi][note]
  pose: "books" | "write";
  text: string; title?: string;
  visible: boolean;
  arrow?: Arrow | null; // subtle pointer from Havi to the element he's explaining
  noteW: number;   // responsive note width for this placement
  haviSize: number; // responsive Havi sprite size for this placement
}

export function Onboarding() {
  const { hydrated, onboardingSeen, completeOnboarding } = useStore();
  const { t, lang } = useT();

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [page, setPage] = useState<PageKey>("dashboard");
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [guide, setGuide] = useState<Guide>({ x: 0, y: 0, noteFirst: false, pose: "books", text: "", visible: false, noteW: NOTE_W, haviSize: HAVI_SIZE });
  const [reduced, setReduced] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const runToken = useRef(0);
  const pausedRef = useRef(false);
  const openRef = useRef(false);
  const currentPage = useRef<PageKey | null>(null);
  // The element (and its note) Havi is currently glued to — so he can re-anchor
  // whenever the view scrolls or resizes and never drift off his target.
  const anchorRef = useRef<{ el: HTMLElement | null; text: string; title?: string; pose: "books" | "write" } | null>(null);
  const rafRepos = useRef(0);
  // While the tour is programmatically scrolling, Havi glides to the target's
  // PREDICTED landing spot in parallel — so live scroll events must not re-anchor
  // him to the element's mid-scroll position (that fight is what caused the lag).
  const suppressReanchor = useRef(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { openRef.current = open; }, [open]);
  // Tell the autonomous app mascot to stand down while the tour runs, so it
  // doesn't roam the real page behind the overlay and leak stray Havis into it.
  useEffect(() => {
    if (!mounted) return;
    window.dispatchEvent(new Event(open ? "haven:tour-open" : "haven:tour-close"));
  }, [open, mounted]);
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
    anchorRef.current = null;
    setOpen(false);
    setGuide((g) => ({ ...g, visible: false }));
    completeOnboarding();
  }, [completeOnboarding]);

  // Position Havi + his attached note as ONE unit, right at the target: beside it
  // when there's room, otherwise just below (or above) it — never dropped to the
  // screen corner. Because the page is scrolled so the target sits high, the unit
  // below it stays on-screen and never covers what Havi points at.
  const aimAt = useCallback((el: HTMLElement | null, text: string, title: string | undefined, pose: "books" | "write", rect?: DOMRect) => {
    const vw = window.innerWidth, vh = window.innerHeight;
    // Responsive geometry for THIS placement (Havi shrinks + note narrows on
    // small screens so the unit always fits without overlapping content).
    const { hw: HW, hh: HH, noteW: NW, haviSize, unitW: UW, unitH: UH } = tourDims();

    if (!el) {
      // Page-intro (welcome / finish / section headers): sit at the TOP of the
      // demo panel, above the content — never over the elements.
      const box = boxRef.current?.getBoundingClientRect();
      const cx = box ? box.left + box.width / 2 : vw / 2;
      const top = box ? box.top : 0;
      const y = clamp(top + 76, 12, vh - UH - 12);
      const x = clamp(cx - UW / 2, 12, vw - UW - 12);
      setGuide({ x, y, noteFirst: false, pose, text, title, visible: true, arrow: null, noteW: NW, haviSize });
      return;
    }

    const r = rect ?? el.getBoundingClientRect();
    const cy = r.top + r.height / 2, ecx = r.left + r.width / 2;
    const need = HW + GAP + NW + GAP;

    let x: number, y: number, noteFirst: boolean;
    if (vw - r.right >= need) {
      // Right of the element: [element] Havi note
      x = r.right + GAP; y = clamp(cy - HH / 2, 12, vh - UH - 12); noteFirst = false;
    } else if (r.left >= need) {
      // Left of the element: note Havi [element]
      x = r.left - GAP - (NW + GAP + HW); y = clamp(cy - HH / 2, 12, vh - UH - 12); noteFirst = true;
    } else {
      // No side room → below the element (or above if it's near the bottom).
      const belowY = r.bottom + GAP;
      y = belowY + UH <= vh - 12 ? belowY : Math.max(12, r.top - GAP - UH);
      y = clamp(y, 12, vh - UH - 12);
      x = clamp(ecx - UW / 2, 12, vw - UW - 12); noteFirst = false;
    }

    // Arrow: from Havi's edge to the nearest point on the element's border.
    const hleft = noteFirst ? x + NW + GAP : x;
    const hcx = hleft + HW / 2, hcy = y + HH / 2;
    const ex = clamp(hcx, r.left, r.right), ey = clamp(hcy, r.top, r.bottom);
    const dx = ex - hcx, dy = ey - hcy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const arrow: Arrow = {
      x1: hcx + ux * (HW / 2 - 2), y1: hcy + uy * (HH / 2 - 2),
      x2: ex - ux * 4, y2: ey - uy * 4,
    };
    setGuide({ x, y, noteFirst, pose, text, title, visible: true, arrow, noteW: NW, haviSize });
  }, []);

  // Re-place Havi + note (+ arrow) against the live element rect — called on any
  // scroll/resize so the guide stays glued to whatever it's explaining.
  const reanchor = useCallback(() => {
    if (rafRepos.current || suppressReanchor.current) return;
    rafRepos.current = requestAnimationFrame(() => {
      rafRepos.current = 0;
      const a = anchorRef.current;
      if (a) aimAt(a.el, a.text, a.title, a.pose);
    });
  }, [aimAt]);

  const locate = useCallback((name: string, scope: Scope): HTMLElement | null => {
    const visible = (el: HTMLElement) => el.offsetParent !== null || el.getClientRects().length > 0;
    const root: ParentNode = scope === "modal" ? document : (scrollRef.current ?? document);
    const els = Array.from(root.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)).filter(visible);
    if (!els.length) return null;
    // modal + pageLast take the last match; page takes the first.
    return scope === "page" ? els[0] : els[els.length - 1];
  }, []);

  const waitFor = useCallback((name: string, scope: Scope, timeout = 2500): Promise<HTMLElement | null> => {
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

  // The demo panel scrollTop that lifts a target into the UPPER area (so the note
  // below never covers it). The TOUR does the scrolling — the user never has to.
  const scrollTargetFor = useCallback((el: HTMLElement): number | null => {
    const c = scrollRef.current;
    if (!c) return null;
    const cr = c.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    return Math.max(0, c.scrollTop + (er.top - cr.top) - Math.min(120, cr.height * 0.2));
  }, []);

  // Eased scroll to an absolute scrollTop with a duration CAPPED regardless of
  // distance — so a long top→bottom jump no longer crawls. Reanchor is suppressed
  // meanwhile: Havi is already gliding to the target's predicted landing spot, so
  // the page and Havi animate in parallel and arrive together (no trailing lag).
  const scrollToTop = useCallback((to: number) => new Promise<void>((resolve) => {
    const c = scrollRef.current;
    if (!c) return resolve();
    const from = c.scrollTop;
    const dist = to - from;
    if (Math.abs(dist) < 4) return resolve();
    const dur = clamp(Math.abs(dist) * 0.5, 240, 440);
    const t0 = performance.now();
    const ease = (p: number) => 1 - Math.pow(1 - p, 3); // easeOutCubic
    suppressReanchor.current = true;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      c.scrollTop = from + dist * ease(p);
      if (p < 1) requestAnimationFrame(step);
      else { suppressReanchor.current = false; resolve(); }
    };
    requestAnimationFrame(step);
  }), []);

  const typeInto = useCallback(async (host: HTMLElement, value: string, enter: boolean, alive: () => boolean) => {
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
    if (inp.type === "time" || inp.type === "color") {
      setNativeValue(inp, value);
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      inp.blur();
      return;
    }
    for (let i = 1; i <= value.length; i++) {
      if (!alive()) return;
      setNativeValue(inp, value.slice(0, i));
      await sleep(72);
    }
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    if (enter) inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    inp.dispatchEvent(new Event("focusout", { bubbles: true }));
    inp.blur();
  }, []);

  const selectFirst = useCallback((host: HTMLElement) => {
    const sel = (host.matches?.("select") ? host : host.querySelector<HTMLSelectElement>("select")) as HTMLSelectElement | null;
    if (!sel) return;
    const opt = Array.from(sel.options).find((o) => o.value !== "");
    if (!opt) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    setter?.set?.call(sel, opt.value);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, []);

  // The scripted runner — can start at any beat (used by the quick-nav jumps).
  const runFrom = useCallback((start: number) => {
    const token = ++runToken.current;
    const alive = () => token === runToken.current && openRef.current;
    setPaused(false);

    (async () => {
      currentPage.current = null;
      await sleep(250);
      for (let k = start; k < BEATS.length; k++) {
        if (!alive()) return;
        setIdx(k);
        const beat = BEATS[k];
        const pageChanged = beat.page !== currentPage.current;
        currentPage.current = beat.page;
        setPage(beat.page);
        if (pageChanged && scrollRef.current) scrollRef.current.scrollTop = 0;
        await sleep(pageChanged ? 760 : 300);
        if (!alive()) return;

        const scope = beat.scope ?? "page";
        const el = beat.target ? await waitFor(beat.target, scope) : null;
        if (beat.target && !el) { anchorRef.current = null; setGuide((g) => ({ ...g, visible: false })); continue; }
        if (!alive()) return;

        const pose: "books" | "write" = beat.action ? "write" : "books";
        const text = beat.callout ? t(beat.callout) : beat.line ? t(beat.line) : "";
        const title = beat.title ? t(beat.title) : undefined;
        anchorRef.current = { el, text, title, pose };
        if (el && scope !== "modal") {
          // Glide Havi to where the target WILL land, then scroll the page there
          // in parallel — both eased over a similar, capped time, so they move
          // together with no trailing lag on big top→bottom jumps.
          const to = scrollTargetFor(el);
          if (to != null) {
            const er = el.getBoundingClientRect();
            const shift = to - scrollRef.current!.scrollTop;
            const predicted = new DOMRect(er.left, er.top - shift, er.width, er.height);
            aimAt(el, text, title, pose, predicted);
            await scrollToTop(to);
          } else {
            aimAt(el, text, title, pose);
          }
        }
        // Settle onto the live rect (corrects any prediction error) once put.
        aimAt(el, text, title, pose);
        await sleep(el ? 460 : 560);

        if (beat.action && el) {
          if (!alive()) return;
          if (beat.action.kind === "click") {
            el.click();
            if (beat.closeIfStuck) {
              await sleep(500);
              if (alive() && locate("item-name", "modal")) locate("item-cancel", "modal")?.click();
            }
          } else if (beat.action.kind === "selectFirst") {
            selectFirst(el);
          } else {
            await typeInto(el, lang === "ar" ? beat.action.ar : beat.action.en, !!beat.action.enter, alive);
          }
          await sleep(500);
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
  }, [aimAt, finish, lang, locate, scrollTargetFor, scrollToTop, selectFirst, t, typeInto, waitFor]);

  const runFromRef = useRef(runFrom);
  runFromRef.current = runFrom;

  useEffect(() => {
    if (!open || !mounted) return;
    runFromRef.current(0);
    return () => { runToken.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  const jumpTo = (anchor: string) => {
    const i = BEATS.findIndex((b) => b.target === anchor);
    if (i >= 0) runFromRef.current(i);
  };

  const replay = () => {
    setPaused(false);
    setIdx(0);
    runFromRef.current(0);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, finish]);

  // Keep Havi glued to his target: re-anchor on scroll/resize, and lock manual
  // scrolling of the demo panel (the tour drives it via scrollTo) so the content
  // never slides out from under him.
  useEffect(() => {
    if (!open || !mounted) return;
    const c = scrollRef.current;
    const onReanchor = () => reanchor();
    const lock = (e: Event) => e.preventDefault();
    c?.addEventListener("scroll", onReanchor, { passive: true });
    window.addEventListener("resize", onReanchor);
    c?.addEventListener("wheel", lock, { passive: false });
    c?.addEventListener("touchmove", lock, { passive: false });
    return () => {
      c?.removeEventListener("scroll", onReanchor);
      window.removeEventListener("resize", onReanchor);
      c?.removeEventListener("wheel", lock);
      c?.removeEventListener("touchmove", lock);
    };
  }, [open, mounted, reanchor]);

  if (!open || !mounted) return null;
  const Current = PAGES[page].Comp;

  const Note = guide.text ? (
    <div className="rounded-2xl px-4 py-3" style={{ width: guide.noteW, background: "var(--color-surface)", color: "var(--color-ink)", border: "1px solid var(--color-border)", boxShadow: "0 14px 36px rgba(20,30,36,0.18)" }}>
      {guide.title && <div className="font-display text-[15px] mb-1" style={{ color: "var(--color-brass)" }}>{guide.title}</div>}
      <div className="text-[13px] leading-relaxed" style={{ color: "var(--color-ink)" }}>{guide.text}</div>
    </div>
  ) : null;
  const Havi = <TourHavi pose={guide.pose} size={guide.haviSize} reduced={reduced} />;

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
            {/* Top bar: close · "jump to" quick-nav chips */}
            <div className="shrink-0 flex items-center gap-3 px-3 sm:px-4 border-b" style={{ height: 58, borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
              <button onClick={finish} aria-label={t("close")}
                className="shrink-0 flex items-center justify-center h-9 w-9 rounded-full hover:bg-black/5" style={{ color: "var(--color-muted)" }}>
                <X size={18} />
              </button>
              <span className="hidden md:inline shrink-0 text-[12px] font-medium" style={{ color: "var(--color-muted)" }}>{t("tour_jumpTo")}</span>
              <div className="flex-1 min-w-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                <div className="flex items-center gap-2 w-max py-1 pe-1">
                  {QUICK.map((q) => (
                    <button key={q.anchor} onClick={() => jumpTo(q.anchor)}
                      className="shrink-0 rounded-full border px-4 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-colors hover:bg-[var(--color-primary-soft)] hover:border-[var(--color-primary)]"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}>
                      {t(q.label)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <TourContext.Provider value={true}>
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
            </TourContext.Provider>

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
                <span className="hidden lg:inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium" style={{ color: "var(--color-muted)" }}>
                  <Sparkles size={12} style={{ color: "var(--color-brass)" }} />{t("tour_sample")}
                </span>
                <div className="flex-1 flex items-center justify-center gap-0.5 flex-wrap">
                  {BEATS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => runFromRef.current(i)}
                      aria-label={t("tour_goToStep", { n: i + 1 })}
                      aria-current={i === idx}
                      title={t("tour_goToStep", { n: i + 1 })}
                      className="group/dot inline-flex h-4 items-center px-0.5 cursor-pointer"
                    >
                      <span
                        className="h-1.5 rounded-full transition-all group-hover/dot:opacity-100"
                        style={{
                          width: i === idx ? 16 : 5,
                          background: i === idx ? "var(--color-primary)" : "var(--color-border)",
                          opacity: i === idx ? 1 : 0.85,
                        }}
                      />
                    </button>
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

      {/* Havi + note travel together as one unit, above every app modal, with a
          subtle arrow pointing at what he's explaining. */}
      {createPortal(
        <div className="pointer-events-none fixed inset-0 z-[80]" aria-hidden={!guide.visible}>
          {guide.visible && guide.arrow && (
            <svg className="fixed inset-0" width="100%" height="100%" style={{ overflow: "visible" }} aria-hidden>
              <defs>
                <marker id="tour-arrowhead" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-brass)" />
                </marker>
              </defs>
              <line
                x1={guide.arrow.x1} y1={guide.arrow.y1} x2={guide.arrow.x2} y2={guide.arrow.y2}
                stroke="var(--color-brass)" strokeWidth={2.5} strokeLinecap="round"
                markerEnd="url(#tour-arrowhead)"
                style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" }}
              />
            </svg>
          )}
          <div style={{
            position: "fixed", left: 0, top: 0,
            transform: `translate(${guide.x}px, ${guide.y}px)`,
            transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
            opacity: guide.visible ? 1 : 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: GAP }} role="note">
              {guide.noteFirst ? <>{Note}{Havi}</> : <>{Havi}{Note}</>}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
