-- Calendars: students see every calendar on record as a suggestion, and only the
-- admin approves one.
--
-- Before: a calendar prepared from the university's official source (status
-- 'review') wasn't shown to students at all until approved, and a suggested
-- calendar approved itself once 5 students confirmed it.
--
-- Now: 'review' calendars reach students as suggestions too (the app already
-- labels them "suggested, awaiting official approval" and asks mid-term). The
-- students' answers are only counted: 5 agreeing (fewer than 3 not) flags the
-- calendar for the admin, who approves it from the admin dashboard. Nothing
-- about a calendar changes by itself.
--
-- Absence rules still approve themselves at 5 agreeing (fewer than 3 not) —
-- but only until 3 students disagree: a rule the students approved then goes
-- back to waiting for the admin (students see it as a suggestion again). A
-- rule the admin approved stays approved.

-- ── What a student's app gets: review rows go out as 'suggested' ────────────

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
  select case when f.status = 'verified' then 'verified' else 'suggested' end,
         f.verified_via, f.academic_year, f.term, f.fact_key, f.value
    from public.university_facts f
   where auth.uid() is not null
     and f.university_slug = p_slug
     and f.status in ('verified', 'suggested', 'review');
$$;

revoke all on function public.student_university_facts(text) from public, anon;
grant execute on function public.student_university_facts(text) to authenticated;

-- ── Votes: calendars are counted, never approved automatically ──────────────

create or replace function public.crowd_votes_apply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.crowd_votes_apply() from public, anon, authenticated;
