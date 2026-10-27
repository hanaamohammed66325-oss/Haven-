-- Keep academic work and earned progress isolated by semester.
-- Cumulative account cosmetics remain in profiles.preferences.
alter table public.semesters
  add column if not exists progress jsonb not null default '{}'::jsonb;

comment on column public.semesters.progress is
  'Semester-owned progress, completed unlocks, and semester activity state. Cumulative cosmetics stay on profiles.preferences.';

-- This is private account data. The existing ownership RLS stays in force;
-- remove legacy anonymous table grants before exposing the new JSON column.
revoke all on public.semesters from anon;

-- Switching must be one transaction: a failed target cannot leave the account
-- without an active semester. RLS still applies because these are invoker RPCs.
create or replace function public.activate_owned_semester(p_semester_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform 1 from public.semesters
    where user_id = v_user
    order by id
    for update;

  if not exists (
    select 1 from public.semesters
    where id = p_semester_id and user_id = v_user
  ) then
    raise exception 'Semester not found' using errcode = 'P0002';
  end if;

  update public.semesters set is_active = false
    where user_id = v_user and is_active and id <> p_semester_id;
  update public.semesters set is_active = true
    where id = p_semester_id and user_id = v_user;
end;
$$;

-- Merge a patch inside Postgres so concurrent tabs cannot replace unrelated
-- progress keys with an older full JSON snapshot.
create or replace function public.merge_owned_semester_progress(
  p_semester_id uuid, p_patch jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_progress jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Progress patch must be an object' using errcode = '22023';
  end if;
  update public.semesters
     set progress = coalesce(progress, '{}'::jsonb) || p_patch
   where id = p_semester_id and user_id = (select auth.uid())
   returning progress into v_progress;
  if not found then
    raise exception 'Semester not found' using errcode = 'P0002';
  end if;
  return v_progress;
end;
$$;

-- Insert, seed, and activate together. A failed step rolls the whole creation
-- back, so retrying the UI cannot strand an incomplete inactive term.
create or replace function public.create_owned_semester(
  p_name text, p_weeks integer, p_finals_weeks integer,
  p_start_date date, p_end_date date, p_progress jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null or length(btrim(p_name)) > 120
     or p_weeks is null or p_weeks not between 1 and 52
     or p_finals_weeks is null or p_finals_weeks not between 0 and 20
     or p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or p_progress is null or jsonb_typeof(p_progress) <> 'object' then
    raise exception 'Invalid semester' using errcode = '22023';
  end if;
  insert into public.semesters
    (user_id, name, teaching_weeks, finals_weeks, start_date, end_date, is_active, progress)
  values
    (v_user, btrim(p_name), p_weeks, p_finals_weeks,
     p_start_date, p_end_date, false, p_progress)
  returning id into v_id;
  perform public.activate_owned_semester(v_id);
  return v_id;
end;
$$;

revoke execute on function public.activate_owned_semester(uuid) from public, anon;
revoke execute on function public.merge_owned_semester_progress(uuid, jsonb) from public, anon;
revoke execute on function public.create_owned_semester(text, integer, integer, date, date, jsonb) from public, anon;
grant execute on function public.activate_owned_semester(uuid) to authenticated;
grant execute on function public.merge_owned_semester_progress(uuid, jsonb) to authenticated;
grant execute on function public.create_owned_semester(text, integer, integer, date, date, jsonb) to authenticated;

-- Group awards use the same durable ledger as before, but project into the
-- selected owned semester instead of the old account-wide preference keys.
create or replace function public.study_apply_semester_awards(
  p_account uuid, p_semester uuid, p_ids uuid[], p_expected jsonb, p_projection jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := study.uid();
  v_progress jsonb;
  v_ids uuid[];
  v_pending uuid[];
  v_minutes integer;
  v_start_date date;
  v_end_date date;
  v_next_start date;
begin
  perform study.assert_available(v_user);
  if p_account is distinct from v_user then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 200
     or jsonb_typeof(p_expected) is distinct from 'object'
     or jsonb_typeof(p_projection) is distinct from 'object'
     or jsonb_typeof(p_projection -> 'pomodoroStats') is distinct from 'object'
     or jsonb_typeof(p_projection -> 'gamification') is distinct from 'object' then
    raise exception 'invalid_ids' using errcode = '22023';
  end if;
  select coalesce(s.progress, '{}'::jsonb), s.start_date, s.end_date
    into v_progress, v_start_date, v_end_date
    from public.semesters s
    where s.id = p_semester and s.user_id = v_user
    for update;
  if not found then
    raise exception 'semester_not_found' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(a.id), '{}'::uuid[]) into v_ids
    from study.awards a where a.user_id = v_user and a.id = any(p_ids);
  if cardinality(v_ids) <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'invalid_ids' using errcode = '22023';
  end if;
  select min(s.start_date) into v_next_start from public.semesters s
    where s.user_id = v_user and s.id <> p_semester
      and s.start_date > v_start_date;
  -- A browser resolves the student's local calendar day. Allow the one-day
  -- timezone boundary and the gap before the next term starts.
  if v_start_date is null or v_end_date is null or exists (
    select 1 from study.awards a
      where a.user_id = v_user and a.id = any(v_ids)
        and (a.awarded_at < v_start_date - interval '1 day'
          or (v_next_start is not null and
              a.awarded_at >= v_next_start + interval '1 day'))
  ) then
    raise exception 'award_outside_semester' using errcode = '22023';
  end if;
  select coalesce(array_agg(a.id), '{}'::uuid[]) into v_pending
    from study.awards a where a.user_id = v_user and a.id = any(v_ids) and a.applied_at is null;
  if cardinality(v_pending) = 0 then
    return jsonb_build_object('ok', true, 'preferences', v_progress);
  end if;
  if cardinality(v_pending) <> cardinality(v_ids)
     or coalesce(v_progress -> 'pomodoroStats', 'null'::jsonb) is distinct from (p_expected -> 'pomodoroStats')
     or coalesce(v_progress -> 'gamification', 'null'::jsonb) is distinct from (p_expected -> 'gamification') then
    return jsonb_build_object('ok', false, 'preferences', v_progress);
  end if;
  select sum(a.minutes) into v_minutes from study.awards a
    where a.user_id = v_user and a.id = any(v_pending);
  if (p_projection #>> '{pomodoroStats,totalSessions}')::numeric is distinct from
       coalesce((v_progress #>> '{pomodoroStats,totalSessions}')::numeric, 0) + cardinality(v_pending)
     or (p_projection #>> '{pomodoroStats,totalFocusMinutes}')::numeric is distinct from
       coalesce((v_progress #>> '{pomodoroStats,totalFocusMinutes}')::numeric, 0) + v_minutes
     or (p_projection #>> '{pomodoroStats,lilyPadCount}')::numeric is distinct from
       coalesce((v_progress #>> '{pomodoroStats,lilyPadCount}')::numeric, 0) + cardinality(v_pending)
     or (p_projection #>> '{gamification,xp}')::numeric is distinct from
       coalesce((v_progress #>> '{gamification,xp}')::numeric, 0) + 10 * cardinality(v_pending) then
    raise exception 'invalid_ids' using errcode = '22023';
  end if;
  v_progress := v_progress || jsonb_build_object(
    'pomodoroStats', p_projection -> 'pomodoroStats',
    'gamification', p_projection -> 'gamification'
  );
  update public.semesters set progress = v_progress
    where id = p_semester and user_id = v_user;
  update study.awards set applied_at = pg_catalog.now()
    where user_id = v_user and id = any(v_pending);
  return jsonb_build_object('ok', true, 'preferences', v_progress);
end;
$$;

revoke execute on function public.study_apply_semester_awards(uuid, uuid, uuid[], jsonb, jsonb)
  from public, anon, service_role;
grant execute on function public.study_apply_semester_awards(uuid, uuid, uuid[], jsonb, jsonb)
  to authenticated;
