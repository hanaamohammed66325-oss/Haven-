-- Attendance suspension hardening, from Codex's review (research/
-- attendance-suspension/CODEX_REVIEW.md, F1 F2 F4 F5 F6 F9). Hanaa approved
-- the fixes on 2026-10-13 («اوافق»). Apply only after the rolled-back test.
--
-- F1  A durable server switch: while the attendance calculation is suspended,
--     no absence push can become pending (insert or re-queue, from any app
--     version). Delivered history stays, so dedup still works on reopening.
-- F2  Uploads into the evidence bucket are capped per student (per day and in
--     total) and for the whole bucket, in the upload permission itself.
-- F4  The daily contribution cap is taken under a per-student lock, and one
--     image backs one contribution (unique index).
-- F6  The contribution context is checked for shape and size on the server.
-- F5  Clean-up runs on a daily schedule (edge function attendance-evidence-
--     cleanup, service role only): images of accounts deleted more than 30
--     days ago, and images uploaded without a contribution (orphans).
-- F9  Admin list: filtered and paged on the server; totals counted separately.
--
-- Rollback (in this order):
--   select cron.unschedule('haven-attendance-evidence-cleanup');
--   drop trigger if exists scheduled_pushes_attendance_gate on public.scheduled_pushes;
--   drop function if exists public.scheduled_pushes_attendance_gate();
--   drop function if exists public.attendance_evidence_cleanup_candidates(integer);
--   drop function if exists public.attendance_evidence_forget(uuid[]);
--   drop function if exists public.admin_attendance_contribution_totals();
--   drop index if exists public.attendance_contributions_image_path;
--   restore the 20261024/20261025 definitions of submit_attendance_contribution,
--   admin_attendance_contributions and the storage insert policy;
--   delete from public.app_config where key = 'attendance_calc_suspended';

-- ---------------------------------------------------------------- F1 -------
insert into public.app_config (key, value, updated_at)
values ('attendance_calc_suspended', 'true', now())
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.attendance_calc_suspended()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select value = 'true' from public.app_config where key = 'attendance_calc_suspended'), false)
$$;
revoke all on function public.attendance_calc_suspended() from public, anon, authenticated;

create or replace function public.scheduled_pushes_attendance_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.dedup_key like 'att-%' and new.sent_at is null and public.attendance_calc_suspended() then
    -- Used up as cancelled: never delivered, and re-queued only once the
    -- switch is turned off (sync_absence_alerts reopens cancelled rows).
    new.sent_at := now();
    new.cancelled_at := now();
  end if;
  return new;
end
$$;
revoke all on function public.scheduled_pushes_attendance_gate() from public, anon, authenticated;

drop trigger if exists scheduled_pushes_attendance_gate on public.scheduled_pushes;
-- Named to run after notification_cadence (triggers fire in name order).
create trigger scheduled_pushes_attendance_gate
  before insert or update on public.scheduled_pushes
  for each row execute function public.scheduled_pushes_attendance_gate();

-- Anything still pending now goes through the gate.
update public.scheduled_pushes
   set sent_at = now(), cancelled_at = now()
 where dedup_key like 'att-%' and sent_at is null;

-- ---------------------------------------------------------------- F2 -------
create or replace function public.attendance_evidence_can_upload()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  -- Per student: 25 images a day, 300 in all.
  if (select count(*) from storage.objects o
       where o.bucket_id = 'attendance-evidence'
         and o.name like v_uid::text || '/%'
         and o.created_at > now() - interval '24 hours') >= 25 then
    return false;
  end if;
  if (select count(*) from storage.objects o
       where o.bucket_id = 'attendance-evidence'
         and o.name like v_uid::text || '/%') >= 300 then
    return false;
  end if;
  -- The whole bucket stays under 800 MB of the free plan's 1 GB.
  if (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o
       where o.bucket_id = 'attendance-evidence') >= 800 * 1024 * 1024 then
    return false;
  end if;
  return true;
end
$$;
revoke all on function public.attendance_evidence_can_upload() from public, anon;
grant execute on function public.attendance_evidence_can_upload() to authenticated;

drop policy if exists "students add own attendance evidence" on storage.objects;
create policy "students add own attendance evidence" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attendance-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.attendance_evidence_can_upload()
  );

-- ---------------------------------------------------------------- F4 -------
create unique index if not exists attendance_contributions_image_path
  on public.attendance_contributions (image_path);

