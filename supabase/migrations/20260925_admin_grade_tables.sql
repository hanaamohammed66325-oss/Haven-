-- ---------------------------------------------------------------------------
-- admin_grade_tables() — what students told us about their university's grade
-- points table (the Profile page / setup window ask them to confirm a table
-- detected from the unverified catalogue, or to enter their own). Returns every
-- user who typed a university name or answered, with the raw academic fields;
-- the admin page classifies them with the same detection code the app uses.
-- Read-only; admin-only (is_admin_current guard), like the other admin_* RPCs.
-- ---------------------------------------------------------------------------
create or replace function public.admin_grade_tables()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare res jsonb;
begin
  if not public.is_admin_current() then raise exception 'not_authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', p.id,
           'email', u.email,
           'last_active_at', p.last_active_at,
           'slug', nullif(p.preferences->'academic'->>'universitySlug', ''),
           'name', nullif(trim(p.preferences->'academic'->>'universityName'), ''),
           'scheme_id', p.preferences->'academic'->>'gpaSchemeId',
           'grade_check', p.preferences->'academic'->'gradeCheck',
           'custom_scheme', p.preferences->'academic'->'customScheme'
         )), '[]'::jsonb)
    into res
    from public.profiles p
    join auth.users u on u.id = p.id
   where (p.preferences->'academic') ? 'gradeCheck'
      or (p.preferences->'academic') ? 'customScheme'
      or nullif(trim(p.preferences->'academic'->>'universityName'), '') is not null;
  return res;
end;
$$;

revoke all on function public.admin_grade_tables() from public, anon;
grant execute on function public.admin_grade_tables() to authenticated;

-- Rollback:
--   drop function if exists public.admin_grade_tables();
