"use client";

import { Flame, Target, Clock, Leaf } from "lucide-react";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/translations/en";
import type { PomodoroStats as Stats } from "@/types";
import { toISODate } from "@/lib/dates";

interface Props {
  stats: Stats;
}

/** Last 7 calendar days of focus minutes, oldest → newest. */
function last7(stats: Stats): { date: string; minutes: number }[] {
  const out: { date: string; minutes: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const iso = toISODate(d);
    const rec = stats.recentDays.find((r) => r.date === iso);
    out.push({ date: iso, minutes: rec ? rec.totalFocusMinutes : 0 });
  }
  return out;
}

export function PomodoroStats({ stats }: Props) {
  const { t } = useT();
  const today = stats.recentDays.find((r) => r.date === toISODate(new Date()));
  const todayCount = today ? today.completedSessions : 0;
  const hours = Math.floor(stats.totalFocusMinutes / 60);
  const mins = stats.totalFocusMinutes % 60;
  const focusText = hours > 0 ? `${hours}${t("pom_hours")} ${mins}${t("pom_minutes")}` : `${mins} ${t("pom_minutes")}`;
  const bars = last7(stats);
  const maxMin = Math.max(30, ...bars.map((b) => b.minutes));

  // Use the app's canonical short day names (never truncated).
  const dayLabel = (dayIdx: number) => t(`day${dayIdx}Short` as TranslationKey);

  const tile = (icon: React.ReactNode, value: string, label: string) => (
    <div className="flex flex-col items-center gap-1 flex-1 py-3">
      <span style={{ color: "var(--color-primary)" }}>{icon}</span>
      <span className="text-lg font-semibold" style={{ color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      <span className="text-[11px] text-center" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
    </div>
  );

  return (
    <div className="haven-card p-4">
      <span className="haven-label block mb-2" style={{ color: "var(--color-muted)" }}>
        {t("pom_stats")}
      </span>

      <div className="flex divide-x" style={{ borderColor: "var(--color-border)" }}>
        {tile(<Target size={18} />, String(stats.totalSessions), t("pom_sessionsCompleted"))}
        {tile(<Clock size={18} />, focusText, t("pom_totalFocusTime"))}
        {tile(<Flame size={18} />, `${stats.currentDailyStreak}${t("pom_days")}`, t("pom_currentStreak"))}
        {tile(<Leaf size={18} />, String(stats.lilyPadCount), t("pom_lilyPads"))}
      </div>

      <div className="mt-4">
        <div className="flex items-end justify-between gap-1.5" style={{ height: 64 }}>
          {bars.map((b, i) => {
            const h = Math.round((b.minutes / maxMin) * 56);
            const isToday = i === 6;
            return (
              <div key={b.date} className="flex flex-col items-center gap-1 flex-1">
                <div className="w-full flex items-end justify-center" style={{ height: 56 }}>
                  <div
                    className="w-full rounded-t-md"
                    style={{
                      height: Math.max(3, h),
                      maxWidth: 22,
                      background: isToday ? "var(--color-primary)" : "var(--color-primary-soft)",
                      transition: "height 0.4s ease",
                    }}
                    title={`${b.minutes} ${t("pom_minutes")}`}
                  />
                </div>
                <span className="text-[10px] whitespace-nowrap" style={{ color: "var(--color-muted)" }}>
                  {dayLabel(new Date(b.date + "T00:00:00").getDay())}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px]" style={{ color: "var(--color-muted)" }}>
            {t("pom_last7Days")}
          </span>
          <span className="text-[11px]" style={{ color: "var(--color-muted)" }}>
            {t("pom_todaySessions")}: {todayCount}
          </span>
        </div>
      </div>
    </div>
  );
}
