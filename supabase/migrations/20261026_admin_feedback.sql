-- Admin: read the public feedback form's messages (Hanaa, 2026-10-13).
-- The `feedback` table is insert-only for visitors and had no read path, so
-- its messages were never shown anywhere. Admin only; table policies unchanged.
--
-- Rollback: drop function if exists public.admin_feedback();

create or replace function public.admin_feedback()
returns table (id uuid, name text, email text, message text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin_current() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select f.id, f.name, f.email, f.message, f.created_at
      from public.feedback f
     order by f.created_at desc
     limit 500;
end
$$;
revoke all on function public.admin_feedback() from public, anon;
grant execute on function public.admin_feedback() to authenticated;
