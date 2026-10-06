// ---------------------------------------------------------------------------
// Absence alerts → the server outbox, bound to the account they belong to.
//
// Each snapshot carries the account whose data it was built from (the store's
// accountId) and goes to sync_absence_alerts with that id; the server refuses
// it unless the request's own account is the same one, before writing
// anything. So one account's alerts can never land on another's, even if the
// device switches accounts while a request is being prepared.
//
// Only the newest snapshot is sent, one request at a time (latestSync). A
// session read that fails (an expired token that can't refresh offline) is
// retried, not taken as signed out, and keeps that snapshot — a cancellation
// ([]) too. Signed out or another account by then: the snapshot is dropped,
// never re-pointed at the new account. A snapshot counts as written only after
// the server accepted it.
// Pure of the Supabase client (passed in), so it's testable.
// ---------------------------------------------------------------------------

import { latestSync } from "./latestSync";

/** One absence alert to queue (lib/absenceAlerts): sent once per key, ever. */
export interface AbsenceAlertRow {
  key: string;
  sendAt: string; // ISO timestamp
  title: string;
  body: string;
}

export interface AbsenceSyncDeps {
  /** The signed-in account now; throws when it can't be read (offline refresh). */
  sessionUserId: () => Promise<string | null>;
  /** sync_absence_alerts(p_expected_uid, p_alerts); resolves the error code or null. */
  rpc: (expectedUid: string, alerts: unknown[]) => Promise<{ code: string } | null>;
  retryDelays?: number[];
}

// Wrong or no account (42501), or input the server refused (22023): retrying
// the same snapshot can't help.
const FINAL_ERRORS = new Set(["42501", "22023"]);

export function createAbsenceSync(deps: AbsenceSyncDeps) {
  let synced: string | null = null; // `uid|snapshot` the server last accepted

  const queue = latestSync(async ({ uid, snapshot }: { uid: string; snapshot: string }) => {
    const current = await deps.sessionUserId(); // a throw is retried
    if (current !== uid) return true; // signed out or another account: not theirs
    if (synced === `${uid}|${snapshot}`) return true;
    const error = await deps.rpc(uid, JSON.parse(snapshot) as unknown[]);
    if (error) return FINAL_ERRORS.has(error.code);
    synced = `${uid}|${snapshot}`;
    return true;
  }, deps.retryDelays);

  return {
    /** Queue the alerts for `accountId` (null: no account's data is shown). */
    sync(accountId: string | null | undefined, alerts: AbsenceAlertRow[]): void {
      if (!accountId) return;
      const snapshot = JSON.stringify(
        [...alerts]
          .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
          .map((a) => ({ key: a.key, send_at: a.sendAt, title: a.title, body: a.body }))
      );
      queue.push({ uid: accountId, snapshot });
    },
    /** Try a waiting snapshot again (the connection came back). */
    retry: queue.retry,
  };
}
