-- Lock down university rules and calendars.
--
-- Before: anyone with the public key (no sign-in needed) could read every row
-- of attendance_policies and university_facts, including where each rule was
-- found (sources, the college rules' sources in `details`), the admin's notes
-- and who approved it.
--
-- Now: only the admin reads the tables. A signed-in student reads their own
-- university's rule and calendar through two functions that return only what
-- the app shows. Nothing is reachable without signing in.

-- ── What a student's app gets ────────────────────────────────────────────────

create or replace function public.student_attendance_policy(p_slug text)
returns table (
  id uuid,
  university_slug text,
  university_name text,
  scope text,
  method text,
  max_absence numeric,
  max_unexcused numeric,
  excused_counts boolean,
  excuse_floor_attendance numeric,
  separate_components boolean,
  component_limits jsonb,
  warnings jsonb,
  late_rule text,
  details jsonb,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.university_slug, p.university_name, p.scope, p.method,
         p.max_absence, p.max_unexcused, p.excused_counts, p.excuse_floor_attendance,
         p.separate_components, p.component_limits, p.warnings, p.late_rule,
         -- only the flags the app reads; college/program rules carry sources
         coalesce(
           (select jsonb_object_agg(e.key, e.value)
              from jsonb_each(p.details) e
             where e.key in ('limit_inclusive', 'crowd', 'auto_verified')),
           '{}'::jsonb
         ),
         p.status
    from public.attendance_policies p
   where auth.uid() is not null
     and p.university_slug = p_slug
     and p.scope = 'university'
     and p.status in ('verified', 'review')
   order by (p.status = 'verified') desc
   limit 1;
$$;

create or replace function public.student_university_facts(p_slug text)
returns table (
  status text,
  verified_via text,
  academic_year text,
  term text,
  fact_key text,
  value jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select f.status, f.verified_via, f.academic_year, f.term, f.fact_key, f.value
    from public.university_facts f
   where auth.uid() is not null
     and f.university_slug = p_slug
     and f.status in ('verified', 'suggested');
$$;

revoke all on function public.student_attendance_policy(text) from public, anon;
revoke all on function public.student_university_facts(text) from public, anon;
grant execute on function public.student_attendance_policy(text) to authenticated;
grant execute on function public.student_university_facts(text) to authenticated;

-- ── The tables: admin only ───────────────────────────────────────────────────
-- The admin policies ("admins manage attendance policies", "admins read all
-- facts", "admins write facts") stay; the public read policies go.

drop policy if exists "verified and suggested attendance policies are public" on public.attendance_policies;
drop policy if exists "verified attendance policies are public" on public.attendance_policies;
drop policy if exists "verified and suggested facts are public" on public.university_facts;
drop policy if exists "verified facts are public" on public.university_facts;

revoke all on public.attendance_policies from anon;
revoke all on public.university_facts from anon;
revoke all on public.attendance_policy_reports from anon;

-- ── Fixed search_path on the functions the security advisor flagged ─────────

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('attendance_rule_key', 'attendance_vote_key', 'touch_support_ticket_updated_at',
                         'admin_new_users_7d', 'admin_total_users', 'increment_coupon_uses')
  loop
    execute format('alter function %s set search_path = public', f);
  end loop;
end $$;

-- ── Safety check: every admin_* function a signed-in user can call must check
-- that the caller is the admin. Stops the migration if one doesn't.

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
