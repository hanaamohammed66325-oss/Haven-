-- Optional student contributions while the attendance calculation is suspended
-- (ACCURACY_PLAN.md, 2026-10-12). LOCAL, NOT APPLIED: apply only with Hanaa's
-- approval.
--
-- A student sends a covered (name/number hidden) image of their portal's
-- absence record for one course, the date the portal record covers (or
-- "unclear"), and whether the portal and their Haven log hold the same
-- absences (yes / no / unsure). The app freezes the course context it already
-- has (university, term dates, weekly sessions, logged absences) at sending
-- time, so later edits don't change the comparison. Contributions are review
-- material only: they change no calculation and approve no rule.
--
-- Locked by default:
--   • table: RLS on, no grants to anon/authenticated; written only through
--     submit_attendance_contribution() (the caller's own row), read only
--     through admin_attendance_contributions() (is_admin_current()).
--   • images: private bucket `attendance-evidence`, 600 KB a file, JPEG/WebP
--     only (the app re-encodes on the device). A student can add files only
--     under their own folder (<uid>/...) and can't read, list or replace any;
--     the admin reads them.
--   • at most 20 contributions per student per 24 hours.
-- Space: the free plan holds 1 GB of files; at 600 KB a file that is roughly
-- 1,700 images. The admin page shows the running total.
--
-- Deleting an account removes its rows (on delete cascade). Its images stay in
-- the bucket until the admin deletes them (open item: retention period).
--
-- Rollback:
--   drop function if exists public.admin_attendance_contributions();
--   drop function if exists public.admin_review_attendance_contribution(uuid, text);
--   drop function if exists public.submit_attendance_contribution(text, date, text, text, text, jsonb);
--   drop table if exists public.attendance_contributions;
--   drop policy if exists "students add own attendance evidence" on storage.objects;
--   drop policy if exists "admins read attendance evidence" on storage.objects;
--   drop policy if exists "admins delete attendance evidence" on storage.objects;
--   delete from storage.buckets where id = 'attendance-evidence';  -- after emptying it

create table if not exists public.attendance_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  image_path text not null,
  covers_until date,
  matches text not null check (matches in ('yes', 'no', 'unsure')),
  rule_url text check (rule_url is null or length(rule_url) <= 500),
  note text check (note is null or length(note) <= 1000),
  context jsonb not null check (pg_column_size(context) <= 20000),
  status text not null default 'new' check (status in ('new', 'reviewed'))
);

create index if not exists attendance_contributions_created
  on public.attendance_contributions (created_at desc);
create index if not exists attendance_contributions_user
  on public.attendance_contributions (user_id, created_at desc);

alter table public.attendance_contributions enable row level security;
revoke all on public.attendance_contributions from anon, authenticated;

-- Private bucket for the covered images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-evidence', 'attendance-evidence', false, 614400, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "students add own attendance evidence" on storage.objects;
create policy "students add own attendance evidence" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attendance-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "admins read attendance evidence" on storage.objects;
create policy "admins read attendance evidence" on storage.objects
  for select to authenticated
  using (bucket_id = 'attendance-evidence' and public.is_admin_current());

drop policy if exists "admins delete attendance evidence" on storage.objects;
create policy "admins delete attendance evidence" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attendance-evidence' and public.is_admin_current());

-- The student's own contribution. The image must already be in their folder.
create or replace function public.submit_attendance_contribution(
  p_image_path text,
  p_covers_until date,
  p_matches text,
  p_rule_url text,
  p_note text,
  p_context jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_image_path is null or p_image_path !~ ('^' || v_uid::text || '/[A-Za-z0-9-]{1,64}\.(jpg|webp)$') then
    raise exception 'bad image path' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'attendance-evidence' and o.name = p_image_path
  ) then
    raise exception 'image not uploaded' using errcode = '22023';
  end if;
  if exists (select 1 from public.attendance_contributions c where c.image_path = p_image_path) then
    raise exception 'image already used' using errcode = '22023';
  end if;
  if p_matches is null or p_matches not in ('yes', 'no', 'unsure') then
    raise exception 'bad answer' using errcode = '22023';
  end if;
  if p_covers_until is not null and (p_covers_until > current_date + 1 or p_covers_until < current_date - 400) then
    raise exception 'date out of range' using errcode = '22023';
  end if;
  if p_context is null or jsonb_typeof(p_context) <> 'object' then
    raise exception 'bad context' using errcode = '22023';
  end if;
  if (
    select count(*) from public.attendance_contributions c
     where c.user_id = v_uid and c.created_at > now() - interval '24 hours'
  ) >= 20 then
    raise exception 'too many today' using errcode = '54000';
  end if;

  insert into public.attendance_contributions (user_id, image_path, covers_until, matches, rule_url, note, context)
  values (
    v_uid, p_image_path, p_covers_until, p_matches,
    nullif(left(btrim(coalesce(p_rule_url, '')), 500), ''),
    nullif(left(btrim(coalesce(p_note, '')), 1000), ''),
    p_context
  )
  returning id into v_id;
  return v_id;
end
$$;

revoke all on function public.submit_attendance_contribution(text, date, text, text, text, jsonb) from public, anon;
grant execute on function public.submit_attendance_contribution(text, date, text, text, text, jsonb) to authenticated;

-- Admin: every contribution, newest first, with the student's email and the
-- image's size (the page totals it against the free plan's space).
create or replace function public.admin_attendance_contributions()
returns table (
  id uuid,
  user_id uuid,
  email text,
  created_at timestamptz,
  image_path text,
  covers_until date,
  matches text,
  rule_url text,
  note text,
  context jsonb,
  status text,
  image_bytes bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin_current() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select c.id, c.user_id, u.email::text, c.created_at, c.image_path, c.covers_until,
           c.matches, c.rule_url, c.note, c.context, c.status,
           (o.metadata->>'size')::bigint
      from public.attendance_contributions c
      left join auth.users u on u.id = c.user_id
      left join storage.objects o on o.bucket_id = 'attendance-evidence' and o.name = c.image_path
     order by c.created_at desc
     limit 500;
end
$$;

revoke all on function public.admin_attendance_contributions() from public, anon;
grant execute on function public.admin_attendance_contributions() to authenticated;

-- Admin: mark a contribution reviewed (or back to new).
create or replace function public.admin_review_attendance_contribution(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin_current() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_status not in ('new', 'reviewed') then
    raise exception 'bad status' using errcode = '22023';
  end if;
  update public.attendance_contributions set status = p_status where id = p_id;
end
$$;

revoke all on function public.admin_review_attendance_contribution(uuid, text) from public, anon;
grant execute on function public.admin_review_attendance_contribution(uuid, text) to authenticated;
