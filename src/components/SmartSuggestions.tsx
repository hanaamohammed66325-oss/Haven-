"use client";

import { useMemo, useState, useEffect, useRef } from "react";
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
  X,
} from "lucide-react";
import { useStore, useScheme } from "@/store";
import { useT } from "@/i18n";
import { buildSmartSuggestions, type SuggestionKind } from "@/lib/smartSuggestions";
import { claimSmartSeasonDisplay } from "@/lib/db";
import { holidayCalendar } from "@/lib/universityCountry";

const ICON: Record<SuggestionKind, React.ReactNode> = {
  "att-danger": <AlertTriangle size={14} />,
  "att-warn": <AlertTriangle size={14} />,
  exam: <GraduationCap size={14} />,
  task: <ClipboardList size={14} />,
  ungraded: <Sparkles size={14} />,
  checkin: <Zap size={14} />,
  "finals-week": <CalendarClock size={14} />,
  "midterm-week": <CalendarClock size={14} />,
  "gpa-goal": <TrendingUp size={14} />,
  "all-good": <CheckCircle2 size={14} />,
};

export function SmartSuggestions() {
  const { t } = useT();
  const { courses, semester, planner, gamification, gpaGoal, academic, attendanceEnabled, accountId } = useStore();
  const scheme = useScheme();

  const suggestions = useMemo(
    () =>
      buildSmartSuggestions(
        { courses, planner, semester, gamification, gpaGoal, scheme, holidayCalendar: holidayCalendar(academic), attendanceEnabled },
        t
      ),
    [courses, semester, planner, gamification, gpaGoal, scheme, academic, attendanceEnabled, t]
  );

  const seasonPrefix = `season:${semester.startDate}:${semester.endDate}:`;
  const seasonKeys = suggestions.filter(s => s.kind === "midterm-week" || s.kind === "finals-week").map(s => seasonPrefix + s.kind).join("|");
  const [display, setDisplay] = useState<{ uid: string; keys: string[] }>({ uid: "", keys: [] });
  const seasonRequest = useRef<{ signature: string; result: Promise<string[]> } | null>(null);
  useEffect(() => {
    let stopped = false;
    if (accountId && seasonKeys) {
      const signature = `${accountId}|${seasonKeys}`;
      if (seasonRequest.current?.signature !== signature) {
        seasonRequest.current = { signature, result: claimSmartSeasonDisplay(accountId, seasonKeys.split("|")) };
      }
      void seasonRequest.current.result.then(keys => {
        if (!stopped) setDisplay({ uid: accountId, keys });
      });
    }
    return () => { stopped = true; };
  }, [accountId, seasonKeys]);

  return (
    <div className="flex gap-2.5 overflow-x-auto pb-2 -mb-2 scrollbar-hide">
      {suggestions.filter(s => !(s.kind === "midterm-week" || s.kind === "finals-week") ||
        (display.uid === accountId && display.keys.includes(seasonPrefix + s.kind))).map((s) => {
        const chip = (
          <div
            key={s.id}
            className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm whitespace-nowrap shrink-0 transition-colors"
            style={{
              background: "var(--color-surface)",
              border: `1.5px solid color-mix(in srgb, ${s.color} 30%, transparent)`,
              color: "var(--color-ink)",
            }}
          >
            <span style={{ color: s.color }} className="shrink-0">{ICON[s.kind]}</span>
            <span className="font-medium">{s.text}</span>
            {(s.kind === "midterm-week" || s.kind === "finals-week") && <button type="button" aria-label={t("close")}
              onClick={() => setDisplay(d => ({ ...d, keys: d.keys.filter(k => k !== seasonPrefix + s.kind) }))}><X size={14} /></button>}
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
