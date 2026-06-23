"use client";

import { useState } from "react";
import { NotebookPen, CalendarRange } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Planner } from "@/components/Planner";
import { Timetable } from "@/components/Timetable";

type Tab = "planner" | "timetable";

export default function SchedulePage() {
  const { t } = useT();
  const { hydrated } = useStore();
  const [tab, setTab] = useState<Tab>("planner");

  if (!hydrated) return <div className="h-40" />;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "planner", label: t("tabPlanner"), icon: <NotebookPen size={15} /> },
    { key: "timetable", label: t("tabTimetable"), icon: <CalendarRange size={15} /> },
  ];

  return (
    <div className="haven-fade-in">
      <h1 className="font-display text-[34px] leading-tight" style={{ color: "var(--color-ink)" }}>
        {t("nav_schedule")}
      </h1>
      <p className="text-[15px] mt-3 mb-8" style={{ color: "var(--color-muted)" }}>
        {t("scheduleSubtitle")}
      </p>

      <div className="inline-flex rounded-xl p-1 mb-8" style={{ background: "var(--color-primary-soft)" }}>
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={
              tab === tb.key
                ? { background: "var(--color-surface)", color: "var(--color-primary)", boxShadow: "var(--shadow-card)" }
                : { color: "var(--color-muted)" }
            }
          >
            {tb.icon}
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "planner" ? <Planner /> : <Timetable />}
    </div>
  );
}
