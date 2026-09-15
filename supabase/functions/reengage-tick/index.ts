// supabase/functions/reengage-tick/index.ts
//
// Win-back engine. Finds users who have gone quiet (last_active_at older than
// LAPSE_DAYS but not ancient) and gives each ONE gentle nudge to come back,
// choosing the channel that can actually reach them:
//   • has a push subscription  → Web Push (they enabled notifications)
//   • no push subscription     → email (the only channel left for opted-out users)
// A cooldown (COOLDOWN_DAYS, tracked in notifications_sent kind='reengage')
// guarantees we never nag: at most one win-back touch per user per window.
//
// SAFETY: sending is OFF unless the REENGAGE_ENABLED secret is exactly "true".
// Until then every cron tick is a no-op. This is the deliberate go-live switch,
// mirroring ENFORCE_PREMIUM — the owner flips it when ready. Testing hooks:
//   ?dryRun=1            → compute the target list, send nothing (works even off)
//   ?onlyUser=<uuid>     → target just that user, bypassing the enable guard,
//                          the lapse window, and the cooldown (for a self-test)
//
// AUTH: Bearer <SCHEDULER_SECRET>, same as send-email / the cron caller.
//
// SECRETS: SCHEDULER_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
//          RESEND_API_KEY (via send-email), plus the Supabase-provided ones.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const LAPSE_DAYS = 7; // quiet for at least this long → eligible
const MAX_DAYS = 120; // …but don't chase users who left months ago
const COOLDOWN_DAYS = 14; // never nudge the same user more often than this
const LIMIT = 200; // cap per run

const DAY = 86_400_000;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

// Gender-neutral Arabic + English push copy, by (lang, variant).
function pushContent(lang: string, variant: 'setup' | 'back'): { title: string; body: string; url: string } {
  const ar = lang !== 'en';
  if (variant === 'setup') {
    return {
      title: ar ? 'نكمّل حسابك؟' : 'Finish setting up?',
      body: ar
        ? 'ناقص موادك — إضافتها تاخذ دقيقة ونبدأ نحسب لك المعدل'
        : "Add your courses — it takes a minute and we'll start tracking your GPA",
      url: '/courses?reengage=1',
    };
  }
  return {
    title: ar ? 'Haven بانتظارك' : 'Haven misses you',
    body: ar
      ? 'مرّت فترة — تحديث سريع لدرجاتك يبيّن لك وين وصلت'
      : "It's been a while — a quick grade update shows where you stand",
    url: '/dashboard?reengage=1',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  try {
    const schedulerSecret = Deno.env.get('SCHEDULER_SECRET');
    if (!schedulerSecret) return json({ error: 'SCHEDULER_SECRET not configured' }, 500);
    const authHeader = req.headers.get('Authorization') ?? '';
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!m || m[1] !== schedulerSecret) return json({ error: 'Unauthorized' }, 401);

    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dryRun') === '1';
    const onlyUser = url.searchParams.get('onlyUser');
    const enabled = Deno.env.get('REENGAGE_ENABLED') === 'true';

    // Master switch. A self-test (onlyUser) or a dry run may proceed while off.
    if (!enabled && !onlyUser && !dryRun) {
      return json({ ok: true, disabled: true, msg: 'REENGAGE_ENABLED is not "true" — no-op' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const now = Date.now();
    const todayStr = new Date(now).toISOString().slice(0, 10);

    // 1) Candidate profiles.
    let q = admin.from('profiles').select('id, email, preferences, last_active_at').not('email', 'is', null);
    if (onlyUser) {
      q = q.eq('id', onlyUser);
    } else {
      q = q
        .lt('last_active_at', new Date(now - LAPSE_DAYS * DAY).toISOString())
        .gt('last_active_at', new Date(now - MAX_DAYS * DAY).toISOString());
    }
    const { data: profiles, error: pErr } = await q.limit(LIMIT * 3);
    if (pErr) return json({ error: pErr.message }, 500);
    if (!profiles?.length) return json({ ok: true, targeted: 0, msg: 'no lapsed users' });

    let userIds = profiles.map((p: any) => p.id);

    // 2) Cooldown — drop anyone nudged within COOLDOWN_DAYS (skipped for a
    //    targeted self-test so it can be re-run freely).
    const skip = new Set<string>();
    if (!onlyUser) {
      const { data: recent } = await admin
        .from('notifications_sent')
        .select('user_id')
        .eq('kind', 'reengage')
        .gt('created_at', new Date(now - COOLDOWN_DAYS * DAY).toISOString())
        .in('user_id', userIds);
      for (const r of recent ?? []) skip.add(r.user_id);
    }
    userIds = userIds.filter((id) => !skip.has(id)).slice(0, LIMIT);
    if (!userIds.length) return json({ ok: true, targeted: 0, msg: 'all within cooldown' });

    // 3) Channels + variant inputs: push subscriptions and course counts.
    const [subRes, courseRes] = await Promise.all([
      admin.from('push_subscriptions').select('user_id, id, endpoint, p256dh, auth').in('user_id', userIds),
      admin.from('courses').select('user_id').in('user_id', userIds),
    ]);
    const subsOf = new Map<string, any[]>();
    for (const s of subRes.data ?? []) {
      if (!subsOf.has(s.user_id)) subsOf.set(s.user_id, []);
      subsOf.get(s.user_id)!.push(s);
    }
    const courseCount = new Map<string, number>();
    for (const c of courseRes.data ?? []) courseCount.set(c.user_id, (courseCount.get(c.user_id) ?? 0) + 1);

    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT');
    if (vapidPublic && vapidPrivate && vapidSubject) {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    }
    const profOf = new Map(profiles.map((p: any) => [p.id, p]));

    let pushSent = 0, emailSent = 0, cleaned = 0, skipped = 0;
    const plan: any[] = [];

    for (const uid of userIds) {
      const prof: any = profOf.get(uid);
      const lang = prof?.preferences?.language === 'en' ? 'en' : 'ar';
      const variant: 'setup' | 'back' = (courseCount.get(uid) ?? 0) > 0 ? 'back' : 'setup';
      const subs = subsOf.get(uid);
      const channel = subs?.length ? 'push' : prof?.email ? 'email' : 'none';

      if (channel === 'none') { skipped++; continue; }
      if (dryRun) { plan.push({ uid, channel, variant, lang }); continue; }

      let delivered = false;
      if (channel === 'push') {
        const { title, body, url: link } = pushContent(lang, variant);
        const payload = JSON.stringify({ title, body, url: link, id: `reengage-${todayStr}` });
        for (const sub of subs!) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
              { TTL: 3 * DAY / 1000 },
            );
            delivered = true;
          } catch (err: any) {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await admin.from('push_subscriptions').delete().eq('id', sub.id);
              cleaned++;
            }
          }
        }
        if (delivered) pushSent++;
      } else {
        // Email — hand off to send-email (bilingual template).
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${schedulerSecret}` },
            body: JSON.stringify({
              to: prof.email,
              template: 'reengage',
              data: { variant },
              dedup_key: `reengage-${todayStr}`,
              user_id: uid,
            }),
          });
          if (res.ok) { emailSent++; delivered = true; }
        } catch { /* best-effort */ }
      }

      // Record the touch for the cooldown (ignore duplicate-key races).
      if (delivered) {
        await admin.from('notifications_sent').insert({ user_id: uid, item_key: `reengage-${todayStr}`, kind: 'reengage' });
      }
    }

    return json({ ok: true, enabled, dryRun, targeted: userIds.length, pushSent, emailSent, cleaned, skipped, ...(dryRun ? { plan } : {}) });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
