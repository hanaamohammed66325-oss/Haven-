// ---------------------------------------------------------------------------
// The client side of the scheduled_pushes outbox (reminders queued for the
// delivery cron), with the table passed in so it can be tested.
//
// A reminder is cancelled by marking the row (sent_at, and cancelled_at) so the
// cron skips it. The delivery cron marks a row only at or after its send time,
// so a mark made BEFORE the send time is a cancellation, never a delivery.
// Queuing the same reminder again brings a cancelled row back: when the student
// returns to a term, or un-checks a task, its reminders come back. A row the
// cron delivered stays delivered, even if its task is moved to a later time
// afterwards: one reminder per task and lead time, never two.
// ---------------------------------------------------------------------------

export interface OutboxPush {
  dedupKey: string;
  sendAt: string; // ISO timestamp
  title: string;
  body: string;
}

/** What the table holds for one reminder. */
export interface OutboxRow {
  sendAt: string;
  sentAt: string | null;
  cancelledAt: string | null;
}

export interface OutboxStore {
  read(uid: string, dedupKey: string): Promise<OutboxRow | null>;
  /** Insert or refresh the reminder; with `revive`, also clear its cancellation mark. */
  upsert(uid: string, push: OutboxPush, revive: boolean): Promise<void>;
  /** Keys of this account's rows with the prefix that are not marked yet. */
  undeliveredKeys(uid: string, prefix: string): Promise<string[]>;
  /** Mark these unmarked rows as cancelled. */
  cancel(uid: string, dedupKeys: string[], nowIso: string): Promise<void>;
}

/** Marked, and marked before it was due (or marked cancelled): never delivered. */
export function wasCancelled(row: OutboxRow | null): boolean {
  if (!row?.sentAt) return false;
  return !!row.cancelledAt || Date.parse(row.sentAt) < Date.parse(row.sendAt);
}

export function createOutbox(deps: {
  sessionUserId: () => Promise<string | null>;
  store: OutboxStore;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  return {
    /** Queue a reminder (refreshing its content and time); a cancelled one that is still ahead comes back. Never throws. */
    async enqueue(push: OutboxPush): Promise<void> {
      try {
        const uid = await deps.sessionUserId();
        if (!uid) return;
        const ahead = Date.parse(push.sendAt) > now();
        const revive = ahead && wasCancelled(await deps.store.read(uid, push.dedupKey));
        await deps.store.upsert(uid, push, revive);
      } catch {
        // best-effort — ignore failures
      }
    },
    /** Cancel this account's waiting reminders with the prefix that are not in `keep`. Never throws. */
    async reconcile(prefix: string, keep: ReadonlySet<string>): Promise<void> {
      try {
        const uid = await deps.sessionUserId();
        if (!uid) return;
        const stale = (await deps.store.undeliveredKeys(uid, prefix)).filter((key) => !keep.has(key));
        if (stale.length) await deps.store.cancel(uid, stale, new Date(now()).toISOString());
      } catch {
        // best-effort — ignore failures
      }
    },
  };
}
