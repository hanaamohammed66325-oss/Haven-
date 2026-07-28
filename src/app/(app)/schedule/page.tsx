"use client";

import { useState } from "react";
import { NotebookPen, CalendarRange } from "lucide-react";
import { useStore } from "@/store";
import { useT, usePageTitle } from "@/i18n";
import { Planner } from "@/components/Planner";
import { Timetable } from "@/components/Timetable";
import { Card } from "@/components/Card";
import { useSubscription } from "@/lib/subscription";
import { canUse } from "@/lib/premium";

type Tab = "planner" | "timetable";

export default function SchedulePage() {
  const { t } = useT();
  usePageTitle("nav_schedule");
  const { hydrated } = useStore();
  const { sub } = useSubscription();
  const [tab, setTab] = useState<Tab>("planner");

  if (!hydrated) return <div className="h-40" />;

  // Premium gate — the semester planner & weekly schedule. Open while
  // ENFORCE_PREMIUM is off; a lock hint once it's on and the plan doesn't allow it.
  const plannerAllowed = canUse("planner", sub);

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

      {plannerAllowed ? (
        <>
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
        </>
      ) : (
        <Card className="py-12 text-center">
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>{t("premiumFeatureLocked")}</p>
        </Card>
      )}
    </div>
  );
}
