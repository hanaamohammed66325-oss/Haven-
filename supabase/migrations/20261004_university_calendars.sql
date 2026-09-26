-- Holiday calendars for universities outside Saudi Arabia, and what their
-- students tell us about them (her decisions, 2026-09-25):
--
--   • Calendars read from a university's official source live in the app's code
--     (lib/countryHolidays). One we reach later — from a new official source or
--     from what the university's own students reported — is published here by
--     the admin, so it reaches that university's students without an app update.
--   • Every calendar reaches students as a SUGGESTION. The student reviews it
--     (removing or adding holidays) and confirms "these are my university's
--     holidays" (preferences.academic.holidayCheck). The admin page counts the
--     answers per university: 5 confirming with fewer than 3 changing it flags
--     the calendar, and the admin approves it by hand. Nothing approves itself.
--   • A university with no calendar of its own gets its country's official
--     holidays; the admin page lists those universities by how many students
--     they have, with the holidays those students added — the research queue.
--
-- Security: the table is admin-only. A signed-in student reads ONLY their own
-- university's calendar, through student_university_calendar(), which returns
-- only what the app shows. The admin reads students' answers through
-- admin_holiday_reports(), guarded by is_admin_current().

-- ── 1. Published calendars (admin only) ─────────────────────────────────────

create table if not exists public.university_calendars (
  -- the university catalogue's slug (lib/gradeCatalog), or one the admin gives
  -- a university outside it; never a country code
  key         text primary key check (key ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  -- the typed names (normalised, lib/universityCountry normalizeName) that
  -- point to this university, for one outside the catalogue
  names       text[] not null default '{}'
              check (cardinality(names) <= 30 and array_position(names, null) is null),
  country     text not null check (country ~ '^[A-Z]{2}$' and country <> 'SA'),
  name_ar     text not null check (char_length(name_ar) between 1 and 120),
  name_en     text not null check (char_length(name_en) between 1 and 120),
  academic_year text not null check (academic_year ~ '^[0-9]{4}-[0-9]{4}$'),
  -- [{"name_ar","name_en","start","end","estimated"?}] — ISO dates, inclusive
  holidays    jsonb not null
              check (jsonb_typeof(holidays) = 'array' and jsonb_array_length(holidays) between 1 and 60),
  status      text not null default 'suggested' check (status in ('suggested', 'verified', 'rejected')),
  -- official = read from the university's own calendar · students = what its
  -- students reported
  source      text not null check (source in ('official', 'students')),
  sources     jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  note        text check (note is null or char_length(note) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz
);

create index if not exists university_calendars_names_idx
  on public.university_calendars using gin (names);

alter table public.university_calendars enable row level security;

drop policy if exists "admins manage university calendars" on public.university_calendars;
create policy "admins manage university calendars" on public.university_calendars
  for all to authenticated
  using (public.is_admin_current())
  with check (public.is_admin_current());

revoke all on public.university_calendars from public, anon, authenticated;
grant select, insert, update, delete on public.university_calendars to authenticated;

-- ── 2. What a student's app gets: their own university's calendar ───────────
-- p_slug: the catalogue slug their university's name matched (or null);
-- p_name: their typed university name, normalised. Returns at most one row.

create or replace function public.student_university_calendar(p_slug text, p_name text)
returns table (
  key text,
  country text,
  name_ar text,
  name_en text,
  academic_year text,
  holidays jsonb,
  status text,
  source text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.key, c.country, c.name_ar, c.name_en, c.academic_year, c.holidays, c.status, c.source
    from public.university_calendars c
   where auth.uid() is not null
     and c.status in ('suggested', 'verified')
     and ((p_slug is not null and c.key = p_slug)
          or (nullif(trim(p_name), '') is not null and c.names @> array[trim(p_name)]))
   order by (p_slug is not null and c.key = p_slug) desc
   limit 1;
$$;

revoke all on function public.student_university_calendar(text, text) from public, anon;
grant execute on function public.student_university_calendar(text, text) to authenticated;

-- ── 3. What the admin reads: every student's university and holiday edits ──
-- The admin page tells Saudi from other universities, and works out each
-- calendar, with the same code the app uses.

create or replace function public.admin_holiday_reports()
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
           'email', u.email,
           'last_active_at', p.last_active_at,
           'slug', nullif(p.preferences->'academic'->>'universitySlug', ''),
           'name', nullif(trim(p.preferences->'academic'->>'universityName'), ''),
           'check', p.preferences->'academic'->'holidayCheck',
           'dismissed', coalesce(p.preferences->'dismissedHolidays', '[]'::jsonb),
           'custom', coalesce(p.preferences->'customHolidays', '[]'::jsonb)
         )), '[]'::jsonb)
    into res
    from public.profiles p
    join auth.users u on u.id = p.id
   where nullif(trim(p.preferences->'academic'->>'universityName'), '') is not null;
  return res;
end;
$$;

revoke all on function public.admin_holiday_reports() from public, anon;
grant execute on function public.admin_holiday_reports() to authenticated;

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
--   drop function if exists public.admin_holiday_reports();
--   drop function if exists public.student_university_calendar(text, text);
--   drop table if exists public.university_calendars;
