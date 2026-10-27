-- Growth page: exclude Hanaa's test accounts and the referral-trial accounts
-- from every Growth number, and add one plain summary RPC.
-- LOCAL DRAFT. Not applied. Applying needs Hanaa's separate approval.
-- Rollback: restore the previous bodies of the functions replaced below
-- (they are in 20261015090318_referral_growth_vip_disabled.sql,
-- 20261016084345_admin_outcome_summaries.sql and
-- 20261023111357_admin_referral_answers.sql plus the totals fix after it),
-- then drop growth.excluded_accounts, growth.is_excluded, growth.real_group
-- and public.growth_admin_summary.

-- 1. One private list of accounts that are not real students.
create table growth.excluded_accounts (
  user_id uuid primary key,
  label text not null,
  added_at timestamptz not null default now()
);
alter table growth.excluded_accounts enable row level security;
revoke all on table growth.excluded_accounts from public, anon, authenticated, service_role;

insert into growth.excluded_accounts (user_id, label)
select u.id, u.email
from auth.users u
where lower(btrim(u.email)) in (
  'hanaamohammed66325@gmail.com',
  'hanaamohammed25366@gmail.com',
  'lamesmohammed789@gmail.com',
  'hanaamurie@gmail.com',
  'hanaa25663@gmail.com',
  'hanmoh20066325@gmail.com',
  'lhl20052006@gmail.com',
  'lhl232526@gmail.com',
  'whateverll6825@gmail.com',
  'havenstudent.contact@gmail.com'
)
on conflict (user_id) do nothing;

-- Referral-trial accounts are excluded even if their emails change later.
insert into growth.excluded_accounts (user_id, label)
select owner_id, 'referral trial owner' from referral.pilot_config
union
select user_id, 'referral trial receiver' from referral.pilot_receivers where user_id is not null
on conflict (user_id) do nothing;

create function growth.is_excluded(p_uid uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from growth.excluded_accounts x where x.user_id = p_uid);
$$;
revoke all on function growth.is_excluded(uuid) from public, anon, authenticated, service_role;

-- A group counts only while it has at least one current member who is a real student.
create function growth.real_group(p_gid uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from study.members m
    where m.group_id = p_gid and m.left_at is null and not growth.is_excluded(m.user_id)
  );
$$;
revoke all on function growth.real_group(uuid) from public, anon, authenticated, service_role;

-- 2. Cohort metrics ignore excluded accounts.
create or replace function growth.cohort(p_groups boolean, p_target uuid, p_asof timestamptz)
returns jsonb language sql stable set search_path = '' as $$
 with entries as (
   select c.receiver_id as uid,c.claimed_at as entered,null::uuid as gid,true as acquired from referral.claims c
     where not p_groups and (p_target is null or c.owner_id=p_target)
       and not growth.is_excluded(c.receiver_id) and not growth.is_excluded(c.owner_id)
   union all select e.user_id,e.entered_at,e.group_id,
     exists(select 1 from growth.origins o where o.user_id=e.user_id and o.group_id=e.group_id and o.kind='invited' and o.new_account)
   from growth.group_entries e join study.groups g on g.id=e.group_id and g.deleted_at is null
   where p_groups and (p_target is null or e.group_id=p_target) and not growth.is_excluded(e.user_id)
 ), samples as materialized (
   select case when acquired then growth.activity(uid,entered,p_asof) else jsonb_build_object('week2',growth.zero_metric(),'week4',growth.zero_metric()) end as a,
     case when p_groups then growth.repeat_metric(gid,uid,entered,p_asof) else growth.zero_metric() end as r from entries
 )
 select jsonb_build_object('week2',growth.metric_sum(jsonb_agg(a->'week2')),'week4',growth.metric_sum(jsonb_agg(a->'week4')),'repeat',growth.metric_sum(jsonb_agg(r))) from samples;
$$;

