// supabase/functions/test-push/index.ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')!;

    if (!vapidPublic || !vapidPrivate || !vapidSubject) {
      return json({ error: 'VAPID env vars not configured' }, 500);
    }

    // Client bound to the user's JWT (RLS-safe)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: 'Not authenticated' }, 401);
    }
    const user = userData.user;

    let body: { locale?: 'ar' | 'en' } = {};
    try { body = await req.json(); } catch (_) {}
    const locale: 'ar' | 'en' = body.locale === 'ar' ? 'ar' : 'en';

    // Fetch this user's subscriptions (RLS auto-filters)
    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth');
    if (subsErr) {
      return json({ error: 'Failed to load subscriptions', detail: subsErr.message }, 500);
    }
    if (!subs || subs.length === 0) {
      return json({ error: 'No subscriptions for this user', sent: 0, cleaned: 0 }, 400);
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const payload = JSON.stringify({
      title: locale === 'ar' ? 'Haven — إشعار تجريبي' : 'Haven — Test notification',
      body: locale === 'ar'
        ? '🎉 الإشعارات مفعّلة بنجاح على هذا الجهاز.'
        : '🎉 Notifications are working correctly on this device.',
      url: '/settings',
    });

    let sent = 0;
    let cleaned = 0;
    const errors: string[] = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 60 }
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 = subscription expired; clean it up
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          cleaned += 1;
        } else {
          errors.push(`endpoint ${sub.endpoint.slice(0, 40)}...: ${(err as Error).message}`);
        }
      }
    }

    return json({ sent, cleaned, errors, total: subs.length });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
