-- Absence alerts: bind each sync to the account whose data built it.
--
-- Why: the app reads the signed-in account, then the Supabase client fetches
-- the request's token separately. If the device switched accounts in between,
-- account A's alerts (course names) reached the server under B's token, and
-- sync_absence_alerts(p_alerts) wrote them into B's outbox: it trusted
-- auth.uid() alone.
--
-- Now the app sends the account the alerts belong to (p_expected_uid, the
-- account whose data is on screen), and the function refuses the request
-- before writing anything unless auth.uid() is that same account (42501). The
-- old one-argument version is dropped, so no call path skips the check. The
-- app that calls it isn't deployed yet, so nothing calls the old version.
--
-- Unchanged from 20261015_absence_alerts_sync.sql: cancel without using up
-- (cancelled_at), bring back a cancelled level, never touch a delivered one;
-- only the caller's `att-` rows; one sync per student at a time; signed-in
-- users only.

drop function if exists public.sync_absence_alerts(jsonb);

create or replace function public.sync_absence_alerts(p_expected_uid uuid, p_alerts jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_keys text[];
begin
  if v_uid is null or p_expected_uid is null or v_uid <> p_expected_uid then
    raise exception 'not the account these alerts belong to' using errcode = '42501';
  end if;
  if p_alerts is null or jsonb_typeof(p_alerts) <> 'array' or jsonb_array_length(p_alerts) > 100 then
    raise exception 'alerts must be an array of at most 100' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_alerts) a
    where jsonb_typeof(a) <> 'object'
       or coalesce(a->>'key', '') !~ '^att-[A-Za-z0-9._-]{1,150}$'
       or coalesce(a->>'title', '') = '' or length(a->>'title') > 200
       or coalesce(a->>'body', '') = '' or length(a->>'body') > 500
       or coalesce(a->>'send_at', '') !~ '^\d{4}-\d{2}-\d{2}T'
  ) then
    raise exception 'bad alert' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_alerts) a
    where (a->>'send_at')::timestamptz not between now() - interval '1 day' and now() + interval '2 days'
  ) then
    raise exception 'send_at out of range' using errcode = '22023';
  end if;

  -- One sync per student at a time (two tabs or devices).
  perform pg_advisory_xact_lock(hashtextextended('absence-alerts:' || v_uid::text, 0));

  select coalesce(array_agg(distinct a->>'key'), '{}')
    into v_keys
    from jsonb_array_elements(p_alerts) a;

  -- Pending levels that are no longer current: cancelled, not used up.
  update public.scheduled_pushes
     set sent_at = now(), cancelled_at = now()
   where user_id = v_uid
     and dedup_key like 'att-%'
     and sent_at is null
     and dedup_key <> all (v_keys);

  -- Current levels: queued, or brought back if cancelled. Delivered ones stay.
  insert into public.scheduled_pushes as s (user_id, dedup_key, send_at, title, body)
  select distinct on (a->>'key')
         v_uid, a->>'key', (a->>'send_at')::timestamptz, a->>'title', a->>'body'
    from jsonb_array_elements(p_alerts) a
  on conflict (user_id, dedup_key) do update
     set send_at = excluded.send_at,
         title = excluded.title,
         body = excluded.body,
         sent_at = null,
         cancelled_at = null
   where s.sent_at is null or s.cancelled_at is not null;
end;
$$;

revoke all on function public.sync_absence_alerts(uuid, jsonb) from public, anon;
grant execute on function public.sync_absence_alerts(uuid, jsonb) to authenticated;
