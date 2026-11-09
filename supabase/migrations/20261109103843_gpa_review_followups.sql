-- DRAFT ONLY: apply after Hanaa explicitly approves this migration.
-- Expand-only; no users/contact rows are seeded, and no messages are sent.
-- Rollback (separately authorized): drop the two RPCs, then the empty follow-up
-- table and the new indexes. Never drop populated follow-up history implicitly.
begin;

create table if not exists public.gpa_followups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  grp text not null check (grp in ('G2', 'G3')),
  reason text not null check (char_length(reason) between 1 and 500),
  contacted_at timestamptz not null,
  channel text not null check (channel in ('push', 'email')),
  note text not null default '' check (char_length(note) <= 2000),
  closed_at timestamptz
);
alter table public.gpa_followups enable row level security;
revoke all on table public.gpa_followups from public, anon, authenticated, service_role;
-- No client RLS policies: all reads/writes go through admin-guarded RPCs.
create index if not exists gpa_followups_contacted_idx on public.gpa_followups (contacted_at desc);

-- Existing logEvent inserts remain unchanged. Unique review keys make delivery
-- idempotent across cards, reloads and devices. Legacy event rows are unaffected.
create unique index if not exists user_events_gpa_review_shown_once
  on public.user_events (user_id, (meta ->> 'review_key'))
  where event = 'gpa_prior_review_shown' and char_length(meta ->> 'review_key') between 1 and 64;
create unique index if not exists user_events_gpa_review_completed_once
  on public.user_events (user_id, (meta ->> 'review_key'))
  where event in ('gpa_prior_confirmed', 'gpa_prior_edited') and char_length(meta ->> 'review_key') between 1 and 64;
create index if not exists user_events_gpa_review_lookup
  on public.user_events (user_id, created_at desc)
  where event in ('gpa_prior_review_shown', 'gpa_prior_confirmed', 'gpa_prior_edited');

create or replace function public.admin_gpa_followups()
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin_current(), false) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', f.user_id, 'email', u.email, 'grp', f.grp, 'reason', f.reason,
        'contacted_at', f.contacted_at, 'channel', f.channel, 'note', f.note, 'closed_at', f.closed_at
      ) order by f.contacted_at desc)
      from public.gpa_followups f left join auth.users u on u.id = f.user_id
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', e.user_id, 'email', u.email, 'event', e.event, 'at', e.created_at,
        'meta', jsonb_build_object('reason', e.meta -> 'reason', 'scheme', e.meta -> 'scheme',
          'max', e.meta -> 'max', 'review_key', e.meta -> 'review_key')
      ) order by e.created_at desc)
      from public.user_events e left join auth.users u on u.id = e.user_id
      where e.event in ('gpa_prior_review_shown', 'gpa_prior_confirmed', 'gpa_prior_edited')
    ), '[]'::jsonb),
    -- Keep the existing consent/withdrawal filtering for shared check details.
    'checks', public.admin_gpa_checks()
  );
end;
$$;
revoke all on function public.admin_gpa_followups() from public, anon, authenticated, service_role;
grant execute on function public.admin_gpa_followups() to authenticated;

-- Called only after an explicitly approved contact actually succeeds. No seed
-- script is included in this release; the browser section is read-only.
create or replace function public.admin_set_gpa_followup(
  p_user_id uuid, p_grp text, p_reason text, p_contacted_at timestamptz,
  p_channel text, p_note text default '', p_closed_at timestamptz default null
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin_current(), false) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.gpa_followups (user_id, grp, reason, contacted_at, channel, note, closed_at)
    values (p_user_id, p_grp, p_reason, p_contacted_at, p_channel, coalesce(p_note, ''), p_closed_at)
    on conflict (user_id) do update set grp = excluded.grp, reason = excluded.reason,
      contacted_at = excluded.contacted_at, channel = excluded.channel,
      note = excluded.note, closed_at = excluded.closed_at;
end;
$$;
revoke all on function public.admin_set_gpa_followup(uuid,text,text,timestamptz,text,text,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_gpa_followup(uuid,text,text,timestamptz,text,text,timestamptz) to authenticated;

commit;
