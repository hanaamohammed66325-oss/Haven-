-- 20261028_attendance_hardening_2.sql
--
-- Codex review round 2 (research/attendance-suspension/CODEX_REVIEW.md),
-- Hanaa's go-ahead 2026-10-13. Builds on 20261027_attendance_hardening.
--
-- R2.1 Upload caps can't be raced: the storage INSERT policy's check is now
--      VOLATILE and takes one transaction lock for the bucket, so uploads are
--      checked one after another, each seeing the ones committed before it
--      (a volatile function takes a fresh snapshot per query after the lock).
--      The byte cap keeps room for the incoming file: the bucket's own file
--      limit (600 KB) is reserved, so the total stays under 800 MB.
-- R2.2 The admin list pages by (created_at, id), so rows with the same time
--      are never skipped at a page boundary.
-- R2.5 Clean-up vs a late send: a contribution may only use an image uploaded
--      in the last hour, and the clean-up job only takes images older than two
--      hours with no contribution. An image the job can pick can never become
--      evidence afterwards, and evidence is never an orphan.

-- ---------------------------------------------------------------- R2.1 -----
create or replace function public.attendance_evidence_can_upload()
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_room bigint;
begin
  if v_uid is null then return false; end if;
  -- One upload checked at a time; held until the upload's transaction ends.
  perform pg_advisory_xact_lock(hashtextextended('attendance-evidence-upload', 0));
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
  -- The whole bucket stays under 800 MB of the free plan's 1 GB, with room
  -- kept for the file being uploaded (at most the bucket's file limit).
  select coalesce(b.file_size_limit, 614400) into v_room
    from storage.buckets b where b.id = 'attendance-evidence';
  if (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o
       where o.bucket_id = 'attendance-evidence') + coalesce(v_room, 614400) > 800 * 1024 * 1024 then
    return false;
  end if;
  return true;
end
$$;
revoke all on function public.attendance_evidence_can_upload() from public, anon;
grant execute on function public.attendance_evidence_can_upload() to authenticated;

-- ---------------------------------------------------------------- R2.5 -----
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
  -- Only a fresh upload (the app sends right after uploading). Older images
  -- belong to the clean-up job, which takes them after two hours.
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'attendance-evidence' and o.name = p_image_path
       and o.created_at > now() - interval '1 hour'
  ) then
    raise exception 'image too old' using errcode = '22023';
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

-- ---------------------------------------------------------------- R2.2 -----
drop function if exists public.admin_attendance_contributions(boolean, timestamptz, integer);
create or replace function public.admin_attendance_contributions(
  p_only_new boolean default false,
  p_before timestamptz default null,
  p_before_id uuid default null,
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
       -- Next page: strictly after the last row shown, by (time, id).
       and (p_before is null
            or c.created_at < p_before
            or (c.created_at = p_before and p_before_id is not null and c.id < p_before_id))
     order by c.created_at desc, c.id desc
     limit greatest(1, least(coalesce(p_limit, 100), 200));
end
$$;
revoke all on function public.admin_attendance_contributions(boolean, timestamptz, uuid, integer) from public, anon;
grant execute on function public.admin_attendance_contributions(boolean, timestamptz, uuid, integer) to authenticated;
