"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { courseCurrentPct, pctToGrade, attendanceInfo, semesterProgress, semesterGPA } from "@/lib/grades";
import { buildUpcoming } from "@/lib/upcoming";
import { toISODate } from "@/lib/dates";

interface Suggestion {
  id: string;
  icon: React.ReactNode;
  text: string;
  href?: string;
  color: string;
  priority: number;
}

export function SmartSuggestions() {
  const { t } = useT();
  const { courses, semester, planner, gamification, gpaGoal } = useStore();
  const today = toISODate(new Date());
  const checkedIn = gamification.checkedInToday === today;

  const suggestions = useMemo(() => {
    const items: Suggestion[] = [];
    const now = new Date();

    // 1. Attendance danger/warn (merged from NeedsAttentionCard)
    for (const c of courses) {
      const att = attendanceInfo(c, semester);
      if (att?.status === "danger") {
        items.push({
          id: `att-danger-${c.id}`,
          icon: <AlertTriangle size={14} />,
          text: t("smart_attDanger", { course: c.name, n: att.absence.toFixed(0) }),
          href: `/courses#${c.id}`,
          color: "var(--color-danger)",
          priority: 1,
        });
      } else if (att?.status === "warn") {
        items.push({
          id: `att-warn-${c.id}`,
          icon: <AlertTriangle size={14} />,
          text: t("smart_attWarn", { course: c.name, n: att.absence.toFixed(0) }),
          href: `/courses#${c.id}`,
          color: "#C77E2E",
          priority: 2,
        });
      }
    }

    // 2. Low grade warning
    for (const c of courses) {
      const pct = courseCurrentPct(c);
      if (pct != null && pctToGrade(pct).points <= 3.0) {
        items.push({
          id: `grade-low-${c.id}`,
          icon: <TrendingUp size={14} />,
          text: t("smart_lowGrade", { course: c.name, letter: pctToGrade(pct).letter }),
          href: `/courses#${c.id}`,
          color: "var(--color-danger)",
          priority: 3,
        });
      }
    }

    // 3. Upcoming exams/quizzes (tomorrow or today)
    const upcoming = buildUpcoming(courses, planner, semester, now);
    const urgentExams = upcoming.filter(
      (u) => u.bucket === "exam" && u.diffDays <= 1
    );
    for (const exam of urgentExams.slice(0, 2)) {
      const when = exam.diffDays === 0 ? t("smart_today") : t("smart_tomorrow");
      items.push({
        id: `exam-${exam.date}-${exam.name}`,
        icon: <GraduationCap size={14} />,
        text: t("smart_examSoon", {
          name: exam.name,
          course: exam.courseName ?? "",
          when,
        }),
        href: exam.href,
        color: "var(--color-primary)",
        priority: 2,
      });
    }

    // 4. Tasks due this week
    const dueTasks = upcoming.filter((u) => u.bucket === "task");
    if (dueTasks.length > 0) {
      items.push({
        id: "tasks-due",
        icon: <ClipboardList size={14} />,
        text: t("smart_tasksDue", { n: dueTasks.length }),
        href: "/planner",
        color: "var(--color-brass)",
        priority: 4,
      });
    }

    // 5. Ungraded components with past dates
    let ungradedCount = 0;
    for (const c of courses) {
      for (const comp of c.components) {
        if (comp.score == null && comp.date && comp.date < today && comp.type !== "final") {
          ungradedCount++;
        }
      }
    }
    if (ungradedCount > 0) {
      items.push({
        id: "ungraded",
        icon: <Sparkles size={14} />,
        text: t("smart_ungraded", { n: ungradedCount }),
        href: "/courses",
        color: "var(--color-primary)",
        priority: 5,
      });
    }

    // 6. Check-in reminder
    if (!checkedIn) {
      const streak = gamification.streak.current;
      items.push({
        id: "checkin",
        icon: <Zap size={14} />,
        text: streak > 0
          ? t("smart_checkinStreak", { n: streak })
          : t("smart_checkin"),
        color: "var(--color-brass)",
        priority: 6,
      });
    }

    // 7. Exam week detection
    const progress = semesterProgress(semester);
    const isFinalsWeek =
      progress.currentWeek > semester.weeks &&
      progress.currentWeek <= semester.weeks + semester.finalsWeeks;
    const isMidtermWeek =
      progress.currentWeek >= Math.floor(semester.weeks / 2) - 1 &&
      progress.currentWeek <= Math.floor(semester.weeks / 2) + 1;
    if (isFinalsWeek) {
      items.push({
        id: "finals-week",
        icon: <CalendarClock size={14} />,
        text: t("smart_finalsWeek"),
        color: "var(--color-danger)",
        priority: 1,
      });
    } else if (isMidtermWeek) {
      items.push({
        id: "midterm-week",
        icon: <CalendarClock size={14} />,
        text: t("smart_midtermWeek"),
        color: "#C77E2E",
        priority: 3,
      });
    }

    // 8. GPA goal tracking
    if (gpaGoal > 0 && courses.some((c) => courseCurrentPct(c) != null)) {
      const currentGpa = semesterGPA(courses);
      if (currentGpa != null && currentGpa < gpaGoal && gpaGoal - currentGpa <= 0.5) {
        items.push({
          id: "gpa-goal",
          icon: <TrendingUp size={14} />,
          text: t("smart_gpaGoal", {
            current: currentGpa.toFixed(2),
            goal: gpaGoal.toFixed(1),
          }),
          color: "var(--color-primary)",
          priority: 5,
        });
      }
    }

    // 9. All good — positive message
    if (items.length === 0) {
      items.push({
        id: "all-good",
        icon: <CheckCircle2 size={14} />,
        text: t("smart_allGood"),
        color: "var(--color-success)",
        priority: 99,
      });
    }

    return items.sort((a, b) => a.priority - b.priority);
  }, [courses, semester, planner, gamification, gpaGoal, checkedIn, today, t]);

  return (
    <div className="flex gap-2.5 overflow-x-auto pb-2 -mb-2 scrollbar-hide">
      {suggestions.map((s) => {
        const chip = (
          <div
            key={s.id}
            className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm whitespace-nowrap shrink-0 transition-colors"
            style={{
              background: "var(--card-bg)",
              border: `1.5px solid color-mix(in srgb, ${s.color} 30%, transparent)`,
              color: "var(--color-ink)",
            }}
          >
            <span style={{ color: s.color }} className="shrink-0">{s.icon}</span>
            <span className="font-medium">{s.text}</span>
          </div>
        );

        if (s.href) {
          return (
            <Link key={s.id} href={s.href} className="shrink-0 no-underline hover:brightness-95 transition-all">
              {chip}
            </Link>
          );
        }
        return chip;
      })}
    </div>
  );
}
