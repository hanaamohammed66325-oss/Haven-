-- ---------------------------------------------------------------------------
-- admin_havi_gpa_alerts() — the students Havi alerted about data missing for
-- an accurate GPA (components/HaviGpaNote), one row per student: their
-- account, when he first and last alerted them, what was missing the last
-- time, what they chose (an item opened / remind me later), and whether
-- everything has been recorded since. Reads the havi_gpa_note_* events in
-- user_events. Read-only; admin-only (is_admin_current guard), like the other
-- admin_* RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.admin_havi_gpa_alerts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare res jsonb;
begin
  if not public.is_admin_current() then raise exception 'not_authorized'; end if;
  with ev as (
    select user_id, event, meta, created_at
      from public.user_events
     where event in ('havi_gpa_note_shown', 'havi_gpa_note_later', 'havi_gpa_note_fix', 'havi_gpa_note_resolved')
  ),
  per_user as (
    select user_id,
           min(created_at) filter (where event = 'havi_gpa_note_shown') as first_at,
           max(created_at) filter (where event = 'havi_gpa_note_shown') as last_at,
           count(*) filter (where event = 'havi_gpa_note_shown') as shown,
           count(*) filter (where event = 'havi_gpa_note_later') as later,
           count(*) filter (where event = 'havi_gpa_note_fix') as fixes,
           max(created_at) filter (where event = 'havi_gpa_note_resolved') as resolved_at
      from ev
     group by user_id
  ),
  last_shown as (
    select distinct on (user_id) user_id, meta
      from ev
     where event = 'havi_gpa_note_shown'
     order by user_id, created_at desc
  ),
  last_action as (
    select distinct on (user_id) user_id, event, meta, created_at
      from ev
     where event in ('havi_gpa_note_later', 'havi_gpa_note_fix')
     order by user_id, created_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', p.user_id,
           'email', u.email,
           'first_at', p.first_at,
           'last_at', p.last_at,
           'shown', p.shown,
           'later', p.later,
           'fixes', p.fixes,
           'missing', coalesce(s.meta -> 'missing', '[]'::jsonb),
           'courses', coalesce((s.meta ->> 'courses')::int, 0),
           'last_action', a.event,
           'last_action_item', a.meta ->> 'item',
           'last_action_at', a.created_at,
           -- resolved only if nothing was shown again after it
           'resolved_at', case when p.resolved_at >= p.last_at then p.resolved_at end
         ) order by p.last_at desc nulls last), '[]'::jsonb)
    into res
    from per_user p
    join auth.users u on u.id = p.user_id
    left join last_shown s on s.user_id = p.user_id
    left join last_action a on a.user_id = p.user_id
   where p.shown > 0;
  return res;
end;
$$;

revoke all on function public.admin_havi_gpa_alerts() from public, anon;
grant execute on function public.admin_havi_gpa_alerts() to authenticated;
