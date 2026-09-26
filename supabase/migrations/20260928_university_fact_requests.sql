-- Links the admin wants turned into a university's calendar. The admin pastes
-- an official calendar link on the University facts page ("Prepare from this
-- link"); the link waits here as `pending` until it's read in a working session
-- with Claude (free — no API), which adds the dates to university_facts as
-- `review` rows for the admin to approve, and marks the link `done` (or
-- `failed` with a note, e.g. the site blocks reading). Admins only.

create table if not exists public.university_fact_requests (
  id              uuid primary key default gen_random_uuid(),
  university_slug text not null,
  url             text not null check (url ~ '^https?://'),
  title           text,
  status          text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  note            text,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  done_at         timestamptz
);

create index if not exists university_fact_requests_status_idx
  on public.university_fact_requests (status, created_at);

alter table public.university_fact_requests enable row level security;

drop policy if exists "admins manage fact requests" on public.university_fact_requests;
create policy "admins manage fact requests" on public.university_fact_requests
  for all to authenticated
  using (public.is_admin_current())
  with check (public.is_admin_current());

revoke all on public.university_fact_requests from anon;
grant select, insert, update, delete on public.university_fact_requests to authenticated;
