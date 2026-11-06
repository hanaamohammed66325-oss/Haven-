-- Turn on growth follow-up recording (Hanaa, 2026-11-06).
-- Enabling resets growth.config.started_at to now, which is correct for follow-up
-- coverage. But three admin views used that date as the start of the signup-source
-- survey cohort, and would have dropped every earlier account. The survey began with
-- the referral program, so they now read referral.config.starts_at (the same value
-- today, and it never moves). Each body changes only at the strings replaced below;
-- create or replace keeps the existing grants.
-- Nothing is backfilled: only activity after this point is recorded.
-- Rollback: update growth.config set enabled = false where singleton; then reverse
-- the replacements. growth.origins and growth.group_entries rows may stay.

do $migration$
declare before_def text; after_def text;
begin
  before_def := pg_get_functiondef('public.growth_admin_page(uuid,text,uuid,jsonb,integer)'::regprocedure);
  after_def := replace(before_def, 'where u.created_at>=cfg.started_at and u.created_at<=asof', 'where u.created_at>=(select starts_at from referral.config) and u.created_at<=asof');
  if after_def = before_def then raise exception 'growth_admin_page: expected text not found'; end if;
  execute after_def;

  before_def := pg_get_functiondef('public.growth_admin_summary(uuid)'::regprocedure);
  after_def := replace(before_def, 'where r.created_at >= cfg.started_at', 'where r.created_at >= (select starts_at from referral.config)');
  if after_def = before_def then raise exception 'growth_admin_summary cohort: expected text not found'; end if;
  before_def := after_def;
  after_def := replace(before_def, '''tracking_started_at'', cfg.started_at', '''tracking_started_at'', (select starts_at from referral.config)');
  if after_def = before_def then raise exception 'growth_admin_summary date: expected text not found'; end if;
  execute after_def;

  before_def := pg_get_functiondef('public.referral_admin_answers(uuid,timestamptz,uuid,integer)'::regprocedure);
  after_def := replace(before_def, 'select cfg.started_at into strict tracking_start from growth.config cfg where cfg.singleton', 'select cfg.starts_at into strict tracking_start from referral.config cfg where cfg.singleton');
  if after_def = before_def then raise exception 'referral_admin_answers: expected text not found'; end if;
  execute after_def;
end;
$migration$;

update growth.config set enabled = true where singleton;
