"use client";

import { useEffect } from "react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { scheduleAll, cancelAll, type SmartAlert } from "@/lib/notifScheduler";
import { buildSmartSuggestions } from "@/lib/smartSuggestions";
import { enqueueScheduledPush } from "@/lib/db";

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NotifScheduler() {
  const { hydrated, courses, planner, semester, notifPrefs, gamification, gpaGoal } = useStore();
  const { t, lang } = useT();

  useEffect(() => {
    if (!hydrated) return;

    // Highest-priority suggestion → the day's single smart reminder. On a calm
    // day (nothing urgent → "all good") fall back to a friendly study nudge so
    // the daily reminder still arrives, instead of going silent.
    const top = buildSmartSuggestions(
      { courses, planner, semester, gamification, gpaGoal },
      t
    )[0];
    const body = top && top.kind !== "all-good" ? top.text : t("smart_studyNudge");
    const smartAlert: SmartAlert = {
      id: top?.kind !== "all-good" ? (top?.id ?? "study-nudge") : "study-nudge",
      title: lang === "ar" ? "Haven — تذكير" : "Haven — Reminder",
      body,
    };

    // In-tab timers (fires while the app is open, and catches up on open).
    scheduleAll(courses, planner, semester, notifPrefs, lang, smartAlert);

    // Outbox: queue the reminder for SERVER delivery so it arrives even when the
    // app is CLOSED. Schedule the next occurrence of the daily reminder hour —
    // today if it's still ahead, otherwise tomorrow — so opening the app at any
    // time of day always leaves a push queued. dedupKey is per send-date, so the
    // server sends it exactly once and re-opening the app just refreshes content.
    if (notifPrefs.exams.enabled) {
      const sendAt = new Date();
      sendAt.setHours(notifPrefs.dailyReminderHour, 0, 0, 0);
      if (sendAt.getTime() <= Date.now()) sendAt.setDate(sendAt.getDate() + 1);
      void enqueueScheduledPush({
        dedupKey: `smart-${isoDate(sendAt)}`,
        sendAt: sendAt.toISOString(),
        title: smartAlert.title,
        body: smartAlert.body,
      });
    }

    return cancelAll;
  }, [hydrated, courses, planner, semester, notifPrefs, gamification, gpaGoal, lang, t]);

  return null;
}
