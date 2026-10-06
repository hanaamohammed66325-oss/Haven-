// supabase/functions/scheduler-tick/outbox.ts
// Deliver client-queued reminders from the scheduled_pushes outbox that are due
// now and not yet sent. Kept free of Deno APIs so tests can run it with a fake
// client (tests/outbox.test.ts).
//
// Each row is claimed atomically (flip sent_at only while still null) so exactly
// one cron tick delivers it. The claim also requires the row to still be the
// version this tick read: same send time, title and body. A row the app changed
// in between (an absence alert cancelled and brought back for tomorrow, a
// reminder whose text was refreshed) is left alone, neither sent nor used up;
// a later tick takes the new version at its own time. What goes out is the
// content the claim returned.

// A reminder this many ms past its send time is stale — better to drop it than
// deliver a notification for something whose moment has passed (e.g. a push
// queued for yesterday that missed its window arriving today).
export const STALE_MS = 3 * 3_600_000;

// Validate task/exam reminders against their planner item at delivery time: a
// checked-off (done) or deleted task must not fire, even if the app was never
// reopened to cancel it client-side. dedup_key is `task-<uuid>-<n>h`.
const UUID = /^task-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-/;
const taskNoteId = (key: string): string | null => {
  const m = UUID.exec(key);
  return m ? m[1] : null;
};

/** `onClean` is called whenever a dead (404/410) subscription is pruned.
 *  Returns how many pushes were sent. */
export async function deliverOutbox(
  supabase: any,
  webpush: any,
  onClean: () => void,
  nowMs: number = Date.now(),
): Promise<number> {
  const nowIso = new Date(nowMs).toISOString();
  const { data: due } = await supabase
    .from('scheduled_pushes')
    .select('id, user_id, dedup_key, title, body, send_at')
    .is('sent_at', null)
    .lte('send_at', nowIso)
    .limit(200);

  if (!due?.length) return 0;

  // Take the row as this tick read it (see the header): still unsent, same
  // send time and content. null when it was changed or taken meanwhile.
  const claim = async (row: any) => {
    const { data } = await supabase
      .from('scheduled_pushes')
      .update({ sent_at: nowIso })
      .eq('id', row.id)
      .is('sent_at', null)
      .eq('send_at', row.send_at)
      .eq('title', row.title)
      .eq('body', row.body)
      .select('id, user_id, dedup_key, title, body')
      .maybeSingle();
    return data ?? null;
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
  // (flip sent_at) so they never deliver, but send nothing. Only the version
  // read here: one rescheduled since stays for its new time.
  const deliver: any[] = [];
  for (const row of due) {
    const stale = nowMs - new Date(row.send_at).getTime() > STALE_MS;
    const nid = taskNoteId(row.dedup_key);
    const deadTask = noteLookupOk && nid != null && (!noteExists.has(nid) || noteDone.get(nid) === true);
    if (stale || deadTask) await claim(row);
    else deliver.push(row);
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
    // Atomic claim — only the first tick to flip sent_at delivers this row, and
    // only the version read above.
    const claimed = await claim(row);
    if (!claimed) continue;

    const subs = subsOf.get(claimed.user_id);
    if (!subs?.length) continue;

    const payload = JSON.stringify({
      title: claimed.title,
      body: claimed.body,
      url: '/dashboard',
      id: claimed.dedup_key,
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
