-- Attendance calculation suspended (Hanaa, 2026-10-12; ACCURACY_PLAN.md).
-- LOCAL, NOT APPLIED: apply only with her approval, and only together with the
-- app release that carries ATTENDANCE_CALC_SUSPENDED (src/lib/featureFlags.ts).
--
-- 1. Existing accounts keep absence tracking on. The app now treats a missing
--    preferences.attendanceEnabled as OFF (the new default for new accounts),
--    so every account that has no value yet is saved as ON. Accounts that
--    turned it off keep false.
-- 2. Absence alerts still waiting in the outbox are cancelled (cancelled_at,
--    same as the app's own cancel: not used up, so they can come back). The
--    app stops queueing new ones while the flag is on.
-- 3. Student votes no longer approve or reopen an attendance rule: the trigger
--    that does it is turned off. It only acts on attendance votes (calendar
--    answers are just stored, and still are). Votes are kept.
--
-- Rollback (when the calculation returns):
--   alter table public.crowd_votes enable trigger crowd_votes_apply;
--   -- alerts come back on their own: the app re-syncs current levels and
--   -- sync_absence_alerts brings cancelled ones back.
--   -- 1 is a saved choice, not reverted.

update public.profiles
   set preferences = coalesce(preferences, '{}'::jsonb) || jsonb_build_object('attendanceEnabled', true)
 where not (coalesce(preferences, '{}'::jsonb) ? 'attendanceEnabled');

update public.scheduled_pushes
   set sent_at = now(), cancelled_at = now()
 where dedup_key like 'att-%'
   and sent_at is null;

alter table public.crowd_votes disable trigger crowd_votes_apply;
