-- Per-course attendance counting method (ADDITIVE-ONLY — cannot affect existing
-- rows or any calculation). Lets a course count حرمان either:
--   • 'hour'    — duration-based (each contact hour a share of 100%). The current
--                 behaviour, and the default every existing row keeps.
--   • 'lecture' — each missed lecture an equal share (100 / total lectures), for a
--                 professor who counts absences by session, not by hour.
-- per_lecture_pct is an OPTIONAL manual override for the per-lecture % in lecture
-- mode (e.g. a professor who fixes each absence at 8%); NULL = auto (even split).
--
-- Safe by construction: new columns, defaulted to today's behaviour, so nothing
-- recomputes and no existing course changes.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS attendance_mode text NOT NULL DEFAULT 'hour'
    CHECK (attendance_mode IN ('hour', 'lecture')),
  ADD COLUMN IF NOT EXISTS per_lecture_pct numeric
    CHECK (per_lecture_pct IS NULL OR (per_lecture_pct > 0 AND per_lecture_pct <= 100));
