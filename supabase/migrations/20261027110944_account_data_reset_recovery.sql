-- LOCAL REVIEW ONLY. Owner approved implementation, not production application.
-- Reset/restore personal data atomically; identity/access/shared ledgers survive.
create schema if not exists account_reset;
revoke all on schema account_reset from public, anon, authenticated, service_role;
alter default privileges in schema account_reset revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema account_reset revoke all on functions from public, anon, authenticated, service_role;

create table account_reset.state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation bigint not null default 0 check (generation >= 0),
  progress_after timestamptz,
  last_operation uuid,
  changed_at timestamptz,
  kind text,
  source_id uuid,
  operation_txid bigint
);
create table account_reset.snapshots (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '30 days'),
  kind text not null check (kind in ('reset','restore')),
  source_id uuid,
  payload jsonb not null,
  check (expires_at > created_at)
);
create index account_reset_snapshots_user_expiry on account_reset.snapshots(user_id, expires_at);
create table account_reset.legacy_definitions (name text primary key, definition text not null);
alter table account_reset.state enable row level security;
alter table account_reset.snapshots enable row level security;
alter table account_reset.legacy_definitions enable row level security;
revoke all on all tables in schema account_reset from public, anon, authenticated, service_role;

create function account_reset.operation_allowed(p_user uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from account_reset.state where user_id=p_user
    and operation_txid=pg_catalog.txid_current() and last_operation is not null);
$$;

-- Every personal write takes the same per-account transaction lock as reset.
-- Missing generation remains compatible only until that account's first reset.
create function account_reset.guard_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare u uuid; owner_id uuid; expected bigint; supplied text;
begin
  u := auth.uid();
  if tg_table_schema='public' and tg_table_name='profiles' then
    if tg_op='DELETE' then owner_id:=old.id; else owner_id:=new.id; end if;
  else
    if tg_op='DELETE' then owner_id:=old.user_id; else owner_id:=new.user_id; end if;
  end if;
  -- Server jobs have no end-user JWT; their narrow existing access is retained.
  if u is null then if tg_op='DELETE' then return old; else return new; end if; end if;
  -- Existing study RPCs authorize hosts to close another member's room page or
  -- remove a member. Keep that authorization in those RPCs; fence the caller
  -- here without breaking legitimate shared-room moderation.
  if tg_table_schema='public' and u is distinct from owner_id then raise exception 'Account ownership mismatch' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text, 271027));
  if account_reset.operation_allowed(u) then if tg_op='DELETE' then return old; else return new; end if; end if;
  select generation into expected from account_reset.state where user_id=u;
  expected := coalesce(expected,0);
  supplied := coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-haven-data-generation','');
  if supplied='' and expected=0 then null;
  elsif supplied !~ '^[0-9]{1,16}$' or supplied::bigint<>expected then
    raise exception 'Account data changed; reload before saving' using errcode='40001';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','semesters','courses','grade_components','attendance_absences',
    'attendance_sessions','timetable_entries','planner_items','tasks','scheduled_pushes'] loop
    execute format('create trigger account_data_generation before insert or update or delete on public.%I for each row execute function account_reset.guard_write()',t);
  end loop;
  foreach t in array array['members','room_pages','ready_choices','focus_choices'] loop
    execute format('create trigger account_data_generation before insert or update or delete on study.%I for each row execute function account_reset.guard_write()',t);
  end loop;
end;
$$;

-- Preserve the deployed guard verbatim except for this private transaction-only
-- reset branch. Old and new normal writes retain monotonic counters/badges.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('backup.guard_preferences()'::regprocedure);
  if position('account_reset.operation_allowed' in definition)>0
    or regexp_count(definition,E'\nbegin\n')<>1 then raise exception 'Review changed preference guard before migration'; end if;
  insert into account_reset.legacy_definitions values ('backup.guard_preferences',definition);
  execute replace(definition,E'\nbegin\n',E'\nbegin\n  if account_reset.operation_allowed(new.id) then return new; end if;\n');
end;
$$;

