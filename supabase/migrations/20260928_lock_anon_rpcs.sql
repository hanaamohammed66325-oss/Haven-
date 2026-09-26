-- Two SECURITY DEFINER functions were still executable by `anon` (anyone with
-- the public key, no sign-in), flagged by the Supabase security advisor:
--   • admin_retention_stats() — the admin Retention page (guarded inside by
--     is_admin_current(), but it shouldn't be reachable without a session);
--   • merge_preferences(patch) — saves the signed-in user's preferences.
-- Both are only ever called by signed-in users, so: signed-in only, same model
-- as the other admin_* functions. Done by name so every overload is covered.

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_retention_stats', 'merge_preferences')
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
