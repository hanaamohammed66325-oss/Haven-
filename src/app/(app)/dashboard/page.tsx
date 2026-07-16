"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Eye, EyeOff, CalendarClock, BookOpen, ChevronDown, Calculator } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Card } from "@/components/Card";
import { CircularProgress } from "@/components/CircularProgress";
import { InfoPopover } from "@/components/InfoPopover";
import { GradeBadge } from "@/components/GradeBadge";
import { AttendanceBadge } from "@/components/AttendanceBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { CountUp } from "@/components/CountUp";
import { MiniCalendar } from "@/components/MiniCalendar";
import { UpcomingPanel } from "@/components/UpcomingPanel";
import { GpaGoalCard } from "@/components/GpaGoalCard";
import { WhatIfCard } from "@/components/WhatIfCard";
import { NeedsAttentionCard } from "@/components/NeedsAttentionCard";
import { CumulativeGpaModal } from "@/components/CumulativeGpaModal";
import {
  semesterGPA,
  semesterProgress,
  courseCurrentPct,
  attendanceInfo,
  weightsTotal,
  projectedCumulativeGpa,
} from "@/lib/grades";
import { creditHoursLabel } from "@/lib/format";
import type { Course } from "@/types";
import type { TranslationKey } from "@/i18n/translations/en";

const attStatusColor: Record<"ok" | "warn" | "danger", string> = {
  ok: "var(--color-success)",
  warn: "#C77E2E",
  danger: "var(--color-danger)",
};

// Havi "watch" trigger windows — mirror UpcomingPanel: exams within 14 days,
// tasks within 7 days (both from today, dated + still ungraded).
const HAVI_EXAM_TYPES = ["quiz", "midterm", "final"];
const HAVI_TASK_TYPES = ["assignment", "project"];

