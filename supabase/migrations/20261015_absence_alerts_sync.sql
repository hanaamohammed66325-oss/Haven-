-- Absence alerts: one notification per level, cancellable without being used up.
--
-- Why: the absence warning went out every day. The app now sends one alert per
-- level (the university's warning levels, or 40/60/80% of the student's limit,
-- then denial), through the existing scheduled_pushes outbox, keyed
-- `att-<course>-<limit>-<level>`. A delivered row is never sent again (the
-- scheduler-tick cron only sends rows whose sent_at is null).
--
-- The outbox had no way to tell a CANCELLED row from a DELIVERED one: both only
-- stamp sent_at. So cancelling a pending level (alerts turned off, an absence
-- removed before the send time) used it up for good. cancelled_at marks a
-- cancellation; such a row can be brought back.
--
-- sync_absence_alerts(alerts) makes the student's `att-` rows match the levels
-- they are at now, in one step, one call at a time per student:
--   - a pending level that is no longer current is cancelled (sent_at and
--     cancelled_at stamped, so the cron skips it);
--   - a current level is queued, or brought back if it was cancelled;
--   - a delivered level is never touched, so it is never sent again.
-- Only `att-` rows of the signed-in student. Other reminders (smart-, task-) and
-- the cron are unchanged.

alter table public.scheduled_pushes add column if not exists cancelled_at timestamptz;

create or replace function public.sync_absence_alerts(p_alerts jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_keys text[];
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
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

revoke all on function public.sync_absence_alerts(jsonb) from public, anon;
grant execute on function public.sync_absence_alerts(jsonb) to authenticated;
