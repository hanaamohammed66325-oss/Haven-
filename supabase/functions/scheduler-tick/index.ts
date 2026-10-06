// supabase/functions/scheduler-tick/index.ts
// Cron-invoked edge function: sends push notifications for upcoming lectures and
// delivers client-queued smart reminders from the scheduled_pushes outbox.
// Runs every minute via pg_cron + pg_net; a WINDOW-minute send window plus an
// atomic per-lecture claim (notifications_sent unique key) guarantees exactly
// one push per lecture even though many ticks fall inside the window. Each
// student's lectures follow their own clock (the time zone their app saved) and
// skip their holidays (preferences.classOff, see NotifScheduler).
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';
import { deliverOutbox } from './outbox.ts';

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

    let sent = 0;
    let cleaned = 0;
    let recorded = 0;

    // 0) OUTBOX — deliver client-queued smart reminders that are due now. This
    // runs FIRST and independently of lectures so it still fires on days with no
    // timetable entries. The client precomputes the content and send time; here
    // we only deliver, claiming each row atomically so a row is sent exactly once.
    const scheduledSent = await deliverOutbox(supabase, webpush, () => { cleaned++; });

    // Each student's own clock: the time zone their app saved (preferences.
    // classOff.tz; Riyadh when none yet). Timetable days are fetched for the
    // Riyadh day and the ones either side, which covers every time zone.
    const riyadhDow = new Date(Date.now() + 3 * 3_600_000).getUTCDay();
    const dows = [(riyadhDow + 6) % 7, riyadhDow, (riyadhDow + 1) % 7];

    // 1) Timetable entries for those days
    const { data: entries, error: eErr } = await supabase
      .from('timetable_entries')
      .select('id, user_id, course_id, semester_id, start_time, room, day_of_week')
      .in('day_of_week', dows);

    if (eErr) return json({ error: eErr.message }, 500);
    if (!entries?.length) return json({ sent, cleaned, recorded, scheduledSent, msg: 'no entries today' });

    // 2) Their students' preferences, then today's entries on each one's clock
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, preferences')
      .in('id', [...new Set(entries.map((e: any) => e.user_id))]);
    const prefsOf = new Map((profs ?? []).map((p: any) => [p.id, p.preferences ?? {}]));
    const clockOf = new Map<string, LocalNow>();
    const clock = (userId: string) => {
      let c = clockOf.get(userId);
      if (!c) {
        c = localNow(prefsOf.get(userId)?.classOff?.tz);
        clockOf.set(userId, c);
      }
      return c;
    };
    const today = entries.filter((e: any) => e.day_of_week === clock(e.user_id).dow);

    // 3) Active semesters covering the student's today — and not one of their
    // holidays (preferences.classOff.days: the term's breaks, as their app works
    // them out from their university's calendar).
    const semIds = [...new Set(today.map((e: any) => e.semester_id))];
    const { data: semesters } = semIds.length
      ? await supabase.from('semesters').select('id, start_date, end_date, is_active').in('id', semIds)
      : { data: [] };
    const semOf = new Map((semesters ?? []).map((s: any) => [s.id, s]));

    const active = today.filter((e: any) => {
      const s = semOf.get(e.semester_id);
      const { date } = clock(e.user_id);
      if (!s?.is_active || date < s.start_date || date > s.end_date) return false;
      const off = prefsOf.get(e.user_id)?.classOff?.days;
      return !(Array.isArray(off) && off.includes(date));
    });
    if (!active.length) return json({ sent, cleaned, recorded, scheduledSent, msg: 'no active entries' });

    // 4) Push subscriptions, course names
    const userIds = [...new Set(active.map((e: any) => e.user_id))];
    const courseIds = [...new Set(active.map((e: any) => e.course_id))];

    const [subRes, courseRes] = await Promise.all([
      supabase
        .from('push_subscriptions')
        .select('user_id, id, endpoint, p256dh, auth')
        .in('user_id', userIds),
      supabase.from('courses').select('id, name').in('id', courseIds),
    ]);

    const courseOf = new Map(
      (courseRes.data ?? []).map((c: any) => [c.id, c.name]),
    );
    const subsOf = new Map<string, any[]>();
    for (const s of subRes.data ?? []) {
      if (!subsOf.has(s.user_id)) subsOf.set(s.user_id, []);
      subsOf.get(s.user_id)!.push(s);
    }

    // 5) Send. Dedup is ATOMIC: we claim the per-lecture key by INSERTing into
    // notifications_sent (which has a UNIQUE (user_id,item_key,kind) constraint)
    // BEFORE sending. If the insert conflicts, another cron tick already claimed
    // it this window, so we skip — no duplicate pushes even though the cron runs
    // every minute across a multi-minute send window.
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

      const { mins: nowMins, date: todayStr } = clock(entry.user_id);
      if (fireMins >= nowMins || fireMins < nowMins - WINDOW) continue;

      const subs = subsOf.get(entry.user_id);
      if (!subs?.length) continue;

      const key = `lec-${entry.id}-${todayStr}`;

      // Atomic claim — first tick to insert wins; a conflict means already sent.
      const { data: claimed, error: claimErr } = await supabase
        .from('notifications_sent')
        .insert({ user_id: entry.user_id, item_key: key, kind: 'lecture' })
        .select('id')
        .maybeSingle();
      if (claimErr || !claimed) continue; // conflict (23505) or error → skip
      recorded++;

      const lang = prefs.language === 'en' ? 'en' : 'ar';
      const courseName = courseOf.get(entry.course_id) ?? 'Haven';
      const room: string | null = entry.room ?? null;
      const payload = JSON.stringify({
        title: `${courseName}`,
        body: lectureBody(lang, courseName, minsBefore, room),
        url: '/schedule',
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
    }

    return json({ checked: active.length, sent, cleaned, recorded, scheduledSent });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});

interface LocalNow {
  dow: number;
  date: string;
  mins: number;
}

/** Now on a student's clock (an IANA time zone; Riyadh when missing or unknown). */
function localNow(tz: unknown): LocalNow {
  const zone = typeof tz === 'string' && tz.length <= 64 ? tz : 'Asia/Riyadh';
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(new Date());
  } catch {
    return zone === 'Asia/Riyadh' ? { dow: 0, date: '', mins: 0 } : localNow('Asia/Riyadh');
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    date: `${get('year')}-${get('month')}-${get('day')}`,
    mins: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

// Lecture-reminder body, a few variations, with the room when known.
function lectureBody(lang: string, course: string, mins: number, room: string | null): string {
  if (lang === 'en') {
    const r = room ? ` — Room ${room}` : '';
    const v = [
      `${course} starts in ${mins} min${r}.`,
      `${course} is coming up soon${r}.`,
      `Time to get ready for ${course}${r}.`,
    ];
    return v[Math.floor(Math.random() * v.length)];
  }
  const r = room ? ` — القاعة ${room}` : '';
  const v = [
    `محاضرة ${course} تبدأ بعد ${arMinutes(mins)}${r}.`,
    `محاضرة ${course} قرّبت${r}.`,
    `استعد لمحاضرة ${course}${r}.`,
  ];
  return v[Math.floor(Math.random() * v.length)];
}

// "دقيقة" in the form its number takes: 1, 2, 3–10, 11+.
function arMinutes(n: number): string {
  if (n === 1) return 'دقيقة';
  if (n === 2) return 'دقيقتين';
  const m = n % 100;
  return m >= 3 && m <= 10 ? `${n} دقائق` : `${n} دقيقة`;
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