-- ---------------------------------------------------------------- F4 + F6 --
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
  v_url text := nullif(left(btrim(coalesce(p_rule_url, '')), 500), '');
  v_course jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_image_path is null or p_image_path !~ ('^' || v_uid::text || '/[A-Za-z0-9-]{1,64}\.(jpg|webp)$') then
    raise exception 'bad image path' using errcode = '22023';
  end if;
  if p_matches is null or p_matches not in ('yes', 'no', 'unsure') then
    raise exception 'bad answer' using errcode = '22023';
  end if;
  if p_covers_until is not null and (p_covers_until > current_date + 1 or p_covers_until < current_date - 400) then
    raise exception 'date out of range' using errcode = '22023';
  end if;
  if v_url is not null and v_url !~* '^https?://[^\s]+$' then
    raise exception 'bad link' using errcode = '22023';
  end if;
  -- The context's shape (the admin page reads it).
  if p_context is null or jsonb_typeof(p_context) <> 'object' then
    raise exception 'bad context' using errcode = '22023';
  end if;
  v_course := p_context->'course';
  if v_course is null or jsonb_typeof(v_course) <> 'object'
     or jsonb_typeof(v_course->'name') is distinct from 'string' or length(v_course->>'name') > 200
     or (v_course ? 'sessions' and (jsonb_typeof(v_course->'sessions') <> 'array' or jsonb_array_length(v_course->'sessions') > 50))
     or (p_context ? 'absences' and (jsonb_typeof(p_context->'absences') <> 'array' or jsonb_array_length(p_context->'absences') > 500))
     or (p_context ? 'university' and jsonb_typeof(p_context->'university') <> 'object')
     or (p_context ? 'term' and jsonb_typeof(p_context->'term') <> 'object') then
    raise exception 'bad context' using errcode = '22023';
  end if;

  -- One submission per student at a time: the cap below can't be raced.
  perform pg_advisory_xact_lock(hashtextextended('attendance-contribution:' || v_uid::text, 0));

  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'attendance-evidence' and o.name = p_image_path
  ) then
    raise exception 'image not uploaded' using errcode = '22023';
  end if;
  if exists (select 1 from public.attendance_contributions c where c.image_path = p_image_path) then
    raise exception 'image already used' using errcode = '22023';
  end if;
  if (
    select count(*) from public.attendance_contributions c
     where c.user_id = v_uid and c.created_at > now() - interval '24 hours'
  ) >= 20 then
    raise exception 'too many today' using errcode = '54000';
  end if;

  insert into public.attendance_contributions (user_id, image_path, covers_until, matches, rule_url, note, context)
  values (
    v_uid, p_image_path, p_covers_until, p_matches, v_url,
    nullif(left(btrim(coalesce(p_note, '')), 1000), ''),
    p_context
  )
  returning id into v_id;
  return v_id;
end
$$;
revoke all on function public.submit_attendance_contribution(text, date, text, text, text, jsonb) from public, anon;
grant execute on function public.submit_attendance_contribution(text, date, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------- F9 -------
drop function if exists public.admin_attendance_contributions();
create or replace function public.admin_attendance_contributions(
  p_only_new boolean default false,
  p_before timestamptz default null,
  p_limit integer default 100
)
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
     where (c.account_deleted_at is null or c.account_deleted_at >= now() - interval '30 days')
       and (not coalesce(p_only_new, false) or c.status = 'new')
       and (p_before is null or c.created_at < p_before)
     order by c.created_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 200));
end
$$;
revoke all on function public.admin_attendance_contributions(boolean, timestamptz, integer) from public, anon;
grant execute on function public.admin_attendance_contributions(boolean, timestamptz, integer) to authenticated;

create or replace function public.admin_attendance_contribution_totals()
returns table (
  total bigint,
  fresh bigint,
  yes bigint,
  no bigint,
  unsure bigint,
  tracked_bytes bigint,
  bucket_bytes bigint,
  bucket_files bigint,
  orphan_files bigint,
  awaiting_deletion bigint
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
    select
      (select count(*) from public.attendance_contributions),
      (select count(*) from public.attendance_contributions where status = 'new'),
      (select count(*) from public.attendance_contributions where matches = 'yes'),
      (select count(*) from public.attendance_contributions where matches = 'no'),
      (select count(*) from public.attendance_contributions where matches = 'unsure'),
      (select coalesce(sum((o.metadata->>'size')::bigint), 0)
         from public.attendance_contributions c
         join storage.objects o on o.bucket_id = 'attendance-evidence' and o.name = c.image_path),
      (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o where o.bucket_id = 'attendance-evidence'),
      (select count(*) from storage.objects o where o.bucket_id = 'attendance-evidence'),
      (select count(*) from storage.objects o
        where o.bucket_id = 'attendance-evidence'
          and o.created_at < now() - interval '2 hours'
          and not exists (select 1 from public.attendance_contributions c where c.image_path = o.name)),
      (select count(*) from public.attendance_contributions
        where account_deleted_at is not null and account_deleted_at < now() - interval '30 days');
end
$$;
revoke all on function public.admin_attendance_contribution_totals() from public, anon;
grant execute on function public.admin_attendance_contribution_totals() to authenticated;

-- ---------------------------------------------------------------- F5 -------
-- For the clean-up edge function (service role only). Expired: the account
-- was deleted more than 30 days ago. Orphan: uploaded over 2 hours ago with
-- no contribution (a failed or abandoned send).
create or replace function public.attendance_evidence_cleanup_candidates(p_limit integer default 200)
returns table (kind text, contribution_id uuid, image_path text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  (select 'expired'::text, c.id, c.image_path
     from public.attendance_contributions c
    where c.account_deleted_at is not null
      and c.account_deleted_at < now() - interval '30 days'
    order by c.account_deleted_at
    limit greatest(1, least(coalesce(p_limit, 200), 500)))
  union all
  (select 'orphan'::text, null::uuid, o.name
     from storage.objects o
    where o.bucket_id = 'attendance-evidence'
      and o.created_at < now() - interval '2 hours'
      and not exists (select 1 from public.attendance_contributions c where c.image_path = o.name)
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 200), 500)))
$$;
revoke all on function public.attendance_evidence_cleanup_candidates(integer) from public, anon, authenticated;
grant execute on function public.attendance_evidence_cleanup_candidates(integer) to service_role;

-- Forget expired rows, only once their image is really gone from storage.
create or replace function public.attendance_evidence_forget(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  delete from public.attendance_contributions c
   where c.id = any (coalesce(p_ids, '{}'))
     and c.account_deleted_at is not null
     and c.account_deleted_at < now() - interval '30 days'
     and not exists (select 1 from storage.objects o
                      where o.bucket_id = 'attendance-evidence' and o.name = c.image_path);
  get diagnostics v_n = row_count;
  return v_n;
end
$$;
revoke all on function public.attendance_evidence_forget(uuid[]) from public, anon, authenticated;
grant execute on function public.attendance_evidence_forget(uuid[]) to service_role;
