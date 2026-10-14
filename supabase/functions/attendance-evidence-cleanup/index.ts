// supabase/functions/attendance-evidence-cleanup/index.ts
//
// Daily clean-up of the private `attendance-evidence` bucket (Codex review F5,
// Hanaa 2026-10-13). Removes:
//   • images of accounts deleted more than 30 days ago (kept one month, her
//     decision), then forgets their rows once the image is really gone;
//   • orphans: images uploaded over 2 hours ago with no contribution (a failed
//     or abandoned send).
// Storage files can only be deleted through the Storage API, not SQL
// (protect_objects_delete), hence this function. Bounded per run; whatever is
// left goes on the next run, and the admin page shows what is still waiting.
//
// AUTH: Bearer <SCHEDULER_SECRET>, like the other cron-called functions.
// SECRETS: SCHEDULER_SECRET plus the Supabase-provided ones.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const BUCKET = 'attendance-evidence';
const LIMIT = 200;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  try {
    const secret = Deno.env.get('SCHEDULER_SECRET');
    if (!secret) return json({ error: 'SCHEDULER_SECRET not configured' }, 500);
    const m = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i);
    if (!m || m[1] !== secret) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });

    const { data, error } = await admin.rpc('attendance_evidence_cleanup_candidates', { p_limit: LIMIT });
    if (error) return json({ error: error.message }, 500);
    const rows = (data ?? []) as { kind: 'expired' | 'orphan'; contribution_id: string | null; image_path: string }[];
    if (!rows.length) return json({ ok: true, removed: 0, forgotten: 0 });

    let removed = 0;
    const failed: string[] = [];
    // The Storage API takes a list; 100 at a time.
    for (let i = 0; i < rows.length; i += 100) {
      const paths = rows.slice(i, i + 100).map((r) => r.image_path);
      const { data: gone, error: re } = await admin.storage.from(BUCKET).remove(paths);
      if (re) failed.push(...paths);
      else removed += gone?.length ?? 0;
    }

    // Rows are forgotten only where the image is really gone (checked in SQL).
    const ids = rows.filter((r) => r.kind === 'expired' && r.contribution_id).map((r) => r.contribution_id!);
    let forgotten = 0;
    if (ids.length) {
      const { data: n, error: fe } = await admin.rpc('attendance_evidence_forget', { p_ids: ids });
      if (fe) return json({ ok: false, removed, error: fe.message, failed: failed.length }, 500);
      forgotten = Number(n ?? 0);
    }
    return json({ ok: failed.length === 0, removed, forgotten, failed: failed.length }, failed.length ? 500 : 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
