"use client";

import Link from "next/link";
import { GraduationCap, ClipboardList, AlertTriangle, Clock } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { formatShortDate, formatTime, toISODate } from "@/lib/dates";
import { plannerItemDate, REMINDER_TAGS } from "@/lib/reminders";
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
  /** due date, or null when the item has no date set */
  date: string | null;
  /** "HH:MM" (24h) when the item carries a due time */
  time?: string | null;
  /** whole days until due, or null when undated */
  diffDays: number | null;
  bucket: "exam" | "task";
}

const EXAM_TYPES = ["quiz", "midterm", "final"];
const TASK_TYPES = ["assignment", "project"];
// Planner tags routed to each section (إجازة is never reminder-eligible).
const PLANNER_EXAM_TAGS = new Set(["tagExam", "tagQuiz"]);

export function UpcomingPanel({
  courses,
  calendar = "gregorian",
}: {
  courses: Course[];
  calendar?: CalendarType;
}) {
  const { t, lang } = useT();
  const { planner, semester } = useStore();

  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayMs = 864e5;
  const diffOf = (iso: string) => Math.round((+new Date(`${iso}T00:00:00`) - +todayMid) / dayMs);

  const all: UpItem[] = [];
  const seen = new Set<string>();
  const add = (it: UpItem) => {
    // De-dup by (date + title/note) across every source so nothing shows twice.
    const key = `${it.date ?? "nodate"}|${it.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    all.push(it);
  };

  // Course-derived items — every not-yet-graded item. Undated ones are collected
  // here but filtered out below by the near-term window. Past-dated ones drop off.
  courses.forEach((c) =>
    c.components
      .filter((comp) => comp.score == null && (comp.date == null || comp.date >= todayStr))
      .forEach((comp) => {
        if (!EXAM_TYPES.includes(comp.type) && !TASK_TYPES.includes(comp.type)) return;
        add({
          href: `/courses#${c.id}`,
          subtitle: c.name,
          name: comp.name,
          labelKey: `type_${comp.type}` as TranslationKey,
          date: comp.date,
          diffDays: comp.date == null ? null : diffOf(comp.date),
          bucket: EXAM_TYPES.includes(comp.type) ? "exam" : "task",
        });
      })
  );

  // Planner deadline chips — reminder-eligible tag + a specific day (not -1).
  // Their real date comes from the week's start date + weekday offset.
  planner.notes.forEach((n) => {
    if (!n.tag || !REMINDER_TAGS.has(n.tag)) return;
    if (n.day == null) return;
    const d = plannerItemDate(semester, n.week, n.day);
    if (!d) return;
    const iso = toISODate(d);
    if (iso < todayStr) return; // only what's still upcoming
    add({
      href: "/schedule",
      subtitle: t("tabPlanner"),
      name: n.text,
      labelKey: n.tag as TranslationKey,
      date: iso,
      time: n.dueTime ?? null,
      diffDays: diffOf(iso),
      bucket: PLANNER_EXAM_TAGS.has(n.tag) ? "exam" : "task",
    });
  });

  // Dated items first (soonest → latest); undated after. Timed before untimed same day.
  const byDate = (a: UpItem, b: UpItem) => {
    if (a.date == null && b.date == null) return 0;
    if (a.date == null) return 1;
    if (b.date == null) return -1;
    if (a.date !== b.date) return +new Date(a.date) - +new Date(b.date);
    const at = a.time ? 1 : 0;
    const bt = b.time ? 1 : 0;
    if (at !== bt) return bt - at;
    if (a.time && b.time) return a.time < b.time ? -1 : 1;
    return 0;
  };
  // Near-term windows: tasks within 7 days, exams within 14 days (both inclusive
  // of today). An item must have an actual date to appear — undated items are
  // hidden entirely — and anything dated beyond its window is hidden too.
  const within = (i: UpItem, days: number) =>
    i.diffDays != null && i.diffDays >= 0 && i.diffDays <= days;
  const exams = all.filter((i) => i.bucket === "exam" && within(i, 14)).sort(byDate);
  const tasks = all.filter((i) => i.bucket === "task" && within(i, 7)).sort(byDate);

  // Soonest dated exam within ~3 days gets the alert icon.
  const examAlert = exams[0] && exams[0].diffDays != null && exams[0].diffDays <= 3 ? exams[0] : undefined;

  const fmtDate = (d: string | null) => (d == null ? t("dateNotSpecified") : formatShortDate(d, lang, calendar));

  const countdown = (n: number | null) => {
    if (n == null || n < 0 || n > 14) return null;
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
            const urgent = it.diffDays != null && it.diffDays >= 0 && it.diffDays <= 3;
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
