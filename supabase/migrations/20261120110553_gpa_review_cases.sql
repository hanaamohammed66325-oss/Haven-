begin;

-- The support ticket owns the queue state; GPA inputs stay in a private, linked row.
alter table public.support_tickets drop constraint support_tickets_category_check;
alter table public.support_tickets add constraint support_tickets_category_check
  check (category in ('account', 'login', 'subscription', 'payment', 'technical', 'general', 'other', 'gpa'));

create table public.gpa_review_cases (
  ticket_id uuid primary key references public.support_tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('current', 'past')),
  term_key text not null check (term_key ~ '^[A-Za-z0-9_-]{1,80}$'),
  snapshot jsonb not null,
  last_submission text not null,
  revision integer not null default 1,
  resolution text,
  contacted_at timestamptz,
  unique (user_id, source, term_key)
);
alter table public.gpa_review_cases enable row level security;
revoke all on public.gpa_review_cases from public, anon, authenticated, service_role;

-- Compare the displayed values submitted by the existing two-decimal comparator.
create function public.checked_gpa_review_results(p_results jsonb, p_max numeric)
returns jsonb language plpgsql immutable set search_path = ''
as $$
declare kind text; pair jsonb;
begin
  if p_max is null or p_max <= 0 or p_max > 100 or jsonb_typeof(p_results) is distinct from 'object' or p_results = '{}'::jsonb then
    raise exception 'invalid_comparison' using errcode = '22023';
  end if;
  for kind, pair in select key, value from jsonb_each(p_results) loop
    if kind not in ('semester', 'cumulative') or jsonb_typeof(pair) is distinct from 'object'
      or coalesce(pair->>'ours', '') !~ '^[0-9]{1,3}\.[0-9]{2}$'
      or coalesce(pair->>'portal', '') !~ '^[0-9]{1,3}\.[0-9]{2}$' then
      raise exception 'invalid_comparison' using errcode = '22023';
    end if;
    if (pair->>'ours')::numeric > round(p_max, 2) or (pair->>'portal')::numeric > round(p_max, 2) then
      raise exception 'invalid_comparison' using errcode = '22023';
    end if;
    p_results := jsonb_set(p_results, array[kind], jsonb_build_object('ours', pair->>'ours', 'portal', pair->>'portal'));
  end loop;
  return p_results;
end;
$$;
revoke all on function public.checked_gpa_review_results(jsonb,numeric) from public, anon, authenticated, service_role;

create function public.gpa_review_status(p_id uuid, p_snapshot jsonb, p_status text, p_resolution text, p_revision integer)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_id, 'source', p_snapshot->>'source', 'termId', p_snapshot->>'termId', 'label', p_snapshot->>'label',
    'status', case when p_resolution is not null then 'resolved' when p_status = 'open' then 'open' else 'pending' end,
    'resolution', p_resolution, 'revision', p_revision
  );
$$;
revoke all on function public.gpa_review_status(uuid,jsonb,text,text,integer) from public, anon, authenticated, service_role;

