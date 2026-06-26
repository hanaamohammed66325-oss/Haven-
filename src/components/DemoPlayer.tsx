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
  Target,
  Check,
  TrendingUp,
} from "lucide-react";
import { Logo } from "./Logo";
import { Card } from "./Card";
import { CircularProgress } from "./CircularProgress";
import { CountUp } from "./CountUp";
import { GradeBadge } from "./GradeBadge";
import { AttendanceBadge } from "./AttendanceBadge";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { pctToGrade } from "@/lib/grades";
import type { TranslationKey } from "@/i18n/translations/en";

const SCENE_MS = 5600;
const THEMES = ["haven", "midnight", "rose", "lavender", "sand", "forest", "ocean", "mono"];

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

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

const SAMPLE = [
  { name: "Calculus I", cr: 4, pct: 86, color: "#477680" },
  { name: "Physics II", cr: 4, pct: 82, color: "#5fa98c" },
  { name: "Programming", cr: 3, pct: 92, color: "#e89b4a" },
  { name: "English", cr: 2, pct: 96, color: "#8a6fb0" },
  { name: "Chemistry", cr: 3, pct: 84, color: "#3b6ea5" },
  { name: "Statistics", cr: 3, pct: 90, color: "#b8975a" },
];

interface SceneDef {
  caption: TranslationKey;
  nav: string;
  cyclesTheme?: boolean;
  render: (p: { reduced: boolean; demoTheme: string | null }) => React.ReactNode;
}

const SCENES: SceneDef[] = [
  { caption: "demoScene1", nav: "dashboard", render: ({ reduced }) => <SceneDashboard reduced={reduced} /> },
  { caption: "demoScene2", nav: "dashboard", render: ({ reduced }) => <SceneGpaLive reduced={reduced} /> },
  { caption: "demoScene3", nav: "dashboard", render: ({ reduced }) => <SceneCumulative reduced={reduced} /> },
  { caption: "demoScene4", nav: "dashboard", render: ({ reduced }) => <SceneAttendance reduced={reduced} /> },
  { caption: "demoScene5", nav: "dashboard", render: ({ reduced }) => <SceneFinal reduced={reduced} /> },
  { caption: "demoScene6", nav: "dashboard", render: ({ reduced }) => <SceneWhatIf reduced={reduced} /> },
  { caption: "demoGoalCap", nav: "dashboard", render: ({ reduced }) => <SceneGoal reduced={reduced} /> },
  { caption: "demoTasksCap", nav: "assignments", render: () => <SceneTasks /> },
  { caption: "demoScene7", nav: "schedule", render: ({ reduced }) => <ScenePlanner reduced={reduced} /> },
  { caption: "demoTtCap", nav: "schedule", render: () => <SceneTimetable /> },
  { caption: "demoScene8", nav: "", cyclesTheme: true, render: ({ demoTheme }) => <SceneThemes activeTheme={demoTheme} /> },
];
const SCENE_COUNT = SCENES.length;

