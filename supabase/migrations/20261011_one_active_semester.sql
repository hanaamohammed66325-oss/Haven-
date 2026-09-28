-- One active semester per student. Two first loads racing each created one,
-- which left 89 students with two (fixed by dedupe_active_semesters,
-- 2026-09-28). With this index the second insert is refused and the app
-- (lib/db ensureActiveSemester) settles on the first one.
--
-- APPLY ONLY TOGETHER WITH the app update that handles the refusal (23505):
-- before it, the second load of a new student would show an error.
-- Needs every student to have at most one active semester first.
create unique index if not exists semesters_one_active_per_user
  on public.semesters (user_id)
  where is_active;
