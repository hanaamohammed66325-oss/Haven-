-- Give back the progress that signing in wiped (streak, XP, daily check-ins),
-- rebuilt from the activity log (public.user_events, kept since 2026-09-07).
--
-- What the log proves, per account:
--   check-ins  every check_in event is one check-in
--   XP         15 per check-in + 5 per day the dashboard was opened + the XP
--              logged with each marks / attendance / task / focus-session event
--              (daily and weekly challenge XP isn't logged, so this is a floor)
--   streak     consecutive days the dashboard was opened (or a check-in made),
--              in the account's own time zone (preferences.classOff.tz, else
--              Riyadh)
-- Each value only ever goes UP: the stored one is kept when it's higher. The
-- current streak is lengthened only when its last day is the day the app last
-- counted, so a streak that already broke stays broken.
--
-- The badge tier isn't in the log. `gamificationRecheck` asks the app to re-run
-- its own badge rules on the account's data once, the next time it opens.
--
-- Every change is recorded in backup.restore_log (before and after); the
-- snapshot taken just before this (backup.daily_snapshots) holds the rest.

create table if not exists backup.restore_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  at timestamptz not null default now(),
  reason text not null,
  before jsonb,
  after jsonb
);
alter table backup.restore_log enable row level security;
revoke all on backup.restore_log from public, anon, authenticated, service_role;

with p as (
  select id, preferences -> 'gamification' as g,
    case when (preferences -> 'classOff' ->> 'tz') in (select name from pg_timezone_names)
      then preferences -> 'classOff' ->> 'tz' else 'Asia/Riyadh' end as tz
  from public.profiles
  where jsonb_typeof(preferences -> 'gamification') = 'object'
    and jsonb_typeof(preferences #> '{gamification,streak}') = 'object'
), days as (
  select distinct e.user_id, (e.created_at at time zone p.tz)::date as d
  from public.user_events e join p on p.id = e.user_id
  where e.event = 'check_in' or (e.event = 'page_view' and e.meta ->> 'path' like '/dashboard%')
), runs as (
  select user_id, d, d - (row_number() over (partition by user_id order by d))::int as grp from days
), runlen as (
  select user_id, count(*)::int as len, max(d) as last_d from runs group by user_id, grp
), streaks as (
  select distinct on (user_id) user_id, len as last_run, last_d as last_day,
    max(len) over (partition by user_id) as best_run
  from runlen order by user_id, last_d desc
), ev as (
  select user_id,
    count(*) filter (where event = 'check_in')::int as ci,
    coalesce(sum(case when jsonb_typeof(meta -> 'xp') = 'number' then (meta ->> 'xp')::int end), 0)::int as xp_logged
  from public.user_events group by user_id
), active as (
  select user_id, count(*)::int as n from days group by user_id
), calc as (
  select p.id, p.g as before,
    coalesce(backup.num(p.g -> 'totalCheckIns'), 0) as ci_saved,
    coalesce(backup.num(p.g -> 'xp'), 0) as xp_saved,
    coalesce(backup.num(p.g #> '{streak,longest}'), 0) as longest_saved,
    coalesce(backup.num(p.g #> '{streak,current}'), 0) as cur_saved,
    p.g #>> '{streak,lastActiveDate}' as last_saved,
    ev.ci, 15 * ev.ci + 5 * coalesce(a.n, 0) + ev.xp_logged as xp_log,
    coalesce(s.best_run, 0) as best_run, s.last_run, s.last_day
  from p
  join ev on ev.user_id = p.id
  left join streaks s on s.user_id = p.id
  left join active a on a.user_id = p.id
), target as (
  select id, before,
    greatest(ci_saved, ci) as ci,
    greatest(xp_saved, xp_log) as xp,
    greatest(longest_saved, best_run, cur_saved) as longest,
    case when last_saved = last_day::text then greatest(cur_saved, last_run) else cur_saved end as cur,
    ci_saved, xp_saved, longest_saved, cur_saved
  from calc
), changed as (
  select * from target
  where ci > ci_saved or xp > xp_saved or longest > longest_saved or cur > cur_saved
), upd as (
  update public.profiles pr
     set preferences = jsonb_set(jsonb_set(jsonb_set(jsonb_set(pr.preferences,
           '{gamification,totalCheckIns}', to_jsonb(c.ci)),
           '{gamification,xp}', to_jsonb(c.xp)),
           '{gamification,streak,longest}', to_jsonb(c.longest)),
           '{gamification,streak,current}', to_jsonb(c.cur))
         || '{"gamificationRecheck": true}'::jsonb
    from changed c
   where pr.id = c.id
  returning pr.id, c.before, pr.preferences -> 'gamification' as after
)
insert into backup.restore_log (user_id, reason, before, after)
select id, 'progress wiped on sign-in (2026-09), rebuilt from user_events', before, after from upd;
