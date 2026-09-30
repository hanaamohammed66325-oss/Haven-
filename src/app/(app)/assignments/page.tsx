"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ClipboardList, ChevronRight, GripVertical, Timer, Check } from "lucide-react";
import { useStore } from "@/store";
import { useT, usePageTitle } from "@/i18n";
import { Card } from "@/components/Card";
import { formatShortDate, toISODate } from "@/lib/dates";
import { spokenDuration } from "@/lib/format";
import { semesterProgress } from "@/lib/grades";
import { usePointerReorder, type PointerReorder } from "@/lib/usePointerReorder";
import { POMODORO_ENABLED } from "@/lib/featureFlags";
import { componentTaskKey, focusTasks, kindOf } from "@/lib/pomodoro/focusTasks";
import type { ComponentType, Course, TaskFocus } from "@/types";

interface Task {
  id: string;
  name: string;
  type: ComponentType;
  weight: number;
  unit: "percent" | "points";
  total: number;
  score: number | null;
  date: string | null;
}

export default function TasksPage() {
  const { t, lang } = useT();
  usePageTitle("nav_assignments");
  const { hydrated, courses, semester, taskOrder, setTaskOrder, planner, taskFocus } = useStore();

  // Assessments that can be focused on in Pomodoro ("focus on it" opens it there).
  const focusable = useMemo(
    () =>
      POMODORO_ENABLED
        ? new Set(focusTasks(courses, planner.notes, semesterProgress(semester).currentWeek, taskFocus).map((x) => x.key))
        : null,
    [courses, planner.notes, semester, taskFocus],
  );


  // Courses that actually have tasks, arranged by the saved order
  // (unknown courses keep their natural order at the end).
  const ordered = useMemo(() => {
    const withTasks = courses.filter((c) => c.components.length > 0);
    const pos = (id: string) => {
      const i = taskOrder.indexOf(id);
      return i === -1 ? Number.POSITIVE_INFINITY : i;
    };
    return [...withTasks].sort((a, b) => pos(a.id) - pos(b.id));
  }, [courses, taskOrder]);

  /* Pointer-based reorder — works with mouse AND touch. HTML5 `draggable`
     never fires for touch in iOS Safari, so the handle did nothing on iPad. */
  const orderedIds = useMemo(() => ordered.map((c) => c.id), [ordered]);
  const { dragId, overId, registerEl, handleProps } = usePointerReorder(
    orderedIds,
    setTaskOrder
  );

  if (!hydrated) return <div className="h-40" />;

  const fmtDate = (d: string | null) =>
    d ? formatShortDate(d, lang, semester.calendarType) : "—";
  const fmtWeight = (w: number, unit: "percent" | "points") =>
    unit === "percent" ? `${w}${t("unitPercent")}` : `${w} ${t("unitPoints")}`;


  return (
    <div className="haven-fade-in">
      <h1 className="font-display text-[34px] leading-tight" style={{ color: "var(--color-ink)" }}>
        {t("assignmentsTitle")}
      </h1>
      <p className="text-[15px] mt-3 mb-10" style={{ color: "var(--color-muted)" }}>
        {t("assignmentsSubtitle")}
      </p>

      {ordered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center text-center py-16">
          <div
            className="flex items-center justify-center rounded-2xl mb-4"
            style={{ width: 56, height: 56, background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
          >
            <ClipboardList size={24} />
          </div>
          <h3 className="font-display text-xl mb-2" style={{ color: "var(--color-ink)" }}>{t("assignmentsEmpty")}</h3>
          <p className="max-w-sm text-[15px]" style={{ color: "var(--color-muted)" }}>{t("emptyHint")}</p>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4 text-xs" style={{ color: "var(--color-muted)" }}>
            <GripVertical size={14} />
            {t("tasksDragHint")}
          </div>
          <div className="flex flex-col gap-5">
            {ordered.map((course) => (
              <CourseSection
                key={course.id}
                course={course}
                registerEl={registerEl}
                handleProps={handleProps(course.id)}
                dragging={dragId === course.id}
                over={overId === course.id && dragId !== course.id}
                fmtDate={fmtDate}
                fmtWeight={fmtWeight}
                focusable={focusable}
                taskFocus={taskFocus}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CourseSection({
  course,
  registerEl,
  handleProps,
  dragging,
  over,
  fmtDate,
  fmtWeight,
  focusable,
  taskFocus,
}: {
  course: Course;
  registerEl: (id: string, el: HTMLElement | null) => void;
  handleProps: ReturnType<PointerReorder["handleProps"]>;
  dragging: boolean;
  over: boolean;
  fmtDate: (d: string | null) => string;
  fmtWeight: (w: number, u: "percent" | "points") => string;
  /** task keys Pomodoro can focus on; null when Pomodoro is off */
  focusable: Set<string> | null;
  taskFocus: Record<string, TaskFocus>;
}) {
  const { t } = useT();
  const focusTime = (id: string) => {
    const m = taskFocus[componentTaskKey(id)]?.minutes ?? 0;
    return m > 0 ? t("pom_focusedChip", { time: spokenDuration(m, t) }) : null;
  };
  // the header and the rows share these, so the columns line up
  const endPad = focusable ? "pe-3" : "pe-6";
  const focusSlot = "w-9 me-3 shrink-0";

  const tasks: Task[] = [...course.components]
    .map((c) => ({ id: c.id, name: c.name, type: c.type, weight: c.weight, unit: c.unit, total: c.total, score: c.score, date: c.date }))
    .sort((a, b) => (a.date ? +new Date(a.date) : Infinity) - (b.date ? +new Date(b.date) : Infinity));

  return (
    <section
      ref={(el) => registerEl(course.id, el)}
      style={{ opacity: dragging ? 0.5 : 1 }}
    >
      <Card
        padding="p-0"
        className="overflow-hidden"
        style={over ? { outline: "2px dashed var(--color-primary)", outlineOffset: 2 } : undefined}
      >
        {/* Drag handle. handleProps carries `touch-action: none`, which is what
            makes this work on iPad — without it Safari claims the gesture as a
            page scroll and never delivers pointermove. It's scoped to the
            handle only, so the rest of the page still scrolls normally. */}
        <div
          {...handleProps}
          data-havi-avoid
          data-drag-handle={course.id}
          className="flex items-center gap-2 px-5 py-4 border-b cursor-grab active:cursor-grabbing select-none"
          style={{
            borderColor: "var(--color-border)",
            background: "var(--color-primary-soft)",
            ...handleProps.style,
          }}
        >
          <GripVertical size={16} style={{ color: "var(--color-muted)" }} />
          <h2 className="font-display text-lg flex-1 truncate" style={{ color: "var(--color-ink)" }}>
            {course.name}
          </h2>
          <span
            className="inline-flex items-center justify-center rounded-full px-2 min-w-[22px] h-[22px] text-xs font-semibold"
            style={{ background: "var(--color-surface)", color: "var(--color-primary)" }}
          >
            {tasks.length}
          </span>
        </div>

        {/* column header (desktop) */}
        <div
          className="hidden sm:flex items-center border-b text-[11px] font-semibold uppercase tracking-wider"
          style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}
        >
          <div className={`flex-1 grid grid-cols-12 gap-3 ps-6 py-3 ${endPad}`}>
            <span className="col-span-5">{t("colItem")}</span>
            <span className="col-span-3">{t("colType")}</span>
            <span className="col-span-2 text-end">{t("colWeight")}</span>
            <span className="col-span-1 text-end">{t("colDate")}</span>
            <span className="col-span-1 text-end">{t("colScore")}</span>
          </div>
          {focusable && <span className={focusSlot} />}
        </div>

        <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
          {tasks.map((r) => {
            const key = componentTaskKey(r.id);
            const done = !!taskFocus[key]?.done;
            const focused = focusTime(r.id);
            return (
              <div key={r.id} className="flex items-center transition-colors hover:bg-[var(--color-primary-soft)]/40">
                <Link
                  href={`/courses#${course.id}`}
                  className={`flex-1 min-w-0 block ps-6 py-3.5 ${endPad}`}
                >
                  {/* desktop grid */}
                  <div className="hidden sm:grid grid-cols-12 gap-3 items-center">
                    <span className="col-span-5 min-w-0">
                      <span className="block text-sm font-medium truncate" style={{ color: "var(--color-ink)" }}>{r.name}</span>
                      {focused && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--color-muted)" }}>
                          <Timer size={11} />
                          {focused}
                        </span>
                      )}
                    </span>
                    <span className="col-span-3"><TypeBadge type={r.type} /></span>
                    <span className="col-span-2 text-end text-xs" style={{ color: "var(--color-muted)" }}>{fmtWeight(r.weight, r.unit)}</span>
                    <span className="col-span-1 text-end text-xs" style={{ color: "var(--color-muted)" }}>{fmtDate(r.date)}</span>
                    <span className="col-span-1 text-end"><ScoreCell row={r} done={done} /></span>
                  </div>

                  {/* mobile stack */}
                  <div className="sm:hidden flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: "var(--color-ink)" }}>{r.name}</span>
                      <ScoreCell row={r} done={done} />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: "var(--color-muted)" }}>
                      <TypeBadge type={r.type} />
                      <span>·</span>
                      <span>{fmtWeight(r.weight, r.unit)}</span>
                      <span>·</span>
                      <span>{fmtDate(r.date)}</span>
                      {focused && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Timer size={11} />
                            {focused}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
                {focusable && (
                  <div className={focusSlot}>
                    {focusable.has(key) && (
                      <Link
                        href={`/pomodoro?task=${encodeURIComponent(key)}`}
                        aria-label={`${t("pom_focusOnIt")}: ${r.name}`}
                        title={t("pom_focusOnIt")}
                        className="grid place-items-center w-9 h-9 rounded-full transition-colors hover:bg-[var(--color-primary-soft)]"
                        style={{ color: "var(--color-primary)" }}
                      >
                        <Timer size={17} />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </section>
  );
}

function TypeBadge({ type }: { type: string }) {
  const { t } = useT();
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
    >
      {t(`type_${type}` as Parameters<typeof t>[0])}
    </span>
  );
}

function ScoreCell({ row, done }: { row: Task; done: boolean }) {
  const { t } = useT();
  if (row.score != null) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
        {row.score}
        <span className="text-xs font-normal" style={{ color: "var(--color-muted)" }}>/ {row.total}</span>
      </span>
    );
  }
  // marked done in Pomodoro, grade not in yet
  if (done) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
        style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
      >
        <Check size={11} />
        {kindOf(row.type) === "exam" ? t("pom_prepared") : t("pom_submitted")}
      </span>
    );
  }
  const past = row.date != null && row.date < toISODate(new Date());
  if (!past) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{ background: "var(--color-primary-soft)", color: "var(--color-success)" }}
      >
        <ChevronRight size={11} className="rtl:rotate-180" />
        {t("statusUpcoming")}
      </span>
    );
  }
  return <span className="text-xs" style={{ color: "var(--color-muted)" }}>{t("statusUngraded")}</span>;
}
