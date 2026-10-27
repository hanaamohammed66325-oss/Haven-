-- Original launch: 2026-10-27 00:00 Asia/Riyadh (2026-10-26 21:00 UTC).
-- Owner explicitly authorized immediate launch after that deadline passed.
-- Apply only after the public frontend/image and authenticated Edge preflight
-- are verified. No contact or public access is enabled ahead of that instant.
do $$
begin
  if now() >= timestamptz '2026-11-09 21:00:00+00' then
    raise exception 'Campaign window has expired; review before arming';
  end if;
  if exists (select 1 from public.app_config where key = 'group-launch-20261027-schedule') then
    raise exception 'Launch already armed; preserve its existing state';
  end if;
  if not exists (select 1 from cron.job where jobname = 'haven-reengage-biweekly'
    and length(substring(command from $token$Bearer[[:space:]]+([^'"[:space:]]+)$token$)) > 16) then
    raise exception 'Existing scheduler authentication unavailable';
  end if;
end;
$$;

insert into public.app_config(key, value)
values ('group-launch-20261027-schedule', jsonb_build_object(
  'enabled', true, 'frontendReady', true, 'serverOpened', false,
  'startsAt', '2026-10-26T21:00:00.000Z',
  'expiresAt', '2026-11-09T21:00:00.000Z'
)::text);

create function study.run_group_launch_20261027()
returns void language plpgsql security invoker set search_path = '' as $$
declare
  schedule_state jsonb;
  campaign_state jsonb;
  scheduler_bearer text;
begin
  if now() < timestamptz '2026-10-26 21:00:00+00' then return; end if;
  select value::jsonb into schedule_state from public.app_config
    where key = 'group-launch-20261027-schedule' for update;
  select value::jsonb into campaign_state from public.app_config
    where key = 'group-launch-20261027';
  if now() >= timestamptz '2026-11-09 21:00:00+00'
    or campaign_state->>'phase' = 'complete' then
    perform cron.unschedule(jobid) from cron.job where jobname = 'haven-group-launch-20261027';
    return;
  end if;
  if schedule_state->>'enabled' is distinct from 'true'
    or schedule_state->>'frontendReady' is distinct from 'true'
    or schedule_state->>'startsAt' is distinct from '2026-10-26T21:00:00.000Z'
    or schedule_state->>'expiresAt' is distinct from '2026-11-09T21:00:00.000Z'
    or campaign_state->>'phase' = 'paused' then return; end if;
  -- Reuse the existing server-held scheduler credential entirely inside SQL.
  -- It is never returned, logged, embedded in this migration or sent to a client.
  select substring(command from $token$Bearer[[:space:]]+([^'"[:space:]]+)$token$)
    into scheduler_bearer from cron.job where jobname = 'haven-reengage-biweekly';
  if scheduler_bearer is null or length(scheduler_bearer) <= 16 then
    raise exception 'Existing scheduler authentication unavailable';
  end if;
  update study.config set enabled_for_all = true where id and not enabled_for_all;
  if schedule_state->>'serverOpened' is distinct from 'true' then
    update public.app_config set value = (schedule_state || '{"serverOpened":true}'::jsonb)::text,
      updated_at = now() where key = 'group-launch-20261027-schedule';
  end if;
  perform net.http_post(
    url := 'https://cseufbkuvhqrkjrhbvaj.supabase.co/functions/v1/group-launch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || scheduler_bearer),
    body := '{"mode":"tick"}'::jsonb,
    timeout_milliseconds := 90000
  );
end;
$$;
revoke all on function study.run_group_launch_20261027() from public, anon, authenticated, service_role;
comment on function study.run_group_launch_20261027() is 'Locked one-time group launch coordinator; exact UTC start, no early opening, no automatic retries of uncertain delivery.';

select cron.schedule('haven-group-launch-20261027', '* * * * *', 'select study.run_group_launch_20261027();');
select study.run_group_launch_20261027();

-- Recovery: disable this named cron and set the schedule enabled flag false.
-- Do not erase the campaign snapshot or any sending/review/sent status.
-- Reclosing study.config must be a separately reviewed owner decision.
