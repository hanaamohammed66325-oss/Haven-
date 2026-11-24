begin;

alter table public.gpa_review_cases
  add column waiting_for_info boolean not null default false,
  add column classification text not null default 'unknown' check (classification in ('unknown','app','inputs','program'));

create table public.gpa_review_case_actions (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.gpa_review_cases(ticket_id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('submitted','recompared','triage','contact','resolve','note','wait','reopen')),
  note text check (char_length(note) <= 1200),
  happened_at timestamptz not null default clock_timestamp()
);
create index gpa_review_case_actions_ticket_idx on public.gpa_review_case_actions(ticket_id, id);
alter table public.gpa_review_case_actions enable row level security;
revoke all on public.gpa_review_case_actions from public, anon, authenticated, service_role;

create function public.gpa_review_affected(p_snapshot jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(key order by key) from (
      select key from jsonb_each(coalesce(p_snapshot->'initialResults','{}'::jsonb)) p
        where p.value->>'ours' <> p.value->>'portal'
      union
      select key from jsonb_each(coalesce(p_snapshot->'results','{}'::jsonb)) p
        where p.value->>'ours' <> p.value->>'portal'
      union
      select value from jsonb_array_elements_text(coalesce(p_snapshot#>'{details,affectedKinds}','[]'::jsonb))
        where value in ('semester','cumulative')
    ) disputed
  ), '[]'::jsonb);
$$;

-- Validate request inputs before the existing atomic case/ticket write.
create function public.check_gpa_review_evidence(p_snapshot jsonb)
returns void language plpgsql immutable set search_path = ''
as $$
declare details jsonb := p_snapshot->'details'; course jsonb; v_max numeric; counted int := 0; selected jsonb;
begin
  if coalesce(btrim(p_snapshot->>'label'), '') = ''
     or coalesce(btrim(p_snapshot->>'scheme'), '') = ''
     or coalesce(p_snapshot->>'max','') !~ '^[0-9]{1,3}(\.[0-9]{1,4})?$'
     or details->'confirmation' is distinct from 'true'::jsonb
     or jsonb_typeof(details->'courseTable') is distinct from 'array'
     or details#>>'{grading,id}' is distinct from p_snapshot->>'scheme'
     or details#>'{grading,max}' is distinct from p_snapshot->'max'
     or jsonb_typeof(details#>'{grading,bands}') is distinct from 'array' then
    raise exception 'missing_gpa_request_fields' using errcode = '22023';
  end if;
  v_max := (p_snapshot->>'max')::numeric;
  if jsonb_array_length(details->'courseTable') not between 1 and 80
     or jsonb_array_length(details#>'{grading,bands}') not between 1 and 100 then
    raise exception 'missing_gpa_request_fields' using errcode = '22023';
  end if;
  for course in select value from jsonb_array_elements(details->'courseTable') loop
    if jsonb_typeof(course) is distinct from 'object' or coalesce(btrim(course->>'id'), '') = ''
      or jsonb_typeof(course->'excluded') is distinct from 'boolean'
      or jsonb_typeof(course->'hours') is distinct from 'number' or (course->>'hours')::numeric < 0 then
      raise exception 'invalid_gpa_request_course' using errcode = '22023';
    end if;
    if course->>'excluded' = 'false' then
      if coalesce(btrim(course->>'name'), '') = '' or (course->>'hours')::numeric <= 0
        or jsonb_typeof(course->'points') is distinct from 'number'
        or not ((course->>'points')::numeric between 0 and v_max)
        or coalesce(btrim(course->>'grade'), '') = '' then
        raise exception 'missing_gpa_request_course' using errcode = '22023';
      end if;
      if details#>'{grading,percent}' = 'true'::jsonb then
        if jsonb_typeof(course->'grade') is distinct from 'number' or not ((course->>'grade')::numeric between 0 and 100) then
          raise exception 'invalid_gpa_request_grade' using errcode = '22023';
        end if;
      elsif jsonb_typeof(course->'grade') is distinct from 'string'
        or (course->>'grade' <> 'DN' and not exists (
          select 1 from jsonb_array_elements(details#>'{grading,bands}') b where b->>'letter' = course->>'grade'
        )) then
        raise exception 'invalid_gpa_request_grade' using errcode = '22023';
      end if;
      counted := counted + 1;
    end if;
    if course->>'id' = details->>'selectedCourse' then selected := course; end if;
  end loop;
  if counted = 0 then raise exception 'missing_gpa_request_course' using errcode = '22023'; end if;
  if p_snapshot->>'reason' in ('grade','notCounted','repeat')
    or (p_snapshot->>'reason' = 'hours' and p_snapshot#>>'{results,semester,ours}' <> p_snapshot#>>'{results,semester,portal}') then
    if selected is null or coalesce(btrim(selected->>'name'),'') = '' then
      raise exception 'missing_gpa_request_selected_course' using errcode = '22023';
    end if;
  end if;
  if (p_snapshot->'results') ? 'cumulative' then
    if jsonb_typeof(details#>'{prior,gpa}') is distinct from 'number'
      or jsonb_typeof(details#>'{prior,hours}') is distinct from 'number'
      or not ((details#>>'{prior,gpa}')::numeric between 0 and v_max)
      or not ((details#>>'{prior,hours}')::numeric between 0 and 400)
      or ((details#>>'{prior,hours}')::numeric = 0 and (details#>>'{prior,gpa}')::numeric <> 0) then
      raise exception 'missing_gpa_request_prior' using errcode = '22023';
    end if;
  end if;
end;
$$;
revoke all on function public.check_gpa_review_evidence(jsonb), public.gpa_review_affected(jsonb) from public, anon, authenticated, service_role;

alter function public.save_gpa_review_case(jsonb, boolean, integer) rename to save_gpa_review_case_v1;
revoke all on function public.save_gpa_review_case_v1(jsonb, boolean, integer) from public, anon, authenticated, service_role;

create function public.save_gpa_review_case(p_snapshot jsonb, p_create boolean, p_expected_revision integer default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); prior public.gpa_review_cases%rowtype; receipt jsonb; ticket uuid; kinds jsonb;
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if octet_length(p_snapshot::text) > 32000 or coalesce(p_snapshot->>'termId','') !~ '^[A-Za-z0-9_-]{1,80}$'
      or coalesce(p_snapshot->>'source','') not in ('current','past') then
    raise exception 'invalid_review' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || (p_snapshot->>'source') || ':' || (p_snapshot->>'termId'), 0));
  select r.* into prior from public.gpa_review_cases r where r.user_id = uid
    and r.source = p_snapshot->>'source' and r.term_key = p_snapshot->>'termId' for update;
  if p_create and prior.last_submission is distinct from p_snapshot->>'submissionId' then
    perform public.check_gpa_review_evidence(p_snapshot);
    select coalesce(jsonb_agg(distinct value order by value), '[]'::jsonb) into kinds
      from jsonb_array_elements_text(public.gpa_review_affected(coalesce(prior.snapshot,'{}'::jsonb)) ||
        public.gpa_review_affected(jsonb_build_object('results',p_snapshot->'results')));
    p_snapshot := jsonb_set(p_snapshot, '{details,affectedKinds}', kinds);
  end if;

  receipt := public.save_gpa_review_case_v1(p_snapshot, p_create, p_expected_revision);
  if receipt is null then return null; end if;
  ticket := (receipt->>'id')::uuid;
  if (receipt->>'revision')::integer is distinct from prior.revision then
    if p_create or receipt->>'status' = 'resolved' then
      update public.gpa_review_cases set waiting_for_info = false where ticket_id = ticket;
    end if;
    update public.support_tickets set updated_at = now() where id = ticket;
    insert into public.gpa_review_case_actions(ticket_id,actor_id,action)
      values(ticket,uid,case when p_create then 'submitted' else 'recompared' end);
  end if;
  return receipt;
end;
$$;

create or replace function public.my_gpa_review_cases()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(
    public.gpa_review_status(t.id,r.snapshot,t.status,r.resolution,r.revision) ||
      jsonb_build_object('affectedKinds',public.gpa_review_affected(r.snapshot)) ||
      case when r.waiting_for_info and r.resolution is null then '{"status":"waiting"}'::jsonb else '{}'::jsonb end
    order by t.created_at desc),'[]'::jsonb)
  from public.gpa_review_cases r join public.support_tickets t on t.id=r.ticket_id
  where r.user_id=auth.uid();
$$;

alter function public.admin_gpa_review_cases(boolean) rename to admin_gpa_review_cases_v1;
revoke all on function public.admin_gpa_review_cases_v1(boolean) from public, anon, authenticated, service_role;

create function public.admin_gpa_review_cases(p_include_cases boolean default false)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare response jsonb; enriched jsonb;
begin
  response := public.admin_gpa_review_cases_v1(p_include_cases);
  if not p_include_cases then return response; end if;
  select coalesce(jsonb_agg(item || jsonb_build_object(
    'affectedKinds', public.gpa_review_affected(r.snapshot),
    'classification', r.classification,
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object(
      'action', a.action, 'at', a.happened_at,
      'actor', coalesce(u.email,case when a.actor_id=r.user_id then 'Student' else 'Account removed' end),
      'note', a.note
    ) order by a.id), '[]'::jsonb)
    from public.gpa_review_case_actions a left join auth.users u on u.id=a.actor_id where a.ticket_id=r.ticket_id)
  ) || case when r.waiting_for_info and r.resolution is null then '{"status":"waiting"}'::jsonb else '{}'::jsonb end
  order by ord), '[]'::jsonb) into enriched
  from jsonb_array_elements(response->'cases') with ordinality j(item,ord)
  join public.gpa_review_cases r on r.ticket_id=(item->>'id')::uuid;
  return jsonb_set(response,'{cases}',enriched);
end;
$$;

alter function public.admin_update_gpa_review_case(uuid,text,integer,jsonb) rename to admin_update_gpa_review_case_v1;
revoke all on function public.admin_update_gpa_review_case_v1(uuid,text,integer,jsonb) from public, anon, authenticated, service_role;

create function public.admin_update_gpa_review_case(p_id uuid, p_action text, p_revision integer, p_evidence jsonb default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.gpa_review_cases%rowtype; t public.support_tickets%rowtype;
  message text := nullif(btrim(p_evidence->>'note'),''); cause text := p_evidence->>'classification';
begin
  if auth.uid() is null or not coalesce(public.is_admin_current(),false) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  select c.* into r from public.gpa_review_cases c where c.ticket_id=p_id for update;
  if r.ticket_id is null or r.revision is distinct from p_revision then raise exception 'review_changed' using errcode='40001'; end if;
  select s.* into t from public.support_tickets s where s.id=p_id for update;
  if coalesce(char_length(message),0)>1200 then raise exception 'note_too_long' using errcode='22023'; end if;
  if p_action = 'note' then
    if cause is null or cause not in ('unknown','app','inputs','program') or message is null then
      raise exception 'missing_internal_note' using errcode='22023';
    end if;
    update public.gpa_review_cases set classification=cause,revision=revision+1 where ticket_id=p_id;
  elsif p_action = 'wait' and r.resolution is null and message is not null then
    update public.gpa_review_cases set waiting_for_info=true,contacted_at=now(),revision=revision+1 where ticket_id=p_id;
    update public.support_tickets set status='pending' where id=p_id;
  elsif p_action = 'triage' and r.waiting_for_info then
    update public.gpa_review_cases set waiting_for_info=false,revision=revision+1 where ticket_id=p_id;
  elsif p_action = 'reopen' and r.resolution is not null and message is not null then
    update public.gpa_review_cases set resolution=null,waiting_for_info=false,revision=revision+1 where ticket_id=p_id;
    update public.support_tickets set status='pending',resolved_at=null,closed_at=null where id=p_id;
  else
    perform public.admin_update_gpa_review_case_v1(p_id,p_action,p_revision,p_evidence);
    if p_action='resolve' then
      update public.gpa_review_cases set waiting_for_info=false where ticket_id=p_id;
      message := btrim(p_evidence->>'resolution');
    end if;
  end if;
  update public.support_tickets set updated_at=now() where id=p_id;
  insert into public.gpa_review_case_actions(ticket_id,actor_id,action,note) values(p_id,auth.uid(),p_action,message);
end;
$$;

revoke all on function public.save_gpa_review_case(jsonb,boolean,integer), public.admin_gpa_review_cases(boolean),
  public.admin_update_gpa_review_case(uuid,text,integer,jsonb), public.my_gpa_review_cases() from public, anon, authenticated, service_role;
grant execute on function public.save_gpa_review_case(jsonb,boolean,integer), public.admin_gpa_review_cases(boolean),
  public.admin_update_gpa_review_case(uuid,text,integer,jsonb), public.my_gpa_review_cases() to authenticated;
commit;
