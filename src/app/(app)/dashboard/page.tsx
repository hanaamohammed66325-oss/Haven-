"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Eye, EyeOff, CalendarClock, BookOpen, ChevronDown, Calculator, Info, ClipboardList, User, Calendar, Palette, Pencil } from "lucide-react";
import { useStore } from "@/store";
import { useT, usePageTitle } from "@/i18n";
import { Card } from "@/components/Card";
import { CircularProgress } from "@/components/CircularProgress";
import { InfoPopover } from "@/components/InfoPopover";
import { GradeBadge } from "@/components/GradeBadge";
import { AttendanceBadge } from "@/components/AttendanceBadge";

import { CountUp } from "@/components/CountUp";
import { MiniCalendar } from "@/components/MiniCalendar";
import { UpcomingPanel } from "@/components/UpcomingPanel";
import { buildUpcoming } from "@/lib/upcoming";
import { GpaGoalCard } from "@/components/GpaGoalCard";
import { WhatIfCard } from "@/components/WhatIfCard";
import { NeedsAttentionCard } from "@/components/NeedsAttentionCard";
import { CumulativeGpaModal } from "@/components/CumulativeGpaModal";
import {
  semesterGPA,
  semesterProgress,
  courseCurrentPct,
  attendanceInfo,
  projectedCumulativeGpa,
  STATUS_COLOR,
} from "@/lib/grades";
import { creditHoursLabel } from "@/lib/format";
import type { Course } from "@/types";
import type { TranslationKey } from "@/i18n/translations/en";

const CARD_PALETTE = [
  "#477680", "#5fa98c", "#e89b4a", "#8a6fb0", "#3b6ea5",
  "#b8975a", "#d9534f", "#6b8e9b", "#c06068", "#7b9e3b",
  "#d48cb7", "#4a90a4", "#e8a040", "#6c757d",
];

