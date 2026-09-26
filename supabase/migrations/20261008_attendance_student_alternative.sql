-- A second rule for a university, as its students describe it (her request,
-- 2026-09-26, Jazan: "ضيف لهم نظام ... كخيار وقول بناء على طلاب جامعتك").
--
-- The rule read from the university's documents stays the main one; next to
-- it the student sees the rule their fellow students describe, labelled as
-- coming from them, and picks whichever their university actually applies.
-- Stored as another university-wide row with scope_name 'students' and
-- details.alternative = true (the unique index is on slug + scope +
-- scope_name, so it sits beside the main row).
--
-- Jazan, from a message in a Jazan students' group (a screenshot she sent):
--   absence without an excuse reaching 25% → denied;
--   all absence (excused + unexcused) reaching 50% → denied;
--   counted per lecture ("نسبة الغياب الواحد للمقرر").

insert into public.attendance_policies
  (university_slug, country, scope, scope_name, method, max_absence, max_unexcused, excused_counts,
   details, effective, status, note, sources)
select 'jazan', 'SA', 'university', 'students', 'lectures', 50, 25, true,
       jsonb_build_object('alternative', true, 'crowd', true, 'limit_inclusive', true),
       'من طلاب الجامعة', 'review',
       'من رسالة في مجموعة لطلاب جامعة جازان (صورة أرسلتها الأدمن 2026-09-26): الغياب بدون عذر إذا وصل 25% حرمان، والغياب الكلي (بعذر وبدون عذر) إذا وصل 50% حرمان، ويُحسب بنسبة الغياب الواحد للمقرر. ليس من اللائحة؛ اللائحة 1444هـ تنص على 20%.',
       jsonb_build_array(jsonb_build_object('url', 'photo:jazan/students-group-2026-09-26', 'title', 'رسالة من طلاب جامعة جازان (صورة أرسلتها الأدمن)'))
 where not exists (
   select 1 from public.attendance_policies
    where university_slug = 'jazan' and scope = 'university' and scope_name = 'students');

-- Students get the main rule first, then any rule from students beside it.
create or replace function public.student_attendance_policy(p_slug text)
 returns table(id uuid, university_slug text, university_name text, scope text, method text, max_absence numeric, max_unexcused numeric, excused_counts boolean, excuse_floor_attendance numeric, separate_components boolean, component_limits jsonb, warnings jsonb, late_rule text, details jsonb, status text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id, p.university_slug, p.university_name, p.scope, p.method,
         p.max_absence, p.max_unexcused, p.excused_counts, p.excuse_floor_attendance,
         p.separate_components, p.component_limits, p.warnings, p.late_rule,
         -- only the flags the app reads; college/program rules carry sources
         coalesce(
           (select jsonb_object_agg(e.key, e.value)
              from jsonb_each(p.details) e
             where e.key in ('limit_inclusive', 'crowd', 'auto_verified', 'alternative')),
           '{}'::jsonb
         ),
         p.status
    from public.attendance_policies p
   where auth.uid() is not null
     and p.university_slug = p_slug
     and p.scope = 'university'
     and p.status in ('verified', 'review')
   order by (coalesce(p.scope_name, '') = '') desc, (p.status = 'verified') desc
   limit 4;
$function$;

revoke all on function public.student_attendance_policy(text) from public, anon;
grant execute on function public.student_attendance_policy(text) to authenticated;

-- Votes are counted against the main rule only (a student who picks the
-- students' rule counts as differing from it, so the admin sees it).
create or replace function public.crowd_votes_apply()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  p public.attendance_policies%rowtype;
  k text;
  n_agree int;
  n_differ int;
  n_total int;
  top_key text;
  top_n int;
  sample jsonb;
begin
  -- Calendar answers are only stored; the admin dashboard counts them.
  if new.subject <> 'attendance' then
    return new;
  end if;

  select * into p from public.attendance_policies
    where university_slug = new.university_slug and scope = 'university' and status <> 'rejected'
      and coalesce(scope_name, '') = ''
    order by (status = 'verified') desc
    limit 1;

  if found then
    k := public.attendance_rule_key(p.method, p.max_absence, p.max_unexcused, p.excused_counts);
    select count(*) filter (where public.attendance_vote_key(answer) = k),
           count(*) filter (where public.attendance_vote_key(answer) <> k)
      into n_agree, n_differ
      from public.crowd_votes
      where subject = 'attendance' and university_slug = new.university_slug;
    if p.status = 'review' and n_agree >= 5 and n_differ < 3 then
      update public.attendance_policies
        set status = 'verified',
            last_verified = now(),
            details = details || jsonb_build_object('auto_verified', true, 'confirmed_by', n_agree),
            updated_at = now()
        where id = p.id;
    elsif p.status = 'verified' and (p.details->>'auto_verified') = 'true' and n_differ >= 3 then
      update public.attendance_policies
        set status = 'review',
            details = details || jsonb_build_object('auto_verified', false, 'reopened_by', n_differ),
            updated_at = now()
        where id = p.id;
    end if;
  elsif not exists (
    select 1 from public.attendance_policies where university_slug = new.university_slug and scope = 'university'
  ) then
    select count(*) into n_total
      from public.crowd_votes where subject = 'attendance' and university_slug = new.university_slug;
    select public.attendance_vote_key(answer), count(*)
      into top_key, top_n
      from public.crowd_votes
      where subject = 'attendance' and university_slug = new.university_slug
      group by 1
      order by 2 desc
      limit 1;
    if top_n >= 5 and n_total - top_n < 3 then
      select answer into sample
        from public.crowd_votes
        where subject = 'attendance' and university_slug = new.university_slug
          and public.attendance_vote_key(answer) = top_key
        limit 1;
      insert into public.attendance_policies
        (university_slug, scope, method, max_absence, max_unexcused, excused_counts, status, last_verified, details, note)
      values (
        new.university_slug,
        'university',
        coalesce(nullif(sample->>'method', ''), 'unspecified'),
        nullif(sample->>'max_absence', '')::numeric,
        nullif(sample->>'max_unexcused', '')::numeric,
        coalesce((sample->>'excused_counts')::boolean, true),
        'verified',
        now(),
        jsonb_build_object('crowd', true, 'auto_verified', true, 'confirmed_by', top_n),
        'From students: ' || top_n || ' gave this same rule.'
      )
      on conflict do nothing;
    end if;
  end if;
  return new;
end
$function$;

-- Rollback:
--   delete from public.attendance_policies where university_slug = 'jazan' and scope_name = 'students';
--   (and restore the two functions from 20261001_crowd_confirmations.sql: limit 1, no scope_name filter)
