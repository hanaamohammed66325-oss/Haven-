-- Students confirm what we know about their university, and Haven learns from
-- them (her decisions, 2026-09-25):
--
--   • Absence rules prepared from the university's documents reach students as a
--     SUGGESTION before an admin approves them (status 'review'). No percentage
--     is shown until the student confirms the rule ("صح"), or tells us theirs.
--   • Calendars from an unofficial source are stored as 'suggested'; in the
--     middle of the term the student is asked to confirm their term's dates.
--   • Every answer is a vote (crowd_votes). 5 or more students agreeing, with
--     fewer than 3 disagreeing, approves the rule / calendar automatically. With
--     3 or more disagreeing nothing is approved and the admin page flags it.
--   • A university with no rule at all gets the one 5 students gave identically
--     (again only while fewer than 3 answered differently).

-- ── 1. Rules waiting for approval are readable, as suggestions ──────────────
drop policy if exists "verified attendance policies are public" on public.attendance_policies;
drop policy if exists "verified and suggested attendance policies are public" on public.attendance_policies;
create policy "verified and suggested attendance policies are public" on public.attendance_policies
  for select to anon, authenticated
  using (status in ('verified', 'review'));

-- ── 2. Suggested calendar facts ──────────────────────────────────────────────
alter table public.university_facts drop constraint if exists university_facts_status_check;
alter table public.university_facts
  add constraint university_facts_status_check check (status in ('verified', 'review', 'suggested', 'rejected'));
alter table public.university_facts drop constraint if exists university_facts_verified_via_check;
alter table public.university_facts
  add constraint university_facts_verified_via_check check (verified_via in ('admin', 'crowd'));

drop policy if exists "verified facts are public" on public.university_facts;
drop policy if exists "verified and suggested facts are public" on public.university_facts;
create policy "verified and suggested facts are public" on public.university_facts
  for select to anon, authenticated
  using (status in ('verified', 'suggested'));

-- ── 3. Votes ─────────────────────────────────────────────────────────────────
--   attendance: period '' · answer {method, max_absence, max_unexcused, excused_counts}
--   calendar:   period 'YYYY-YYYY|first' · answer {start, finals_start}
create table if not exists public.crowd_votes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject         text not null check (subject in ('attendance', 'calendar')),
  university_slug text not null check (university_slug ~ '^[a-z0-9-]{2,60}$'),
  period          text not null default '' check (period = '' or period ~ '^[0-9]{4}-[0-9]{4}\|(first|second|summer)$'),
  agrees          boolean not null,
  answer          jsonb not null check (jsonb_typeof(answer) = 'object'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, subject, university_slug, period)
);

create index if not exists crowd_votes_target_idx on public.crowd_votes (subject, university_slug, period);

alter table public.crowd_votes enable row level security;
revoke all on public.crowd_votes from anon;
grant select, insert, update on public.crowd_votes to authenticated;

drop policy if exists "students add their own votes" on public.crowd_votes;
create policy "students add their own votes" on public.crowd_votes
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "students change their own votes" on public.crowd_votes;
create policy "students change their own votes" on public.crowd_votes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "students read their own votes" on public.crowd_votes;
create policy "students read their own votes" on public.crowd_votes
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_current());

-- ── 4. Counting ──────────────────────────────────────────────────────────────
-- Two rules are the same when they deny at the same limits, counted the same way.
create or replace function public.attendance_rule_key(method text, max_absence numeric, max_unexcused numeric, excused_counts boolean)
returns text
language sql
immutable
as $$
  select case
    when coalesce(excused_counts, true) then
      coalesce(method, 'unspecified') || '|' || coalesce(trim_scale(max_absence)::text, '') || '|' || coalesce(trim_scale(max_unexcused)::text, '') || '|1'
    else
      coalesce(method, 'unspecified') || '|' || coalesce(trim_scale(coalesce(max_unexcused, max_absence))::text, '') || '||0'
  end
$$;

create or replace function public.attendance_vote_key(answer jsonb)
returns text
language sql
immutable
as $$
  select public.attendance_rule_key(
    answer->>'method',
    nullif(answer->>'max_absence', '')::numeric,
    nullif(answer->>'max_unexcused', '')::numeric,
    coalesce((answer->>'excused_counts')::boolean, true)
  )
$$;

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
  yr text;
  tm text;
  fs text;
  ts text;
  top_start text;
