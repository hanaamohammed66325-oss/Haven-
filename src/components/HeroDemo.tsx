"use client";

import { Fragment, useEffect, useState } from "react";
import {
  TrendingUp,
  SlidersHorizontal,
  CalendarRange,
  AlertTriangle,
  CalendarCheck,
  Check,
} from "lucide-react";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/translations/en";

/* ---------------- helpers ---------------- */

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

/** prefers-reduced-motion → no auto-advance, scenes render their static end-state */
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

// Saudi 5.0 scale (compact, for the mock only)
const SCALE: [number, string, number][] = [
  [95, "A+", 5], [90, "A", 4.75], [85, "B+", 4.5], [80, "B", 4],
  [75, "C+", 3.5], [70, "C", 3], [65, "D+", 2.5], [60, "D", 2], [0, "F", 1],
];
const gradeFor = (pct: number) => SCALE.find((s) => pct >= s[0]) ?? SCALE[SCALE.length - 1];
const gradeColor = (letter: string) =>
  letter.startsWith("A") ? "var(--color-success)"
  : letter.startsWith("B") ? "var(--color-primary)"
  : letter.startsWith("C") ? "var(--color-warning)"
  : "var(--color-danger)";

/* ---------------- scene config ---------------- */

interface Scene {
  key: TranslationKey;
  Icon: typeof TrendingUp;
  duration: number;
  Comp: (p: { active: boolean; reduced: boolean }) => React.ReactNode;
}

const SCENES: Scene[] = [
  { key: "demo_gpa", Icon: TrendingUp, duration: 4200, Comp: DashboardScene },
  { key: "demo_whatif", Icon: SlidersHorizontal, duration: 6800, Comp: WhatIfScene },
  { key: "demo_planner", Icon: CalendarRange, duration: 6400, Comp: PlannerScene },
  { key: "demo_attendance", Icon: AlertTriangle, duration: 4200, Comp: AttendanceScene },
];

export function HeroDemo() {
  const { t } = useT();
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduced || paused) return;
    const id = setTimeout(() => setActive((a) => (a + 1) % SCENES.length), SCENES[active].duration);
    return () => clearTimeout(id);
  }, [active, paused, reduced]);

  const ActiveIcon = SCENES[active].Icon;

  return (
    <div
      className="relative w-full max-w-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="surface-card rounded-3xl p-6 md:p-7"
        style={{ boxShadow: "var(--shadow-card-hover)" }}
        role="group"
        aria-roledescription="carousel"
        aria-label={t("demo_aria")}
      >
        {/* window chrome */}
        <div className="flex items-center gap-2 mb-5">
          <span className="flex gap-1.5">
            {["#d9534f", "#e89b4a", "#5fa98c"].map((c) => (
              <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.7 }} />
            ))}
          </span>
          <span className="ms-auto haven-label" style={{ fontSize: 11 }}>Haven</span>
        </div>

        {/* stage */}
        <div className="relative" style={{ height: 296 }}>
          {SCENES.map((s, i) => {
            const isActive = i === active;
            const Comp = s.Comp;
            return (
              <div
                key={s.key}
                aria-hidden={!isActive}
                className="absolute inset-0 flex items-center"
                style={{
                  opacity: isActive ? 1 : 0,
                  transform: isActive ? "translateX(0)" : "translateX(12px)",
                  transition: "opacity 0.55s ease, transform 0.55s ease",
                  pointerEvents: isActive ? "auto" : "none",
                }}
              >
                <div className="w-full">
                  <Comp active={isActive} reduced={reduced} />
                </div>
              </div>
            );
          })}
        </div>

        {/* caption */}
        <div key={active} className="haven-fade-in mt-5 flex items-center justify-center gap-2 text-center">
          <ActiveIcon size={16} style={{ color: "var(--color-brass)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
            {t(SCENES[active].key)}
          </span>
        </div>

        {/* dots */}
        <div className="mt-4 flex items-center justify-center gap-2">
          {SCENES.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setActive(i)}
              aria-label={t("demo_goToSlide", { n: i + 1 })}
              aria-current={i === active}
              className="h-2 rounded-full transition-all"
              style={{
                width: i === active ? 22 : 8,
                background: i === active ? "var(--color-primary)" : "var(--color-border)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- animated primitives ---------------- */

function AnimatedRing({
  value, active, reduced, size = 84, stroke = 9, children,
}: {
  value: number; active: boolean; reduced: boolean; size?: number; stroke?: number; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reduced) { setShown(value); return; }
    if (!active) { setShown(0); return; }
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [active, reduced, value]);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-primary-soft)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--color-primary)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - (shown / 100) * circ}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/** counts a number from 0 → target whenever the scene becomes active */
function useCountUp(target: number, active: boolean, reduced: boolean, dur = 950) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduced) { setN(target); return; }
    if (!active) { setN(0); return; }
    let raf = 0, start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / dur);
      setN(target * easeOutCubic(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reduced, target, dur]);
  return n;
}

