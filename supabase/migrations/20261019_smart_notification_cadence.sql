-- Proposed only. Apply after owner approval and rollback verification.
-- Retain existing outbox/RLS; serialize semantic selection per authenticated account.
create or replace function public.sync_smart_notifications(
 p_expected_uid uuid,p_start date,p_end date,p_send_at timestamptz,p_title text,p_candidates jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c jsonb; k text; previous public.scheduled_pushes; chosen text;
begin
 if u is null or u<>p_expected_uid then raise exception 'account mismatch' using errcode='42501'; end if;
 if p_start is null or p_end is null or p_send_at is null or p_title is null or p_candidates is null or p_end<p_start or length(p_title) not between 1 and 200 or jsonb_typeof(p_candidates)<>'array'
    or jsonb_array_length(p_candidates)>100 or p_send_at not between now()-interval '1 day' and now()+interval '2 days'
 then raise exception 'invalid smart batch' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('smart-notifications:'||u::text,0));
 if exists(select 1 from public.scheduled_pushes where user_id=u and dedup_key like 'smart2:%' and cancelled_at is null and sent_at is not null and send_at::date=p_send_at::date) then
  update public.scheduled_pushes set sent_at=now(),cancelled_at=now() where user_id=u and dedup_key like 'smart2:%' and sent_at is null;
  return;
 end if;
 for c in select value from jsonb_array_elements(p_candidates) loop
  k:=c->>'key';
  if jsonb_typeof(c)<>'object' or k is null or c->>'body' is null or c->>'kind' is null or c->>'cooldownDays' is null or k not like 'smart2:'||p_start::text||':'||p_end::text||':%'
    or length(k)>1000 or length(c->>'body') not between 1 and 500
    or c->>'kind' not in ('exam','task','midterm-week','finals-week','ungraded','gpa-goal')
    or (c->>'cooldownDays')::int <> (case when c->>'kind' in ('ungraded','gpa-goal') then 7 else 0 end)
  then raise exception 'invalid smart candidate' using errcode='22023'; end if;
  -- Previous bilingual season pushes belong to the same term, regardless of language.
  if c->>'kind' in ('midterm-week','finals-week') and exists(
   select 1 from public.scheduled_pushes s where s.user_id=u and s.dedup_key like 'smart-%'
    and s.cancelled_at is null and s.sent_at>=s.send_at and s.send_at::date between p_start and p_end
    and s.body=any(case when c->>'kind'='midterm-week'
     then array['Midterm season — good luck!','موسم الاختبارات النصفية — بالتوفيق!']
     else array['Finals week — good luck!','أسبوع الاختبارات النهائية — بالتوفيق!'] end)
  ) then continue; end if;
  select * into previous from public.scheduled_pushes where user_id=u and dedup_key=k for update;
  if found and previous.sent_at is not null and previous.cancelled_at is null then
   if (c->>'cooldownDays')::int=0 or previous.sent_at>p_send_at-interval '7 days' then continue; end if;
  end if;
  chosen:=k;
  insert into public.scheduled_pushes(user_id,dedup_key,title,body,send_at)
   values(u,k,p_title,c->>'body',p_send_at)
   on conflict(user_id,dedup_key) do update set title=excluded.title,body=excluded.body,
    send_at=excluded.send_at,sent_at=null,cancelled_at=null;
  exit;
 end loop;
 update public.scheduled_pushes set sent_at=now(),cancelled_at=now()
  where user_id=u and dedup_key like 'smart2:%' and sent_at is null
    and (chosen is null or dedup_key<>chosen);
end; $$;
revoke all on function public.sync_smart_notifications(uuid,date,date,timestamptz,text,jsonb) from public,anon;
grant execute on function public.sync_smart_notifications(uuid,date,date,timestamptz,text,jsonb) to authenticated;

