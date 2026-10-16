"use client";
import { InteractionButton } from "@/components/motion/Interaction";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Flame, Target, Clock, Leaf, ChevronLeft, ChevronRight } from "@/components/motion/icons";
import { useT } from "@/i18n";
import type { PomodoroStats as Stats } from "@/types";
import { toISODate } from "@/lib/dates";
import { spokenDuration } from "@/lib/format";
import { achievementBuckets, achievementPeriodId, prepareAchievementHistory, type AchievementMode, type AchievementSemester } from "@/lib/pomodoro/achievementHistory";

export function PomodoroStats({ stats, semester }: { stats: Stats; semester: AchievementSemester }) {
  const { t, lang, dir } = useT();
  const reduced = useReducedMotion();
  const today = toISODate(new Date());
  const [mode, setMode] = useState<AchievementMode>("weekly");
  const [windowEnd, setWindowEnd] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [summary, setSummary] = useState(false);
  const history = useMemo(() => prepareAchievementHistory(stats, semester), [stats, semester]);
  const period = history.periods[achievementPeriodId(semester)];
  const buckets = useMemo(() => achievementBuckets(period, mode, today), [period, mode, today]);
  const count = mode === "daily" ? 7 : 6;
  const end = Math.min(windowEnd ?? buckets.length, buckets.length);
  const start = Math.max(0, end - count);
  const visible = buckets.slice(start, end);
  const current = buckets.find(b => b.key === selected) ?? visible.at(-1);
  const index = current ? buckets.indexOf(current) : -1;
  const previous = index > 0 ? buckets[index-1] : null;
  const dur = (n: number) => n ? spokenDuration(n, t) : "0";
  const formatDate = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-GB", { calendar: "gregory", ...options }).format(new Date(`${date}T12:00:00`));
  const label = (b: typeof current) => !b ? t("pom_historyEmpty") : mode === "weekly" ? t("pom_historyWeek", { n: b.index }) : formatDate(b.start, mode === "monthly" ? { month: "long", year: "numeric" } : { weekday: "short", day: "numeric", month: "short" });
  const days = summary ? period.days : null;
  const knownStreaks = days?.flatMap(d => d.streak === null ? [] : [d.streak]) ?? [];
  const values = summary ? { sessions: days!.reduce((n,d) => n+d.sessions,0), minutes: days!.reduce((n,d) => n+d.minutes,0), lotus: days!.reduce((n,d) => n+d.lotus,0), streak: knownStreaks.length ? Math.max(...knownStreaks) : days!.length ? null : 0 } : current ?? { sessions: 0, minutes: 0, lotus: 0, streak: 0 };
  const max = Math.max(1, ...visible.map(b => b.minutes));
  const unavailable = !summary && current?.incomplete && current.sessions === 0;
  const tile = (icon: React.ReactNode, text: string, value: string) => <div className="min-w-0 rounded-2xl px-3 py-3" style={{ background: "color-mix(in srgb, var(--color-ink) 4%, transparent)" }}>
    <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-muted)" }}><span style={{ color: "var(--color-primary)" }}>{icon}</span>{text}</span>
    <span className="mt-1 block text-[15px] font-semibold tabular-nums text-balance">{value}</span>
  </div>;
  const changeWindow = (delta: number) => { const next = Math.max(Math.min(count, buckets.length), Math.min(buckets.length, end + delta*count)); setWindowEnd(next); setSelected(buckets[next-1]?.key ?? null); setSummary(false); };
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  return <div className="min-w-0" style={{ color: "var(--color-ink)" }}>
    <p className="text-xs" style={{ color: "var(--color-muted)" }}>{semester.name}</p>
    <div className="mt-3 flex rounded-xl p-1" style={{ background: "color-mix(in srgb, var(--color-ink) 5%, transparent)" }} role="group" aria-label={t("pom_historyDisplay")}>
      {(["daily", "weekly", "monthly"] as const).map(m => <motion.button key={m} type="button" aria-pressed={mode===m}
        onClick={() => { setMode(m); setWindowEnd(null); setSelected(null); setSummary(false); }}
        whileTap={reduced ? undefined : { scale: .97 }} className="relative flex-1 rounded-lg px-2 py-2 text-sm font-medium">
        {mode===m && <motion.span layoutId="achievement-mode" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-lg shadow-sm" style={{ background: "var(--color-surface)" }} />}
        <span className="relative">{t(m === "daily" ? "pom_historyDaily" : m === "weekly" ? "pom_historyWeekly" : "pom_historyMonthly")}</span>
      </motion.button>)}
    </div>
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="min-w-0"><h3 className="text-sm font-semibold">{summary ? t("pom_historyTerm") : label(current)}</h3>
        {current && !summary && <p className="mt-1 text-[11px]" style={{ color: "var(--color-muted)" }}>{formatDate(current.start, { day: "numeric", month: "short" })}{current.end!==current.start && ` — ${formatDate(current.end, { day: "numeric", month: "short" })}`}</p>}
      </div>
      <InteractionButton type="button" className="shrink-0 rounded-lg px-2 py-2 text-xs" aria-pressed={summary} style={{ color: "var(--color-primary)" }} onClick={() => setSummary(!summary)}>{summary ? t("pom_historySelected") : t("pom_historyTerm")}</InteractionButton>
    </div>
    <motion.div key={`${mode}-${summary ? "summary" : current?.key}`} initial={reduced ? false : { opacity: .6, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }} className="mt-3 grid grid-cols-2 gap-2" aria-live="polite">
      {tile(<Target size={14}/>, t("pom_sessionsCompleted"), unavailable ? "—" : String(values.sessions))}
      {tile(<Clock size={14}/>, t("pom_totalFocusTime"), unavailable ? "—" : dur(values.minutes))}
      {tile(<Flame size={14}/>, mode === "daily" && !summary ? t("pom_currentStreak") : t("pom_historyLongestStreak"), unavailable || values.streak === null ? "—" : t("pom_daysCount", { n: values.streak }))}
      {tile(<Leaf size={14}/>, t("pom_lilyPads"), unavailable ? "—" : String(values.lotus))}
    </motion.div>
    <p className="mt-3 min-h-4 text-[11px]" style={{ color: "var(--color-muted)" }}>
      {!summary && current && previous && !current.incomplete && !previous.incomplete && (current.minutes === previous.minutes ? t("pom_historyEqual") : t(current.minutes > previous.minutes ? "pom_historyMore" : "pom_historyLess", { time: dur(Math.abs(current.minutes-previous.minutes)) }))}
    </p>
    <div className="mt-2 flex items-center justify-between gap-2">
      <InteractionButton type="button" disabled={start===0} onClick={() => changeWindow(-1)} className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-25" aria-label={t("pom_historyPrevious")}><Prev size={17}/></InteractionButton>
      <span className="text-xs" style={{ color: "var(--color-muted)" }}>{t("pom_historyMinutes")}</span>
      <InteractionButton type="button" disabled={end>=buckets.length} onClick={() => changeWindow(1)} className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-25" aria-label={t("pom_historyNext")}><Next size={17}/></InteractionButton>
    </div>
    {visible.length ? <div className="mt-1 flex items-end gap-1.5" role="group" aria-label={t("pom_historyChart")}>
      {visible.map(b => { const active = !summary && current?.key===b.key; return <InteractionButton key={`${mode}-${b.key}`} type="button" aria-pressed={active}
        aria-label={b.incomplete && b.sessions === 0 ? `${label(b)}: ${t("pom_historyUnknown")}` : `${label(b)}: ${dur(b.minutes)}, ${t("pom_sessionsCount", { n: b.sessions })}, ${t("pom_currentStreak")}: ${b.streak === null ? t("pom_historyUnknown") : t("pom_daysCount", { n: b.streak })}`}
        onClick={() => { setSelected(b.key); setSummary(false); }} className="group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-0.5 pb-2 outline-offset-2">
        <span className="flex h-4 items-center justify-center gap-0.5 text-[10px] tabular-nums" style={{ color: "#bc8942" }}>{b.streak !== null && b.streak > 0 && <><Flame size={10}/>{b.streak}</>}</span>
        <span className="relative flex h-28 w-full items-end justify-center">
          {b.minutes > 0 ? <motion.span initial={reduced ? false : { scaleY: 0 }} animate={{ scaleY: b.minutes/max, backgroundColor: active ? "var(--color-primary)" : "color-mix(in srgb, var(--color-primary) 32%, transparent)" }} transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 170, damping: 26 }} className="block h-full w-5 max-w-full origin-bottom rounded-t-full rounded-b-md group-hover:brightness-110" /> : b.incomplete ? <span className="text-xs" style={{color:"var(--color-muted)"}}>—</span> : <span className="h-1.5 w-5 rounded-full" style={{ background: "color-mix(in srgb, var(--color-muted) 22%, transparent)" }}/>}</span>
        <span className={`block w-full truncate text-center text-[10px] ${active ? "font-semibold" : ""}`} style={{ color: active ? "var(--color-ink)" : "var(--color-muted)" }} title={label(b)}>{mode === "weekly" ? t("pom_historyWeek", { n: b.index }) : formatDate(b.start, mode === "monthly" ? { month: "short" } : { weekday: "short" })}</span>
        {mode === "daily" && <span className="text-[10px] tabular-nums" style={{ color: "var(--color-muted)" }}>{formatDate(b.start, { day: "numeric", month: "numeric" })}</span>}
      </InteractionButton>; })}
    </div> : <p className="py-6 text-center text-sm" style={{ color: "var(--color-muted)" }}>{t("pom_historyEmpty")}</p>}
    {(summary ? period.incomplete : current?.incomplete) && <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--color-muted)" }}>{t("pom_historyIncomplete")}</p>}
    {history.legacy.sessions > 0 && <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--color-muted)" }}>{t("pom_historyLegacy")}</p>}
  </div>;
}
