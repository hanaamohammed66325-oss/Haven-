-- The last two SECURITY DEFINER functions the Supabase advisor flagged as
-- callable without signing in. Neither is called from the app:
--   • increment_coupon_uses(coupon_id_arg) — anyone could burn a coupon's uses;
--   • sync_profile_email_from_auth() — a trigger function (triggers don't need
--     callers to hold EXECUTE, so the trigger keeps working).
-- Server-only now: revoked from public/anon/authenticated, kept for
-- service_role (edge functions).

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('increment_coupon_uses', 'sync_profile_email_from_auth')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