create function public.save_gpa_review_case(p_snapshot jsonb, p_create boolean, p_expected_revision integer default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_source text := p_snapshot->>'source';
  v_term_key text := p_snapshot->>'termId';
  v_submission text := p_snapshot->>'submissionId';
  results jsonb;
  next_snapshot jsonb;
  next_status text;
  next_resolution text;
  request public.gpa_review_cases%rowtype;
  ticket public.support_tickets%rowtype;
  email text;
  has_difference boolean;
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object' or octet_length(p_snapshot::text) > 32000
    or coalesce(v_source, '') not in ('current', 'past')
    or coalesce(v_term_key, '') !~ '^[A-Za-z0-9_-]{1,80}$'
    or coalesce(p_snapshot->>'max', '') !~ '^[0-9]{1,3}(\.[0-9]{1,4})?$'
    or jsonb_typeof(p_snapshot->'details') is distinct from 'object'
    or p_create is null then
    raise exception 'invalid_review' using errcode = '22023';
  end if;
  if v_source = 'current' and not exists (select 1 from public.semesters s where s.user_id = uid and s.id::text = v_term_key) then
    raise exception 'unknown_term' using errcode = '42501';
  end if;
  results := public.checked_gpa_review_results(p_snapshot->'results', (p_snapshot->>'max')::numeric);
  select exists (select 1 from jsonb_each(results) r where r.value->>'ours' <> r.value->>'portal') into has_difference;
  if p_create and (not has_difference or coalesce(v_submission, '') !~ '^[A-Za-z0-9_-]{12,80}$'
    or coalesce(p_snapshot->>'reason', '') not in ('hours','grade','notCounted','repeat','unknown')) then
    raise exception 'unconfirmed_difference' using errcode = '22023';
  end if;
  if not p_create and (has_difference or p_expected_revision is null) then
    raise exception 'unconfirmed_match' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || v_source || ':' || v_term_key, 0));
  select r.* into request from public.gpa_review_cases r
    where r.user_id = uid and r.source = v_source and r.term_key = v_term_key for update;
  if request.ticket_id is null and not p_create then return null; end if;
  if request.ticket_id is not null then
    select t.* into ticket from public.support_tickets t where t.id = request.ticket_id for update;
  end if;
  if not p_create and (request.revision <> p_expected_revision or request.resolution is not null
      or request.snapshot->>'scheme' <> p_snapshot->>'scheme' or request.snapshot->>'max' <> p_snapshot->>'max') then
    return null;
  end if;

  if p_create then
    if request.last_submission = v_submission then
      return public.gpa_review_status(ticket.id, request.snapshot, ticket.status, request.resolution, request.revision);
    end if;
    if request.resolution is null and request.snapshot->>'scheme' = p_snapshot->>'scheme'
        and request.snapshot->>'max' = p_snapshot->>'max' then
      results := (request.snapshot->'results') || results;
    elsif request.resolution is null and request.ticket_id is not null
        and exists (select 1 from jsonb_object_keys(request.snapshot->'results') k where not (results ? k)) then
      raise exception 'review_scale_changed' using errcode = '22023';
    end if;
    next_snapshot := jsonb_build_object(
      'source', v_source, 'termId', v_term_key, 'label', left(coalesce(p_snapshot->>'label', ''), 100),
      'scheme', left(coalesce(p_snapshot->>'scheme', ''), 80), 'max', (p_snapshot->>'max')::numeric,
      'results', results, 'initialResults', (p_snapshot->'results') || coalesce(request.snapshot->'initialResults', '{}'::jsonb),
      'details', p_snapshot->'details', 'reason', p_snapshot->>'reason'
    );
    if request.ticket_id is null then
      select u.email into email from auth.users u where u.id = uid;
      if email is null then raise exception 'missing_contact' using errcode = '22023'; end if;
      insert into public.support_tickets (user_id, user_email, subject, category, priority, status, first_message)
        values (uid, email, 'GPA comparison review', 'gpa', 'high', 'open', 'The student requested review of a GPA comparison.')
        returning * into ticket;
      insert into public.gpa_review_cases (ticket_id, user_id, source, term_key, snapshot, last_submission)
        values (ticket.id, uid, v_source, v_term_key, next_snapshot, v_submission) returning * into request;
      return public.gpa_review_status(ticket.id, request.snapshot, ticket.status, request.resolution, request.revision);
    end if;
    if request.snapshot = next_snapshot and request.resolution is null then
      update public.gpa_review_cases set last_submission = v_submission where ticket_id = ticket.id;
      return public.gpa_review_status(ticket.id, request.snapshot, ticket.status, request.resolution, request.revision);
    end if;
    next_status := 'open';
    next_resolution := null;
  else
    -- Only update parts already in the request. An unrelated successful check
    -- cannot resolve another requested result, even for the same term.
    select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) into results
      from jsonb_each(results) r where (request.snapshot->'results') ? r.key;
    if results = '{}'::jsonb then return null; end if;
    results := (request.snapshot->'results') || results;
    if results = request.snapshot->'results' then return null; end if;
    next_snapshot := jsonb_set(request.snapshot, '{results}', results);
    if exists (select 1 from jsonb_each(results) r where r.value->>'ours' <> r.value->>'portal') then
      next_status := ticket.status;
    else
      next_status := 'resolved';
      next_resolution := 'matched';
    end if;
  end if;

  update public.gpa_review_cases r set snapshot = next_snapshot, revision = r.revision + 1, resolution = next_resolution,
    last_submission = case when p_create then v_submission else r.last_submission end
    where r.ticket_id = ticket.id returning r.* into request;
  update public.support_tickets t set status = next_status,
    resolved_at = case when next_status = 'resolved' then now() else null end, closed_at = null
    where t.id = ticket.id;
  return public.gpa_review_status(ticket.id, request.snapshot, next_status, request.resolution, request.revision);
