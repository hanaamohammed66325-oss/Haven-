-- ============================================================================
-- Haven — Referral / "Ambassador" system · NUCLEUS
-- ============================================================================
-- Data model + RLS + tamper-proof functions for:
--   1. a share CODE per user
--   2. a "how did you hear about us?" acquisition survey (owner-only stats)
--   3. an activation-GATED referral counter (a referral only counts once the
--      referee verifies their email AND takes a real step — adding a course)
--
-- Rewards (badges / XP / themes / Havi cosmetics) are layered on top LATER and
-- are intentionally not in this file.
--
-- Design rule: clients can never write status or forge a count. All mutations
-- go through SECURITY DEFINER functions that enforce the rules server-side;
-- the tables themselves are read-own / no-direct-write for `authenticated`.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) TABLES
-- ---------------------------------------------------------------------------

-- One immutable share code per user.
create table if not exists public.referral_codes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now()
);

-- One row per NEW user: how they arrived, and (if any) the code they entered.
-- Kept separate from `referrals` because a survey answer exists even when the
-- source is a social platform / "friend" with no code. Owner-only aggregate.
create table if not exists public.acquisition_survey (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  source     text not null check (source in
               ('code','x','instagram','tiktok','snapchat','friend','other')),
  code       text,                       -- the raw code they typed, if any
  created_at timestamptz not null default now()
);

-- One row per referee. `status` starts 'pending' and only a SECURITY DEFINER
-- function may flip it to 'activated' once the referee is genuinely active.
create table if not exists public.referrals (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid not null references auth.users (id) on delete cascade,
  referee_id   uuid not null unique references auth.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','activated')),
  created_at   timestamptz not null default now(),
  activated_at timestamptz,
  constraint referrals_no_self check (referrer_id <> referee_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id);
create index if not exists referrals_status_idx   on public.referrals (status);

-- ---------------------------------------------------------------------------
-- 2) ROW LEVEL SECURITY
--    Read-own only; NO direct client INSERT/UPDATE/DELETE. Every write is done
--    by the SECURITY DEFINER functions below (which run as owner, bypass RLS,
--    and enforce the real rules). Owner-wide stats use the service role, which
--    bypasses RLS entirely, so no broad SELECT policy is exposed to users.
-- ---------------------------------------------------------------------------

alter table public.referral_codes    enable row level security;
alter table public.acquisition_survey enable row level security;
alter table public.referrals          enable row level security;

drop policy if exists referral_codes_select_own on public.referral_codes;
create policy referral_codes_select_own on public.referral_codes
  for select to authenticated using (user_id = auth.uid());

drop policy if exists acquisition_survey_select_own on public.acquisition_survey;
create policy acquisition_survey_select_own on public.acquisition_survey
  for select to authenticated using (user_id = auth.uid());

-- A referrer sees their own referrals; a referee can see the row about them.
drop policy if exists referrals_select_involved on public.referrals;
create policy referrals_select_involved on public.referrals
  for select to authenticated
  using (referrer_id = auth.uid() or referee_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3) FUNCTIONS  (all SECURITY DEFINER, owned by the table owner)
-- ---------------------------------------------------------------------------

-- Mint (once) and return the caller's share code. 7 chars, unambiguous
-- alphabet (no 0/O/1/I). Retries on the rare collision.
create or replace function public.get_my_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  existing text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  select code into existing from public.referral_codes where user_id = uid;
  if existing is not null then
    return existing;
  end if;

  loop
    candidate := '';
    for i in 1..7 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.referral_codes (user_id, code) values (uid, candidate);
      return candidate;
    exception when unique_violation then
      -- code collided (or a race inserted our row) — re-check and retry
      select code into existing from public.referral_codes where user_id = uid;
      if existing is not null then
        return existing;
      end if;
    end;
  end loop;
end;
$$;

-- Record how the CURRENT (new) user arrived, and — if they entered a valid
-- code that isn't their own — open a PENDING referral. One-time per user:
-- a second call is a no-op (never overwrites, never double-credits).
create or replace function public.claim_referral(p_source text, p_code text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  norm_code    text := nullif(upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')), '');
  referrer     uuid;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if p_source is null or p_source not in
       ('code','x','instagram','tiktok','snapchat','friend','other') then
    raise exception 'invalid source';
  end if;

  -- survey is one-time; if it already exists, stop (idempotent).
  if exists (select 1 from public.acquisition_survey where user_id = uid) then
    return;
  end if;

  insert into public.acquisition_survey (user_id, source, code)
  values (uid, p_source, norm_code);

  -- Link a referral only for a real, foreign code.
  if norm_code is not null then
    select user_id into referrer from public.referral_codes where code = norm_code;
    if referrer is not null and referrer <> uid then
      insert into public.referrals (referrer_id, referee_id, status)
      values (referrer, uid, 'pending')
      on conflict (referee_id) do nothing;
    end if;
  end if;
end;
$$;

-- Flip the CALLER's pending referral to 'activated' — but only when they are
-- genuinely active: email confirmed AND at least one course added. Safe to call
-- repeatedly (no-op once activated or if nothing qualifies). This is the ONLY
-- path that increments a referrer's real count. Reward granting hangs off here
-- later (two-sided bonus for referrer + referee).
create or replace function public.activate_my_referral()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  confirmed  boolean;
  has_course boolean;
  updated    int;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  select (email_confirmed_at is not null) into confirmed
    from auth.users where id = uid;
  select exists (select 1 from public.courses where user_id = uid) into has_course;

  if not coalesce(confirmed, false) or not coalesce(has_course, false) then
    return false;
  end if;

  update public.referrals
     set status = 'activated', activated_at = now()
   where referee_id = uid and status = 'pending';
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

-- The caller's OWN dashboard numbers: how many they've brought in that count.
create or replace function public.my_referral_stats()
returns table (activated int, pending int)
language sql
security definer
set search_path = public
as $$
  select
    count(*) filter (where status = 'activated')::int,
    count(*) filter (where status = 'pending')::int
  from public.referrals
  where referrer_id = auth.uid();
$$;

-- Locked down: only signed-in users, and only these entry points.
revoke all on function public.get_my_referral_code()            from public, anon;
revoke all on function public.claim_referral(text, text)        from public, anon;
revoke all on function public.activate_my_referral()            from public, anon;
revoke all on function public.my_referral_stats()               from public, anon;
grant execute on function public.get_my_referral_code()         to authenticated;
grant execute on function public.claim_referral(text, text)     to authenticated;
grant execute on function public.activate_my_referral()         to authenticated;
grant execute on function public.my_referral_stats()            to authenticated;

-- ---------------------------------------------------------------------------
-- 4) OWNER-ONLY ACQUISITION STATS  (service role / admin only — RLS blocks
--    everyone else automatically since no user SELECT policy is granted here).
--    Query with the service key from an admin screen or edge function.
-- ---------------------------------------------------------------------------
create or replace view public.acquisition_stats as
  select source, count(*)::int as total
  from public.acquisition_survey
  group by source
  order by total desc;
