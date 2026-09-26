-- ---------------------------------------------------------------------------
-- admin_gpa_checks() also returns repeat_policy_other: a student at a
-- university outside Saudi Arabia describing, in their own words, how their
-- university counts a repeated course (a rule the app doesn't offer yet), so
-- it can be added as a real option. Same guard and grants as before.
-- ---------------------------------------------------------------------------

create or replace function public.admin_gpa_checks()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare res jsonb;
begin
  if not public.is_admin_current() then raise exception 'not_authorized'; end if;
  with withdrawn as (
    select user_id, max(created_at) as at
      from public.user_events
     where event = 'term_consent_withdrawn'
     group by user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', e.user_id,
           'email', u.email,
           'event', e.event,
           'at', e.created_at,
           'meta', case
                     when w.at is not null and e.created_at <= w.at and e.event like 'term\_%'
                       then jsonb_build_object('withdrawn', true)
                     else e.meta
                   end
         ) order by e.created_at desc), '[]'::jsonb)
    into res
    from public.user_events e
    join auth.users u on u.id = e.user_id
    left join withdrawn w on w.user_id = e.user_id
   where e.event in (
     'term_gpa_match', 'term_gpa_mismatch', 'term_grades_saved', 'term_mismatch_reason',
     'past_term_checked', 'past_term_reason', 'repeat_policy_other'
   );
  return res;
end;
$$;

revoke all on function public.admin_gpa_checks() from public, anon;
grant execute on function public.admin_gpa_checks() to authenticated;

-- Rollback: re-run admin_gpa_checks() from 20260926_gpa_checks.sql.
