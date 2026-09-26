-- Admin drill-downs: who is behind each dashboard number, users per university,
-- top users, and the raw inputs behind every attendance percentage.
-- All functions: SECURITY DEFINER + is_admin_current() guard, callable by
-- `authenticated` only (same model as admin_retention_stats etc.).

-- ---------------------------------------------------------------------------
-- admin_card_users(card, arg) — the users counted by a dashboard card.
-- Each branch mirrors the exact definition of the number it drills into
-- (admin_dashboard_live / admin_engagement_stats / admin_notification_stats /
-- admin_retention_stats), so the list length matches the card.
-- Returns [{user_id, email, last_active_at, detail, badge, sort_key}].
-- ---------------------------------------------------------------------------
create or replace function public.admin_card_users(card text, arg text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare res jsonb;
begin
  if not public.is_admin_current() then raise exception 'not_authorized'; end if;

  with opens as (
    select ue.user_id,
           count(*)::int as opens,
           count(distinct ((ue.created_at at time zone 'Asia/Riyadh')::date))::int as active_days,
           min(ue.created_at) as first_open,
           max(ue.created_at) as last_open
    from public.user_events ue
    where ue.event = 'app_open'
    group by ue.user_id
  ),
  latest_open as (
    select distinct on (e.user_id) e.user_id, (e.meta->>'standalone') = 'true' as standalone
    from public.user_events e
    where e.event = 'app_open'
    order by e.user_id, e.created_at desc
  ),
  subs as (
    select s.user_id,
           count(distinct s.endpoint)::int as devices,
           bool_or(s.endpoint ilike '%push.apple.com%') as ios
    from public.push_subscriptions s
    group by s.user_id
  ),
  sent as (
    select n.user_id,
           case
             when n.kind in ('lecture','lecture_reminder') then 'lectures'
             when n.kind like 'time_%'   then 'planner_tasks'
             when n.kind like 'date_%'   then 'exams'
             when n.kind like 'attend_%' then 'attendance'
             else 'other'
           end as grp,
           count(*)::int as cnt
    from public.notifications_sent n
    group by 1, 2
  ),
  picked (user_id, detail, badge, sort_key) as (
    -- live presence
    select p.id, null::text, null::text, extract(epoch from p.last_active_at)::numeric
      from public.profiles p
     where card = 'online_now' and p.last_active_at > now() - interval '5 minutes'
    union all
    select p.id, null, null, extract(epoch from p.last_active_at)
      from public.profiles p
     where card = 'online_15m' and p.last_active_at > now() - interval '15 minutes'
    union all
    select p.id, null, null, extract(epoch from p.last_active_at)
      from public.profiles p
     where card = 'active_24h' and p.last_active_at > now() - interval '24 hours'
    union all
    select p.id, null, null, extract(epoch from p.last_active_at)
      from public.profiles p
     where card = 'active_7d' and p.last_active_at > now() - interval '7 days'
    union all
    select p.id, null, 'app', extract(epoch from p.last_active_at)
      from public.profiles p join latest_open lo on lo.user_id = p.id
     where card = 'in_app_now' and p.last_active_at > now() - interval '5 minutes' and lo.standalone
    union all
    select p.id, null, 'browser', extract(epoch from p.last_active_at)
      from public.profiles p left join latest_open lo on lo.user_id = p.id
     where card = 'in_browser_now' and p.last_active_at > now() - interval '5 minutes'
       and not coalesce(lo.standalone, false)
    -- devices / installs
    union all
    select s.user_id, s.devices || case when s.devices = 1 then ' device' else ' devices' end,
           case when s.ios then 'iOS' end, s.devices
      from subs s
     where card = 'push_devices'
    union all
    select s.user_id, s.devices || case when s.devices = 1 then ' device' else ' devices' end,
           'iOS', s.devices
      from subs s
     where card = 'installs_ios' and s.ios
    union all
    select x.user_id, x.n || ' installed opens', null, x.n
      from (select user_id, count(*)::int as n from public.user_events
             where event = 'app_open' and (meta->>'standalone') = 'true' group by user_id) x
     where card = 'installs_standalone'
    -- notifications
    union all
    select x.user_id, x.n || ' sessions', null, x.n
      from (select user_id, count(*)::int as n from public.user_events
             where event = 'complete_pomodoro' group by user_id) x
     where card = 'pomodoro'
    union all
    select se.user_id, se.cnt || ' delivered', null, se.cnt
      from sent se
     where card = 'notif_group' and se.grp = arg
    union all
    select p.id, null, case when s.user_id is null then 'no device' end, extract(epoch from p.last_active_at)
      from public.profiles p left join subs s on s.user_id = p.id
     where card = 'funnel_touched' and p.preferences ? 'notifPrefs'
    union all
    select s.user_id, s.devices || case when s.devices = 1 then ' device' else ' devices' end,
           case when s.ios then 'iOS' end, s.devices
      from subs s
     where card = 'funnel_has_sub'
    union all
    select p.id, s.devices || case when s.devices = 1 then ' device' else ' devices' end,
           case when s.ios then 'iOS' end, s.devices
      from public.profiles p join subs s on s.user_id = p.id
     where card = 'funnel_both' and p.preferences ? 'notifPrefs'
    union all
    select p.id, null, 'no device', extract(epoch from p.last_active_at)
      from public.profiles p
     where card = 'funnel_touched_no_sub' and p.preferences ? 'notifPrefs'
       and not exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
    union all
    select s.user_id, s.devices || case when s.devices = 1 then ' device' else ' devices' end,
           case when s.ios then 'iOS' end, s.devices
      from subs s
     where card = 'funnel_sub_no_prefs'
       and not exists (select 1 from public.profiles p where p.id = s.user_id and p.preferences ? 'notifPrefs')
    -- retention: cohorts (every member, returners flagged + listed first)
    union all
    select o.user_id, o.active_days || ' active days · ' || o.opens || ' opens',
           case when o.active_days >= 2 then 'returned' else 'not back' end,
           (case when o.active_days >= 2 then 1000000 else 0 end) + o.active_days * 1000 + o.opens
      from opens o
     where card = 'cohort'
       and o.first_open < now() - make_interval(days => greatest(1, coalesce(nullif(arg, '')::int, 1)))
    -- retention: states
    union all
    select o.user_id, o.active_days || ' active days · ' || o.opens || ' opens', null, extract(epoch from o.last_open)
      from opens o
     where card = 'state_new' and o.first_open >= now() - interval '3 days'
    union all
    select o.user_id, o.active_days || ' active days · ' || o.opens || ' opens', null, extract(epoch from o.last_open)
      from opens o
     where card = 'state_active' and o.last_open >= now() - interval '3 days' and o.first_open < now() - interval '3 days'
    union all
    select o.user_id, o.active_days || ' active days · ' || o.opens || ' opens', null, extract(epoch from o.last_open)
      from opens o
     where card = 'state_slipping' and o.last_open < now() - interval '3 days' and o.last_open >= now() - interval '14 days'
    union all
    select o.user_id, o.active_days || ' active days · ' || o.opens || ' opens', null, extract(epoch from o.last_open)
      from opens o
     where card = 'state_dormant' and o.last_open < now() - interval '14 days'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', pk.user_id,
           'email', u.email,
           'last_active_at', pr.last_active_at,
           'detail', pk.detail,
           'badge', pk.badge
         ) order by pk.sort_key desc nulls last), '[]'::jsonb)
    into res
    from picked pk
    join auth.users u on u.id = pk.user_id
    left join public.profiles pr on pr.id = pk.user_id;

  return res;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_university_users() — every user who set a university in their academic
