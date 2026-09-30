# Backups

Student data is copied inside the database, in the `backup` schema. The API
doesn't expose it and no app role can read it (anon, authenticated and
service_role have no access); only the database owner can, from SQL. Set up in
`supabase/migrations/20261012_backups_and_preference_guard.sql`. It runs on
the free plan at no cost (about 3 MB per nightly copy).

| Table | What it holds | Kept |
|---|---|---|
| `backup.daily_snapshots` | Every student table (profiles, semesters, courses, grade_components, attendance_sessions, attendance_absences, timetable_entries, planner_items, tasks, subscriptions, support_tickets), one row per record as JSON. Taken every night at 03:00 Riyadh (`haven-backup-nightly` cron job) | The last 14 nights, plus Sundays for 8 weeks |
| `backup.preference_history` | An account's settings and progress (`profiles.preferences`) just before a change, at most once per 30 minutes per account | 14 days |
| `backup.guard_log` | Every save the guard refused: what was kept and what was refused | 90 days |
| `backup.restore_log` | Every restore we ran: the account, why, before and after | Permanent |

## The guard

`profiles_guard_preferences` refuses a save that would take a lifetime counter
back, because only an empty or out-of-date screen can send one:

- `gamification`: `xp`, `totalCheckIns`, `streak.longest`, `badgeTier`
- `pomodoroStats`: `totalSessions`, `totalFocusMinutes`, `longestDailyStreak`

The stored value is kept and the attempt is written to `backup.guard_log`. A
row there means some screen tried to go back: look for the cause.

To lower one of these deliberately, disable the trigger for that statement
only:

```sql
alter table public.profiles disable trigger profiles_guard_preferences;
-- the update
alter table public.profiles enable trigger profiles_guard_preferences;
```

## Restoring

Always as a migration (`apply_migration`), with Hanaa's approval, and record
it in `backup.restore_log`.

An account's settings and progress, as they were at a point in time:

```sql
select saved_at, preferences from backup.preference_history
 where user_id = '<id>' order by saved_at desc;
```

A table's rows for one account, from a night's copy (re-adds what's missing
and leaves what's there):

```sql
insert into public.courses
select (jsonb_populate_record(null::public.courses, s.row)).*
  from backup.daily_snapshots s
 where s.taken_on = '<date>' and s.tbl = 'courses' and s.user_id = '<id>'
on conflict (id) do nothing;
```

Restore parents before children: semesters, courses, then grade_components,
attendance_sessions, attendance_absences and timetable_entries.

## History

- 2026-09-30: set up after signing in was found to wipe streaks, XP, check-ins
  and badge tiers. 30 accounts were restored from `user_events`
  (`supabase/migrations/20261013_restore_wiped_streaks.sql`).