export function DemoPlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const { theme: userTheme } = useStore();
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [demoTheme, setDemoTheme] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open) setIdx(0); }, [open]);

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

  // auto-advance
  useEffect(() => {
    if (!open || reduced || paused) return;
    const id = setTimeout(() => setIdx((i) => (i + 1) % SCENE_COUNT), SCENE_MS);
    return () => clearTimeout(id);
  }, [open, idx, paused, reduced]);

  // Scene 8 cycles the real app theme by itself; restore the user's theme otherwise.
  useEffect(() => {
    if (!open) return;
    if (!SCENES[idx].cyclesTheme || reduced) {
      document.documentElement.setAttribute("data-theme", userTheme);
      setDemoTheme(null);
      return;
    }
    let k = 0;
    setDemoTheme(THEMES[0]);
    document.documentElement.setAttribute("data-theme", THEMES[0]);
    const id = setInterval(() => {
      k = (k + 1) % THEMES.length;
      setDemoTheme(THEMES[k]);
      document.documentElement.setAttribute("data-theme", THEMES[k]);
    }, 750);
    return () => {
      clearInterval(id);
      document.documentElement.setAttribute("data-theme", userTheme);
      setDemoTheme(null);
    };
  }, [open, idx, reduced, userTheme]);

  if (!open || !mounted) return null;

  const go = (n: number) => setIdx((n + SCENE_COUNT) % SCENE_COUNT);
  const captionKey = SCENES[idx].caption;

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
        className="haven-modal relative flex flex-col w-[94vw] max-w-[1180px] h-[88vh] max-h-[840px] rounded-3xl overflow-hidden"
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

        {/* App frame */}
        <div className="flex-1 min-h-0 flex" style={{ background: "var(--color-canvas)" }}>
          <DemoSidebar activeNav={SCENES[idx].nav} />
          <div className="flex-1 min-w-0 relative overflow-y-auto">
            <div key={idx} className="haven-fade-in p-4 sm:p-7 min-h-full">
              {SCENES[idx].render({ reduced, demoTheme })}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="shrink-0 border-t px-4 sm:px-6 py-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <div className="flex items-center gap-3">
            <button onClick={() => go(idx - 1)} aria-label={t("demoPrev")} className="shrink-0 flex items-center justify-center h-8 w-8 rounded-full transition-colors hover:bg-black/5" style={{ color: "var(--color-muted)" }}>
              <ChevronLeft size={20} className="rtl:rotate-180" />
            </button>
            <p className="flex-1 text-center text-[13px] sm:text-sm font-medium leading-snug" style={{ color: "var(--color-ink)" }}>
              {t(captionKey)}
            </p>
            <button onClick={() => go(idx + 1)} aria-label={t("demoNext")} className="shrink-0 flex items-center justify-center h-8 w-8 rounded-full transition-colors hover:bg-black/5" style={{ color: "var(--color-muted)" }}>
              <ChevronRight size={20} className="rtl:rotate-180" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 flex items-center justify-center gap-2">
              {Array.from({ length: SCENE_COUNT }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  aria-label={`${i + 1}`}
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

function DemoSidebar({ activeNav }: { activeNav: string }) {
  const { t } = useT();
  const items: { key: string; label: string; Icon: typeof LayoutDashboard }[] = [
    { key: "dashboard", label: t("nav_dashboard"), Icon: LayoutDashboard },
    { key: "courses", label: t("nav_courses"), Icon: BookOpen },
    { key: "assignments", label: t("nav_assignments"), Icon: ClipboardList },
    { key: "schedule", label: t("nav_schedule"), Icon: CalendarDays },
  ];
  return (
    <aside className="haven-sidebar hidden md:flex shrink-0 flex-col" style={{ width: 208, padding: 18 }}>
      <div className="flex items-center gap-2 mb-6 px-1">
        <Logo size={26} stroke="#ffffff" />
        <span className="font-display text-xl text-white">{t("appName")}</span>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((it) => {
          const active = it.key === activeNav;
          return (
            <div
              key={it.key}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${active ? "haven-nav-active text-white" : ""}`}
              style={active ? undefined : { color: "rgba(231,239,240,0.7)" }}
            >
              <it.Icon size={17} style={active ? { color: "var(--color-brass)" } : undefined} />
              <span>{it.label}</span>
            </div>
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

/* ---------------- Scene 1: Dashboard ---------------- */
function SceneDashboard({ reduced }: { reduced: boolean }) {
  const { t } = useT();
  return (
    <div className="haven-stagger max-w-3xl mx-auto">
      <h1 className="font-display text-2xl mb-5" style={{ color: "var(--color-ink)" }}>{t("welcomeBack")}</h1>
      <Card padding="p-0" className="overflow-hidden mb-6">
        <div className="grid grid-cols-3 divide-x" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex flex-col items-center justify-center gap-3 p-5">
            <CircularProgress value={reduced ? 68 : 68} size={92} color="gradient">
              <span className="font-display text-xl" style={{ color: "var(--color-ink)" }}>
                <CountUp value={68} decimals={0} suffix="%" />
              </span>
            </CircularProgress>
            <div className="haven-label text-center">{t("semesterProgress")}</div>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 p-5 text-center">
            <div className="haven-label">{t("semesterGpa")}</div>
            <div className="font-display text-[40px] leading-none" style={{ color: "var(--color-brass)" }}>
              <CountUp value={4.62} decimals={2} />
            </div>
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>/ 5.0</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 p-5 text-center">
            <div className="haven-label">{t("upcoming")}</div>
            <div className="font-display text-[40px] leading-none" style={{ color: "var(--color-ink)" }}>
              <CountUp value={3} decimals={0} />
            </div>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SAMPLE.map((c) => (
          <Card key={c.name} className="flex items-center justify-between" padding="p-5">
            <div>
              <div className="font-display text-base" style={{ color: "var(--color-ink)" }}>{c.name}</div>
              <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{t("creditsShort", { n: c.cr })}</div>
            </div>
            <GradeBadge pct={c.pct} size="lg" />
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Scene 2: GPA updates live ---------------- */
function SceneGpaLive({ reduced }: { reduced: boolean }) {
  const { t } = useT();
  const [added, setAdded] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const id = setTimeout(() => setAdded(true), 1500);
    return () => clearTimeout(id);
  }, [reduced]);

  const rows = [
    { name: "Midterm", score: "27 / 30" },
    { name: "Project", score: "14 / 15" },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="haven-label">{t("semesterGpa")}</div>
        <div className="font-display text-3xl" style={{ color: "var(--color-brass)" }}>
          <CountUp value={added ? 4.62 : 4.31} decimals={2} />
        </div>
      </div>
      <Card padding="p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl" style={{ color: "var(--color-ink)" }}>Physics II</h3>
          <GradeBadge pct={added ? 91 : 82} size="lg" />
        </div>
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
              <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{r.name}</span>
              <span className="text-sm font-semibold rounded-lg px-2.5 py-0.5" style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}>{r.score}</span>
            </div>
          ))}
          {added && (
            <div className="haven-fade-up flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: "var(--color-primary)", background: "var(--color-primary-soft)" }}>
              <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>Quiz 1</span>
              <span className="text-sm font-semibold rounded-lg px-2.5 py-0.5" style={{ background: "var(--color-success)", color: "#fff" }}>9 / 10</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Scene 3: Cumulative GPA calculator ---------------- */
function SceneCumulative({ reduced }: { reduced: boolean }) {
  const { t } = useT();
  // prev 4.63 over 52h + this semester 4.62 over 16cr → ~4.63
  const newCum = (4.63 * 52 + 4.62 * 16) / (52 + 16);
  return (
    <div className="max-w-md mx-auto">
      <Card padding="p-6">
        <h3 className="font-display text-xl mb-5" style={{ color: "var(--color-ink)" }}>{t("cumGpaTitle")}</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--color-border)" }}>
            <div className="text-[11px]" style={{ color: "var(--color-muted)" }}>{t("cumPrevGpa")}</div>
            <div className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>4.63</div>
          </div>
          <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--color-border)" }}>
            <div className="text-[11px]" style={{ color: "var(--color-muted)" }}>{t("cumCompletedHours")}</div>
            <div className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>52</div>
          </div>
        </div>
        <div className="rounded-2xl p-5 text-center" style={{ background: "var(--color-primary-soft)" }}>
          <div className="haven-label" style={{ color: "var(--color-primary)" }}>{t("cumResultLabel")}</div>
          <div className="font-display text-[40px] leading-none mt-1.5" style={{ color: "var(--color-brass)" }}>
            <CountUp value={reduced ? newCum : newCum} decimals={2} duration={1400} />
            <span className="text-base ms-1.5" style={{ color: "var(--color-muted)" }}>/ 5.0</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Scene 4: Attendance warning ---------------- */
function SceneAttendance({ reduced }: { reduced: boolean }) {
  const { t } = useT();
  const [pct, setPct] = useState(reduced ? 26 : 0);
  useEffect(() => {
    if (reduced) return;
    let v = 0;
    const id = setInterval(() => {
      v += 1;
      setPct(v);
      if (v >= 26) clearInterval(id);
    }, 110);
    return () => clearInterval(id);
  }, [reduced]);

  const status: "ok" | "warn" | "danger" = pct >= 25 ? "danger" : pct >= 18 ? "warn" : "ok";
  const color = status === "ok" ? "var(--color-success)" : status === "warn" ? "#C77E2E" : "var(--color-danger)";

  return (
    <div className="max-w-md mx-auto">
      <Card padding="p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-xl" style={{ color: "var(--color-ink)" }}>Physics II</h3>
          <span className="font-display text-2xl" style={{ color }}>{pct.toFixed(0)}%</span>
        </div>
        <div className="text-xs mb-4" style={{ color: "var(--color-muted)" }}>{t("attendance")}</div>
        <div className="h-2.5 rounded-full mb-4" style={{ background: "var(--color-primary-soft)" }}>
          <div className="h-2.5 rounded-full transition-all" style={{ width: `${Math.min(100, pct * 3.2)}%`, background: color }} />
        </div>
        <AttendanceBadge status={status} size="md" />
      </Card>
    </div>
  );
}

/* ---------------- Scene 5: What you need on the final ---------------- */
function SceneFinal({ reduced }: { reduced: boolean }) {
  const { t } = useT();
  const rows = [
    { name: "Quiz 1", score: "18 / 20" },
    { name: "Midterm", score: "27 / 30" },
    { name: "Project", score: "14 / 15" },
    { name: "Final", score: "—" },
  ];
  return (
    <div className="max-w-md mx-auto">
      <Card padding="p-6">
        <h3 className="font-display text-xl mb-4" style={{ color: "var(--color-ink)" }}>Calculus I</h3>
        <div className="flex flex-col gap-2 mb-5">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between rounded-xl border px-3.5 py-2.5" style={{ borderColor: "var(--color-border)" }}>
              <span className="text-sm" style={{ color: "var(--color-ink)" }}>{r.name}</span>
              <span className="text-sm font-semibold" style={{ color: "var(--color-muted)" }}>{r.score}</span>
            </div>
          ))}
        </div>
        <div className="rounded-2xl p-5 flex gap-3" style={{ background: "var(--color-primary-soft)" }}>
          <Target size={18} className="shrink-0 mt-0.5" style={{ color: "var(--color-primary)" }} />
          <div>
            <div className="font-semibold text-sm mb-1" style={{ color: "var(--color-ink)" }}>{t("finalTitle")}</div>
            <div className="font-display text-2xl" style={{ color: "var(--color-brass)" }}>
              <CountUp value={41} decimals={0} duration={1200} />
              <span className="text-sm ms-1" style={{ color: "var(--color-muted)" }}>/ 60</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Scene 6: What-if simulator ---------------- */
const WI = [
  { name: "Calculus I", cr: 4 },
  { name: "Physics II", cr: 4 },
  { name: "Programming", cr: 3 },
];
const WI_KF = [
  [70, 62, 75],
  [88, 80, 93],
  [95, 90, 84],
];
function SceneWhatIf({ reduced }: { reduced: boolean }) {
  const { t } = useT();
  const [vals, setVals] = useState<number[]>(reduced ? WI_KF[WI_KF.length - 1] : WI_KF[0]);
  useEffect(() => {
    if (reduced) return;
    let raf = 0, start = 0;
    const seg = 1600;
    const total = (WI_KF.length - 1) * seg;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / total);
      const sf = p * (WI_KF.length - 1);
      const i = Math.min(WI_KF.length - 2, Math.floor(sf));
      const local = easeOut(sf - i);
      setVals(WI_KF[i].map((v, j) => v + (WI_KF[i + 1][j] - v) * local));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  let num = 0, den = 0;
  vals.forEach((v, i) => { num += pctToGrade(v).points * WI[i].cr; den += WI[i].cr; });
  const gpa = den ? num / den : 0;

  return (
    <div className="max-w-md mx-auto">
      <Card padding="p-6">
        <div className="flex items-end justify-between mb-5">
          <span className="haven-label">{t("whatIfTitle")}</span>
          <div className="text-end">
            <div className="haven-label" style={{ fontSize: 10 }}>{t("whatIfResult")}</div>
            <div className="font-display text-3xl leading-none" style={{ color: "var(--color-brass)" }}>{gpa.toFixed(2)}</div>
          </div>
        </div>
        <div className="space-y-3.5">
          {WI.map((c, i) => (
            <div key={c.name}>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span style={{ color: "var(--color-ink)" }}>{c.name}</span>
                <span className="font-semibold" style={{ color: "var(--color-primary)" }}>{pctToGrade(vals[i]).letter}</span>
              </div>
              <div className="relative h-2 rounded-full" style={{ background: "var(--color-primary-soft)" }}>
                <div className="absolute inset-y-0 start-0 rounded-full" style={{ width: `${vals[i]}%`, background: "var(--color-primary)" }} />
                <span className="absolute h-4 w-4 rounded-full -top-1" style={{ left: `${vals[i]}%`, transform: "translateX(-50%)", background: "var(--color-surface)", border: "2px solid var(--color-primary)", boxShadow: "0 1px 4px rgba(36,54,64,0.25)" }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Scene 7: Planner ---------------- */
const PL_NOTE = "Review chapter 4";
function ScenePlanner({ reduced }: { reduced: boolean }) {
  const { t } = useT();
  const [step, setStep] = useState(reduced ? 9 : 0);
  const [typed, setTyped] = useState(reduced ? PL_NOTE.length : 0);

  useEffect(() => {
    if (reduced) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStep(1), 600));   // Sunday quiz tag
    timers.push(setTimeout(() => setStep(2), 1300));  // Tuesday assignment
    timers.push(setTimeout(() => setStep(3), 2000));  // start typing Wednesday note
    timers.push(setTimeout(() => setStep(4), 4200));  // tick Sunday checkbox
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  useEffect(() => {
    if (reduced || step < 3) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTyped(i);
      if (i >= PL_NOTE.length) clearInterval(id);
    }, 70);
    return () => clearInterval(id);
  }, [step, reduced]);

  const days = [
    { d: 0, label: t("day0"), content: step >= 1 ? <Tag color="#d9534f" label={t("tagQuiz")} done={step >= 4} /> : null },
    { d: 1, label: t("day1"), content: null },
    { d: 2, label: t("day2"), content: step >= 2 ? <Tag color="#477680" label={t("tagAssignment")} /> : null },
    { d: 3, label: t("day3"), content: step >= 3 ? <NoteChip text={PL_NOTE.slice(0, typed)} /> : null },
    { d: 4, label: t("day4"), content: null },
  ];

  return (
    <div className="max-w-md mx-auto">
      <Card padding="p-6">
        <div className="font-display text-lg mb-4" style={{ color: "var(--color-ink)" }}>{t("weekLabel", { n: 1 })}</div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-3 items-center">
          {days.map((row) => (
            <div key={row.d} className="contents">
              <div className="text-[12px]" style={{ color: "var(--color-muted)" }}>{row.label}</div>
              <div className="flex items-center gap-1.5 min-h-[28px]">{row.content}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Tag({ color, label, done }: { color: string; label: string; done?: boolean }) {
  return (
    <span className="haven-fade-up inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs" style={{ background: `${color}1A` }}>
      <span className="h-3.5 w-3.5 rounded-full inline-flex items-center justify-center shrink-0" style={{ border: `1.5px solid ${color}`, background: done ? color : "transparent", transition: "background 0.3s ease" }}>
        {done && <Check size={9} color="#fff" strokeWidth={3} />}
      </span>
      <span style={{ color: "var(--color-ink)", textDecoration: done ? "line-through" : "none", opacity: done ? 0.5 : 1 }}>{label}</span>
    </span>
  );
}

function NoteChip({ text }: { text: string }) {
  return (
    <span className="haven-fade-up inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs" style={{ background: "#4776801A" }}>
      <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ border: "1.5px solid #477680" }} />
      <span style={{ color: "var(--color-ink)" }}>{text}<span className="opacity-50">|</span></span>
    </span>
  );
}

/* ---------------- Scene: GPA goal ---------------- */
function SceneGoal({ reduced }: { reduced: boolean }) {
  const { t } = useT();
  const goal = 4.75;
  const current = 4.62;
  const pct = Math.min(100, (current / goal) * 100);
  const [w, setW] = useState(reduced ? pct : 0);
  useEffect(() => {
    if (reduced) return;
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [reduced, pct]);

  return (
    <div className="max-w-md mx-auto">
      <Card padding="p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl" style={{ color: "var(--color-ink)" }}>{t("gpaGoalTitle")}</h3>
          <span className="text-xs rounded-lg px-2.5 py-1 font-medium" style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
            {t("goalTarget")}: {goal.toFixed(2)}
          </span>
        </div>
        <div className="flex items-end justify-center gap-2 mb-5">
          <span className="font-display text-[46px] leading-none" style={{ color: "var(--color-brass)" }}>
            <CountUp value={current} decimals={2} duration={1200} />
          </span>
          <span className="text-base mb-1.5" style={{ color: "var(--color-muted)" }}>/ {goal.toFixed(2)}</span>
        </div>
        <div className="h-2.5 rounded-full mb-3" style={{ background: "var(--color-primary-soft)" }}>
          <div className="h-2.5 rounded-full" style={{ width: `${w}%`, background: "var(--grad-primary)", transition: "width 1s cubic-bezier(0.22,1,0.36,1)" }} />
        </div>
        <div className="text-center text-sm font-medium" style={{ color: "var(--color-success)" }}>
          {t("goalToGo", { n: (goal - current).toFixed(2) })}
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Scene: Tasks by course ---------------- */
function SceneTasks() {
  const { t } = useT();
  const groups = [
    { course: "Calculus I", count: 3, rows: [["Quiz 1", t("type_quiz"), "18 / 20"], ["Midterm", t("type_midterm"), "27 / 30"], ["Final Exam", t("type_final"), "—"]] },
    { course: "Physics II", count: 2, rows: [["Lab Report", t("type_assignment"), "—"], ["Quiz 2", t("type_quiz"), "8 / 10"]] },
  ];
  return (
    <div className="haven-stagger max-w-xl mx-auto flex flex-col gap-4">
      {groups.map((g) => (
        <Card key={g.course} padding="p-0" className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--color-border)", background: "var(--color-primary-soft)" }}>
            <h3 className="font-display text-lg" style={{ color: "var(--color-ink)" }}>{g.course}</h3>
            <span className="inline-flex items-center justify-center rounded-full px-2 min-w-[22px] h-[22px] text-xs font-semibold" style={{ background: "var(--color-surface)", color: "var(--color-primary)" }}>{g.count}</span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {g.rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{r[0]}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] rounded-md px-2 py-0.5 font-medium" style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}>{r[1]}</span>
                  <span className="text-sm font-semibold w-14 text-end" style={{ color: "var(--color-muted)" }}>{r[2]}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------------- Scene: Weekly timetable ---------------- */
function SceneTimetable() {
  const { t } = useT();
  const COL = ["#477680", "#5fa98c", "#e89b4a", "#8a6fb0", "#3b6ea5"];
  const days = [
    { d: 0, classes: [{ n: "Calculus I", time: "08:00", room: "B24-105", c: 0 }] },
    { d: 1, classes: [{ n: "Physics II", time: "10:00", room: "B12-7", c: 1 }, { n: "English", time: "13:00", room: "A3-2", c: 3 }] },
    { d: 2, classes: [{ n: "Programming", time: "09:00", room: "CS-Lab", c: 2 }] },
    { d: 3, classes: [{ n: "Calculus I", time: "08:00", room: "B24-105", c: 0 }, { n: "Physics II", time: "10:00", room: "B12-7", c: 1 }] },
    { d: 4, classes: [{ n: "English", time: "11:00", room: "A3-2", c: 3 }] },
  ];
  return (
    <div className="haven-stagger max-w-3xl mx-auto grid grid-cols-5 gap-2.5">
      {days.map((day) => (
        <div key={day.d} className="rounded-2xl border p-2.5" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <div className="haven-label text-center mb-2" style={{ fontSize: 10, color: "var(--color-ink)" }}>{t(`day${day.d}` as TranslationKey)}</div>
          <div className="flex flex-col gap-2">
            {day.classes.map((cl, i) => {
              const col = COL[cl.c];
              return (
                <div key={i} className="rounded-lg px-2 py-1.5" style={{ background: `${col}14`, borderInlineStart: `3px solid ${col}` }}>
                  <div className="text-[11px] font-semibold truncate" style={{ color: "var(--color-ink)" }}>{cl.n}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--color-muted)" }}>{cl.time} · {cl.room}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Scene 8: Themes ---------------- */
const THEME_SWATCHES = [
  { id: "haven", surface: "#fcfbf9", sidebar: "#0f3a40", primary: "#477680", brass: "#b8975a" },
  { id: "midnight", surface: "#16242b", sidebar: "#0a141a", primary: "#5fa9b8", brass: "#cbaa6e" },
  { id: "rose", surface: "#fdfbfb", sidebar: "#46303a", primary: "#b3737f", brass: "#c08a72" },
  { id: "lavender", surface: "#fdfcff", sidebar: "#322c4a", primary: "#7e6fb0", brass: "#b89a6a" },
  { id: "sand", surface: "#fdfbf8", sidebar: "#463729", primary: "#b07a52", brass: "#a98955" },
  { id: "forest", surface: "#fcfdfb", sidebar: "#1c3528", primary: "#3f7d5a", brass: "#b8975a" },
  { id: "ocean", surface: "#fbfdfe", sidebar: "#14304a", primary: "#3a6ea5", brass: "#b8975a" },
  { id: "mono", surface: "#fdfdfd", sidebar: "#26282b", primary: "#4a4f54", brass: "#8f8f8f" },
];
function SceneThemes({ activeTheme }: { activeTheme: string | null }) {
  const { t } = useT();
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <TrendingUp size={18} style={{ color: "var(--color-brass)" }} />
        <h3 className="font-display text-xl" style={{ color: "var(--color-ink)" }}>{t("sectionTheme")}</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {THEME_SWATCHES.map((th) => {
          const active = activeTheme === th.id;
          return (
            <div
              key={th.id}
              className="rounded-2xl border p-2 transition-all"
              style={{ borderColor: active ? "var(--color-primary)" : "var(--color-border)", boxShadow: active ? "0 0 0 2px var(--color-primary)" : "none", background: "var(--color-surface)" }}
            >
              <div className="h-14 rounded-xl overflow-hidden flex" style={{ background: th.surface, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)" }}>
                <div style={{ width: 14, background: th.sidebar }} />
                <div className="flex-1 flex items-center gap-1 px-1.5">
                  <span className="h-3.5 w-3.5 rounded-full" style={{ background: th.primary }} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: th.brass }} />
                </div>
              </div>
              <div className="text-[11px] font-medium mt-1.5 text-center" style={{ color: "var(--color-ink)" }}>
                {t(`theme_${th.id}` as TranslationKey)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
