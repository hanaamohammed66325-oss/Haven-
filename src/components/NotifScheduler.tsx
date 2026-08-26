"use client";

import { useEffect } from "react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { scheduleAll, cancelAll } from "@/lib/notifScheduler";

export function NotifScheduler() {
  const { hydrated, courses, planner, semester, notifPrefs, reminderDays } = useStore();
  const { lang } = useT();

  useEffect(() => {
    if (!hydrated) return;
    scheduleAll(courses, planner, semester, notifPrefs, reminderDays, lang);
    return cancelAll;
  }, [hydrated, courses, planner, semester, notifPrefs, reminderDays, lang]);

  return null;
}