create function account_reset.status_for(p_user uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('generation',coalesce((select generation from account_reset.state where user_id=p_user),0),
    'snapshots',coalesce((select jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,'expiresAt',expires_at,'kind',kind,'sourceId',source_id) order by created_at desc)
      from account_reset.snapshots where user_id=p_user and expires_at>clock_timestamp()),'[]'::jsonb),
    'latest',(select jsonb_build_object('id',last_operation,'createdAt',changed_at,'expiresAt',changed_at+interval '30 days','kind',kind,'sourceId',source_id)
      from account_reset.state where user_id=p_user and last_operation is not null));
$$;
create function public.account_data_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  return account_reset.status_for(auth.uid());
end;
$$;

create function account_reset.capture(p_user uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb; t text; rows jsonb;
begin
  select jsonb_build_object('preferences',coalesce(preferences,'{}'::jsonb)) into result from public.profiles where id=p_user;
  if result is null then raise exception 'Profile unavailable'; end if;
  foreach t in array array['semesters','courses','grade_components','attendance_sessions',
    'attendance_absences','timetable_entries','tasks','planner_items'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.%I x where user_id=$1',t) into rows using p_user;
    result := result || jsonb_build_object(t,rows);
  end loop;
  return result || jsonb_build_object(
    'awards',coalesce((select jsonb_agg(jsonb_build_object('id',id,'applied_at',applied_at)) from study.awards where user_id=p_user),'[]'::jsonb),
    'appearance',coalesce((select jsonb_agg(jsonb_build_object('group_id',group_id,'havi_name',havi_name,'havi_color',havi_color,'flower_color',flower_color)) from study.members where user_id=p_user),'[]'::jsonb),
    'reminders',coalesce((select jsonb_agg(to_jsonb(x)) from public.scheduled_pushes x where user_id=p_user and sent_at is null and cancelled_at is null),'[]'::jsonb));
end;
$$;

create function account_reset.change(p_operation uuid,p_expected_generation bigint,p_snapshot uuid,p_expected_user uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare u uuid:=auth.uid(); st account_reset.state; source account_reset.snapshots;
  existing account_reset.snapshots; before_data jsonb; target jsonb; t text; entry jsonb; preserved jsonb;
begin
  if u is null or u is distinct from p_expected_user or p_operation is null or p_expected_generation is null or p_expected_generation<0 then
    raise exception 'Invalid authenticated operation' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,271027));
  select * into existing from account_reset.snapshots where id=p_operation;
  if found then
    if existing.user_id<>u or existing.source_id is distinct from p_snapshot then raise exception 'Operation unavailable' using errcode='42501'; end if;
    return account_reset.status_for(u);
  end if;
  insert into account_reset.state(user_id) values(u) on conflict(user_id) do nothing;
  select * into st from account_reset.state where user_id=u for update;
  if st.generation<>p_expected_generation then raise exception 'Account data changed; reload before saving' using errcode='40001'; end if;
  if p_snapshot is not null then
    select * into source from account_reset.snapshots where id=p_snapshot and user_id=u and expires_at>clock_timestamp();
    if not found then raise exception 'Recovery snapshot unavailable' using errcode='42501'; end if;
    target := source.payload;
  end if;
  -- Lock the parent before reading the snapshot. All guarded writers also hold
  -- the account advisory lock, including pending writes from another tab.
  perform 1 from public.profiles where id=u for update;
  before_data := account_reset.capture(u);
  insert into account_reset.snapshots(id,user_id,kind,source_id,payload)
    values(p_operation,u,case when p_snapshot is null then 'reset' else 'restore' end,p_snapshot,before_data);
  update account_reset.state set generation=generation+1,progress_after=clock_timestamp(),changed_at=clock_timestamp(),
    kind=case when p_snapshot is null then 'reset' else 'restore' end,source_id=p_snapshot,
    last_operation=p_operation,operation_txid=pg_catalog.txid_current() where user_id=u;

  -- Preserve notification delivery history, but cancel every old pending alarm.
  update public.scheduled_pushes set cancelled_at=clock_timestamp() where user_id=u and sent_at is null and cancelled_at is null;
  -- The ledger is immutable/shared; acknowledge old personal projections rather
  -- than deleting awards or recreating XP after the reset.
  update study.awards set applied_at=coalesce(applied_at,clock_timestamp()) where user_id=u;
  update study.room_pages set is_open=false,awake=false where user_id=u;
  delete from study.ready_choices where user_id=u;
  delete from study.focus_choices where user_id=u;

  foreach t in array array['grade_components','attendance_absences','attendance_sessions',
    'timetable_entries','tasks','planner_items','courses','semesters'] loop
    execute format('delete from public.%I where user_id=$1',t) using u;
  end loop;
  if target is null then
    -- Walkthrough delivery markers are operational, not student content. Do
    -- not repeatedly send/show announcements when somebody clears their data.
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into preserved
      from jsonb_each(before_data->'preferences') where key='onboardingSeen' or key like 'whatsNewSeen\_%' escape '\';
    update public.profiles set preferences=preserved where id=u;
    update study.members set havi_name='Havi',havi_color='#a8d98a',flower_color='#e9a3c0' where user_id=u;
  else
    foreach t in array array['semesters','courses','grade_components','attendance_sessions',
      'attendance_absences','timetable_entries','tasks','planner_items'] loop
      execute format('insert into public.%1$I select (jsonb_populate_record(null::public.%1$I,x)).* from jsonb_array_elements($1) x',t)
        using coalesce(target->t,'[]'::jsonb);
    end loop;
    update public.profiles set preferences=target->'preferences' where id=u;
    for entry in select * from jsonb_array_elements(target->'awards') loop
      update study.awards set applied_at=(entry->>'applied_at')::timestamptz where id=(entry->>'id')::uuid and user_id=u;
    end loop;
    for entry in select * from jsonb_array_elements(target->'appearance') loop
      update study.members set havi_name=entry->>'havi_name',havi_color=entry->>'havi_color',flower_color=entry->>'flower_color'
        where user_id=u and group_id=(entry->>'group_id')::uuid;
    end loop;
    for entry in select * from jsonb_array_elements(target->'reminders') loop
      -- Never replay a notification whose original time passed, or one already
      -- accepted by the delivery provider during the recovery window.
      update public.scheduled_pushes set cancelled_at=null where user_id=u and id=(entry->>'id')::uuid
        and sent_at is null and send_at>clock_timestamp();
    end loop;
  end if;
  return account_reset.status_for(u);
end;
$$;

create function public.account_data_reset(p_operation uuid,p_expected_generation bigint,p_expected_user uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select account_reset.change(p_operation,p_expected_generation,null,p_expected_user);
$$;
create function public.account_data_restore(p_operation uuid,p_expected_generation bigint,p_snapshot uuid,p_expected_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_snapshot is null then raise exception 'Recovery snapshot required' using errcode='42501'; end if;
  return account_reset.change(p_operation,p_expected_generation,p_snapshot,p_expected_user);
end;
$$;

-- Rounds started before the latest change cannot recreate cleared progress
-- when their award is inserted later by the server's settlement job.
create function account_reset.guard_late_award() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cutoff timestamptz; started timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,271027));
  select progress_after into cutoff from account_reset.state where user_id=new.user_id;
  if cutoff is not null then
    select starts_at into started from study.rounds where id=new.round_id;
    if started is null or started<=cutoff then new.applied_at:=coalesce(new.applied_at,clock_timestamp()); end if;
  end if;
  return new;
end;
$$;
create trigger account_data_late_award before insert on study.awards for each row execute function account_reset.guard_late_award();

create function account_reset.expire() returns void language sql security invoker set search_path = '' as $$
  delete from account_reset.snapshots where expires_at<=clock_timestamp();
$$;
revoke all on all functions in schema account_reset from public,anon,authenticated,service_role;
revoke all on function public.account_data_status() from public,anon,service_role;
revoke all on function public.account_data_reset(uuid,bigint,uuid) from public,anon,service_role;
revoke all on function public.account_data_restore(uuid,bigint,uuid,uuid) from public,anon,service_role;
grant execute on function public.account_data_status(),public.account_data_reset(uuid,bigint,uuid),public.account_data_restore(uuid,bigint,uuid,uuid) to authenticated;
select cron.schedule('haven-account-data-recovery-expiry','20 1 * * *','select account_reset.expire();');

-- Safe disable/rollback: revoke the three public RPCs first. Retain generation
-- and late-award fences, state and snapshots so an older client cannot recreate
-- erased data. The archived preference guard is available for a separately
-- reviewed rollback after resets are disabled. Do not drop recovery payloads
-- before their expiry or blindly restore erased data as part of a rollback.
