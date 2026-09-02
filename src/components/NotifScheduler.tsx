"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { scheduleAll, cancelAll } from "@/lib/notifScheduler";

export function NotifScheduler() {
  const { hydrated, courses, planner, semester, notifPrefs, reminderDays } = useStore();
  const { lang } = useT();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!hydrated) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      scheduleAll(courses, planner, semester, notifPrefs, reminderDays, lang);
    }, 300);
    return () => {
      clearTimeout(debounceRef.current);
      cancelAll();
    };
  }, [hydrated, courses, planner, semester, notifPrefs, reminderDays, lang]);

  return null;
}
