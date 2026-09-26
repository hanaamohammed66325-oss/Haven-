-- ---------------------------------------------------------------------------
-- GPA accuracy checks + approved grade cutoffs.
--
-- 1. admin_gpa_checks() — what students told us when comparing our GPA with
--    their university portal (the end-of-term window and "try it on a past
--    term" on the Profile page). Reads the term_* / past_term_* events in
--    user_events. The app only puts course details in an event when the
--    student agreed to share them; for a student who later withdrew consent,
--    their earlier end-of-term events are returned without any details.
--    Read-only; admin-only (is_admin_current guard), like the other admin_* RPCs.
--
-- 2. grade_cutoffs — percentage cutoffs for universities that don't publish
--    them, worked out from students' real results and approved by the admin.
--    Everyone can read it (the app applies them to that university's
--    students); only admin_set_grade_cutoffs() writes it.
-- ---------------------------------------------------------------------------

create or replace function public.admin_gpa_checks()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare res jsonb;
begin
  if not public.is_admin_current() then raise exception 'not_authorized'; end if;
  with withdrawn as (
    select user_id, max(created_at) as at
      from public.user_events
     where event = 'term_consent_withdrawn'
     group by user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', e.user_id,
           'email', u.email,
           'event', e.event,
           'at', e.created_at,
           'meta', case
                     when w.at is not null and e.created_at <= w.at and e.event like 'term\_%'
                       then jsonb_build_object('withdrawn', true)
                     else e.meta
                   end
         ) order by e.created_at desc), '[]'::jsonb)
    into res
    from public.user_events e
    join auth.users u on u.id = e.user_id
    left join withdrawn w on w.user_id = e.user_id
   where e.event in (
     'term_gpa_match', 'term_gpa_mismatch', 'term_grades_saved', 'term_mismatch_reason',
     'past_term_checked', 'past_term_reason'
   );
  return res;
end;
$$;

revoke all on function public.admin_gpa_checks() from public, anon;
grant execute on function public.admin_gpa_checks() to authenticated;

create table if not exists public.grade_cutoffs (
  university text primary key,          -- catalogue slug (lib/gradeCatalog)
  cutoffs jsonb not null,               -- {"A": 90, "B+": 85, ...}: lowest % per letter
  samples integer not null default 0,   -- how many student results backed it
  updated_at timestamptz not null default now()
);

alter table public.grade_cutoffs enable row level security;

drop policy if exists "grade_cutoffs are public" on public.grade_cutoffs;
create policy "grade_cutoffs are public" on public.grade_cutoffs
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.grade_cutoffs from anon, authenticated;
grant select on public.grade_cutoffs to anon, authenticated;

-- Approve (or, with p_cutoffs = null, withdraw) a university's cutoffs.
create or replace function public.admin_set_grade_cutoffs(p_university text, p_cutoffs jsonb, p_samples integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_current() then raise exception 'not_authorized'; end if;
  if p_university is null or length(p_university) = 0 or length(p_university) > 120 then
    raise exception 'bad_university';
  end if;
  if p_cutoffs is null then
    delete from public.grade_cutoffs where university = p_university;
    return;
  end if;
  if jsonb_typeof(p_cutoffs) <> 'object' then raise exception 'bad_cutoffs'; end if;
  insert into public.grade_cutoffs (university, cutoffs, samples, updated_at)
  values (p_university, p_cutoffs, greatest(coalesce(p_samples, 0), 0), now())
  on conflict (university) do update
    set cutoffs = excluded.cutoffs, samples = excluded.samples, updated_at = now();
end;
$$;

revoke all on function public.admin_set_grade_cutoffs(text, jsonb, integer) from public, anon;
grant execute on function public.admin_set_grade_cutoffs(text, jsonb, integer) to authenticated;

-- Rollback:
--   drop function if exists public.admin_set_grade_cutoffs(text, jsonb, integer);
--   drop table if exists public.grade_cutoffs;
--   drop function if exists public.admin_gpa_checks();
