-- Regulation links the admin wants read for a university's attendance (حرمان)
-- rule. On the Attendance policies page, each rule waiting for approval has a
-- box for another official link (a regulation page or PDF). The link waits
-- here as `pending` until it's read in a working session with Claude (free —
-- no API), who updates that university's `review` rule in attendance_policies
-- from it (with the quoted text and the link) for the admin to approve, and
-- marks the link `done` — or `failed` with a note (e.g. the site blocks
-- reading, or the page has no attendance rule). Admins only.

create table if not exists public.attendance_policy_requests (
  id              uuid primary key default gen_random_uuid(),
  -- an app university's slug, or null with a name for one outside the app list
  university_slug text,
  university_name text,
  country         text not null default 'SA' check (country ~ '^[A-Z]{2}$'),
  url             text not null check (url ~ '^https?://'),
  -- what to look for, e.g. "the nursing college's clinical rule"
  note            text check (note is null or char_length(note) <= 500),
  status          text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  -- what came out of reading it, or why it failed
  result_note     text,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  done_at         timestamptz,
  check (university_slug is not null or university_name is not null)
);

create index if not exists attendance_policy_requests_status_idx
  on public.attendance_policy_requests (status, created_at);

alter table public.attendance_policy_requests enable row level security;

drop policy if exists "admins manage policy requests" on public.attendance_policy_requests;
create policy "admins manage policy requests" on public.attendance_policy_requests
  for all to authenticated
  using (public.is_admin_current())
  with check (public.is_admin_current());

revoke all on public.attendance_policy_requests from anon;
grant select, insert, update, delete on public.attendance_policy_requests to authenticated;
