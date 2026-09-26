"use client";

import { useEffect, useMemo } from "react";
import { useStore, useScheme } from "@/store";
import { useT } from "@/i18n";
import { scheduleAll, cancelAll, type SmartAlert } from "@/lib/notifScheduler";
import { buildSmartSuggestions } from "@/lib/smartSuggestions";
import { enqueueScheduledPush, reconcileScheduledPushes } from "@/lib/db";
import { plannerItemDate } from "@/lib/reminders";
import { holidayCalendar } from "@/lib/universityCountry";
import { classOffDays } from "@/lib/holidays";

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NotifScheduler() {
  const { hydrated, courses, planner, semester, notifPrefs, gamification, gpaGoal, academic, attendanceEnabled, saveClassOff } = useStore();
  // The reminder's GPA must use the student's own system, like the dashboard.
  const scheme = useScheme();
  const { t, lang } = useT();

  // The term's holidays on the student's calendar: no lecture reminder on them,
  // here or from the server (which also needs the student's time zone — a
  // student in the UAE is an hour ahead of Riyadh).
  const calendar = holidayCalendar(academic);
  const offDays = useMemo(
    () => classOffDays(semester, calendar),
    [semester.startDate, semester.endDate, semester.dismissedHolidays, semester.customHolidays, calendar] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const offKey = offDays.join(",");
  useEffect(() => {
    if (!hydrated) return;
    let tz = "Asia/Riyadh";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
    } catch {
      /* keep Riyadh */
    }
    saveClassOff({ tz, days: offDays });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, offKey]);

  useEffect(() => {
    if (!hydrated) return;

    // Highest-priority suggestion → the day's single smart reminder. On a calm
    // day (nothing urgent → "all good") fall back to a friendly study nudge so
    // the daily reminder still arrives, instead of going silent. Built AS OF a
    // given moment: the in-tab timer uses "now", but the queued server push is
    // built as of its SEND time so a deadline that will already be past when it
    // fires is never named (a quiz due today isn't announced in tomorrow's push).
    const buildAlert = (asOf: Date): SmartAlert => {
      const top = buildSmartSuggestions(
        { courses, planner, semester, gamification, gpaGoal, scheme, holidayCalendar: holidayCalendar(academic), attendanceEnabled, now: asOf },
        t
      )[0];
      const body = top && top.kind !== "all-good" ? top.text : t("smart_studyNudge");
      return {
        id: top && top.kind !== "all-good" ? (top.id ?? "study-nudge") : "study-nudge",
        title: lang === "ar" ? "Haven — تذكير" : "Haven — Reminder",
        body,
      };
    };

    // In-tab timers (fires while the app is open, and catches up on open).
    // On a holiday the daily reminder goes out only with something that matters
    // (an exam, a task due, attendance) — never the general study nudge.
    const off = new Set(offDays);
    const forDay = (alert: SmartAlert, day: Date) => (alert.id === "study-nudge" && off.has(isoDate(day)) ? null : alert);
    scheduleAll(courses, planner, semester, notifPrefs, lang, forDay(buildAlert(new Date()), new Date()), off);

    // Outbox: queue the reminder for SERVER delivery so it arrives even when the
    // app is CLOSED. Schedule the next occurrence of the daily reminder hour —
    // today if it's still ahead, otherwise tomorrow — so opening the app at any
    // time of day always leaves a push queued. dedupKey is per send-date, so the
    // server sends it exactly once and re-opening the app just refreshes content.
    if (notifPrefs.exams.enabled) {
      const sendAt = new Date();
      sendAt.setHours(notifPrefs.dailyReminderHour, 0, 0, 0);
      if (sendAt.getTime() <= Date.now()) sendAt.setDate(sendAt.getDate() + 1);
      const queuedAlert = forDay(buildAlert(sendAt), sendAt); // content as it will be at send time
      if (queuedAlert) void enqueueScheduledPush({
        dedupKey: `smart-${isoDate(sendAt)}`,
        sendAt: sendAt.toISOString(),
        title: queuedAlert.title,
        body: queuedAlert.body,
      });
    }

    // Outbox: also queue each HOUR-BASED task reminder (planner items that carry
    // a specific due time) at its OWN send time, so a task set for 8:00 PM pushes
    // at (8 PM − N hours) even when the app is CLOSED — independent of the daily
    // reminder hour. Without this the per-task time only fired via the in-tab
    // timer (open tab only); the sole server push was the daily smart reminder,
    // so on a phone every notification collapsed onto dailyReminderHour. Mirrors
    // scheduleTasks() in notifScheduler.ts (same id/body) so an open tab and a
    // push coalesce on the same notification tag instead of double-firing.
    if (notifPrefs.tasks.enabled) {
      const now = Date.now();
      // The reminders that SHOULD exist right now: every hour-mark of every
      // active (still-present, not checked-off) dated task. We reconcile the
      // server outbox against this set so a task that was DELETED or checked off
      // stops firing — a deleted task leaves no note to cancel by key, so the
      // outbox is pruned to "only what's still live" instead.
      const liveKeys = new Set<string>();
      for (const note of planner.notes) {
        if (note.done) continue; // checked off → not a live reminder
        if (!note.dueTime || note.day == null) continue;
        const d = plannerItemDate(semester, note.week, note.day);
        if (!d) continue;
        const m = /^(\d{1,2}):(\d{2})$/.exec(note.dueTime);
        if (!m) continue;
        const due = new Date(d);
        due.setHours(Number(m[1]), Number(m[2]), 0, 0);
        const dueMs = due.getTime();

        for (const hoursAhead of notifPrefs.tasks.hours) {
          const dedupKey = `task-${note.id}-${hoursAhead}h`;
          liveKeys.add(dedupKey); // live even if its lead time already passed
          const fireAt = dueMs - hoursAhead * 3600_000;
          if (fireAt <= now) continue; // lead time already passed → nothing to queue
          const body =
            lang === "ar"
              ? `موعد التسليم خلال ${hoursAhead} ساعة`
              : `Due in ${hoursAhead}h`;
          void enqueueScheduledPush({
            dedupKey,
            sendAt: new Date(fireAt).toISOString(),
            title: `Haven — ${note.text}`,
            body,
          });
        }
      }
      // Drop any queued-but-undelivered task push whose task is gone/checked off.
      void reconcileScheduledPushes("task-", liveKeys);
    }

    return cancelAll;
  }, [hydrated, courses, planner, semester, notifPrefs, gamification, gpaGoal, scheme, academic, lang, t]);

  return null;
}