-- profile. The client folds free-typed names into known universities with the
-- same matcher the app uses, then groups + drills down locally.
-- ---------------------------------------------------------------------------
create or replace function public.admin_university_users()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare res jsonb;
begin
  if not public.is_admin_current() then raise exception 'not_authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', p.id,
           'email', u.email,
           'last_active_at', p.last_active_at,
           'slug', nullif(p.preferences->'academic'->>'universitySlug', ''),
           'name', nullif(trim(p.preferences->'academic'->>'universityName'), ''),
           'major', nullif(trim(p.preferences->'academic'->>'major'), ''),
           'level', nullif(trim(p.preferences->'academic'->>'level'), '')
         )), '[]'::jsonb)
    into res
    from public.profiles p
    join auth.users u on u.id = p.id
   where nullif(p.preferences->'academic'->>'universitySlug', '') is not null
      or nullif(trim(p.preferences->'academic'->>'universityName'), '') is not null;
  return jsonb_build_object('total_users', (select count(*) from auth.users), 'users', res);
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_top_users() — usage leaderboard inputs for every tracked user. Sorting
-- (active days / opens / content / tasks done) happens client-side.
-- ---------------------------------------------------------------------------
create or replace function public.admin_top_users()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare res jsonb;
begin
  if not public.is_admin_current() then raise exception 'not_authorized'; end if;
  with opens as (
    select ue.user_id,
           count(*)::int as opens,
           count(distinct ((ue.created_at at time zone 'Asia/Riyadh')::date))::int as active_days,
           min(ue.created_at) as first_open,
           max(ue.created_at) as last_open
    from public.user_events ue
    where ue.event = 'app_open'
    group by ue.user_id
  ),
  ev as (
    select user_id,
           count(*) filter (where event = 'complete_pomodoro')::int as pomodoros,
           count(*) filter (where event = 'check_in')::int          as check_ins,
           count(*) filter (where event = 'page_view')::int         as page_views
    from public.user_events
    group by user_id
  ),
  crs as (
    select c.user_id, count(*)::int as courses
    from public.courses c join public.semesters s on s.id = c.semester_id and s.is_active
    group by c.user_id
  ),
  pl as (
    select user_id, count(*)::int as planner_items, count(*) filter (where done)::int as planner_done
    from public.planner_items group by user_id
  ),
  ab as (
    select user_id, count(*)::int as absences from public.attendance_absences group by user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', o.user_id,
           'email', u.email,
           'opens', o.opens,
           'active_days', o.active_days,
           'first_open', o.first_open,
           'last_open', o.last_open,
           'courses', coalesce(crs.courses, 0),
           'planner_items', coalesce(pl.planner_items, 0),
           'planner_done', coalesce(pl.planner_done, 0),
           'pomodoros', coalesce(ev.pomodoros, 0),
           'check_ins', coalesce(ev.check_ins, 0),
           'page_views', coalesce(ev.page_views, 0),
           'absences', coalesce(ab.absences, 0),
           'university', nullif(trim(p.preferences->'academic'->>'universityName'), '')
         ) order by o.active_days desc, o.opens desc), '[]'::jsonb)
    into res
    from opens o
    join auth.users u on u.id = o.user_id
    left join public.profiles p on p.id = o.user_id
    left join ev  on ev.user_id  = o.user_id
    left join crs on crs.user_id = o.user_id
    left join pl  on pl.user_id  = o.user_id
    left join ab  on ab.user_id  = o.user_id
   -- Admin (owner/test) accounts would top every ranking; keep the board to real users.
   where not exists (select 1 from public.admins a where lower(a.email) = lower(u.email));
  return res;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_attendance_audit(p_user) — the RAW inputs the app's attendanceInfo()