export default function DashboardPage() {
  const { t } = useT();
  const store = useStore();
  const {
    hydrated,
    profileName,
    semester,
    courses,
    gpaMode,
    cumulativeGpa,
    cumulativeHours,
    setGpaMode,
    setCumulativeGpa,
    setCumulativeHours,
  } = store;
  const [revealGpa, setRevealGpa] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);

  const progress = useMemo(() => semesterProgress(semester), [semester]);
  const gpa = useMemo(() => semesterGPA(courses), [courses]);
  const projected = useMemo(
    () => projectedCumulativeGpa(courses, cumulativeGpa, cumulativeHours),
    [courses, cumulativeGpa, cumulativeHours]
  );
  const shownGpa = gpaMode === "cumulative" ? projected : gpa;

  // Time-of-day greeting + the profile name (gender-neutral Arabic). Falls back
  // to a name-less greeting when the profile has no name set.
  const greeting = (() => {
    const h = new Date().getHours();
    const part = h < 5 || h >= 23 ? "Default" : h < 12 ? "Morning" : "Evening";
    const name = profileName.trim();
    return name
      ? t(`greet${part}` as TranslationKey, { name })
      : t(`greet${part}NoName` as TranslationKey);
  })();

  const upcoming = useMemo(() => {
    const items = courses.flatMap((c) =>
      c.components
        .filter((comp) => comp.score == null)
        .map((comp) => ({ course: c.name, comp }))
    );
    items.sort((a, b) => {
      const da = a.comp.date ? +new Date(a.comp.date) : Infinity;
      const db = b.comp.date ? +new Date(b.comp.date) : Infinity;
      return da - db;
    });
    return items;
  }, [courses]);

  // Whether Havi should "watch" the Upcoming card: any dated, ungraded task
  // within 7 days or exam within 14 days.
  const hasNearDue = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMs = 864e5;
    return courses.some((c) =>
      c.components.some((comp) => {
        if (comp.score != null || !comp.date) return false;
        const diff = Math.round((+new Date(`${comp.date}T00:00:00`) - +today) / dayMs);
        if (diff < 0) return false;
        if (HAVI_EXAM_TYPES.includes(comp.type)) return diff <= 14;
        if (HAVI_TASK_TYPES.includes(comp.type)) return diff <= 7;
        return false;
      })
    );
  }, [courses]);

  // Cards mount/unmount as courses load and change — nudge Havi to re-place.
  useEffect(() => {
    if (!hydrated) return;
    const id = window.setTimeout(() => window.havi?.refresh(), 120);
    return () => window.clearTimeout(id);
  }, [hydrated, courses.length, hasNearDue]);

  if (!hydrated) {
    return <div className="h-40" />;
  }

  const divider = { borderColor: "var(--color-border)" };

  return (
    <div className="haven-fade-in">
      {/* Header */}
      <header
        className="haven-fade-up flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between mb-12"
        style={{ animationDelay: "0.02s" }}
      >
        <div className="min-w-0">
          <h1
            className="font-display text-[34px] leading-tight"
            style={{ color: "var(--color-ink)" }}
          >
            {greeting}
          </h1>
          <p className="text-[15px] mt-2.5" style={{ color: "var(--color-muted)" }}>
            {semester.name}
          </p>
        </div>
        <Link
          href="/courses"
          className="haven-btn shrink-0 inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-medium"
        >
          <Plus size={17} />
          {t("addCourse")}
        </Link>
      </header>

      {/* Two-column: main content + right panel */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_352px] gap-8">
        {/* Main column */}
        <div className="min-w-0">
          {/* Overview card */}
          <Card
            padding="p-0"
            className="haven-fade-up mb-12 overflow-hidden"
            style={{ animationDelay: "0.08s" }}
            data-havi-role="generic"
          >
            <div
              className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x"
              style={divider}
            >
              {/* Progress gauge */}
              <div className="flex flex-col items-center justify-center gap-4 p-8">
                <CircularProgress value={progress.pct} size={116} color="gradient">
                  <div className="flex flex-col items-center gap-0.5 leading-none">
                    <span className="font-display text-2xl" style={{ color: "var(--color-ink)" }}>
                      <CountUp value={Math.round(progress.pct)} decimals={0} suffix="%" />
                    </span>
                    <InfoPopover
                      label={t("progressInfo")}
                      trigger={
                        <ChevronDown size={16} className="haven-nudge" style={{ color: "var(--color-brass)" }} />
                      }
                    >
                      {t("progressInfo")}
                    </InfoPopover>
                  </div>
                </CircularProgress>
                <div className="text-center">
                  <div className="haven-label">{t("semesterProgress")}</div>
                  <div className="text-sm mt-2" style={{ color: "var(--color-ink)" }}>
                    {t("weekOf", { current: progress.currentWeek, total: progress.totalWeeks })}
                  </div>
                </div>
              </div>

              {/* GPA — live Semester / Cumulative modes, hidden by default */}
              <div className="relative flex flex-col items-center justify-center gap-3 p-8">
                {/* Cumulative GPA calculator trigger (one-time modal) */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setCalcOpen(true); }}
                  aria-label={t("calcCumGpa")}
                  title={t("calcCumGpa")}
                  className="absolute top-3 end-3 z-[2] inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors hover:bg-[var(--color-primary-soft)]"
                  style={{ color: "var(--color-primary)" }}
                >
                  <Calculator size={16} />
                </button>

                {/* Live mode toggle: Semester (out of 5) vs Cumulative (from current) */}
                <div className="inline-flex rounded-lg p-0.5" style={{ background: "var(--color-primary-soft)" }}>
                  {(["semester", "cumulative"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setGpaMode(m)}
                      aria-pressed={gpaMode === m}
                      className="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors"
                      style={
                        gpaMode === m
                          ? { background: "var(--color-surface)", color: "var(--color-primary)", boxShadow: "var(--shadow-card)" }
                          : { color: "var(--color-muted)" }
                      }
                    >
                      {t(m === "semester" ? "gpaModeSemester" : "gpaModeCumulative")}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setRevealGpa((v) => !v)}
                  className="flex flex-col items-center justify-center gap-2 text-center"
                >
                  <div className="haven-label">
                    {t(gpaMode === "cumulative" ? "gpaProjectedCumulative" : "semesterGpa")}
                  </div>
                  {shownGpa == null ? (
                    <>
                      <div className="font-display text-4xl" style={{ color: "var(--color-muted)" }}>—</div>
                      <div className="text-xs max-w-[11rem]" style={{ color: "var(--color-muted)" }}>
                        {gpaMode === "cumulative" ? t("gpaEnterCumulative") : t("noGradesYet")}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={revealGpa ? "haven-clear" : "haven-blur"}>
                        <span className="font-display text-[40px] leading-none" style={{ color: "var(--color-brass)" }}>
                          <CountUp value={shownGpa} decimals={2} />
                        </span>
                        <span className="text-base ml-1" style={{ color: "var(--color-muted)" }}>/ 5.0</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--color-muted)" }}>
                        {revealGpa ? <EyeOff size={12} /> : <Eye size={12} />}
                        {revealGpa ? t("clickHide") : t("clickReveal")}
                      </div>
                    </>
                  )}
                </button>

                {/* Cumulative inputs — the current GPA the projection starts from */}
                {gpaMode === "cumulative" && (
                  <div className="flex items-end justify-center gap-2">
                    <label className="flex flex-col items-center gap-1">
                      <span className="text-[10px] leading-tight text-center" style={{ color: "var(--color-muted)" }}>
                        {t("gpaCurrentCumulative")}
                      </span>
                      <input
                        type="number"
                        min="0"
                        max="5"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={cumulativeGpa || ""}
                        onChange={(e) => setCumulativeGpa(Number(e.target.value) || 0)}
                        className="w-20 rounded-lg border px-2 py-1 text-sm text-center outline-none transition-colors focus:border-[var(--color-primary)]"
                        style={{ borderColor: "var(--color-border)" }}
                      />
                    </label>
                    <label className="flex flex-col items-center gap-1">
                      <span className="text-[10px] leading-tight text-center" style={{ color: "var(--color-muted)" }}>
                        {t("gpaCompletedHours")}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        placeholder="0"
                        value={cumulativeHours || ""}
                        onChange={(e) => setCumulativeHours(Number(e.target.value) || 0)}
                        className="w-16 rounded-lg border px-2 py-1 text-sm text-center outline-none transition-colors focus:border-[var(--color-primary)]"
                        style={{ borderColor: "var(--color-border)" }}
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Upcoming */}
              <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="haven-label">{t("upcoming")}</div>
                <div className="font-display text-[40px] leading-none" style={{ color: "var(--color-ink)" }}>
                  <CountUp value={upcoming.length} decimals={0} />
                </div>
                <div className="inline-flex items-center gap-1.5 text-xs px-2" style={{ color: "var(--color-muted)" }}>
                  <CalendarClock size={12} />
                  {upcoming.length
                    ? t("upcomingNearest", { name: `${upcoming[0].course} · ${upcoming[0].comp.name}` })
                    : t("noUpcoming")}
                </div>
              </div>
            </div>
          </Card>

          {/* Needs attention */}
          <div className="haven-fade-up mb-12" style={{ animationDelay: "0.11s" }}>
            <NeedsAttentionCard />
          </div>

          {/* Courses */}
          <div
            className="haven-fade-up flex items-center justify-between mb-6"
            style={{ animationDelay: "0.14s" }}
          >
            <h2 className="font-display text-[22px]" style={{ color: "var(--color-ink)" }}>
              {t("coursesHeading")}
            </h2>
            {courses.length > 0 && (
              <Link href="/courses" className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
                {t("viewAll")}
              </Link>
            )}
          </div>

          {courses.length === 0 ? (
            <EmptyCourses />
          ) : (
            <div
              className="grid gap-6"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
            >
              {courses.map((c, i) => (
                <DashboardCourseCard key={c.id} course={c} index={i} />
              ))}
            </div>
          )}

          {/* What-if simulator */}
          {courses.length > 0 && (
            <div className="haven-fade-up mt-12" style={{ animationDelay: "0.2s" }}>
              <WhatIfCard />
            </div>
          )}
        </div>

        {/* Right panel */}
        <aside className="haven-fade-up flex flex-col gap-6" style={{ animationDelay: "0.12s" }}>
          <Card data-havi-role="generic">
            <MiniCalendar calendar={semester.calendarType} />
          </Card>
          <GpaGoalCard />
          <Card
            data-havi-role="upcoming"
            data-havi-near-due={hasNearDue ? "true" : "false"}
          >
            <h2 className="font-display text-lg mb-6" style={{ color: "var(--color-ink)" }}>
              {t("upcoming")}
            </h2>
            <UpcomingPanel courses={courses} calendar={semester.calendarType} />
          </Card>
        </aside>
      </div>

      <CumulativeGpaModal open={calcOpen} onClose={() => setCalcOpen(false)} />
    </div>
  );
}