/* ---------------- scenes ---------------- */

function DashboardScene({ active, reduced }: { active: boolean; reduced: boolean }) {
  const { t } = useT();
  const gpa = useCountUp(4.62, active, reduced);
  const grades = [
    { name: "Calculus I", grade: "B+", color: "#477680" },
    { name: "Programming", grade: "A", color: "#5FA98C" },
    { name: "Physics II", grade: "B", color: "#E89B4A" },
  ];
  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center gap-5">
        <AnimatedRing value={68} active={active} reduced={reduced} size={82}>
          <span className="font-display text-lg" style={{ color: "var(--color-ink)" }}>68%</span>
        </AnimatedRing>
        <div>
          <div className="haven-label">{t("semesterProgress")}</div>
          <div className="text-sm mt-1.5" style={{ color: "var(--color-ink)" }}>
            {t("weekOf", { current: 11, total: 16 })}
          </div>
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: "#EBF7F3", color: "var(--color-success)" }}>
            <CalendarCheck size={12} /> {t("attStatus_ok")}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <span className="haven-label" style={{ fontSize: 11 }}>{t("semesterGpa")}</span>
          <span className="font-display text-2xl leading-none" style={{ color: "var(--color-brass)" }}>{gpa.toFixed(2)}</span>
        </div>
        <div className="space-y-2">
          {grades.map((g) => (
            <div key={g.name} className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--color-ink)" }}>{g.name}</span>
              <span className="font-semibold rounded-lg px-2 py-0.5 text-xs"
                style={{ background: `${g.color}1A`, color: g.color }}>{g.grade}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const WI_COURSES = [
  { name: "Calculus I", credits: 4 },
  { name: "Programming", credits: 3 },
  { name: "Physics II", credits: 4 },
  { name: "English", credits: 2 },
];
const WI_KEYFRAMES = [
  [60, 55, 64, 68],
  [86, 73, 91, 79],
  [94, 90, 82, 96],
];

function WhatIfScene({ active, reduced }: { active: boolean; reduced: boolean }) {
  const { t } = useT();
  const [vals, setVals] = useState<number[]>(WI_KEYFRAMES[0]);

  useEffect(() => {
    if (reduced) { setVals(WI_KEYFRAMES[WI_KEYFRAMES.length - 1]); return; }
    if (!active) { setVals(WI_KEYFRAMES[0]); return; }
    let raf = 0, start = 0;
    const seg = 2000; // ms per keyframe segment
    const total = (WI_KEYFRAMES.length - 1) * seg;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / total);
      const segF = p * (WI_KEYFRAMES.length - 1);
      const i = Math.min(WI_KEYFRAMES.length - 2, Math.floor(segF));
      const local = easeOutCubic(segF - i);
      const from = WI_KEYFRAMES[i], to = WI_KEYFRAMES[i + 1];
      setVals(from.map((v, j) => v + (to[j] - v) * local));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reduced]);

  let num = 0, den = 0;
  vals.forEach((v, i) => { num += gradeFor(v)[2] * WI_COURSES[i].credits; den += WI_COURSES[i].credits; });
  const gpa = den ? num / den : 0;

  return (
    <div className="w-full">
      <div className="flex items-end justify-between mb-4">
        <span className="haven-label">{t("whatIfTitle")}</span>
        <div className="text-end">
          <div className="haven-label" style={{ fontSize: 10 }}>{t("whatIfResult")}</div>
          <div className="font-display text-2xl leading-none mt-0.5" style={{ color: "var(--color-brass)" }}>
            {gpa.toFixed(2)}
          </div>
        </div>
      </div>
      <div className="space-y-2.5">
        {WI_COURSES.map((c, i) => {
          const [, letter] = gradeFor(vals[i]);
          const col = gradeColor(letter);
          return (
            <div key={c.name}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span style={{ color: "var(--color-ink)" }}>{c.name}</span>
                <span className="font-semibold rounded-md px-1.5 py-0.5"
                  style={{ background: `${col}1A`, color: col }}>{letter}</span>
              </div>
              <div className="relative h-2 rounded-full" style={{ background: "var(--color-primary-soft)" }}>
                <div className="absolute inset-y-0 start-0 rounded-full"
                  style={{ width: `${vals[i]}%`, background: "var(--color-primary)" }} />
                <span className="absolute h-4 w-4 rounded-full -top-1"
                  style={{
                    left: `${vals[i]}%`, transform: "translateX(-50%)",
                    background: "var(--color-surface)", border: "2px solid var(--color-primary)",
                    boxShadow: "0 1px 4px rgba(36,54,64,0.25)",
                  }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PL_DAYS = [0, 1, 2, 3];
interface PlTask { day: number; text: string; tag?: TranslationKey; color: string; reveal: number; done: number | null; }
const PL_TASKS: PlTask[] = [
  { day: 0, text: "Calc quiz", tag: "tagExam", color: "#d9534f", reveal: 1, done: null },
  { day: 1, text: "Lab report", tag: "tagAssignment", color: "#477680", reveal: 2, done: null },
  { day: 2, text: "Read ch.4", color: "#5fa98c", reveal: 3, done: 5 },
  { day: 0, text: "Review notes", color: "#477680", reveal: 4, done: 6 },
  { day: 3, text: "Study group", tag: "tagDeadline", color: "#b8975a", reveal: 5, done: null },
  { day: 1, text: "Quiz prep", color: "#5fa98c", reveal: 6, done: 7 },
];
const PL_STEPS = 7;

function PlannerScene({ active, reduced }: { active: boolean; reduced: boolean }) {
  const { t } = useT();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) { setStep(PL_STEPS); return; }
    if (!active) { setStep(0); return; }
    setStep(0);
    let s = 0;
    const id = setInterval(() => {
      s += 1;
      setStep(s);
      if (s >= PL_STEPS) clearInterval(id);
    }, 620);
    return () => clearInterval(id);
  }, [active, reduced]);

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-3">
        <span className="font-display text-base" style={{ color: "var(--color-ink)" }}>{t("weekLabel", { n: 6 })}</span>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5">
        {PL_DAYS.map((day) => {
          const tasks = PL_TASKS.filter((tk) => tk.day === day && step >= tk.reveal);
          return (
            <Fragment key={day}>
              <div className="text-[11px] leading-6" style={{ color: "var(--color-muted)" }}>
                {t(`day${day}` as TranslationKey)}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 min-h-[26px]">
                {tasks.map((tk) => {
                  const done = tk.done != null && step >= tk.done;
                  return (
                    <span key={tk.text}
                      className="haven-fade-up inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
                      style={{ background: `${tk.color}1A` }}>
                      <span className="h-3.5 w-3.5 rounded-full inline-flex items-center justify-center shrink-0"
                        style={{ border: `1.5px solid ${tk.color}`, background: done ? tk.color : "transparent", transition: "background 0.3s ease" }}>
                        <Check size={9} color="#fff" strokeWidth={3} style={{ opacity: done ? 1 : 0, transition: "opacity 0.3s ease" }} />
                      </span>
                      <span style={{ color: "var(--color-ink)", textDecoration: done ? "line-through" : "none", opacity: done ? 0.55 : 1 }}>
                        {tk.text}
                      </span>
                      {tk.tag && (
                        <span className="rounded px-1 text-[10px] font-medium" style={{ background: tk.color, color: "#fff" }}>
                          {t(tk.tag)}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function AttendanceScene({ active, reduced }: { active: boolean; reduced: boolean }) {
  const { t } = useT();
  const grown = active || reduced;
  const rows = [
    { name: "Physics II", pct: 76, status: t("attStatus_warn"), color: "var(--color-warning)", soft: "#FBF0E2" },
    { name: "English", pct: 93, status: t("attStatus_danger"), color: "var(--color-danger)", soft: "#FDEAEA" },
  ];
  return (
    <div className="w-full space-y-3.5">
      {rows.map((r) => (
        <div key={r.name} className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{r.name}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ background: r.soft, color: r.color }}>
              <AlertTriangle size={11} /> {r.status}
            </span>
          </div>
          <div className="h-2 rounded-full" style={{ background: "var(--color-primary-soft)" }}>
            <div className="h-2 rounded-full"
              style={{ width: grown ? `${r.pct}%` : "0%", background: r.color, transition: "width 1.1s cubic-bezier(0.22,1,0.36,1)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