export default function DashboardPage() {
  const { t } = useT();
  usePageTitle("nav_dashboard");
  const store = useStore();
  const {
    hydrated,
    profileName,
    semester,
    courses,
    planner,
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

  // The SAME builder the Upcoming card renders from, so this count always
  // matches the rows in that list (real date required; exams within 14 days,
  // tasks within 7; undated items never counted).
  const upcoming = useMemo(
    () => buildUpcoming(courses, planner, semester),
    [courses, planner, semester]
  );

  // Whether Havi should "watch" the Upcoming card — true when it has anything
  // near-due, i.e. exactly when the list above is non-empty.
  const hasNearDue = upcoming.length > 0;

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
            data-havi-card
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

                <div className="flex flex-col items-center gap-2">
                  {/* Label + rounding-note info icon (outside the reveal button so
                      we don't nest buttons; the icon covers both GPA readings). */}
                  <div className="inline-flex items-center gap-1">
                    <span className="haven-label">
                      {t(gpaMode === "cumulative" ? "gpaProjectedCumulative" : "semesterGpa")}
                    </span>
                    <InfoPopover
                      label={t("gpaRoundingInfo")}
                      trigger={
                        <Info size={13} className="haven-nudge" style={{ color: "var(--color-muted)" }} />
                      }
                    >
                      {t("gpaRoundingNote")}
                    </InfoPopover>
                  </div>

                  <button
                    onClick={() => setRevealGpa((v) => !v)}
                    className="flex flex-col items-center justify-center gap-2 text-center"
                  >
                    {shownGpa == null ? (
                    gpaMode === "cumulative" ? (
                    <>
                      <div className="font-display text-4xl" style={{ color: "var(--color-muted)" }}>—</div>
                      <div className="text-xs max-w-[11rem]" style={{ color: "var(--color-muted)" }}>
                        {t("gpaEnterCumulative")}
                      </div>
                    </>
                    ) : (
                    <>
                      <div className={revealGpa ? "haven-clear" : "haven-blur"}>
                        <span className="inline-flex items-center gap-1">
                          <span className="font-display text-[40px] leading-none" style={{ color: "var(--color-brass)", opacity: 0.6 }}>
                            5.00
                          </span>
                          <span className="text-base" style={{ color: "var(--color-muted)" }}>/ 5.0</span>
                          <InfoPopover
                            label={t("gradeDescNote")}
                            trigger={
                              <Info size={14} className="haven-nudge" style={{ color: "var(--color-muted)" }} />
                            }
                          >
                            {t("gradeDescNote")}
                          </InfoPopover>
                        </span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--color-muted)" }}>
                        {revealGpa ? <EyeOff size={12} /> : <Eye size={12} />}
                        {revealGpa ? t("clickHide") : t("clickReveal")}
                      </div>
                    </>
                    )
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
                </div>

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
                    ? t("upcomingNearest", {
                        name: `${upcoming[0].courseName ?? t("tabPlanner")} · ${upcoming[0].name}`,
                      })
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

function gradeColor(pct: number | null): string {
  if (pct == null) return "var(--color-muted)";
  if (pct >= 90) return "var(--color-success)";
  if (pct >= 80) return "#2E7D32";
  if (pct >= 70) return "#C77E2E";
  if (pct >= 60) return "#E67E22";
  return "var(--color-danger)";
}

function DashboardCourseCard({ course, index }: { course: Course; index: number }) {
  const { t, lang } = useT();
  const { semester, planner, updateCourse } = useStore();
  const [revealed, setRevealed] = useState(false);
  const [editingInstructor, setEditingInstructor] = useState(false);
  const [instrDraft, setInstrDraft] = useState(course.instructorName ?? "");
  const [colorOpen, setColorOpen] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);
  const pct = courseCurrentPct(course);
  const att = attendanceInfo(course, semester);
  const cardColor = course.color;

  useEffect(() => {
    if (!colorOpen) return;
    const close = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [colorOpen]);

  const currentWeek = useMemo(() => semesterProgress(semester).currentWeek, [semester]);
  const weekTasks = useMemo(() => {
    return planner.notes.filter(
      (n) => n.week === currentWeek && !n.done
    ).length;
  }, [planner.notes, currentWeek]);

  const lectureDays = useMemo(() => {
    const days = [...new Set(course.sessions.map((s) => s.day))].sort();
    return days.map((d) => t(`day${d}Short` as TranslationKey));
  }, [course.sessions, t]);

  const toggleGrade = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRevealed((v) => !v);
  };

  const saveInstructor = () => {
    const name = instrDraft.trim();
    updateCourse(course.id, { instructorName: name || undefined });
    setEditingInstructor(false);
  };

  const gc = gradeColor(pct);

  return (
    <div
      className="haven-fade-up h-full"
      style={{ animationDelay: `${0.18 + index * 0.07}s` }}
    >
      <Card hover className="group relative h-full" style={cardColor ? { background: `${cardColor}10`, borderColor: `${cardColor}30` } : undefined}>
        <Link
          href="/courses"
          aria-label={course.name}
          className="absolute inset-0 z-[1] rounded-3xl"
        />
        {/* Color picker */}
        <div ref={colorRef} className="absolute top-2.5 end-2.5 z-[3]">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setColorOpen((v) => !v); }}
            className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110"
            style={cardColor ? { background: `${cardColor}25`, color: cardColor } : { background: "var(--color-primary-soft)", color: "var(--color-muted)" }}
            aria-label="Pick color"
          >
            <Palette size={13} />
          </button>
          {colorOpen && (
            <div
              className="absolute top-8 end-0 p-2 rounded-xl shadow-lg grid grid-cols-7 gap-1.5"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", minWidth: 170 }}
            >
              {CARD_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateCourse(course.id, { color: c }); setColorOpen(false); }}
                  className="w-5 h-5 rounded-full transition-transform hover:scale-125"
                  style={{
                    background: c,
                    outline: c === course.color ? "2px solid var(--color-ink)" : "none",
                    outlineOffset: 1,
                  }}
                />
              ))}
              <input
                type="color"
                value={course.color ?? "#477680"}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); updateCourse(course.id, { color: e.target.value }); }}
                className="w-5 h-5 rounded-full cursor-pointer border-0 p-0"
                style={{ appearance: "none", WebkitAppearance: "none" }}
                title="Custom"
              />
              {course.color && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateCourse(course.id, { color: undefined }); setColorOpen(false); }}
                  className="col-span-7 text-[10px] mt-1 py-1 rounded-lg transition-colors hover:bg-[var(--color-primary-soft)]"
                  style={{ color: "var(--color-muted)" }}
                >
                  {t("resetColor")}
                </button>
              )}
            </div>
          )}
        </div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="font-display text-lg line-clamp-2" style={{ color: "var(--color-ink)" }}>
              {course.name}
            </h3>
            <span className="text-[12px] mt-1 block" style={{ color: "var(--color-muted)" }}>
              {creditHoursLabel(course.creditHours, lang)}
              {course.instructorName && !editingInstructor && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInstrDraft(course.instructorName ?? ""); setEditingInstructor(true); }}
                  className="relative z-[2] inline-flex items-center gap-0.5 hover:opacity-70 transition-opacity"
                  style={{ color: "var(--color-muted)" }}
                >
                  <span> · {course.instructorName}</span>
                  <Pencil size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
                </button>
              )}
            </span>
          </div>

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
            {revealed ? <EyeOff size={14} color="var(--color-muted)" /> : <Eye size={14} color="var(--color-muted)" />}
          </span>
        </div>

        {/* Grade + Attendance chips */}
        <div className="flex gap-2 mb-3">
          {pct != null && (
            <div
              className="flex-1 rounded-lg px-2.5 py-2 text-center"
              style={{ background: `${gc}12` }}
            >
              <div className="text-sm font-semibold" style={{ color: gc }}>
                {Math.round(pct)}<span className="text-[11px] font-normal opacity-60">/100</span>
              </div>
              <div className="text-[10px]" style={{ color: gc, opacity: 0.7 }}>
                {t("currentTotal")}
              </div>
            </div>
          )}
          {att && (
            <div
              className="flex-1 rounded-lg px-2.5 py-2 text-center"
              style={{ background: `${STATUS_COLOR[att.status]}12` }}
            >
              <div className="text-sm font-semibold" style={{ color: STATUS_COLOR[att.status] }}>
                {att.absence.toFixed(1)}%
              </div>
              <div className="text-[10px]" style={{ color: STATUS_COLOR[att.status], opacity: 0.7 }}>
                {t("attendance")}
              </div>
            </div>
          )}
        </div>

        {/* Attendance badge */}
        {att && (
          <div className="relative z-[2] mb-2">
            <AttendanceBadge status={att.status} explain limit={att.limit} />
          </div>
        )}

        {/* Lecture days */}
        {lectureDays.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1 text-[11px]" style={{ color: "var(--color-muted)" }}>
            <Calendar size={12} />
            <span>{lectureDays.join(" · ")}</span>
          </div>
        )}

        {/* Tasks this week */}
        {weekTasks > 0 && (
          <div
            className="flex items-center gap-1.5 mt-2 text-[11px]"
            style={{ color: "var(--color-muted)" }}
          >
            <ClipboardList size={12} />
            <span>{t("tasksThisWeek")}</span>
            <span
              className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: "#C77E2E18", color: "#C77E2E" }}
            >
              {weekTasks}
            </span>
          </div>
        )}

        {/* Instructor hint */}
        {!course.instructorName && !editingInstructor && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingInstructor(true); }}
            className="relative z-[2] flex items-center gap-1 mt-2 text-[11px] transition-opacity hover:opacity-70"
            style={{ color: "var(--color-muted)" }}
          >
            <User size={12} />
            {t("addInstructor")}
          </button>
        )}
        {editingInstructor && (
          <div
            className="relative z-[2] flex items-center gap-1.5 mt-2"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              value={instrDraft}
              onChange={(e) => setInstrDraft(e.target.value)}
              placeholder={t("instructorName")}
              className="flex-1 text-[12px] rounded border px-2 py-1"
              style={{ borderColor: "var(--color-border)", minWidth: 0 }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") saveInstructor();
                else if (e.key === "Escape") setEditingInstructor(false);
              }}
            />
            <button
              onClick={saveInstructor}
              className="text-[10px] px-2 py-1 rounded font-medium"
              style={{ background: "var(--color-primary)", color: "#fff" }}
            >
              {t("save")}
            </button>
          </div>
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
