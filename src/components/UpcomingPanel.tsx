"use client";

import Link from "next/link";
import { GraduationCap, ClipboardList, AlertTriangle, Clock } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { formatShortDate, formatTime } from "@/lib/dates";
import { buildUpcoming, type UpcomingEntry } from "@/lib/upcoming";
import type { Course, CalendarType } from "@/types";
import type { TranslationKey } from "@/i18n/translations/en";

interface UpItem {
  /** where clicking the row goes */
  href: string;
  /** small secondary line — course name, or "Planner" for planner chips */
  subtitle: string;
  name: string;
  /** translation key for the type/tag badge */
  labelKey: TranslationKey;
  /** due date — always set; undated items never reach the list */
  date: string;
  /** "HH:MM" (24h) when the item carries a due time */
  time?: string | null;
  /** whole days until due */
  diffDays: number;
  bucket: "exam" | "task";
}

export function UpcomingPanel({
  courses,
  calendar = "gregorian",
}: {
  courses: Course[];
  calendar?: CalendarType;
}) {
  const { t, lang } = useT();
  const { planner, semester } = useStore();

  // One shared builder feeds BOTH this list and the dashboard's UPCOMING count,
  // so the number and the rows can never disagree. It already applies the rule
  // (real date required; exams within 14 days, tasks within 7) and sorts.
  const entries = buildUpcoming(courses, planner, semester);

  const toItem = (e: UpcomingEntry): UpItem => ({
    href: e.href,
    subtitle: e.courseName ?? t("tabPlanner"),
    name: e.name,
    labelKey: (e.source === "course" ? `type_${e.kind}` : e.kind) as TranslationKey,
    date: e.date,
    time: e.time,
    diffDays: e.diffDays,
    bucket: e.bucket,
  });

  const exams = entries.filter((e) => e.bucket === "exam").map(toItem);
  const tasks = entries.filter((e) => e.bucket === "task").map(toItem);

  // Soonest exam within ~3 days gets the alert icon.
  const examAlert = exams[0] && exams[0].diffDays <= 3 ? exams[0] : undefined;

  const fmtDate = (d: string) => formatShortDate(d, lang, calendar);

  const countdown = (n: number) => {
    if (n < 0 || n > 14) return null;
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
                key={`${it.href}-${it.name}-${i}`}
                href={it.href}
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
                  <span className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium shrink-0"
                      style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
                    >
                      {t(it.labelKey)}
                    </span>
                    <span className="block text-xs truncate" style={{ color: "var(--color-muted)" }}>
                      {it.subtitle}
                    </span>
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
                <span className="flex flex-col items-end gap-1 shrink-0 mt-0.5">
                  <span className="text-xs whitespace-nowrap" style={{ color: "var(--color-muted)" }}>
                    {fmtDate(it.date)}
                  </span>
                  {it.time && (
                    <span className="inline-flex items-center gap-1 text-[11px] whitespace-nowrap" style={{ color: "var(--color-primary)" }}>
                      <Clock size={10} />
                      {formatTime(it.time, lang)}
                    </span>
                  )}
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
