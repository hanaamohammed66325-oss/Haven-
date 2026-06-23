"use client";

import Link from "next/link";
import { GraduationCap, ClipboardList, AlertTriangle } from "lucide-react";
import { useT } from "@/i18n";
import { formatShortDate } from "@/lib/dates";
import type { Course, CalendarType } from "@/types";

interface UpItem {
  courseId: string;
  courseName: string;
  name: string;
  type: string;
  date: string;
  diffDays: number;
}

const EXAM_TYPES = ["quiz", "midterm", "final"];
const TASK_TYPES = ["assignment", "project"];

export function UpcomingPanel({
  courses,
  calendar = "gregorian",
}: {
  courses: Course[];
  calendar?: CalendarType;
}) {
  const { t, lang } = useT();

  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayMs = 864e5;

  const all: UpItem[] = courses.flatMap((c) =>
    c.components
      .filter((comp) => comp.score == null && comp.date != null && comp.date >= todayStr)
      .map((comp) => ({
        courseId: c.id,
        courseName: c.name,
        name: comp.name,
        type: comp.type,
        date: comp.date as string,
        diffDays: Math.round((+new Date(comp.date as string) - +todayMid) / dayMs),
      }))
  );
  const byDate = (a: UpItem, b: UpItem) => +new Date(a.date) - +new Date(b.date);
  const exams = all.filter((i) => EXAM_TYPES.includes(i.type)).sort(byDate);
  const tasks = all.filter((i) => TASK_TYPES.includes(i.type)).sort(byDate);

  // Soonest exam within ~3 days gets the alert icon.
  const examAlert = exams[0] && exams[0].diffDays <= 3 ? exams[0] : undefined;

  const fmtDate = (d: string) => formatShortDate(d, lang, calendar);

  const countdown = (n: number) => {
    if (n < 0 || n > 7) return null;
    if (n === 0) return t("dueToday");
    if (n === 1) return t("dueTomorrow");
    return t("dueInDays", { n });
  };

  const Section = ({
    title,
    icon,
    items,
    alertItem,
  }: {
    title: string;
    icon: React.ReactNode;
    items: UpItem[];
    alertItem?: UpItem;
  }) => (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: "var(--color-primary)" }}>{icon}</span>
        <span className="haven-label" style={{ color: "var(--color-ink)" }}>{title}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] py-1" style={{ color: "var(--color-muted)" }}>{t("noUpcoming")}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((it, i) => {
            const cd = countdown(it.diffDays);
            const urgent = it.diffDays >= 0 && it.diffDays <= 3;
            const isAlert = alertItem === it;
            return (
              <Link
                key={`${it.courseId}-${it.name}-${i}`}
                href={`/courses#${it.courseId}`}
                className="group flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 -mx-1 transition-colors hover:bg-[var(--color-primary-soft)]"
                style={isAlert ? { background: "#FEF3E2" } : undefined}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {isAlert && <AlertTriangle size={13} className="shrink-0" style={{ color: "#C77E2E" }} />}
                    <span className="block text-sm font-medium truncate" style={{ color: "var(--color-ink)" }}>
                      {it.name}
                    </span>
                  </span>
                  <span className="block text-xs truncate mt-0.5" style={{ color: "var(--color-muted)" }}>
                    {it.courseName}
                  </span>
                  {cd && (
                    <span
                      className="inline-block text-[11px] font-medium mt-1 rounded-full px-2 py-0.5"
                      style={
                        urgent
                          ? { background: "#FEF3E2", color: "#C77E2E" }
                          : { background: "var(--color-brass-soft)", color: "var(--color-brass)" }
                      }
                    >
                      {cd}
                    </span>
                  )}
                </span>
                <span className="text-xs whitespace-nowrap shrink-0 mt-0.5" style={{ color: "var(--color-muted)" }}>
                  {fmtDate(it.date)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <Section title={t("examsHeading")} icon={<GraduationCap size={16} />} items={exams} alertItem={examAlert} />
      <div className="border-t" style={{ borderColor: "var(--color-border)" }} />
      <Section title={t("assignmentsTitle")} icon={<ClipboardList size={16} />} items={tasks} />
    </div>
  );
}
