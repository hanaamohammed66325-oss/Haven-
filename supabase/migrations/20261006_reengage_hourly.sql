-- Win-back at 10 AM on each student's own clock (her request, 2026-09-26: the
-- whole notification system follows the countries of all our universities).
--
-- reengage-tick now sends only to students whose clock (preferences.classOff.tz)
-- reads 10:xx, and skips their holidays, so the cron runs every hour on the 1st
-- and 15th instead of once at 07:30 UTC (10:30 Riyadh for everyone). Applied
-- only after the new reengage-tick was deployed (version 3): the old function
-- sends to everyone on the day's first tick (00:30 UTC, 03:30 Riyadh).

select cron.alter_job(
  (select jobid from cron.job where jobname = 'haven-reengage-biweekly'),
  schedule => '30 * 1,15 * *'
);

-- Rollback:
--   select cron.alter_job((select jobid from cron.job where jobname = 'haven-reengage-biweekly'), schedule => '30 7 1,15 * *');
