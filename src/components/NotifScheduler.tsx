"use client";

import { useEffect } from "react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { scheduleAll, cancelAll, type SmartAlert } from "@/lib/notifScheduler";
import { buildSmartSuggestions } from "@/lib/smartSuggestions";
import { enqueueScheduledPush } from "@/lib/db";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NotifScheduler() {
  const { hydrated, courses, planner, semester, notifPrefs, gamification, gpaGoal } = useStore();
  const { t, lang } = useT();

  useEffect(() => {
    if (!hydrated) return;

    // Highest-priority suggestion → the day's single smart reminder. Skip the
    // "all good" filler; it's reassurance for the dashboard, not a notification.
    const top = buildSmartSuggestions(
      { courses, planner, semester, gamification, gpaGoal },
      t
    )[0];
    const smartAlert: SmartAlert | null =
      top && top.kind !== "all-good"
        ? { id: top.id, title: lang === "ar" ? "Haven — تذكير" : "Haven — Reminder", body: top.text }
        : null;

    // In-tab timers (fires while the app is open, and catches up on open).
    scheduleAll(courses, planner, semester, notifPrefs, lang, smartAlert);

    // Outbox: queue today's reminder for server delivery so it still arrives
    // when the app is CLOSED. Only when the reminder hour is still ahead today
    // (a past hour is already handled in-tab, so a push would be stale/dup).
    if (smartAlert && notifPrefs.exams.enabled) {
      const sendAt = new Date();
      sendAt.setHours(notifPrefs.dailyReminderHour, 0, 0, 0);
      if (sendAt.getTime() > Date.now()) {
        void enqueueScheduledPush({
          dedupKey: `smart-${todayISO()}`,
          sendAt: sendAt.toISOString(),
          title: smartAlert.title,
          body: smartAlert.body,
        });
      }
    }

    return cancelAll;
  }, [hydrated, courses, planner, semester, notifPrefs, gamification, gpaGoal, lang, t]);

  return null;
}
