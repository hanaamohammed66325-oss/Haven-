-- Attendance contribution images: kept one month after the student deletes
-- their account (Hanaa, 2026-10-13), then removed. LOCAL, NOT APPLIED: apply
-- only with her approval.
--
-- Before: deleting an account deleted its rows (on delete cascade) and left
-- its images in the bucket with nothing pointing at them.
-- Now: the row stays with user_id null and account_deleted_at stamped; after
-- 30 days the admin page removes the image through the storage API (direct
-- SQL deletes on storage.objects are blocked by protect_objects_delete) and
-- then the row. Expired rows are hidden from the list at once.
--
-- Rollback:
--   drop function if exists public.admin_expired_attendance_evidence();
--   drop function if exists public.admin_forget_attendance_contributions(uuid[]);
--   drop trigger if exists attendance_contributions_account_deleted on public.attendance_contributions;
--   drop function if exists public.attendance_contributions_stamp_deleted();
--   (FK back to cascade:) alter table ... drop constraint ..., add ... on delete cascade;

alter table public.attendance_contributions
  add column if not exists account_deleted_at timestamptz;

alter table public.attendance_contributions
  alter column user_id drop not null;

alter table public.attendance_contributions
  drop constraint if exists attendance_contributions_user_id_fkey;
alter table public.attendance_contributions
  add constraint attendance_contributions_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

-- The set-null from the account delete is an update on this table: stamp it.
create or replace function public.attendance_contributions_stamp_deleted()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.user_id is null and old.user_id is not null then
    new.account_deleted_at := now();
  end if;
  return new;
end
$$;
revoke all on function public.attendance_contributions_stamp_deleted() from public, anon, authenticated;

drop trigger if exists attendance_contributions_account_deleted on public.attendance_contributions;
create trigger attendance_contributions_account_deleted
  before update of user_id on public.attendance_contributions
  for each row execute function public.attendance_contributions_stamp_deleted();

-- Admin: rows whose month is up (their images are to be removed).
create or replace function public.admin_expired_attendance_evidence()
returns table (id uuid, image_path text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin_current() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select c.id, c.image_path
      from public.attendance_contributions c
     where c.account_deleted_at is not null
       and c.account_deleted_at < now() - interval '30 days'
     limit 200;
end
$$;
revoke all on function public.admin_expired_attendance_evidence() from public, anon;
grant execute on function public.admin_expired_attendance_evidence() to authenticated;

-- Admin: drop expired rows once their images are gone. Only expired rows.
create or replace function public.admin_forget_attendance_contributions(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  if not public.is_admin_current() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.attendance_contributions c
   where c.id = any (coalesce(p_ids, '{}'))
     and c.account_deleted_at is not null
     and c.account_deleted_at < now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_n;
end
$$;
revoke all on function public.admin_forget_attendance_contributions(uuid[]) from public, anon;
grant execute on function public.admin_forget_attendance_contributions(uuid[]) to authenticated;

-- The list hides expired rows (they are on their way out).
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
     where c.account_deleted_at is null
        or c.account_deleted_at >= now() - interval '30 days'
     order by c.created_at desc
     limit 500;
end
$$;
