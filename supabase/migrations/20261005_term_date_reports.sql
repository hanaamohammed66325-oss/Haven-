-- Term dates of students whose university has no calendar on record (her
-- decision, 2026-09-26: "ابغى يتسجل اسم الجامعه والتاريخ اللي حطه").
--
-- The app shows these students a note that term dates differ between
-- universities and asks them to set theirs (components/TermCheckCard). Their
-- dates already live in their active semester and their answer in
-- profiles.preferences.setupConfirmed.termAnswered ("none|…"), so nothing new is
-- written: this reads them for the admin page (University facts → Term dates
-- students set), which works out per student whether we hold their university's
-- calendar (lib/termDateReports) and groups the dates by university.
--
-- Security: admin only (is_admin_current), SECURITY DEFINER with a fixed
-- search_path; no emails, only the university and the dates.

create or replace function public.admin_term_date_reports()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare res jsonb;
begin
  if not public.is_admin_current() then raise exception 'not_authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', p.id,
           'last_active_at', p.last_active_at,
           'slug', nullif(p.preferences->'academic'->>'universitySlug', ''),
           'name', nullif(trim(p.preferences->'academic'->>'universityName'), ''),
           'answered', p.preferences->'setupConfirmed'->>'termAnswered',
           'start_date', s.start_date,
           'end_date', s.end_date,
           'teaching_weeks', s.teaching_weeks,
           'finals_weeks', s.finals_weeks
         )), '[]'::jsonb)
    into res
    from public.profiles p
    left join public.semesters s on s.user_id = p.id and s.is_active
   where nullif(trim(p.preferences->'academic'->>'universityName'), '') is not null
      or p.preferences->'setupConfirmed'->>'termAnswered' like 'none|%';
  return res;
end;
$$;

revoke all on function public.admin_term_date_reports() from public, anon;
grant execute on function public.admin_term_date_reports() to authenticated;

-- ── Safety check (as in 20261002): every admin_* function a signed-in user can
-- call must check that the caller is the admin.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'admin\_%'
       and p.prosecdef
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
       and p.prosrc not ilike '%is_admin_current%'
  loop
    raise exception 'admin function without an admin check: %', r.fn;
  end loop;
end $$;

-- Rollback:
--   drop function if exists public.admin_term_date_reports();
