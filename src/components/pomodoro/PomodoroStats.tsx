"use client";

import { Flame, Target, Clock, Leaf } from "lucide-react";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/translations/en";
import type { PomodoroStats as Stats } from "@/types";
import { addDays, toISODate } from "@/lib/dates";
import { spokenDuration } from "@/lib/format";

interface Props {
  stats: Stats;
}

/** Last 7 calendar days of session minutes, oldest → newest. */
function last7(stats: Stats): { date: string; minutes: number }[] {
  const out: { date: string; minutes: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const iso = toISODate(addDays(now, -i));
    const rec = stats.recentDays.find((r) => r.date === iso);
    out.push({ date: iso, minutes: rec ? rec.totalFocusMinutes : 0 });
  }
  return out;
}

// "Your progress" (a sheet over the pond): today in one line, four totals, and
// the last seven days.
export function PomodoroStats({ stats }: Props) {
  const { t } = useT();
  const dur = (m: number) => (m > 0 ? spokenDuration(m, t) : "0");
  const today = stats.recentDays.find((r) => r.date === toISODate(new Date()));
  const todayLine = today?.completedSessions
    ? t("pom_todayLine", { sessions: t("pom_sessionsCount", { n: today.completedSessions }), time: dur(today.totalFocusMinutes) })
    : t("pom_todayNone");
  const bars = last7(stats);
  const maxMin = Math.max(30, ...bars.map((b) => b.minutes));

  // Use the app's canonical short day names (never truncated).
  const dayLabel = (dayIdx: number) => t(`day${dayIdx}Short` as TranslationKey);

  const tile = (icon: React.ReactNode, label: string, value: string) => (
    <div className="rounded-2xl px-3 py-3 sm:px-3.5" style={{ background: "color-mix(in srgb, var(--color-ink) 4%, transparent)" }}>
      <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-muted)" }}>
        <span style={{ color: "var(--color-primary)" }}>{icon}</span>
        {label}
      </span>
      <span className="mt-1 block text-[15px] font-semibold leading-snug tabular-nums text-balance" style={{ color: "var(--color-ink)" }}>
        {value}
      </span>
    </div>
  );

  return (
    <div>
      <p className="text-sm" style={{ color: "var(--color-muted)" }}>
        {todayLine}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {tile(<Target size={14} />, t("pom_sessionsCompleted"), String(stats.totalSessions))}
        {tile(<Clock size={14} />, t("pom_totalFocusTime"), dur(stats.totalFocusMinutes))}
        {tile(
          <Flame size={14} />,
          t("pom_currentStreak"),
          stats.currentDailyStreak ? t("pom_daysCount", { n: stats.currentDailyStreak }) : "0",
        )}
        {tile(<Leaf size={14} />, t("pom_lilyPads"), String(stats.lilyPadCount))}
      </div>

      <p className="mt-6 text-xs" style={{ color: "var(--color-muted)" }}>
        {t("pom_last7Days")}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2">
        {bars.map((b, i) => {
          const isToday = i === 6;
          return (
            <div key={b.date} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full items-end justify-center" style={{ height: 64 }}>
                <div
                  className="w-full rounded-full"
                  style={{
                    height: Math.max(6, Math.round((b.minutes / maxMin) * 64)),
                    maxWidth: 18,
                    background: isToday ? "var(--color-primary)" : "color-mix(in srgb, var(--color-primary) 28%, transparent)",
                    transition: "height 0.4s ease",
                  }}
                  title={dur(b.minutes)}
                />
              </div>
              <span
                className={`whitespace-nowrap text-[11px] ${isToday ? "font-semibold" : ""}`}
                style={{ color: isToday ? "var(--color-ink)" : "var(--color-muted)" }}
              >
                {dayLabel(new Date(b.date + "T00:00:00").getDay())}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
