-- admin_user_detail v2
-- Adds three read-only blocks to the admin per-user view (admin-only RPC, no user
-- impact) so we can see EXACTLY what calculation-critical data each student entered
-- and whether we're retaining them:
--   • academic   — university / major / level (from preferences.academic)
--   • inputs     — the semester + per-course figures every calculation depends on
--                  (weeks, dates, حرمان limit, credits, sessions/minutes, grade
--                  component weights + graded count, logged absences). Lets us spot
--                  bad inputs (e.g. weights not summing to 100, a course with
--                  absences but no sessions) that skew grade/attendance results.
--   • engagement — app opens (installed-app vs browser), page views, most-visited
--                  pages, first/last activity — to judge retention.
-- Everything else is preserved verbatim from v1.

CREATE OR REPLACE FUNCTION public.admin_user_detail(target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  active_sem uuid;
BEGIN
  -- The active semester is the source of truth the app calculates against.
  SELECT id INTO active_sem
  FROM public.semesters
  WHERE user_id = target_user_id AND is_active = true
  ORDER BY created_at DESC LIMIT 1;

  SELECT jsonb_build_object(
    'profile', (
      SELECT jsonb_build_object(
        'id', u.id, 'email', u.email, 'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'email_confirmed_at', u.email_confirmed_at,
        'banned_until', u.banned_until,
        'full_name', COALESCE(p.full_name, ''),
        'is_vip', COALESCE(p.is_vip, false),
        'is_admin', EXISTS (SELECT 1 FROM public.admins a WHERE lower(a.email) = lower(u.email))
      )
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
      WHERE u.id = target_user_id
    ),
    'subscription', (
      SELECT jsonb_build_object(
        'id', s.id, 'status', s.status, 'billing_cycle', s.billing_cycle,
        'amount_sar', s.amount_sar, 'trial_ends_at', s.trial_ends_at,
        'expires_at', s.expires_at, 'next_billing_at', s.next_billing_at,
        'cancelled_at', s.cancelled_at, 'last_payment_at', s.last_payment_at,
        'last_payment_id', s.last_payment_id, 'coupon_code', s.coupon_code,
        'discount_percent', s.discount_percent
      )
      FROM public.subscriptions s WHERE s.user_id = target_user_id
      ORDER BY s.updated_at DESC LIMIT 1
    ),
    'payment_summary', (
      SELECT jsonb_build_object(
        'total_paid_sar', COALESCE(SUM(amount_sar) FILTER (WHERE last_payment_at IS NOT NULL), 0),
        'payment_count',  COUNT(*) FILTER (WHERE last_payment_at IS NOT NULL),
        'last_payment_at', MAX(last_payment_at)
      )
      FROM public.subscriptions WHERE user_id = target_user_id
    ),
    'push_devices', (
      SELECT COUNT(*) FROM public.push_subscriptions WHERE user_id = target_user_id
    ),
    'tickets', (
      SELECT jsonb_agg(t) FROM (
        SELECT id, subject, status, priority, category, created_at, updated_at
        FROM public.support_tickets WHERE user_id = target_user_id
        ORDER BY created_at DESC LIMIT 50
      ) t
    ),
    'activity', (
      SELECT jsonb_agg(a) FROM (
        SELECT kind, ts, detail
        FROM public.admin_user_activity(target_user_id, 30)
      ) a
    ),

    -- ── NEW: academic identity (from preferences.academic) ──────────────
    'academic', (
      SELECT jsonb_build_object(
        'universitySlug', COALESCE(p.preferences #>> '{academic,universitySlug}', ''),
        'universityName', COALESCE(p.preferences #>> '{academic,universityName}', ''),
        'major',          COALESCE(p.preferences #>> '{academic,major}', ''),
        'level',          COALESCE(p.preferences #>> '{academic,level}', '')
      )
      FROM public.profiles p WHERE p.id = target_user_id
    ),

    -- ── NEW: calculation inputs (semester + per-course figures) ─────────
    'inputs', jsonb_build_object(
      'semester', (
        SELECT jsonb_build_object(
          'name', s.name,
          'teaching_weeks', s.teaching_weeks,
          'finals_weeks', s.finals_weeks,
          'start_date', s.start_date,
          'end_date', s.end_date,
          'withdrawal_limit', (
            SELECT CASE WHEN p.preferences->>'withdrawalLimit' ~ '^[0-9.]+$'
                        THEN (p.preferences->>'withdrawalLimit')::numeric ELSE NULL END
            FROM public.profiles p WHERE p.id = target_user_id
          ),
          'calendar_type', (
            SELECT COALESCE(p.preferences->>'calendarType', p.preferences->>'calendar')
            FROM public.profiles p WHERE p.id = target_user_id
          ),
          'tardiness_rule', (
            SELECT p.preferences->>'tardinessRuleId'
            FROM public.profiles p WHERE p.id = target_user_id
          ),
          'cumulative_gpa', (
            SELECT CASE WHEN p.preferences->>'cumulativeGpa' ~ '^[0-9.]+$'
                        THEN (p.preferences->>'cumulativeGpa')::numeric ELSE s.previous_gpa END
            FROM public.profiles p WHERE p.id = target_user_id
          ),
          'completed_hours', (
            SELECT CASE WHEN p.preferences->>'cumulativeHours' ~ '^[0-9.]+$'
                        THEN (p.preferences->>'cumulativeHours')::numeric ELSE s.completed_hours END
            FROM public.profiles p WHERE p.id = target_user_id
          )
        )
        FROM public.semesters s WHERE s.id = active_sem
      ),
      'courses', (
        SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.position), '[]'::jsonb)
        FROM (
          SELECT
            co.name,
            co.credits,
            co.attendance_limit,
            co.position,
            (SELECT count(*) FROM public.attendance_sessions ase WHERE ase.course_id = co.id) AS sessions,
            (SELECT COALESCE(sum(ase.duration_minutes),0) FROM public.attendance_sessions ase WHERE ase.course_id = co.id) AS weekly_minutes,
            (SELECT count(*) FROM public.grade_components gc WHERE gc.course_id = co.id) AS components,
            (SELECT count(*) FROM public.grade_components gc WHERE gc.course_id = co.id AND gc.score IS NOT NULL) AS graded,
            (SELECT COALESCE(sum(gc.percentage),0) FROM public.grade_components gc WHERE gc.course_id = co.id) AS weight_total,
            (SELECT count(*) FROM public.attendance_absences aa WHERE aa.course_id = co.id) AS absences,
            (SELECT COALESCE(sum(aa.minutes),0) FROM public.attendance_absences aa WHERE aa.course_id = co.id AND COALESCE(aa.excused,false)=false) AS absence_minutes
          FROM public.courses co
          WHERE co.user_id = target_user_id
            AND (active_sem IS NULL OR co.semester_id = active_sem)
        ) c
      )
    ),

    -- ── NEW: engagement / retention signals (from user_events) ──────────
    'engagement', (
      SELECT jsonb_build_object(
        'app_opens',           COUNT(*) FILTER (WHERE event = 'app_open'),
        'app_opens_installed', COUNT(*) FILTER (WHERE event = 'app_open' AND meta->>'standalone' = 'true'),
        'app_opens_browser',   COUNT(*) FILTER (WHERE event = 'app_open' AND meta->>'standalone' = 'false'),
        'page_views',          COUNT(*) FILTER (WHERE event = 'page_view'),
        'events_total',        COUNT(*),
        'first_event_at',      MIN(created_at),
        'last_event_at',       MAX(created_at)
      )
      FROM public.user_events WHERE user_id = target_user_id
    ),
    'top_pages', (
      SELECT COALESCE(jsonb_agg(tp), '[]'::jsonb) FROM (
        SELECT meta->>'path' AS path, count(*) AS views
        FROM public.user_events
        WHERE user_id = target_user_id AND event = 'page_view' AND meta->>'path' IS NOT NULL
        GROUP BY meta->>'path'
        ORDER BY count(*) DESC LIMIT 6
      ) tp
    ),
    'last_active_at', (
      SELECT last_active_at FROM public.profiles WHERE id = target_user_id
    )
  ) INTO result;
  RETURN result;
END;
$function$;