-- uses, per user (active semester only). The admin UI feeds them through the
-- very same function, so the % shown is exactly what the student sees.
-- p_user = null → every user with at least one course.
-- ---------------------------------------------------------------------------
create or replace function public.admin_attendance_audit(p_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare res jsonb;
begin
  if not public.is_admin_current() then raise exception 'not_authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', s.user_id,
           'email', u.email,
           'semester', jsonb_build_object(
             'name', s.name, 'teaching_weeks', s.teaching_weeks, 'finals_weeks', s.finals_weeks,
             'start_date', s.start_date, 'end_date', s.end_date
           ),
           'prefs', jsonb_build_object(
             'startDate', p.preferences->'startDate',
             'endDate', p.preferences->'endDate',
             'withdrawalLimit', p.preferences->'withdrawalLimit',
             'tardinessRuleId', p.preferences->'tardinessRuleId',
             'customTardinessThreshold', p.preferences->'customTardinessThreshold',
             'customTardiesPerAbsence', p.preferences->'customTardiesPerAbsence',
             'dismissedHolidays', p.preferences->'dismissedHolidays',
             'customHolidays', p.preferences->'customHolidays',
             'universitySlug', p.preferences->'academic'->'universitySlug',
             'universityName', p.preferences->'academic'->'universityName'
           ),
           'courses', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'id', c.id, 'name', c.name, 'credits', c.credits,
                      'attendance_limit', c.attendance_limit,
                      'attendance_mode', c.attendance_mode,
                      'per_lecture_pct', c.per_lecture_pct,
                      'sessions', (select coalesce(jsonb_agg(jsonb_build_object(
                                     'id', a.id, 'day', a.day_of_week, 'minutes', a.duration_minutes)), '[]'::jsonb)
                                   from public.attendance_sessions a where a.course_id = c.id),
                      'absences', (select coalesce(jsonb_agg(jsonb_build_object(
                                     'id', x.id, 'date', x.absent_on, 'minutes', x.minutes,
                                     'excused', x.excused, 'tardiness', x.tardiness) order by x.absent_on), '[]'::jsonb)
                                   from public.attendance_absences x where x.course_id = c.id)
                    ) order by c.position), '[]'::jsonb)
             from public.courses c where c.semester_id = s.id
           )
         ) order by u.email), '[]'::jsonb)
    into res
    from public.semesters s
    join auth.users u on u.id = s.user_id
    left join public.profiles p on p.id = s.user_id
   where s.is_active
     and (p_user is null or s.user_id = p_user)
     and exists (select 1 from public.courses c where c.semester_id = s.id);
  return res;
end;
$$;

revoke all on function public.admin_card_users(text, text)      from public, anon;
revoke all on function public.admin_university_users()          from public, anon;
revoke all on function public.admin_top_users()                 from public, anon;
revoke all on function public.admin_attendance_audit(uuid)      from public, anon;
grant execute on function public.admin_card_users(text, text)   to authenticated;
grant execute on function public.admin_university_users()       to authenticated;
grant execute on function public.admin_top_users()              to authenticated;
grant execute on function public.admin_attendance_audit(uuid)   to authenticated;

-- Rollback:
--   drop function if exists public.admin_card_users(text, text);
--   drop function if exists public.admin_university_users();
--   drop function if exists public.admin_top_users();
--   drop function if exists public.admin_attendance_audit(uuid);
