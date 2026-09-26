-- Attendance (حرمان) policies — how each university counts absence, read from
-- its OFFICIAL regulation. The Saudi unified regulation (CUA 1444, Art. 14–15)
-- leaves the percentage to each university council, so there is no universal
-- 25%: Haven applies a university's rule only once an admin has verified it
-- against the source. Until then a student sees their absences logged but no
-- percentage, and can tell us their university's rule.
--
--   attendance_policies          one row per university (or a college/program
--                                inside it); status verified | review | rejected.
--                                Everyone can read verified rows; admins write.
--   attendance_policy_reports    what a student told us about their university's
--                                (or one course's) rule. The student's own answer
--                                applies to them right away in the app; it becomes
--                                the university's rule only when an admin accepts
--                                it together with an official regulation link.

create table if not exists public.attendance_policies (
  id                      uuid primary key default gen_random_uuid(),
  -- our university slug (src/lib/tools/universities.ts), or a new slug for a
  -- university outside that list (e.g. other Arab countries)
  university_slug         text not null,
  university_name         text,
  country                 text not null default 'SA' check (country ~ '^[A-Z]{2}$'),
  scope                   text not null default 'university' check (scope in ('university', 'college', 'program')),
  scope_name              text,
  -- hours = contact hours · lectures = sessions · count = a number of absences,
  -- not a % · none = no denial at all · unspecified = the regulation doesn't say
  method                  text not null default 'unspecified'
                          check (method in ('hours', 'lectures', 'count', 'none', 'unspecified')),
  max_absence             numeric check (max_absence is null or (max_absence > 0 and max_absence <= 100)),
  max_unexcused           numeric check (max_unexcused is null or (max_unexcused > 0 and max_unexcused <= 100)),
  excused_counts          boolean not null default true,
  excuse_floor_attendance numeric check (excuse_floor_attendance is null or (excuse_floor_attendance > 0 and excuse_floor_attendance <= 100)),
  separate_components     boolean,
  component_limits        jsonb,
  warnings                jsonb not null default '[]'::jsonb,
  late_rule               text,
  -- rules the calculator can't apply yet (per-college limits, count rules,
  -- limits that depend on course size…) kept for the admin and the student card
  details                 jsonb not null default '{}'::jsonb,
  effective               text,
  sources                 jsonb not null default '[]'::jsonb,
  note                    text,
  status                  text not null default 'review' check (status in ('verified', 'review', 'rejected')),
  last_verified           timestamptz,
  verified_by             uuid references auth.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index if not exists attendance_policies_scope_uniq
  on public.attendance_policies (university_slug, scope, coalesce(scope_name, ''));
create index if not exists attendance_policies_status_idx
  on public.attendance_policies (status, university_slug);

alter table public.attendance_policies enable row level security;

drop policy if exists "verified attendance policies are public" on public.attendance_policies;
create policy "verified attendance policies are public" on public.attendance_policies
  for select to anon, authenticated
  using (status = 'verified');

drop policy if exists "admins manage attendance policies" on public.attendance_policies;
create policy "admins manage attendance policies" on public.attendance_policies
  for all to authenticated
  using (public.is_admin_current())
  with check (public.is_admin_current());

revoke all on public.attendance_policies from anon;
grant select on public.attendance_policies to anon;
grant select, insert, update, delete on public.attendance_policies to authenticated;


create table if not exists public.attendance_policy_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  university_slug text,
  university_name text,
  country         text check (country is null or country ~ '^[A-Z]{2}$'),
  scope           text not null default 'university' check (scope in ('university', 'course')),
  course_name     text,
  -- {max_absence, method, excused_counts, max_unexcused, late_rule, note}
  answers         jsonb not null,
  regulation_url  text check (regulation_url is null or regulation_url ~ '^https?://'),
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'personal')),
  admin_note      text,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz,
  reviewed_by     uuid references auth.users (id) on delete set null
);

create index if not exists attendance_policy_reports_status_idx
  on public.attendance_policy_reports (status, university_slug, created_at);
create index if not exists attendance_policy_reports_user_idx
  on public.attendance_policy_reports (user_id);

alter table public.attendance_policy_reports enable row level security;

drop policy if exists "students add their own reports" on public.attendance_policy_reports;
create policy "students add their own reports" on public.attendance_policy_reports
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "students read their own reports" on public.attendance_policy_reports;
create policy "students read their own reports" on public.attendance_policy_reports
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "admins manage reports" on public.attendance_policy_reports;
create policy "admins manage reports" on public.attendance_policy_reports
  for all to authenticated
  using (public.is_admin_current())
  with check (public.is_admin_current());

revoke all on public.attendance_policy_reports from anon;
grant select, insert, update, delete on public.attendance_policy_reports to authenticated;
