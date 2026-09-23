// supabase/functions/scheduler-tick/index.ts
// Cron-invoked edge function: sends push notifications for upcoming lectures and
// delivers client-queued smart reminders from the scheduled_pushes outbox.
// Runs every minute via pg_cron + pg_net; a WINDOW-minute send window plus an
// atomic per-lecture claim (notifications_sent unique key) guarantees exactly
// one push per lecture even though many ticks fall inside the window.
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

    let sent = 0;
    let cleaned = 0;
    let recorded = 0;

    // 0) OUTBOX — deliver client-queued smart reminders that are due now. This
    // runs FIRST and independently of lectures so it still fires on days with no
    // timetable entries. The client precomputes the content and send time; here
    // we only deliver, claiming each row atomically so a row is sent exactly once.
    const scheduledSent = await deliverOutbox(supabase, webpush, () => { cleaned++; });

    // Riyadh time (UTC+3)
    const riyadhMs = Date.now() + 3 * 3_600_000;
    const nowRiyadh = new Date(riyadhMs);
    const todayDow = nowRiyadh.getUTCDay();
    const todayStr = nowRiyadh.toISOString().slice(0, 10);
    const nowMins = nowRiyadh.getUTCHours() * 60 + nowRiyadh.getUTCMinutes();

    // 1) Timetable entries for today
    const { data: entries, error: eErr } = await supabase
      .from('timetable_entries')
      .select('id, user_id, course_id, semester_id, start_time, room')
      .eq('day_of_week', todayDow);

    if (eErr) return json({ error: eErr.message }, 500);
    if (!entries?.length) return json({ sent, cleaned, recorded, scheduledSent, msg: 'no entries today' });

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
    if (!active.length) return json({ sent, cleaned, recorded, scheduledSent, msg: 'no active entries' });

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

    // 4) Send. Dedup is ATOMIC: we claim the per-lecture key by INSERTing into
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
        title: `${courseName} 📚`,
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

// Deliver client-queued reminders from the scheduled_pushes outbox that are due
// now and not yet sent. Each row is claimed atomically (flip sent_at only while
// still null) so exactly one cron tick delivers it. `onClean` is called whenever
// a dead (404/410) subscription is pruned. Returns how many pushes were sent.
async function deliverOutbox(
  supabase: any,
  webpush: any,
  onClean: () => void,
): Promise<number> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  // A reminder this many ms past its send time is stale — better to drop it than
  // deliver a notification for something whose moment has passed (e.g. a push
  // queued for yesterday that missed its window arriving today).
  const STALE_MS = 3 * 3_600_000;
  const { data: due } = await supabase
    .from('scheduled_pushes')
    .select('id, user_id, dedup_key, title, body, send_at')
    .is('sent_at', null)
    .lte('send_at', nowIso)
    .limit(200);

  if (!due?.length) return 0;

  // Validate task/exam reminders against their planner item at delivery time: a
  // checked-off (done) or deleted task must not fire, even if the app was never
  // reopened to cancel it client-side. dedup_key is `task-<uuid>-<n>h`.
  const UUID = /^task-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-/;
  const taskNoteId = (key: string): string | null => {
    const m = UUID.exec(key);
    return m ? m[1] : null;
  };
  const noteIds = [...new Set(due.map((r: any) => taskNoteId(r.dedup_key)).filter(Boolean))] as string[];
  const noteDone = new Map<string, boolean>();
  const noteExists = new Set<string>();
  // If the lookup fails we must NOT treat every task as deleted (that would
  // suppress all task reminders this tick) — fall back to delivering normally.
  let noteLookupOk = true;
  if (noteIds.length) {
    const { data: items, error } = await supabase
      .from('planner_items')
      .select('id, done')
      .in('id', noteIds);
    if (error) noteLookupOk = false;
    else for (const it of items ?? []) { noteExists.add(it.id); noteDone.set(it.id, !!it.done); }
  }

  // Drop stale rows and reminders whose task is gone/checked off: claim them
  // (flip sent_at) so they never deliver, but send nothing.
  const deliver: any[] = [];
  const skipIds: string[] = [];
  for (const row of due) {
    const stale = nowMs - new Date(row.send_at).getTime() > STALE_MS;
    const nid = taskNoteId(row.dedup_key);
    const deadTask = noteLookupOk && nid != null && (!noteExists.has(nid) || noteDone.get(nid) === true);
    if (stale || deadTask) skipIds.push(row.id);
    else deliver.push(row);
  }
  if (skipIds.length) {
    await supabase.from('scheduled_pushes').update({ sent_at: nowIso }).in('id', skipIds).is('sent_at', null);
  }
  if (!deliver.length) return 0;

  const dueUserIds = [...new Set(deliver.map((r: any) => r.user_id))];
  const { data: dueSubs } = await supabase
    .from('push_subscriptions')
    .select('user_id, id, endpoint, p256dh, auth')
    .in('user_id', dueUserIds);

  const subsOf = new Map<string, any[]>();
  for (const s of dueSubs ?? []) {
    if (!subsOf.has(s.user_id)) subsOf.set(s.user_id, []);
    subsOf.get(s.user_id)!.push(s);
  }

  let scheduledSent = 0;
  for (const row of deliver) {
    // Atomic claim — only the first tick to flip sent_at delivers this row.
    const { data: claimed } = await supabase
      .from('scheduled_pushes')
      .update({ sent_at: nowIso })
      .eq('id', row.id)
      .is('sent_at', null)
      .select('id')
      .maybeSingle();
    if (!claimed) continue;

    const subs = subsOf.get(row.user_id);
    if (!subs?.length) continue;

    const payload = JSON.stringify({
      title: row.title,
      body: row.body,
      url: '/dashboard',
      id: row.dedup_key,
    });
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 6 * 3600 },
        );
        scheduledSent++;
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          onClean();
        }
      }
    }
  }
  return scheduledSent;
}

// Friendly, varied lecture-reminder body — casual tone, room, and an emoji.
function lectureBody(lang: string, course: string, mins: number, room: string | null): string {
  if (lang === 'en') {
    const r = room ? ` — Room ${room}` : '';
    const v = [
      `Don't forget ${course}! Starts in ${mins} min${r} 🚀`,
      `Heads up — ${course} is coming up${r} 📚`,
      `Time for ${course}! Get ready${r} 🚀`,
    ];
    return v[Math.floor(Math.random() * v.length)];
  }
  const r = room ? ` — القاعة ${room}` : '';
  const v = [
    `لا تنسى ${course}! يبدأ بعد ${mins} دقيقة${r} 🚀`,
    `يلا! عندك ${course} بعد شوي${r} 📚`,
    `وقت ${course}! جهّز نفسك${r} 🚀`,
  ];
  return v[Math.floor(Math.random() * v.length)];
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