-- 3. Growth page lists and totals ignore excluded accounts.
create or replace function public.growth_admin_page(p_expected_account uuid, p_view text, p_target uuid default null, p_cursor jsonb default null, p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); cfg growth.config%rowtype; asof timestamptz:=now(); rows jsonb:='[]'; row jsonb; r record; c record;
 lim integer:=least(50,greatest(1,coalesce(p_limit,25))); n integer:=0; next_cursor jsonb:=null; last_cursor jsonb;
 rank_before bigint; pending_before bigint; id_before text; at_before timestamptz; baseline jsonb; summary jsonb; metrics jsonb; a jsonb; flags integer; reasons jsonb; scopes jsonb;
begin
 if uid is null or uid is distinct from p_expected_account or not public.is_admin_current() then raise exception 'not_authorized' using errcode='42501'; end if;
 if p_view is null or p_view not in('referrals','referral_members','groups','group_members','sources') or p_view in('referral_members','group_members') and p_target is null
   or p_view in('referrals','groups','sources') and p_target is not null then raise exception 'invalid_view' using errcode='22023'; end if;
 if p_cursor is not null then
   if jsonb_typeof(p_cursor)<>'object' or not(p_cursor ?& array['id','rank','pending','at']) then raise exception 'invalid_cursor' using errcode='22023'; end if;
   id_before:=p_cursor->>'id'; rank_before:=(p_cursor->>'rank')::bigint; pending_before:=(p_cursor->>'pending')::bigint; at_before:=(p_cursor->>'at')::timestamptz;
   if rank_before is null or pending_before is null or rank_before<0 or pending_before<0 or id_before is null
     or p_view in('referral_members','group_members') and at_before is null then raise exception 'invalid_cursor' using errcode='22023'; end if;
   if p_view<>'sources' then id_before:=id_before::uuid::text; else perform id_before::date; end if;
 end if;
 select * into strict cfg from growth.config;
 select jsonb_build_object('owners',count(distinct owner_id) filter(where counted_at is not null),'counted',count(*) filter(where counted_at is not null),
 'pending',count(*) filter(where counted_at is null and (activated_at is not null or not referral.is_expired(receiver_id))),
 'incomplete',count(*) filter(where activated_at is null and referral.is_expired(receiver_id)),
 'groups',(select count(*) from study.groups gx where gx.deleted_at is null and growth.real_group(gx.id))) into summary
 from referral.claims c0 where not growth.is_excluded(c0.owner_id) and not growth.is_excluded(c0.receiver_id);
 baseline:=case when p_view in('referrals','groups') then growth.cohort(p_view='groups',null,asof)
   else jsonb_build_object('week2',growth.zero_metric(),'week4',growth.zero_metric(),'repeat',growth.zero_metric()) end;
 if p_view='referrals' then
  for r in with owners as (
   select owner_id,count(*) filter(where counted_at is not null)::integer as rank,
    count(*) filter(where counted_at is null and (activated_at is not null or not referral.is_expired(receiver_id)))::integer as pending,
    count(*) filter(where activated_at is null and referral.is_expired(receiver_id))::integer as incomplete,max(claimed_at) as last_at
   from referral.claims c1 where not growth.is_excluded(c1.owner_id) and not growth.is_excluded(c1.receiver_id) group by owner_id
  ) select o.*,left(p.preferences->>'profileName',120) as title,u.created_at from owners o join public.profiles p on p.id=o.owner_id join auth.users u on u.id=o.owner_id
    where p_cursor is null or (o.rank,o.pending,o.owner_id::text)<(rank_before,pending_before,id_before)
    order by o.rank desc,o.pending desc,o.owner_id desc limit lim+1 loop
   n:=n+1; if n>lim then next_cursor:=last_cursor; exit; end if;
   metrics:=growth.cohort(false,r.owner_id,asof); flags:=0;
   for c in select id from referral.claims where owner_id=r.owner_id and not growth.is_excluded(receiver_id) order by claimed_at desc,id desc limit 10 loop
    if jsonb_array_length(referral.review_evidence(c.id)->'families')>0 then flags:=flags+1; end if;
   end loop;
   row:=growth.row_data(r.owner_id::text,r.title,r.owner_id,r.created_at,null,r.last_at,jsonb_build_object('counted',r.rank,'pending',r.pending,'incomplete',r.incomplete,'review_flags',flags),metrics);
   rows:=rows||jsonb_build_array(row); last_cursor:=jsonb_build_object('id',r.owner_id,'rank',r.rank,'pending',r.pending,'at',null);
  end loop;
 elsif p_view='referral_members' then
  for r in select c.*,left(p.preferences->>'profileName',120) as title,u.created_at from referral.claims c
    left join auth.users u on u.id=c.receiver_id left join public.profiles p on p.id=c.receiver_id
    where c.owner_id=p_target and not growth.is_excluded(c.receiver_id) and (p_cursor is null or (c.claimed_at,c.id::text)<(at_before,id_before))
    order by c.claimed_at desc,c.id desc limit lim+1 loop
   n:=n+1; if n>lim then next_cursor:=last_cursor; exit; end if;
   a:=growth.activity(r.receiver_id,r.claimed_at,asof); reasons:=coalesce(referral.review_evidence(r.id)->'families','[]'::jsonb);
   row:=growth.row_data(r.id::text,r.title,r.receiver_id,r.created_at,r.claimed_at,(a->'activity'->>'last_active')::timestamptz,
     jsonb_build_object('counted',(r.counted_at is not null)::integer,'pending',(r.counted_at is null and (r.activated_at is not null or not referral.is_expired(r.receiver_id)))::integer,
       'incomplete',(r.activated_at is null and referral.is_expired(r.receiver_id))::integer,'review_flags',jsonb_array_length(reasons)),a,a->'activity',reasons);
   rows:=rows||jsonb_build_array(row); last_cursor:=jsonb_build_object('id',r.id,'rank',0,'pending',0,'at',r.claimed_at);
  end loop;
 elsif p_view='groups' then
  for r in with groups as (
    select g.*,(select count(distinct round_id)::integer from study.awards where group_id=g.id and not growth.is_excluded(user_id)) as rank,
      (select count(*)::integer from study.members where group_id=g.id and left_at is null and not growth.is_excluded(user_id)) as pending
    from study.groups g where g.deleted_at is null and growth.real_group(g.id)
  ) select * from groups g where p_cursor is null or (g.rank,g.pending,g.id::text)<(rank_before,pending_before,id_before)
    order by g.rank desc,g.pending desc,g.id desc limit lim+1 loop
   n:=n+1; if n>lim then next_cursor:=last_cursor; exit; end if;
   metrics:=growth.cohort(true,r.id,asof);
   row:=growth.row_data(r.id::text,r.name,r.owner_id,r.created_at,null,(select max(started_at) from study.sittings where group_id=r.id),
     jsonb_build_object('members',r.pending,'rounds',r.rank,'minutes',(select coalesce(sum(minutes),0) from study.awards where group_id=r.id and not growth.is_excluded(user_id)),
       'acquired',(select count(*) from growth.origins where group_id=r.id and kind='invited' and new_account and not growth.is_excluded(user_id))),metrics);
   rows:=rows||jsonb_build_array(row); last_cursor:=jsonb_build_object('id',r.id,'rank',r.rank,'pending',r.pending,'at',null);
  end loop;
 elsif p_view='group_members' then
  for r in select m.*,e.entered_at,left(p.preferences->>'profileName',120) as title,u.created_at,coalesce(e.entered_at,m.joined_at) as sort_at
    from study.members m left join growth.group_entries e on e.group_id=m.group_id and e.user_id=m.user_id
    left join public.profiles p on p.id=m.user_id left join auth.users u on u.id=m.user_id
    where m.group_id=p_target and not growth.is_excluded(m.user_id) and (p_cursor is null or (coalesce(e.entered_at,m.joined_at),m.user_id::text)<(at_before,id_before))
    order by coalesce(e.entered_at,m.joined_at) desc,m.user_id desc limit lim+1 loop
   n:=n+1; if n>lim then next_cursor:=last_cursor; exit; end if;
   a:=growth.activity(r.user_id,r.entered_at,asof); a:=a||jsonb_build_object('repeat',growth.repeat_metric(p_target,r.user_id,r.entered_at,asof));
   row:=growth.row_data(r.user_id::text,coalesce(r.title,r.display_name),r.user_id,r.created_at,r.entered_at,(a->'activity'->>'last_active')::timestamptz,
     jsonb_build_object('members',(r.left_at is null)::integer,'rounds',(select count(*) from study.awards where user_id=r.user_id and group_id=p_target),
       'minutes',(select coalesce(sum(minutes),0) from study.awards where user_id=r.user_id and group_id=p_target),'joined_at',r.joined_at),a,a->'activity');
   rows:=rows||jsonb_build_array(row); last_cursor:=jsonb_build_object('id',r.user_id,'rank',0,'pending',0,'at',r.sort_at);
  end loop;
 else
  -- Signup cohorts since prospective tracking start; source flags may overlap.
  for r in with cohorts as (
    select date_trunc('week',u.created_at at time zone 'Asia/Riyadh')::date as week,u.id,
      exists(select 1 from referral.claims where receiver_id=u.id) as code,
      exists(select 1 from growth.origins where user_id=u.id and kind='invited' and new_account) as invited,
      m.source,m.answered_at
    from auth.users u left join referral.members m on m.user_id=u.id where u.created_at>=cfg.started_at and u.created_at<=asof and u.deleted_at is null and not coalesce(u.is_anonymous,false)
      and not growth.is_excluded(u.id)
  ) select week,count(*) filter(where code)::integer as code,count(*) filter(where invited)::integer as invited,
    count(*) filter(where code and invited)::integer as overlap,count(*) filter(where not code and not invited)::integer as neither,
    count(*) filter(where source='friend')::integer as friend,count(*) filter(where source='social')::integer as social,
    count(*) filter(where source is null and answered_at is not null)::integer as skipped
   from cohorts where p_cursor is null or week<id_before::date group by week order by week desc limit lim+1 loop
   n:=n+1; if n>lim then next_cursor:=last_cursor; exit; end if;
   row:=growth.row_data(r.week::text,null,null,r.week::timestamp at time zone 'Asia/Riyadh',null,null,
     jsonb_build_object('counted',r.code,'acquired',r.invited,'overlap',r.overlap,'incomplete',r.neither,'members',r.friend,'rounds',r.social,'pending',r.skipped),
     jsonb_build_object('week2',growth.zero_metric(),'week4',growth.zero_metric()));
   rows:=rows||jsonb_build_array(row); last_cursor:=jsonb_build_object('id',r.week::text,'rank',0,'pending',0,'at',r.week::timestamp at time zone 'Asia/Riyadh');
  end loop;
 end if;
 scopes:=public.referral_admin_sources();
 return jsonb_build_object('account_id',uid,'view',p_view,'target',p_target,'as_of',asof,'tracking_started_at',cfg.started_at,'tracking_enabled',cfg.enabled,
   'program_enabled',(select enabled from referral.config),'summary',summary,'baseline',baseline,'survey_totals',scopes,'rows',rows,'next_cursor',next_cursor);
