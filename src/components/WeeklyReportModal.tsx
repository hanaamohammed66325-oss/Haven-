"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Zap, CheckCircle2, Flame, BookOpen, ClipboardList } from "lucide-react";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { getLevel } from "@/lib/gamification";
import type { WeeklyReportData } from "@/lib/challenges";

export function WeeklyReportModal() {
  const { t } = useT();
  const { gamification } = useStore();
  const [report, setReport] = useState<WeeklyReportData | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WeeklyReportData>).detail;
      if (detail && (detail.xpEarned > 0 || detail.checkIns > 0 || detail.tasksCompleted > 0 || detail.gradesEntered > 0)) {
        setReport(detail);
      }
    };
    window.addEventListener("haven-weekly-report", handler);
    return () => window.removeEventListener("haven-weekly-report", handler);
  }, []);

  if (!mounted || !report) return null;

  const level = getLevel(gamification.xp);

  const stats = [
    { icon: <Zap size={20} />, value: `+${report.xpEarned}`, label: t("wr_xp"), color: "var(--color-brass)" },
    { icon: <Flame size={20} />, value: String(report.checkIns), label: t("wr_checkIns"), color: "var(--color-primary)" },
    { icon: <ClipboardList size={20} />, value: String(report.tasksCompleted), label: t("wr_tasks"), color: "var(--color-success)" },
    { icon: <BookOpen size={20} />, value: String(report.gradesEntered), label: t("wr_grades"), color: "#8a6fb0" },
  ].filter((s) => s.value !== "0" && s.value !== "+0");

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
    >
      <div
        className="w-full max-w-[360px] rounded-3xl p-6 animate-[slideUp_0.4s_ease-out]"
        style={{
          background: "linear-gradient(160deg, var(--card-bg) 0%, color-mix(in srgb, var(--color-primary) 8%, var(--card-bg)) 100%)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-display text-xl" style={{ color: "var(--color-ink)" }}>
              {t("wr_title")}
            </h2>
            <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
              {t("wr_subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReport(null)}
            aria-label={t("close")}
            className="rounded-lg p-1.5 -m-1 transition-colors hover:bg-black/10"
          >
            <X size={18} style={{ color: "var(--color-muted)" }} />
          </button>
        </div>

        {/* Stats grid */}
        <div
          className="grid gap-3 mb-5"
          style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 2)}, 1fr)` }}
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl p-4 text-center"
              style={{
                background: `color-mix(in srgb, ${stat.color} 10%, transparent)`,
                border: `1px solid color-mix(in srgb, ${stat.color} 20%, transparent)`,
              }}
            >
              <div className="flex justify-center mb-2" style={{ color: stat.color }}>
                {stat.icon}
              </div>
              <div className="font-display text-2xl" style={{ color: "var(--color-ink)" }}>
                {stat.value}
              </div>
              <div className="text-[11px] mt-1" style={{ color: "var(--color-muted)" }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Streak & Level */}
        <div
          className="flex items-center justify-between rounded-xl px-4 py-3 mb-5"
          style={{
            background: "color-mix(in srgb, var(--color-brass) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-brass) 20%, transparent)",
          }}
        >
          <div className="flex items-center gap-2">
            <Flame size={16} style={{ color: "var(--color-brass)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
              {t("wr_streak", { n: report.streak })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} style={{ color: "var(--color-primary)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
              {t("wr_level", { level: level.name })}
            </span>
          </div>
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={() => setReport(null)}
          className="haven-btn w-full rounded-xl py-3 text-sm font-semibold"
        >
          {t("wr_dismiss")}
        </button>
      </div>
    </div>,
    document.body
  );
}
