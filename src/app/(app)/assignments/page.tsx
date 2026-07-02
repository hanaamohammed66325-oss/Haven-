"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, ChevronRight, GripVertical } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Card } from "@/components/Card";
import { formatShortDate } from "@/lib/dates";
import type { Course } from "@/types";

interface Task {
  name: string;
  type: string;
  weight: number;
  unit: "percent" | "points";
  total: number;
  score: number | null;
  date: string | null;
}

export default function TasksPage() {
  const { t, lang } = useT();
  const { hydrated, courses, semester, taskOrder, setTaskOrder } = useStore();

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

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

  if (!hydrated) return <div className="h-40" />;

  const fmtDate = (d: string | null) =>
    d ? formatShortDate(d, lang, semester.calendarType) : "—";
  const fmtWeight = (w: number, unit: "percent" | "points") =>
    unit === "percent" ? `${w}${t("unitPercent")}` : `${w} ${t("unitPoints")}`;

  const reorder = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = ordered.map((c) => c.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setTaskOrder(next);
  };

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
                dragging={dragId === course.id}
                over={overId === course.id && dragId !== course.id}
                onDragStart={() => setDragId(course.id)}
                onDragEnter={() => setOverId(course.id)}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                onDrop={() => { reorder(course.id); setDragId(null); setOverId(null); }}
                fmtDate={fmtDate}
                fmtWeight={fmtWeight}
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
  dragging,
  over,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
  fmtDate,
  fmtWeight,
}: {
  course: Course;
  dragging: boolean;
  over: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  fmtDate: (d: string | null) => string;
  fmtWeight: (w: number, u: "percent" | "points") => string;
}) {
  const { t } = useT();

  const tasks: Task[] = [...course.components]
    .map((c) => ({ name: c.name, type: c.type, weight: c.weight, unit: c.unit, total: c.total, score: c.score, date: c.date }))
    .sort((a, b) => (a.date ? +new Date(a.date) : Infinity) - (b.date ? +new Date(b.date) : Infinity));

  return (
    <section
      onDragOver={(e) => { e.preventDefault(); onDragEnter(); }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      style={{ opacity: dragging ? 0.5 : 1 }}
    >
      <Card
        padding="p-0"
        className="overflow-hidden"
        style={over ? { outline: "2px dashed var(--color-primary)", outlineOffset: 2 } : undefined}
      >
        {/* draggable header */}
        <div
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="flex items-center gap-2 px-5 py-4 border-b cursor-grab active:cursor-grabbing select-none"
          style={{ borderColor: "var(--color-border)", background: "var(--color-primary-soft)" }}
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
          className="hidden sm:grid grid-cols-12 gap-3 px-6 py-3 border-b text-[11px] font-semibold uppercase tracking-wider"
          style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}
        >
          <span className="col-span-5">{t("colItem")}</span>
          <span className="col-span-3">{t("colType")}</span>
          <span className="col-span-2 text-end">{t("colWeight")}</span>
          <span className="col-span-1 text-end">{t("colDate")}</span>
          <span className="col-span-1 text-end">{t("colScore")}</span>
        </div>

        <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
          {tasks.map((r, i) => (
            <Link
              key={`${course.id}-${r.name}-${i}`}
              href={`/courses#${course.id}`}
              className="group block px-6 py-3.5 transition-colors hover:bg-[var(--color-primary-soft)]/40"
            >
              {/* desktop grid */}
              <div className="hidden sm:grid grid-cols-12 gap-3 items-center">
                <span className="col-span-5 text-sm font-medium truncate" style={{ color: "var(--color-ink)" }}>{r.name}</span>
                <span className="col-span-3"><TypeBadge type={r.type} /></span>
                <span className="col-span-2 text-end text-xs" style={{ color: "var(--color-muted)" }}>{fmtWeight(r.weight, r.unit)}</span>
                <span className="col-span-1 text-end text-xs" style={{ color: "var(--color-muted)" }}>{fmtDate(r.date)}</span>
                <span className="col-span-1 text-end"><ScoreCell row={r} /></span>
              </div>

              {/* mobile stack */}
              <div className="sm:hidden flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate" style={{ color: "var(--color-ink)" }}>{r.name}</span>
                  <ScoreCell row={r} />
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: "var(--color-muted)" }}>
                  <TypeBadge type={r.type} />
                  <span>·</span>
                  <span>{fmtWeight(r.weight, r.unit)}</span>
                  <span>·</span>
                  <span>{fmtDate(r.date)}</span>
                </div>
              </div>
            </Link>
          ))}
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

function ScoreCell({ row }: { row: Task }) {
  const { t } = useT();
  if (row.score != null) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
        {row.score}
        <span className="text-xs font-normal" style={{ color: "var(--color-muted)" }}>/ {row.total}</span>
      </span>
    );
  }
  const past = row.date != null && row.date < new Date().toISOString().slice(0, 10);
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