function DashboardCourseCard({ course, index }: { course: Course; index: number }) {
  const { t, lang } = useT();
  const { semester } = useStore();
  const [revealed, setRevealed] = useState(false);
  const pct = courseCurrentPct(course);
  const att = attendanceInfo(course, semester);
  const used = Math.min(100, weightsTotal(course));

  const toggleGrade = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRevealed((v) => !v);
  };

  return (
    <div
      className="haven-fade-up h-full"
      style={{ animationDelay: `${0.18 + index * 0.07}s` }}
    >
      <Card hover className="relative h-full">
        {/* whole-card click target, sits beneath the interactive bits */}
        <Link
          href="/courses"
          aria-label={course.name}
          className="absolute inset-0 z-[1] rounded-3xl"
        />
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h3 className="font-display text-lg truncate" style={{ color: "var(--color-ink)" }}>
              {course.name}
            </h3>
            <span className="text-[13px] mt-2 block" style={{ color: "var(--color-muted)" }}>
              {creditHoursLabel(course.creditHours, lang)}
            </span>
          </div>

          {pct == null ? (
            <span className="shrink-0 text-sm" style={{ color: "var(--color-muted)" }}>—</span>
          ) : (
            <span
              role="button"
              tabIndex={0}
              aria-label={revealed ? t("clickHide") : t("clickReveal")}
              onClick={toggleGrade}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") toggleGrade(e);
              }}
              className="relative z-[2] shrink-0 flex flex-col items-end gap-1.5 cursor-pointer select-none"
            >
              <span className={revealed ? "haven-clear" : "haven-blur"}>
                <GradeBadge pct={pct} size="md" />
              </span>
              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--color-muted)" }}>
                {revealed ? <EyeOff size={11} /> : <Eye size={11} />}
                {revealed ? t("clickHide") : t("clickReveal")}
              </span>
            </span>
          )}
        </div>

        <ProgressBar value={used} height={6} className="mb-6" />

        {att ? (
          <div className="relative z-[2]">
            <div className="flex items-center justify-between gap-2">
              <AttendanceBadge status={att.status} explain limit={att.limit} />
              <span className="text-sm font-semibold" style={{ color: attStatusColor[att.status] }}>
                {att.absence.toFixed(1)}%
              </span>
            </div>
            <div className="text-[11px] mt-1.5" style={{ color: "var(--color-muted)" }}>
              {t("eachHour", { pct: att.unit.toFixed(1) })}
            </div>
          </div>
        ) : (
          <span className="text-[13px]" style={{ color: "var(--color-muted)" }}>
            {t("attendance")}: —
          </span>
        )}
      </Card>
    </div>
  );
}

function EmptyCourses() {
  const { t } = useT();
  return (
    <Card className="haven-fade-up flex flex-col items-center justify-center text-center py-16">
      <div
        className="flex items-center justify-center rounded-2xl mb-6"
        style={{ width: 60, height: 60, background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
      >
        <BookOpen size={26} />
      </div>
      <h3 className="font-display text-xl mb-2" style={{ color: "var(--color-ink)" }}>
        {t("emptyTitle")}
      </h3>
      <p className="max-w-sm text-[15px]" style={{ color: "var(--color-muted)" }}>
        {t("emptyHint")}
      </p>
    </Card>
  );
}
