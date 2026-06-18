"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Eye, EyeOff, CalendarClock, BookOpen } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Card } from "@/components/Card";
import { CircularProgress } from "@/components/CircularProgress";
import { GradeBadge } from "@/components/GradeBadge";
import { AttendanceBadge } from "@/components/AttendanceBadge";
import { ProgressBar } from "@/components/ProgressBar";
import {
  semesterGPA,
  semesterProgress,
  courseCurrentPct,
  attendanceInfo,
  weightsTotal,
} from "@/lib/grades";
import type { Course } from "@/types";

export default function DashboardPage() {
  const { t } = useT();
  const store = useStore();
  const { hydrated, profileName, semester, courses } = store;
  const [revealGpa, setRevealGpa] = useState(false);

  const progress = useMemo(() => semesterProgress(semester), [semester]);
  const gpa = useMemo(() => semesterGPA(courses), [courses]);

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

  const avgAttendance = useMemo(() => {
    const rated = courses
      .map((c) => attendanceInfo(c))
      .filter((x): x is NonNullable<typeof x> => x != null);
    if (!rated.length) return null;
    const rate = rated.reduce((s, x) => s + x.rate, 0) / rated.length;
    const absence = 100 - rate;
    const status: "ok" | "warn" | "danger" =
      absence >= 25 ? "danger" : absence >= 18 ? "warn" : "ok";
    return { rate, status };
  }, [courses]);

  if (!hydrated) {
    return <div className="haven-fade-in h-40" />;
  }

  return (
    <div className="haven-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-7 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            {profileName
              ? t("welcomeBack", { name: profileName })
              : t("welcomeBackNoName")}
          </h1>
          <p className="text-sm mt-1.5" style={{ color: "var(--color-muted)" }}>
            {semester.name}
          </p>
        </div>
        <Link
          href="/courses"
          className="haven-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
        >
          <Plus size={17} />
          {t("addCourse")}
        </Link>
      </div>

      {/* Overview card */}
      <Card padding="p-0" className="mb-8 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x" style={{ borderColor: "var(--color-border)" }}>
          {/* Progress gauge */}
          <div className="flex flex-col items-center justify-center gap-3 p-6">
            <CircularProgress value={progress.pct} size={104} color="gradient">
              <span className="text-xl font-semibold haven-grad-text">
                {Math.round(progress.pct)}%
              </span>
            </CircularProgress>
            <div className="text-center">
              <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>
                {t("semesterProgress")}
              </div>
              <div className="text-sm mt-0.5" style={{ color: "var(--color-ink)" }}>
                {t("weekOf", { current: progress.currentWeek, total: progress.totalWeeks })}
              </div>
            </div>
          </div>

          {/* GPA (hidden by default) */}
          <button
            onClick={() => setRevealGpa((v) => !v)}
            className="flex flex-col items-center justify-center gap-2 p-6 text-center transition-colors hover:bg-black/[0.015]"
          >
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>
              {t("semesterGpa")}
            </div>
            {gpa == null ? (
              <>
                <div className="text-3xl font-semibold" style={{ color: "var(--color-muted)" }}>—</div>
                <div className="text-xs" style={{ color: "var(--color-muted)" }}>{t("noGradesYet")}</div>
              </>
            ) : (
              <>
                <div className={revealGpa ? "haven-clear" : "haven-blur"}>
                  <span className="text-3xl font-semibold haven-grad-text">{gpa.toFixed(2)}</span>
                  <span className="text-base" style={{ color: "var(--color-muted)" }}> / 5.0</span>
                </div>
                <div className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
                  {revealGpa ? <EyeOff size={12} /> : <Eye size={12} />}
                  {revealGpa ? t("clickHide") : t("clickReveal")}
                </div>
              </>
            )}
          </button>

          {/* Upcoming */}
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>
              {t("upcoming")}
            </div>
            <div className="text-3xl font-semibold" style={{ color: "var(--color-ink)" }}>
              {upcoming.length}
            </div>
            <div className="inline-flex items-center gap-1 text-xs px-2" style={{ color: "var(--color-muted)" }}>
              <CalendarClock size={12} />
              {upcoming.length
                ? t("upcomingNearest", { name: `${upcoming[0].course} · ${upcoming[0].comp.name}` })
                : t("noUpcoming")}
            </div>
          </div>

          {/* Avg attendance */}
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>
              {t("avgAttendance")}
            </div>
            {avgAttendance == null ? (
              <div className="text-3xl font-semibold" style={{ color: "var(--color-muted)" }}>—</div>
            ) : (
              <>
                <div
                  className="text-3xl font-semibold"
                  style={{
                    color:
                      avgAttendance.status === "danger"
                        ? "var(--color-danger)"
                        : avgAttendance.status === "warn"
                        ? "#C77E2E"
                        : "var(--color-success)",
                  }}
                >
                  {Math.round(avgAttendance.rate)}%
                </div>
                <AttendanceBadge
                  status={avgAttendance.status}
                  absence={100 - avgAttendance.rate}
                />
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Courses */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
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
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {courses.map((c) => (
            <DashboardCourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardCourseCard({ course }: { course: Course }) {
  const { t } = useT();
  const pct = courseCurrentPct(course);
  const att = attendanceInfo(course);
  const used = Math.min(100, weightsTotal(course));

  return (
    <Link href="/courses">
      <Card hover padding="p-4" className="h-full">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h3 className="font-medium truncate" style={{ color: "var(--color-ink)" }}>
              {course.name}
            </h3>
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              {t("creditsShort", { n: course.creditHours })}
            </span>
          </div>
          <GradeBadge pct={pct} showPct size="md" />
        </div>

        <ProgressBar value={used} height={5} className="mb-3" />

        {att ? (
          <AttendanceBadge status={att.status} absence={att.absence} />
        ) : (
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            {t("attendance")}: —
          </span>
        )}
      </Card>
    </Link>
  );
}

function EmptyCourses() {
  const { t } = useT();
  return (
    <Card className="flex flex-col items-center justify-center text-center py-14">
      <div
        className="flex items-center justify-center rounded-2xl mb-4"
        style={{ width: 56, height: 56, background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
      >
        <BookOpen size={24} />
      </div>
      <h3 className="font-semibold mb-1.5" style={{ color: "var(--color-ink)" }}>
        {t("emptyTitle")}
      </h3>
      <p className="max-w-sm text-sm" style={{ color: "var(--color-muted)" }}>
        {t("emptyHint")}
      </p>
    </Card>
  );
}