end;
$$;

create function public.my_gpa_review_cases()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(public.gpa_review_status(t.id, r.snapshot, t.status, r.resolution, r.revision)
    order by t.created_at desc), '[]'::jsonb)
    from public.gpa_review_cases r join public.support_tickets t on t.id = r.ticket_id
    where r.user_id = auth.uid();
$$;

create function public.admin_gpa_review_cases(p_include_cases boolean default false)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin_current(), false) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'newGpa', (select count(*) from public.support_tickets where status = 'open' and category = 'gpa'),
    'newSupport', (select count(*) from public.support_tickets where status = 'open'),
    'cases', case when p_include_cases then coalesce((
      select jsonb_agg(item order by sort_key, created_at desc) from (
        select public.gpa_review_status(t.id, r.snapshot, t.status, r.resolution, r.revision) || jsonb_build_object(
          'email', coalesce(u.email, t.user_email), 'scheme', r.snapshot->>'scheme', 'max', r.snapshot->'max',
          'results', r.snapshot->'results',
          'details', (r.snapshot->'details') || jsonb_build_object('initialResults', r.snapshot->'initialResults'),
          'reason', r.snapshot->>'reason',
          'createdAt', t.created_at, 'contactedAt', r.contacted_at
        ) as item, case when r.resolution is null then 0 else 1 end as sort_key, t.created_at
        from public.gpa_review_cases r join public.support_tickets t on t.id = r.ticket_id
        left join auth.users u on u.id = r.user_id
      ) rows
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

create function public.admin_update_gpa_review_case(p_id uuid, p_action text, p_revision integer, p_evidence jsonb default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare request public.gpa_review_cases%rowtype; ticket public.support_tickets%rowtype;
  results jsonb; next_snapshot jsonb; next_resolution text; next_status text;
begin
  if auth.uid() is null or not coalesce(public.is_admin_current(), false) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select r.* into request from public.gpa_review_cases r where r.ticket_id = p_id for update;
  if request.ticket_id is null or request.revision is distinct from p_revision then
    raise exception 'review_changed' using errcode = '40001';
  end if;
  select t.* into ticket from public.support_tickets t where t.id = p_id for update;
  next_status := ticket.status;
  next_snapshot := request.snapshot;
  next_resolution := request.resolution;
  if p_action = 'triage' and ticket.status = 'open' then
    next_status := 'pending';
  elsif p_action = 'resolve' and request.resolution is null then
    results := public.checked_gpa_review_results(p_evidence->'results', (request.snapshot->>'max')::numeric);
    if exists (select 1 from jsonb_object_keys(request.snapshot->'results') k where not (results ? k))
      or exists (select 1 from jsonb_each(results) r where r.value->>'ours' <> r.value->>'portal'
        or not ((request.snapshot->'results') ? r.key))
      or not (char_length(btrim(coalesce(p_evidence->>'resolution',''))) between 1 and 400) then
      raise exception 'resolution_requires_match' using errcode = '22023';
    end if;
    next_snapshot := jsonb_set(request.snapshot, '{results}', results);
    next_resolution := btrim(p_evidence->>'resolution');
    next_status := 'resolved';
  elsif p_action is distinct from 'contact' then
    raise exception 'invalid_review_action' using errcode = '22023';
  end if;
  update public.gpa_review_cases r
    set snapshot = next_snapshot, resolution = next_resolution, revision = r.revision + 1,
      contacted_at = case when p_action = 'contact' then now() else r.contacted_at end
    where r.ticket_id = p_id;
  if next_status <> ticket.status then
    update public.support_tickets set status = next_status,
      resolved_at = case when next_status = 'resolved' then now() else null end where id = p_id;
  end if;
end;
$$;

revoke all on function public.save_gpa_review_case(jsonb,boolean,integer) from public, anon, authenticated, service_role;
revoke all on function public.my_gpa_review_cases() from public, anon, authenticated, service_role;
revoke all on function public.admin_gpa_review_cases(boolean) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_gpa_review_case(uuid,text,integer,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_gpa_review_case(jsonb,boolean,integer) to authenticated;
grant execute on function public.my_gpa_review_cases() to authenticated;
grant execute on function public.admin_gpa_review_cases(boolean) to authenticated;
grant execute on function public.admin_update_gpa_review_case(uuid,text,integer,jsonb) to authenticated;

commit;
