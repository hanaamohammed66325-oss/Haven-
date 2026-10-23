-- Individual signup-source answers for the Growth admin view.
-- Keep the underlying auth and referral tables private.
create function public.referral_admin_answers(
  p_expected_account uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 25
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tracking_start timestamptz;
  lim integer := least(50, greatest(1, coalesce(p_limit, 25)));
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

  return jsonb_build_object('account_id', uid, 'rows', items, 'next_cursor', next_cursor);
end;
$$;

revoke all on function public.referral_admin_answers(uuid,timestamptz,uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.referral_admin_answers(uuid,timestamptz,uuid,integer) to authenticated;
