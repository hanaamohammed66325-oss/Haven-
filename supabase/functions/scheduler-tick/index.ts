// supabase/functions/scheduler-tick/index.ts
// Cron-invoked edge function: sends push notifications for upcoming lectures.
// Runs every 5 minutes via pg_cron + pg_net.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const WINDOW = 5;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')!;

    if (!vapidPublic || !vapidPrivate || !vapidSubject) {
      return json({ error: 'VAPID not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    // Riyadh time (UTC+3)
    const riyadhMs = Date.now() + 3 * 3_600_000;
    const nowRiyadh = new Date(riyadhMs);
    const todayDow = nowRiyadh.getUTCDay();
    const todayStr = nowRiyadh.toISOString().slice(0, 10);
    const nowMins = nowRiyadh.getUTCHours() * 60 + nowRiyadh.getUTCMinutes();

    // 1) Timetable entries for today
    const { data: entries, error: eErr } = await supabase
      .from('timetable_entries')
      .select('id, user_id, course_id, semester_id, start_time')
      .eq('day_of_week', todayDow);

    if (eErr) return json({ error: eErr.message }, 500);
    if (!entries?.length) return json({ sent: 0, msg: 'no entries today' });

    // 2) Active semesters covering today
    const semIds = [...new Set(entries.map((e: any) => e.semester_id))];
    const { data: semesters } = await supabase
      .from('semesters')
      .select('id, start_date, end_date, is_active')
      .in('id', semIds);

    const activeSemIds = new Set(
      (semesters ?? [])
        .filter((s: any) => s.is_active && todayStr >= s.start_date && todayStr <= s.end_date)
        .map((s: any) => s.id),
    );

    const active = entries.filter((e: any) => activeSemIds.has(e.semester_id));
    if (!active.length) return json({ sent: 0, msg: 'no active entries' });

    // 3) Profiles, push subscriptions, course names
    const userIds = [...new Set(active.map((e: any) => e.user_id))];
    const courseIds = [...new Set(active.map((e: any) => e.course_id))];

    const [profRes, subRes, courseRes] = await Promise.all([
      supabase.from('profiles').select('id, preferences').in('id', userIds),
      supabase
        .from('push_subscriptions')
        .select('user_id, id, endpoint, p256dh, auth')
        .in('user_id', userIds),
      supabase.from('courses').select('id, name').in('id', courseIds),
    ]);

    const prefsOf = new Map(
      (profRes.data ?? []).map((p: any) => [p.id, p.preferences ?? {}]),
    );
    const courseOf = new Map(
      (courseRes.data ?? []).map((c: any) => [c.id, c.name]),
    );
    const subsOf = new Map<string, any[]>();
    for (const s of subRes.data ?? []) {
      if (!subsOf.has(s.user_id)) subsOf.set(s.user_id, []);
      subsOf.get(s.user_id)!.push(s);
    }

    // 4) Dedup
    const keys = active.map((e: any) => `lec-${e.id}-${todayStr}`);
    const { data: already } = await supabase
      .from('notifications_sent')
      .select('item_key')
      .in('item_key', keys);
    const sentKeys = new Set((already ?? []).map((r: any) => r.item_key));

    // 5) Send
    let sent = 0;
    let cleaned = 0;
    const toRecord: { user_id: string; item_key: string; kind: string }[] = [];

    for (const entry of active) {
      const prefs = prefsOf.get(entry.user_id) ?? {};
      const lp = prefs.notifPrefs?.lectures ?? {};
      if (lp.enabled === false) continue;

      const minsBefore: number = Math.max(
        5,
        Math.min(120, typeof lp.minutesBefore === 'number' ? lp.minutesBefore : 15),
      );

      const m = /^(\d{1,2}):(\d{2})$/.exec(entry.start_time);
      if (!m) continue;
      const fireMins = Number(m[1]) * 60 + Number(m[2]) - minsBefore;

      if (fireMins >= nowMins || fireMins < nowMins - WINDOW) continue;

      const key = `lec-${entry.id}-${todayStr}`;
      if (sentKeys.has(key)) continue;

      const subs = subsOf.get(entry.user_id);
      if (!subs?.length) continue;

      const lang = prefs.language === 'en' ? 'en' : 'ar';
      const courseName = courseOf.get(entry.course_id) ?? 'Haven';
      const payload = JSON.stringify({
        title: courseName,
        body:
          lang === 'ar'
            ? `تبدأ خلال ${minsBefore} دقيقة`
            : `Starts in ${minsBefore} min`,
        url: '/timetable',
        id: key,
      });

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: minsBefore * 60 },
          );
          sent++;
        } catch (err: any) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
            cleaned++;
          }
        }
      }

      toRecord.push({ user_id: entry.user_id, item_key: key, kind: 'lecture' });
      sentKeys.add(key);
    }

    // 6) Record for dedup
    if (toRecord.length) {
      await supabase
        .from('notifications_sent')
        .insert(toRecord.map((r) => ({ ...r })));
    }

    return json({ checked: active.length, sent, cleaned, recorded: toRecord.length });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