-- Old tabs may still queue smart-DATE. Disable that obsolete route on the server.
-- Historical absence matching is intentionally exact on course label and percentage,
-- and uses only old rows actually claimed after their due time (not early cancellation).
create or replace function backup.guard_notification_cadence() returns trigger
language plpgsql security definer set search_path='' as $$
declare oldrow public.scheduled_pushes; prefix text; pct text; rule_prefix text;
begin
 if new.sent_at is not null then return new; end if;
 if new.dedup_key ~ '^smart-\d{4}-\d{2}-\d{2}$' then
  new.sent_at:=now();new.cancelled_at:=now();return new;
 end if;
 if new.dedup_key like 'att-%' then
  rule_prefix:=regexp_replace(new.dedup_key,'-[^-]+$','');
  -- A different recorded rule means a changed cap, not the old warning.
  if exists(select 1 from public.scheduled_pushes s where s.user_id=new.user_id
    and left(s.dedup_key,40)=left(new.dedup_key,40)
    and regexp_replace(s.dedup_key,'-[^-]+$','')<>rule_prefix) then return new;end if;
  prefix:=split_part(new.body,':',1);
  pct:=substring(split_part(new.body,':',2) from '[0-9]+(?:[.][0-9]+)?');
  if pct is not null and (new.body like '%غيابك%وصل%' or new.body like '%absence reached%' or new.body like '%خطر حرمان%' or new.body like '%withdrawal risk%') then
   select * into oldrow from public.scheduled_pushes s
    where s.user_id=new.user_id and s.dedup_key like 'smart-%'
     and s.sent_at>=s.send_at and s.cancelled_at is null
     and s.send_at>=now()-interval '120 days'
     and split_part(s.body,':',1)=prefix
     and substring(split_part(s.body,':',2) from '[0-9]+(?:[.][0-9]+)?')=pct
     and ((new.dedup_key not like '%-denied' and (s.body like '%absence, approaching limit%' or s.body like '%قربت من الحد%')) or (new.dedup_key like '%-denied' and (s.body like '%withdrawal risk%' or s.body like '%خطر حرمان%')))
    order by s.sent_at desc limit 1;
   if found then new.sent_at:=oldrow.sent_at;new.cancelled_at:=null;end if;
  end if;
 end if;
 return new;
end; $$;
revoke all on function backup.guard_notification_cadence() from public,anon,authenticated,service_role;
create trigger notification_cadence before insert or update on public.scheduled_pushes
 for each row execute function backup.guard_notification_cadence();
-- Import old absence evidence for already queued levels too.
update public.scheduled_pushes set body=body where dedup_key like 'att-%' and sent_at is null;
-- Cancel existing obsolete pending daily suggestions, never task/lecture reminders.
update public.scheduled_pushes set sent_at=now(),cancelled_at=now()
 where dedup_key ~ '^smart-\d{4}-\d{2}-\d{2}$' and sent_at is null;
create or replace function public.claim_smart_season_display(p_expected_uid uuid,p_keys jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); prefs jsonb; seen jsonb; fresh jsonb;
begin
 if u is null or u<>p_expected_uid then raise exception 'account mismatch' using errcode='42501'; end if;
 if p_keys is null or jsonb_typeof(p_keys)<>'array' or jsonb_array_length(p_keys)>2
  or exists(select 1 from jsonb_array_elements_text(p_keys) x where x is null or x !~ '^season:\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}:(midterm-week|finals-week)$')
 then raise exception 'bad display keys' using errcode='22023'; end if;
 select preferences into prefs from public.profiles where id=u for update;
 if not found then raise exception 'profile missing'; end if;
 seen:=case when jsonb_typeof(prefs->'smartSeasonSeen')='array' then prefs->'smartSeasonSeen' else '[]'::jsonb end;
 select coalesce(jsonb_agg(x),'[]') into fresh from jsonb_array_elements_text(p_keys) x where not seen ? x;
 update public.profiles set preferences=jsonb_set(coalesce(prefs,'{}'),'{smartSeasonSeen}',seen||fresh) where id=u;
 return fresh;
end; $$;
revoke all on function public.claim_smart_season_display(uuid,jsonb) from public,anon;
grant execute on function public.claim_smart_season_display(uuid,jsonb) to authenticated;
-- Atomic delivery shares the enqueue lock, including across concurrent cron ticks.
create or replace function public.claim_smart_push(p_id uuid,p_send_at timestamptz,p_title text,p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; row public.scheduled_pushes;
begin
 select user_id into u from public.scheduled_pushes where id=p_id and dedup_key like 'smart2:%';
 if not found then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended('smart-notifications:'||u::text,0));
 if exists(select 1 from public.scheduled_pushes s where s.user_id=u and s.id<>p_id
   and s.dedup_key like 'smart2:%' and s.sent_at is not null and s.cancelled_at is null
   and s.send_at::date=p_send_at::date) then
  update public.scheduled_pushes set sent_at=now(),cancelled_at=now() where id=p_id and sent_at is null
   and send_at=p_send_at and title=p_title and body=p_body;
  return null;
 end if;
 update public.scheduled_pushes set sent_at=now() where id=p_id and sent_at is null
   and send_at=p_send_at and title=p_title and body=p_body and send_at<=now()
   returning * into row;
 if not found then return null;end if;
 return jsonb_build_object('id',row.id,'user_id',row.user_id,'dedup_key',row.dedup_key,'title',row.title,'body',row.body);
end; $$;
revoke all on function public.claim_smart_push(uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.claim_smart_push(uuid,timestamptz,text,text) to service_role;
