-- What each student chose or answered — their GPA system, absence rule, term
-- dates, holidays, notifications — in one place for the admin: the student
-- page's summary card (p_user = the student) and the Insights breakdowns
-- (p_user = null, every student). Admin only, like the other admin_* reads.
--
-- A term's courses and grades are shared only with the student's consent, so
-- this returns the answer to the GPA check (match / mismatch) but never the
-- grades themselves.
create or replace function public.admin_student_decisions(p_user uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare res jsonb;
begin
  if not public.is_admin_current() then raise exception 'not_authorized'; end if;

  select coalesce(jsonb_agg(row_data order by joined desc), '[]'::jsonb)
    into res
    from (
      select u.created_at as joined, jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'joined', u.created_at,
        'last_active_at', p.last_active_at,
        'academic', (p.preferences->'academic') - 'customScheme'
          || jsonb_build_object('customScheme', case when p.preferences->'academic'->'customScheme' is null then null else jsonb_build_object(
               'max', p.preferences->'academic'->'customScheme'->'max',
               'percent', p.preferences->'academic'->'customScheme'->'percent',
               'bands', jsonb_array_length(coalesce(p.preferences->'academic'->'customScheme'->'bands', '[]'::jsonb))) end),
        'attendanceRule', p.preferences->'attendanceRule',
        'attendancePolicyAck', p.preferences->'attendancePolicyAck',
        'attendanceEnabled', p.preferences->'attendanceEnabled',
        'ownLimits', case when jsonb_typeof(p.preferences->'ownLimits') = 'array' then jsonb_array_length(p.preferences->'ownLimits') else 0 end,
        'setupConfirmed', p.preferences->'setupConfirmed',
        'holidaysRemoved', case when jsonb_typeof(p.preferences->'dismissedHolidays') = 'array' then jsonb_array_length(p.preferences->'dismissedHolidays') else 0 end,
        'holidaysAdded', case when jsonb_typeof(p.preferences->'customHolidays') = 'array' then jsonb_array_length(p.preferences->'customHolidays') else 0 end,
        'cumulativeGpa', p.preferences->'cumulativeGpa',
        'cumulativeHours', p.preferences->'cumulativeHours',
        'gpaMode', p.preferences->'gpaMode',
        'gpaGoal', p.preferences->'gpaGoal',
        'termCheck', case when p.preferences->'termCheck' is null or jsonb_typeof(p.preferences->'termCheck') <> 'object' then null else jsonb_build_object(
          'answer', p.preferences->'termCheck'->'answer',
          'reason', p.preferences->'termCheck'->'reason',
          'consent', p.preferences->'termCheck'->'consent',
          'cum', p.preferences->'termCheck'->'cum'->'result',
          'snoozed', p.preferences->'termCheck'->'snoozeUntil' is not null) end,
        'pastTerms', case when jsonb_typeof(p.preferences->'pastTerms') = 'array' then (
          select jsonb_build_object(
            'count', count(*),
            'match', count(*) filter (where t->>'result' = 'match'),
            'mismatch', count(*) filter (where t->>'result' = 'mismatch'))
          from jsonb_array_elements(p.preferences->'pastTerms') t) end,
        'repeats', case when jsonb_typeof(p.preferences->'repeats'->'courses') = 'object'
          then (select count(*) from jsonb_object_keys(p.preferences->'repeats'->'courses')) else 0 end,
        'notifPrefs', p.preferences->'notifPrefs',
        'pushDevices', (select count(*) from public.push_subscriptions ps where ps.user_id = u.id),
        'language', p.preferences->'language',
        'theme', p.preferences->'theme',
        'gamification', case when jsonb_typeof(p.preferences->'gamification') = 'object' then jsonb_build_object(
          'xp', p.preferences->'gamification'->'xp',
          'streak', p.preferences->'gamification'->'streak'->'current',
          'longest', p.preferences->'gamification'->'streak'->'longest',
          'badges', case when jsonb_typeof(p.preferences->'gamification'->'badges') = 'array' then jsonb_array_length(p.preferences->'gamification'->'badges') else 0 end,
          'checkIns', p.preferences->'gamification'->'totalCheckIns') end,
        'votes', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'subject', v.subject, 'university', v.university_slug, 'period', v.period,
                   'agrees', v.agrees, 'keptOwn', coalesce((v.answer->>'kept_own')::boolean, false),
                   'at', v.updated_at) order by v.updated_at desc), '[]'::jsonb)
            from public.crowd_votes v where v.user_id = u.id),
        'policyReports', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'scope', r.scope, 'course', r.course_name, 'status', r.status, 'at', r.created_at)
                   order by r.created_at desc), '[]'::jsonb)
            from public.attendance_policy_reports r where r.user_id = u.id),
        'decisions', (
          select coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'at', e.created_at, 'meta', e.meta) order by e.created_at desc), '[]'::jsonb)
            from (
              select e.event, e.created_at,
                     -- a term's grades stay private: keep only what the event is about
                     case when e.event like 'term\_%' or e.event like 'past\_term%' then e.meta - 'courses' - 'grades' else e.meta end as meta
                from public.user_events e
               where e.user_id = u.id
                 and e.event not in ('page_view', 'app_open', 'log_attendance', 'log_marks', 'check_in', 'complete_task', 'complete_pomodoro')
               order by e.created_at desc
               limit case when p_user is null then 12 else 60 end
            ) e),
        'term', (
          select jsonb_build_object(
                   'start_date', s.start_date, 'end_date', s.end_date,
                   'teaching_weeks', s.teaching_weeks, 'finals_weeks', s.finals_weeks,
                   'courses', (select count(*) from public.courses c where c.semester_id = s.id),
                   'planner', (select count(*) from public.planner_items pi where pi.semester_id = s.id),
                   'timetable', (select count(*) from public.timetable_entries te where te.semester_id = s.id),
                   'grades', (select count(*) from public.grade_components g join public.courses c on c.id = g.course_id
                               where c.semester_id = s.id and g.score is not null),
                   'absences', (select count(*) from public.attendance_absences a join public.courses c on c.id = a.course_id
                                 where c.semester_id = s.id))
            from public.semesters s
           where s.user_id = u.id and s.is_active
           -- the semester the app opens: the one holding courses, else the oldest
           order by exists (select 1 from public.courses c where c.semester_id = s.id) desc, s.created_at asc
           limit 1)
      ) as row_data
      from auth.users u
      left join public.profiles p on p.id = u.id
     where p_user is null or u.id = p_user
    ) x;
  return res;
end;
$$;

revoke all on function public.admin_student_decisions(uuid) from public, anon;
grant execute on function public.admin_student_decisions(uuid) to authenticated, service_role;
