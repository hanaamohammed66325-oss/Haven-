-- Backups of every student's data, and a guard that stops a stale or empty app
-- state from overwriting an account's progress.
--
-- Why: signing in showed the dashboard before the account's data had loaded, so
-- the app counted the day's visit on an empty state and saved it over the real
-- one (streak, XP, check-ins and badge tier back to the start). The app is fixed
-- to never save before the account has loaded; this is the database's own net
-- under that, plus a way back if anything else ever goes wrong.
--
-- Everything lives in the `backup` schema, which the API does not expose and no
-- app role (anon, authenticated, service_role) can read or write. Only the
-- database owner can, from the SQL editor.
--
-- 1. backup.daily_snapshots   a copy of every student table each night at 03:00
--                             Riyadh; the last 14 nights, and each Sunday for 8
--                             weeks.
-- 2. backup.preference_history the account's settings and progress just BEFORE a
--                             change, at most once per 30 minutes per account;
--                             kept 14 days.
-- 3. backup.guard_log         each write the guard refused (what was kept, what
--                             was refused); kept 90 days.
--
-- The guard: a save that would LOWER a lifetime counter can only come from an
-- app state that is empty or out of date, so the stored value is kept.
--   gamification: xp, totalCheckIns, streak.longest, badgeTier
--   pomodoroStats: totalSessions, totalFocusMinutes, longestDailyStreak
-- (The current streak can drop; it isn't guarded.) To reset these on purpose,
-- disable the trigger for that one statement:
--   alter table public.profiles disable trigger profiles_guard_preferences;

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated, service_role;
alter default privileges in schema backup revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema backup revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema backup revoke all on functions from public, anon, authenticated, service_role;

create table if not exists backup.daily_snapshots (
  taken_on date not null,
  tbl text not null,
  user_id uuid,
  row jsonb not null
);
create index if not exists daily_snapshots_day_tbl on backup.daily_snapshots (taken_on, tbl);
create index if not exists daily_snapshots_user on backup.daily_snapshots (user_id, taken_on);

create table if not exists backup.preference_history (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  saved_at timestamptz not null default now(),
  preferences jsonb not null
);
create index if not exists preference_history_user on backup.preference_history (user_id, saved_at desc);

create table if not exists backup.guard_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  at timestamptz not null default now(),
  field text not null,
  kept jsonb,
  refused jsonb
);
create index if not exists guard_log_user on backup.guard_log (user_id, at desc);

-- Defence in depth: even if a grant slipped in later, no row is visible to an
-- API role without a policy, and there are none.
alter table backup.daily_snapshots enable row level security;
alter table backup.preference_history enable row level security;
alter table backup.guard_log enable row level security;
revoke all on all tables in schema backup from public, anon, authenticated, service_role;

-- A JSON number, or null for anything else (a string, a missing key).
create or replace function backup.num(v jsonb) returns numeric
language sql immutable set search_path = ''
as $$ select case when jsonb_typeof(v) = 'number' then v::text::numeric end $$;

-- 1. Nightly copy of every student table. Re-running on the same day replaces
--    that day's copy.
create or replace function backup.take_snapshot() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  d date := (now() at time zone 'Asia/Riyadh')::date;
  t text;
begin
  delete from backup.daily_snapshots where taken_on = d;
  insert into backup.daily_snapshots (taken_on, tbl, user_id, row)
    select d, 'profiles', p.id, to_jsonb(p) from public.profiles p;
  foreach t in array array[
    'semesters', 'courses', 'grade_components', 'attendance_sessions',
    'attendance_absences', 'timetable_entries', 'planner_items', 'tasks',
    'subscriptions', 'support_tickets'
  ] loop
    execute format(
      'insert into backup.daily_snapshots (taken_on, tbl, user_id, row) select $1, %L, x.user_id, to_jsonb(x) from public.%I x',
      t, t
    ) using d;
  end loop;
  -- Keep the last 14 nights, and Sundays for 8 weeks.
  delete from backup.daily_snapshots
   where taken_on < d - 14
     and not (extract(dow from taken_on) = 0 and taken_on >= d - 56);
  delete from backup.preference_history where saved_at < now() - interval '14 days';
  delete from backup.guard_log where at < now() - interval '90 days';
end;
$$;

-- 2. The account's settings and progress just before a change.
create or replace function backup.keep_preference_history() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.preferences is not null and old.preferences <> '{}'::jsonb and not exists (
    select 1 from backup.preference_history h
     where h.user_id = old.id and h.saved_at > now() - interval '30 minutes'
  ) then
    insert into backup.preference_history (user_id, preferences) values (old.id, old.preferences);
  end if;
  return null;
end;
$$;

-- 3. The guard.
create or replace function backup.guard_preferences() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  og jsonb := old.preferences -> 'gamification';
  ng jsonb := new.preferences -> 'gamification';
  op jsonb := old.preferences -> 'pomodoroStats';
  np jsonb := new.preferences -> 'pomodoroStats';
begin
  if jsonb_typeof(og) = 'object' and ng is distinct from og and (
       jsonb_typeof(ng) is distinct from 'object'
    or coalesce(backup.num(ng -> 'xp'), 0) < coalesce(backup.num(og -> 'xp'), 0)
    or coalesce(backup.num(ng -> 'totalCheckIns'), 0) < coalesce(backup.num(og -> 'totalCheckIns'), 0)
    or coalesce(backup.num(ng #> '{streak,longest}'), 0) < coalesce(backup.num(og #> '{streak,longest}'), 0)
    or coalesce(backup.num(ng -> 'badgeTier'), 1) < coalesce(backup.num(og -> 'badgeTier'), 1)
  ) then
    new.preferences := jsonb_set(coalesce(new.preferences, '{}'::jsonb), '{gamification}', og);
    insert into backup.guard_log (user_id, field, kept, refused) values (new.id, 'gamification', og, ng);
  end if;

  if jsonb_typeof(op) = 'object' and np is distinct from op and (
       jsonb_typeof(np) is distinct from 'object'
    or coalesce(backup.num(np -> 'totalSessions'), 0) < coalesce(backup.num(op -> 'totalSessions'), 0)
    or coalesce(backup.num(np -> 'totalFocusMinutes'), 0) < coalesce(backup.num(op -> 'totalFocusMinutes'), 0)
    or coalesce(backup.num(np -> 'longestDailyStreak'), 0) < coalesce(backup.num(op -> 'longestDailyStreak'), 0)
  ) then
    new.preferences := jsonb_set(coalesce(new.preferences, '{}'::jsonb), '{pomodoroStats}', op);
    insert into backup.guard_log (user_id, field, kept, refused) values (new.id, 'pomodoroStats', op, np);
  end if;
  return new;
end;
$$;

revoke all on all functions in schema backup from public, anon, authenticated, service_role;

drop trigger if exists profiles_guard_preferences on public.profiles;
create trigger profiles_guard_preferences
  before update of preferences on public.profiles
  for each row execute function backup.guard_preferences();

drop trigger if exists profiles_preference_history on public.profiles;
create trigger profiles_preference_history
  after update of preferences on public.profiles
  for each row when (old.preferences is distinct from new.preferences)
  execute function backup.keep_preference_history();

-- Every night at 00:00 UTC (03:00 Riyadh).
select cron.unschedule(jobid) from cron.job where jobname = 'haven-backup-nightly';
select cron.schedule('haven-backup-nightly', '0 0 * * *', $$select backup.take_snapshot()$$);

-- The first copy now, before anything else changes.
select backup.take_snapshot();
