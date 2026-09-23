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

type Variant = 'setup' | 'grades' | 'back';

// A tiny deterministic hash so a given user gets a DIFFERENT friendly line each
// nudge window (seeded by the day) instead of always the same sentence.
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

// Gender-neutral, casual Arabic + English push copy — several warm variants per
// case, rotated by (uid + day) so repeat nudges never read the same.
function pushContent(lang: string, variant: Variant, seed: number): { title: string; body: string; url: string } {
  const ar = lang !== 'en';
  if (variant === 'setup') {
    const bodies = ar
      ? [
          'ناقص موادك — إضافتها تاخذ دقيقة ونبدأ نحسب لك المعدل',
          'حسابك جاهز! ضيف موادك ونبدأ نتابع معدلك وحضورك',
          'خطوة وحدة باقية: ضيف موادك ونبدأ نشتغل معك',
        ]
      : [
          "Add your courses — it takes a minute and we'll start tracking your GPA",
          'Your account is ready — add your courses and we\'ll track your GPA and attendance',
          "One step left: add your courses and we're good to go",
        ];
    return { title: ar ? 'نكمّل حسابك؟' : 'Finish setting up?', body: pick(bodies, seed), url: '/courses?reengage=1' };
  }
  if (variant === 'grades') {
    const bodies = ar
      ? [
          'موادك جاهزة — ضيف درجاتك ونحسب لك معدلك',
          'خطوة وحدة باقية: درجاتك عشان نبيّن لك وين وصل معدلك',
          'ضيف درجاتك وشوف معدلك يتحدّث لحظة بلحظة',
        ]
      : [
          'Your courses are set — add your grades and we\'ll calculate your GPA',
          'One step left: add your grades to see where your GPA stands',
          'Add your grades and watch your GPA update live',
        ];
    return { title: ar ? 'نحسب معدلك؟' : 'Calculate your GPA?', body: pick(bodies, seed), url: '/courses?reengage=1' };
  }
  const titles = ar
    ? ['طمنّا عنك', 'Haven بانتظارك', 'اشتقنا لك']
    : ['Checking in', 'Haven misses you', 'We miss you'];
  const bodies = ar
    ? [
        'صار لك فترة ما دخلت — متأكد وضعك تمام؟ تحديث سريع يطمنك',
        'مرّت فترة — دقيقة وحدة تحدّث درجاتك وتعرف وين أنت',
        'اشتقنا لك! تعال شوف وين وصل معدلك',
        'تذكيراتك ومعدلك بانتظارك — لا يفوتك اختبار ولا محاضرة',
      ]
    : [
        "It's been a while — all good? A quick update keeps you on track",
        'A minute to update your grades shows exactly where you stand',
        'We miss you! Come see where your GPA landed',
        "Your reminders and GPA are waiting — don't miss an exam or a lecture",
      ];
  return { title: pick(titles, seed), body: pick(bodies, seed), url: '/dashboard?reengage=1' };
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Master switch. Two ways to flip go-live, either one enables sending:
    //   • the REENGAGE_ENABLED secret === "true" (owner sets it in the dashboard)
    //   • the app_config row key='reengage_enabled' value='true' (toggled by SQL)
    // The DB flag exists so go-live can be flipped without a secret redeploy.
    let enabled = Deno.env.get('REENGAGE_ENABLED') === 'true';
    if (!enabled) {
      const { data: cfg } = await admin
        .from('app_config').select('value').eq('key', 'reengage_enabled').maybeSingle();
      enabled = cfg?.value === 'true';
    }

    // A self-test (onlyUser) or a dry run may proceed while off.
    if (!enabled && !onlyUser && !dryRun) {
      return json({ ok: true, disabled: true, msg: 'reengage is disabled — no-op' });
    }

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
    //    notifications_sent has NO timestamp column we can filter on, but every
    //    reengage touch's item_key encodes the day it was sent
    //    (`reengage-YYYY-MM-DD`), so we look for a touch under any of the last
    //    COOLDOWN_DAYS day-keys instead of a created_at range.
    const skip = new Set<string>();
    if (!onlyUser) {
      const recentKeys: string[] = [];
      for (let d = 0; d < COOLDOWN_DAYS; d++) {
        recentKeys.push(`reengage-${new Date(now - d * DAY).toISOString().slice(0, 10)}`);
      }
      const { data: recent } = await admin
        .from('notifications_sent')
        .select('user_id')
        .eq('kind', 'reengage')
        .in('item_key', recentKeys)
        .in('user_id', userIds);
      for (const r of recent ?? []) skip.add(r.user_id);
    }
    userIds = userIds.filter((id) => !skip.has(id)).slice(0, LIMIT);
    if (!userIds.length) return json({ ok: true, targeted: 0, msg: 'all within cooldown' });

    // 3) Channels + variant inputs: push subscriptions, course counts, and
    //    whether any grade has been entered (score set) — drives setup/grades/back.
    const [subRes, courseRes, gradeRes] = await Promise.all([
      admin.from('push_subscriptions').select('user_id, id, endpoint, p256dh, auth').in('user_id', userIds),
      admin.from('courses').select('user_id').in('user_id', userIds),
      admin.from('grade_components').select('user_id').not('score', 'is', null).in('user_id', userIds),
    ]);
    const subsOf = new Map<string, any[]>();
    for (const s of subRes.data ?? []) {
      if (!subsOf.has(s.user_id)) subsOf.set(s.user_id, []);
      subsOf.get(s.user_id)!.push(s);
    }
    const courseCount = new Map<string, number>();
    for (const c of courseRes.data ?? []) courseCount.set(c.user_id, (courseCount.get(c.user_id) ?? 0) + 1);
    const hasGrades = new Set<string>();
    for (const g of gradeRes.data ?? []) hasGrades.add(g.user_id);

    const dayNum = Math.floor(now / DAY); // seed component: rotates copy over time

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
      const nCourses = courseCount.get(uid) ?? 0;
      const variant: Variant = nCourses === 0 ? 'setup' : !hasGrades.has(uid) ? 'grades' : 'back';
      const seed = hash(uid) + dayNum;
      const subs = subsOf.get(uid);
      const channel = subs?.length ? 'push' : prof?.email ? 'email' : 'none';

      if (channel === 'none') { skipped++; continue; }
      // Opted-OUT users (no push) get the notification-enable nudge unless they
      // still need to add courses first, in which case the setup ask comes first.
      const emailVariant = nCourses === 0 ? 'setup' : 'notif';
      if (dryRun) { plan.push({ uid, channel, variant: channel === 'email' ? emailVariant : variant, lang }); continue; }

      let delivered = false;
      if (channel === 'push') {
        const { title, body, url: link } = pushContent(lang, variant, seed);
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
              data: { variant: emailVariant },
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