end;
$$;

-- 4. Source survey totals ignore excluded accounts.
create or replace function public.referral_admin_sources()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin_current() then raise exception 'not_authorized' using errcode='42501'; end if;
  return (select jsonb_build_object('friend',count(*) filter(where source='friend'),'social',count(*) filter(where source='social'),
    'skipped',count(*) filter(where answered_at is not null and source is null))
    from referral.members m where not growth.is_excluded(m.user_id));
end;
$$;

-- 5. New-user source answers (list + totals) ignore excluded accounts.
create or replace function public.referral_admin_answers(p_expected_account uuid, p_before_created_at timestamptz default null, p_before_id uuid default null, p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tracking_start timestamptz;
  lim integer := least(50, greatest(1, coalesce(p_limit, 25)));
  totals jsonb;
  items jsonb := '[]'::jsonb;
  next_cursor jsonb := null;
  last_cursor jsonb := null;
  item record;
  n integer := 0;
begin
  if uid is null or uid is distinct from p_expected_account or public.is_admin_current() is distinct from true then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'invalid_cursor' using errcode = '22023';
  end if;

  select cfg.started_at into strict tracking_start from growth.config cfg where cfg.singleton;
  select jsonb_build_object(
    'total', count(*)::integer,
    'social', count(*) filter (where m.source = 'social')::integer,
    'friend', count(*) filter (where m.source = 'friend')::integer,
    'skipped', count(*) filter (where m.source is null and m.answered_at is not null)::integer,
    'unanswered', count(*) filter (where m.source is null and m.answered_at is null)::integer,
    'code_entered', count(*) filter (where m.claimed_code is not null)::integer,
    'pilot_codes', count(*) filter (where m.claimed_code is not null and pc.claim_id is not null)::integer,
    'unclassified_codes', count(*) filter (where m.claimed_code is not null and c.id is null)::integer
  ) into totals
  from auth.users u
  left join referral.members m on m.user_id = u.id
  left join referral.claims c on c.receiver_id = u.id
  left join referral.pilot_claims pc on pc.claim_id = c.id
  where u.created_at >= tracking_start
    and u.deleted_at is null
    and not coalesce(u.is_anonymous, false)
    and not growth.is_excluded(u.id);

  for item in
    select u.id, u.email, u.created_at, m.source, m.answered_at,
      case
        when m.claimed_code is null then 'none'
        when c.id is null then 'owner_removed'
        when c.counted_at is not null then 'counted'
        when c.activated_at is null and referral.is_expired(u.id) then 'expired'
        else 'pending'
      end as code_status,
      pc.claim_id is not null as pilot
    from auth.users u
    left join referral.members m on m.user_id = u.id
    left join referral.claims c on c.receiver_id = u.id
    left join referral.pilot_claims pc on pc.claim_id = c.id
    where u.created_at >= tracking_start
      and u.deleted_at is null
      and not coalesce(u.is_anonymous, false)
      and not growth.is_excluded(u.id)
      and (p_before_created_at is null or (u.created_at, u.id) < (p_before_created_at, p_before_id))
    order by u.created_at desc, u.id desc
    limit lim + 1
  loop
    n := n + 1;
    if n > lim then
      next_cursor := last_cursor;
      exit;
    end if;
    items := items || jsonb_build_array(jsonb_build_object(
      'id', item.id,
      'email', item.email,
      'created_at', item.created_at,
      'source', item.source,
      'answered_at', item.answered_at,
      'code_status', item.code_status,
      'pilot', item.pilot
    ));
    last_cursor := jsonb_build_object('id', item.id, 'created_at', item.created_at);
  end loop;

  return jsonb_build_object('account_id', uid, 'totals', totals, 'rows', items, 'next_cursor', next_cursor);
end;
$$;

-- 6. Outcome cards and sustained use use the same exclusion list.
create or replace function growth.outcome_window(p_start timestamptz,p_end timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
 with cfg as (select enabled,started_at from growth.config),
 trial as (select owner_id as id from referral.pilot_config union select user_id from referral.pilot_receivers where user_id is not null
   union select user_id from growth.excluded_accounts),
 accounts as materialized (select u.id,u.created_at from auth.users u where u.deleted_at is null and not coalesce(u.is_anonymous,false) and not exists(select 1 from trial t where t.id=u.id)),
 actions as materialized (select a.* from growth.outcome_actions(p_start-interval '28 days',p_end) a join accounts u on u.id=a.user_id),
 claims as materialized (select c.* from referral.claims c join accounts u on u.id=c.receiver_id
   where not exists(select 1 from referral.pilot_claims t where t.claim_id=c.id)
     and not exists(select 1 from trial t where t.id=c.owner_id)),
 entries as materialized (select e.* from growth.group_entries e join accounts u on u.id=e.user_id),
 signup as (
   select u.*,cfg.enabled and u.created_at>=cfg.started_at as covered,
     exists(select 1 from claims c where c.receiver_id=u.id and c.claimed_at<p_end) as code,
     exists(select 1 from growth.origins o where o.user_id=u.id and o.kind='invited' and o.new_account and o.entered_at<p_end) as invited
   from accounts u cross join cfg where u.created_at>=p_start and u.created_at<p_end
 ),
 activation as (
   select 'referral_activation'::text as key,c.receiver_id as uid,c.claimed_at as entered,
     cfg.enabled and c.claimed_at>=cfg.started_at as covered,
     c.counted_at is not null and c.counted_at<c.claimed_at+interval '7 days' as yes
   from claims c cross join cfg where c.claimed_at>=p_start-interval '7 days' and c.claimed_at<p_end-interval '7 days'
   union all
   select 'group_activation',e.user_id,e.entered_at,cfg.enabled and e.entered_at>=cfg.started_at,
     exists(select 1 from study.awards a where a.user_id=e.user_id and a.group_id=e.group_id and a.awarded_at>=e.entered_at and a.awarded_at<e.entered_at+interval '7 days')
   from entries e cross join cfg where e.entered_at>=p_start-interval '7 days' and e.entered_at<p_end-interval '7 days'
 ),
 first_entry as (
   select uid,min(entered) as entered from (
     select receiver_id as uid,claimed_at as entered from claims
     union all select user_id,entered_at from entries
   ) x group by uid
 ),
 continued as (
   select w.key,e.uid,e.entered,cfg.enabled and e.entered>=cfg.started_at as covered,
     exists(select 1 from actions a where a.user_id=e.uid and a.at>=e.entered+w.from_day*interval '1 day' and a.at<e.entered+w.until_day*interval '1 day') as yes
   from first_entry e cross join cfg cross join (values('week2',7,14),('week4',21,28)) w(key,from_day,until_day)
   where e.entered>=p_start-w.until_day*interval '1 day' and e.entered<p_end-w.until_day*interval '1 day'
 ),
 repeated as (
   select e.user_id,e.entered_at,cfg.enabled and e.entered_at>=cfg.started_at as covered,
     exists(select 1 from study.awards a where a.user_id=e.user_id and a.group_id=e.group_id and a.awarded_at>=e.entered_at+interval '7 days' and a.awarded_at<e.entered_at+interval '14 days'
       and exists(select 1 from study.awards first where first.user_id=e.user_id and first.group_id=e.group_id and first.awarded_at>=e.entered_at and first.awarded_at<e.entered_at+interval '7 days')) as yes
   from entries e cross join cfg where e.entered_at>=p_start-interval '14 days' and e.entered_at<p_end-interval '14 days'
     and exists(select 1 from study.awards a where a.user_id=e.user_id and a.group_id=e.group_id and a.awarded_at>=e.entered_at and a.awarded_at<e.entered_at+interval '7 days')
 ),
 metrics as (
   select 'referral_share' as key,count(*) filter(where covered and code) as yes,count(*) filter(where covered) as total,count(*) filter(where not covered) as unknown from signup
   union all select 'group_share',count(*) filter(where covered and invited),count(*) filter(where covered),count(*) filter(where not covered) from signup
   union all select key,count(*) filter(where covered and yes),count(*) filter(where covered),count(*) filter(where not covered) from activation group by key
   union all select key,count(*) filter(where covered and yes),count(*) filter(where covered),count(*) filter(where not covered) from continued group by key
   union all select 'group_repeat',count(*) filter(where covered and yes),count(*) filter(where covered),count(*) filter(where not covered) from repeated
 ), keys as (select unnest(array['referral_share','group_share','referral_activation','group_activation','group_repeat','week2','week4']) as key)
 select jsonb_build_object('start',p_start,'end',p_end,'metrics',jsonb_object_agg(k.key,jsonb_build_object('yes',coalesce(m.yes,0),'total',coalesce(m.total,0),'unknown',coalesce(m.unknown,0))))
 from keys k left join metrics m on m.key=k.key;
$$;

create or replace function public.growth_admin_overview(p_expected_account uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); asof timestamptz:=now(); result jsonb;
begin
 if uid is null or uid is distinct from p_expected_account or not coalesce(public.is_admin_current(),false) then raise exception 'not_authorized' using errcode='42501';end if;
 select jsonb_build_object('account_id',uid,'as_of',asof,'tracking_enabled',c.enabled,'tracking_started_at',c.started_at,
   'trial_accounts',(select count(distinct id) from (select owner_id as id from referral.pilot_config union select user_id from referral.pilot_receivers where user_id is not null
      union select user_id from growth.excluded_accounts) t),
   'current',growth.outcome_window(asof-interval '28 days',asof),'previous',growth.outcome_window(asof-interval '56 days',asof-interval '28 days'))
 into result from growth.config c;
 return result;
end;$$;

create or replace function public.admin_sustained_use(p_expected_account uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); asof timestamptz:=now(); result jsonb;
begin
 if uid is null or uid is distinct from p_expected_account or not coalesce(public.is_admin_current(),false) then raise exception 'not_authorized' using errcode='42501';end if;
 with trial as (select owner_id as id from referral.pilot_config union select user_id from referral.pilot_receivers where user_id is not null),
 excluded as (
   select id from trial
   union select user_id from growth.excluded_accounts
 ),
 -- Account age is deliberately unrestricted; only activity is windowed.
 accounts as materialized (select u.id,p.preferences from auth.users u left join public.profiles p on p.id=u.id
   where u.deleted_at is null and not coalesce(u.is_anonymous,false) and not exists(select 1 from excluded t where t.id=u.id)),
 actions as materialized (select a.* from growth.outcome_actions(asof-interval '28 days',asof) a join accounts u on u.id=a.user_id),
 features as (
   select user_id,feature,count(*) as actions,count(distinct (at at time zone 'Asia/Riyadh')::date) as days from actions group by user_id,feature
 ), evidence as (
   select a.user_id,count(*) as actions,count(distinct (at at time zone 'Asia/Riyadh')::date) as days,
     (select count(*) from features f where f.user_id=a.user_id) as features,
     exists(select 1 from features f where f.user_id=a.user_id and f.actions>=10 and f.days>=7) as specialist
   from actions a group by a.user_id
 ), classified as (
   select *,days>=7 and actions>=10 and (features>=2 or specialist) as sustained from evidence
 ), streak as (
   select a.id,exists(select 1 from (values (a.preferences#>'{gamification,streak,current}',a.preferences#>>'{gamification,streak,lastActiveDate}'),
     (a.preferences#>'{pomodoroStats,currentDailyStreak}',a.preferences#>>'{pomodoroStats,lastSessionDate}')) s(n,d)
     where case when jsonb_typeof(s.n)='number' then s.n::text::numeric>=7 else false end
       and s.d in(select to_char((asof at time zone 'Asia/Riyadh')::date-x,'YYYY-MM-DD') from generate_series(0,3) x)) as high from accounts a
 ), feature_totals as (
   select k.feature,count(distinct f.user_id) as users,coalesce(sum(f.actions),0) as actions
   from unnest(array['grades','planner','pomodoro','group']) k(feature) left join features f on f.feature=k.feature group by k.feature
 )
 select jsonb_build_object('account_id',uid,'as_of',asof,'window_start',asof-interval '28 days',
   'total_accounts',(select count(*) from accounts),'observed_users',(select count(*) from classified),
   'sustained_users',(select count(*) from classified where sustained),
   'multi_feature_users',(select count(*) from classified where sustained and features>=2),
   'specialist_users',(select count(*) from classified where sustained and features=1),
   'high_streak_users',(select count(*) from streak where high),
   'excluded_accounts',(select count(distinct e.id) from excluded e join auth.users u on u.id=e.id where u.deleted_at is null and not coalesce(u.is_anonymous,false)),
   'features',(select jsonb_agg(jsonb_build_object('feature',feature,'users',users,'actions',actions) order by feature) from feature_totals)) into result;
 return result;
end;$$;

-- 7. One plain summary for the top of the Growth page. Real students only.
create function public.growth_admin_summary(p_expected_account uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); asof timestamptz := now(); cfg growth.config%rowtype; result jsonb;
begin
 if uid is null or uid is distinct from p_expected_account or not coalesce(public.is_admin_current(), false) then
   raise exception 'not_authorized' using errcode = '42501';
 end if;
 select * into strict cfg from growth.config;
 with rl as materialized (
   select u.id, u.created_at, u.email_confirmed_at is not null as confirmed, p.last_active_at
   from auth.users u left join public.profiles p on p.id = u.id
   where u.deleted_at is null and not coalesce(u.is_anonymous, false) and not growth.is_excluded(u.id)
 ),
 weeks as (
   select w::date as week
   from generate_series(
     date_trunc('week', (asof at time zone 'Asia/Riyadh')) - interval '7 weeks',
     date_trunc('week', (asof at time zone 'Asia/Riyadh')), interval '1 week') w
 ),
 weekly as (
   select k.week,
     count(r.id)::integer as signups,
     count(r.id) filter (where r.confirmed)::integer as confirmed
   from weeks k
   left join rl r on date_trunc('week', r.created_at at time zone 'Asia/Riyadh')::date = k.week
   group by k.week order by k.week
 ),
 useful as (
   select distinct a.user_id from growth.outcome_actions(asof - interval '7 days', asof) a join rl r on r.id = a.user_id
 ),
 sourced as (
   select r.id, m.source, m.answered_at, m.claimed_code
   from rl r left join referral.members m on m.user_id = r.id
   where r.created_at >= cfg.started_at
 ),
 groups_real as (
   select g.id from study.groups g where g.deleted_at is null and growth.real_group(g.id)
 )
 select jsonb_build_object(
   'account_id', uid, 'as_of', asof,
   'excluded_accounts', (select count(*) from growth.excluded_accounts x join auth.users u on u.id = x.user_id where u.deleted_at is null),
   'tracking_started_at', cfg.started_at,
   'accounts', jsonb_build_object(
     'total', (select count(*) from rl),
     'confirmed', (select count(*) from rl where confirmed),
     'unconfirmed', (select count(*) from rl where not confirmed),
     'new_7d', (select count(*) from rl where created_at > asof - interval '7 days'),
     'new_prev_7d', (select count(*) from rl where created_at <= asof - interval '7 days' and created_at > asof - interval '14 days'),
     'new_30d', (select count(*) from rl where created_at > asof - interval '30 days'),
     'with_course', (select count(distinct c.user_id) from public.courses c join rl r on r.id = c.user_id),
     'active_7d', (select count(*) from rl where last_active_at > asof - interval '7 days'),
     'useful_7d', (select count(*) from useful)),
   'weekly', (select jsonb_agg(jsonb_build_object('week', week, 'signups', signups, 'confirmed', confirmed) order by week) from weekly),
   'sources', jsonb_build_object(
     'cohort', (select count(*) from sourced),
     'social', (select count(*) from sourced where source = 'social'),
     'friend', (select count(*) from sourced where source = 'friend'),
     'skipped', (select count(*) from sourced where source is null and answered_at is not null),
     'unanswered', (select count(*) from sourced s join rl r on r.id = s.id where s.source is null and s.answered_at is null and r.confirmed),
     'unconfirmed', (select count(*) from sourced s join rl r on r.id = s.id where not r.confirmed),
     'code_entered', (select count(*) from sourced where claimed_code is not null)),
   'referrals', jsonb_build_object(
     'claims', (select count(*) from referral.claims c where not growth.is_excluded(c.owner_id) and not growth.is_excluded(c.receiver_id)),
     'counted', (select count(*) from referral.claims c where c.counted_at is not null and not growth.is_excluded(c.owner_id) and not growth.is_excluded(c.receiver_id))),
   'groups', jsonb_build_object(
     'groups', (select count(*) from groups_real),
     'members', (select count(distinct m.user_id) from study.members m join groups_real g on g.id = m.group_id where m.left_at is null and not growth.is_excluded(m.user_id)),
     'rounds', (select count(distinct a.round_id) from study.awards a join groups_real g on g.id = a.group_id where not growth.is_excluded(a.user_id)),
     'students_with_rounds', (select count(distinct a.user_id) from study.awards a join groups_real g on g.id = a.group_id where not growth.is_excluded(a.user_id)))
 ) into result;
 return result;
end;
$$;
revoke all on function public.growth_admin_summary(uuid) from public, anon, authenticated, service_role;
grant execute on function public.growth_admin_summary(uuid) to authenticated;
