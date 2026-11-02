-- ---------------------------------------------------------------------------
-- admin_user_semesters(target_user_id) — every semester a student has, with
-- each one's courses and the figures the calculations run on (the same ones
-- admin_user_detail returns for the active semester only). The admin user
-- page lists them so a student who moved to a new semester still shows their
-- earlier ones. The cumulative GPA / hours each semester started from live in
-- semesters.progress (cumulativeStartGpa / cumulativeStartHours).
-- Read-only; admin-only (is_admin_current guard), like the other admin_* RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.admin_user_semesters(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare res jsonb;
begin
  if not public.is_admin_current() then raise exception 'not_authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'name', s.name,
           'is_active', s.is_active,
           'teaching_weeks', s.teaching_weeks,
           'finals_weeks', s.finals_weeks,
           'start_date', s.start_date,
           'end_date', s.end_date,
           'cumulative_gpa', case when jsonb_typeof(s.progress -> 'cumulativeStartGpa') = 'number'
                                  then (s.progress ->> 'cumulativeStartGpa')::numeric end,
           'completed_hours', case when jsonb_typeof(s.progress -> 'cumulativeStartHours') = 'number'
                                   then (s.progress ->> 'cumulativeStartHours')::numeric end,
           'courses', (
             select coalesce(jsonb_agg(to_jsonb(c) order by c.position), '[]'::jsonb)
             from (
               select
                 co.name,
                 co.credits,
                 co.position,
                 (select count(*) from public.attendance_sessions ase where ase.course_id = co.id) as sessions,
                 (select coalesce(sum(ase.duration_minutes), 0) from public.attendance_sessions ase where ase.course_id = co.id) as weekly_minutes,
                 (select count(*) from public.grade_components gc where gc.course_id = co.id) as components,
                 (select count(*) from public.grade_components gc where gc.course_id = co.id and gc.score is not null) as graded,
                 (select coalesce(sum(gc.percentage), 0) from public.grade_components gc where gc.course_id = co.id) as weight_total,
                 (select count(*) from public.attendance_absences aa where aa.course_id = co.id) as absences,
                 (select coalesce(sum(aa.minutes), 0) from public.attendance_absences aa
                   where aa.course_id = co.id and coalesce(aa.excused, false) = false) as absence_minutes
               from public.courses co
               where co.user_id = target_user_id and co.semester_id = s.id
             ) c
           )
         ) order by s.is_active desc, s.start_date desc nulls last, s.name), '[]'::jsonb)
    into res
    from public.semesters s
   where s.user_id = target_user_id;
  return res;
end;
$$;

revoke all on function public.admin_user_semesters(uuid) from public, anon;
grant execute on function public.admin_user_semesters(uuid) to authenticated;
