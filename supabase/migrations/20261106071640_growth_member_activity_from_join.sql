-- Group member details in the admin Growth page: show real activity.
-- With growth tracking off there is no recorded path entry, so growth.activity
-- received NULL and a member with a completed round showed no last action,
-- no active days and no feature chips. Fall back to the membership join time.
-- Coverage stays "not complete" and rates stay unknown: no rate is invented,
-- and repeat_metric still uses only the recorded entry.
-- Only this line changes from 20261027182348_growth_exclude_test_accounts.sql.
-- Grants are preserved by create or replace.
-- Applied to production 2026-11-06 with Hanaa's approval.
-- Rollback: re-run the growth_admin_page definition from 20261027182348.

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
   a:=growth.activity(r.user_id,coalesce(r.entered_at,r.joined_at),asof); a:=a||jsonb_build_object('repeat',growth.repeat_metric(p_target,r.user_id,r.entered_at,asof));
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