begin
  if new.subject = 'attendance' then
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

  elsif new.subject = 'calendar' and new.period <> '' then
    yr := split_part(new.period, '|', 1);
    tm := split_part(new.period, '|', 2);
    if not exists (
      select 1 from public.university_facts
        where university_slug = new.university_slug and academic_year = yr and term = tm and status = 'suggested'
    ) then
      return new;
    end if;
    select value->>'date' into ts from public.university_facts
      where university_slug = new.university_slug and academic_year = yr and term = tm
        and fact_key = 'term_start' and status in ('verified', 'suggested');
    select value->>'date' into fs from public.university_facts
      where university_slug = new.university_slug and academic_year = yr and term = tm
        and fact_key = 'finals_start' and status in ('verified', 'suggested');

    select count(*) filter (where (ts is null or answer->>'start' = ts) and (fs is null or answer->>'finals_start' = fs)),
           count(*) filter (where not ((ts is null or answer->>'start' = ts) and (fs is null or answer->>'finals_start' = fs)))
      into n_agree, n_differ
      from public.crowd_votes
      where subject = 'calendar' and university_slug = new.university_slug and period = new.period;

    if n_agree >= 5 and n_differ < 3 then
      update public.university_facts
        set status = 'verified', verified_via = 'crowd', reviewed_at = now(), updated_at = now()
        where university_slug = new.university_slug and academic_year = yr and term = tm and status = 'suggested';
      -- No start date was suggested: the one the agreeing students share.
      if ts is null then
        select answer->>'start' into top_start
          from public.crowd_votes
          where subject = 'calendar' and university_slug = new.university_slug and period = new.period
            and (fs is null or answer->>'finals_start' = fs) and answer->>'start' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          group by 1
          having count(*) >= 5
          order by count(*) desc
          limit 1;
        if top_start is not null then
          insert into public.university_facts
            (university_slug, academic_year, term, fact_key, value, status, verified_via, sources, note, reviewed_at)
          values (new.university_slug, yr, tm, 'term_start', jsonb_build_object('date', top_start), 'verified', 'crowd',
                  '[]'::jsonb, 'Confirmed by students', now())
          on conflict (university_slug, academic_year, term, fact_key) do nothing;
        end if;
      end if;
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.crowd_votes_apply() from public, anon, authenticated;

drop trigger if exists crowd_votes_apply on public.crowd_votes;
create trigger crowd_votes_apply
  after insert or update on public.crowd_votes
  for each row execute function public.crowd_votes_apply();

-- ── 5. Suggested calendars (laamea.com — unofficial; finals dates only, which
--      matched the official calendar every time we could compare; its holidays
--      did not, so the app's official national breaks are used instead) ─────
insert into public.university_facts
  (university_slug, academic_year, term, fact_key, value, status, sources, note)
select v.slug, '2026-2027', v.term, v.key, jsonb_build_object('date', v.d), 'suggested',
       jsonb_build_array(jsonb_build_object('url', 'https://laamea.com/calendar/' || v.code, 'title', 'laamea.com (unofficial)')),
       'Unofficial source — suggested until students confirm it or an official calendar is found.'
from (values
  ('majmaah',         'mu',   'first',  'term_start',   '2026-08-23'),
  ('majmaah',         'mu',   'first',  'finals_start', '2026-12-20'),
  ('majmaah',         'mu',   'first',  'finals_end',   '2027-01-05'),
  ('majmaah',         'mu',   'second', 'term_start',   '2027-01-17'),
  ('shaqra',          'su',   'first',  'finals_start', '2026-12-20'),
  ('hafr-albatin',    'uhb',  'first',  'finals_start', '2026-12-20'),
  ('hafr-albatin',    'uhb',  'first',  'finals_end',   '2027-01-05'),
  ('hafr-albatin',    'uhb',  'second', 'finals_start', '2027-05-30'),
  ('hafr-albatin',    'uhb',  'second', 'finals_end',   '2027-06-15'),
  ('ksau-hs',         'ksau', 'first',  'finals_start', '2026-12-27'),
  ('ksau-hs',         'ksau', 'second', 'finals_start', '2027-06-06'),
  ('islamic-madinah', 'iu',   'first',  'finals_start', '2026-11-29'),
  ('islamic-madinah', 'iu',   'first',  'finals_end',   '2026-12-15'),
  ('bahah',           'bu',   'first',  'finals_start', '2026-12-27'),
  ('bahah',           'bu',   'first',  'finals_end',   '2027-01-07'),
  ('bahah',           'bu',   'second', 'finals_start', '2027-06-06'),
  ('bahah',           'bu',   'second', 'finals_end',   '2027-06-22')
) as v(slug, code, term, key, d)
on conflict (university_slug, academic_year, term, fact_key) do nothing;

update public.university_fact_requests
  set status = 'done', done_at = now(),
      note = 'laamea.com is unofficial: its holidays start a teaching day early and miss university breaks. Only the finals dates were kept, as a suggestion students confirm.'
  where status = 'pending' and url like 'https://laamea.com/%';
