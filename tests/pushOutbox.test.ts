import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createOutbox, wasCancelled, type OutboxStore } from "@/lib/pushOutbox";

type Row = {
  uid: string; key: string; sendAt: string; sentAt: string | null; cancelledAt: string | null; title: string; body: string;
};

/** A table that behaves like scheduled_pushes for the outbox, plus the delivery cron. */
function table() {
  const rows: Row[] = [];
  const find = (uid: string, key: string) => rows.find((row) => row.uid === uid && row.key === key);
  const store: OutboxStore = {
    async read(uid, key) {
      const row = find(uid, key);
      return row ? { sendAt: row.sendAt, sentAt: row.sentAt, cancelledAt: row.cancelledAt } : null;
    },
    async upsert(uid, push, revive) {
      const row = find(uid, push.dedupKey);
      if (row) {
        Object.assign(row, { sendAt: push.sendAt, title: push.title, body: push.body });
        if (revive) Object.assign(row, { sentAt: null, cancelledAt: null });
      } else {
        rows.push({ uid, key: push.dedupKey, sendAt: push.sendAt, sentAt: null, cancelledAt: null, title: push.title, body: push.body });
      }
    },
    async undeliveredKeys(uid, prefix) {
      return rows.filter((row) => row.uid === uid && row.sentAt === null && row.key.startsWith(prefix)).map((row) => row.key);
    },
    async cancel(uid, keys, nowIso) {
      for (const row of rows) {
        if (row.uid === uid && row.sentAt === null && keys.includes(row.key)) { row.sentAt = nowIso; row.cancelledAt = nowIso; }
      }
    },
  };
  /** The cron: a row that is due gets marked at delivery time, never before. */
  const deliverDue = (nowIso: string) => {
    for (const row of rows) if (row.sentAt === null && row.sendAt <= nowIso) row.sentAt = nowIso;
  };
  return { rows, store, deliverDue, find };
}

const T0 = Date.parse("2026-10-27T12:00:00Z");
const hours = (n: number) => new Date(T0 + n * 3600_000).toISOString();

function setup(uid: string | null = "u1") {
  const db = table();
  let clock = T0;
  const outbox = createOutbox({ sessionUserId: async () => uid, store: db.store, now: () => clock });
  return { ...db, outbox, at: (ms: number) => { clock = ms; } };
}

describe("the push outbox", () => {
  test("a task reminder cancelled when the student leaves a term comes back when the term returns", async () => {
    const t = setup();
    const push = { dedupKey: "task-a-2h", sendAt: hours(24), title: "Haven — task", body: "Due in 2h" };
    await t.outbox.enqueue(push);
    // The other term becomes current: this term's tasks are no longer live.
    await t.outbox.reconcile("task-", new Set());
    assert.deepEqual(await t.store.undeliveredKeys("u1", "task-"), []);
    assert.ok(t.find("u1", "task-a-2h")!.cancelledAt);
    // Back in this term: the same reminder is queued again.
    await t.outbox.enqueue(push);
    assert.deepEqual(await t.store.undeliveredKeys("u1", "task-"), ["task-a-2h"]);
    assert.equal(t.find("u1", "task-a-2h")!.cancelledAt, null);
    // And the cron delivers it when it is due, once.
    t.deliverDue(hours(25));
    assert.ok(t.find("u1", "task-a-2h")!.sentAt);
    assert.equal(t.rows.length, 1);
  });

  test("a reminder the cron already delivered is never brought back, even if its task moves to a later time", async () => {
    const t = setup();
    await t.outbox.enqueue({ dedupKey: "task-b-1h", sendAt: hours(1), title: "t", body: "b" });
    t.deliverDue(hours(2));
    const deliveredAt = t.find("u1", "task-b-1h")!.sentAt;
    assert.ok(deliveredAt);
    t.at(T0 + 2 * 3600_000);
    await t.outbox.enqueue({ dedupKey: "task-b-1h", sendAt: hours(1), title: "t", body: "b" }); // same time
    await t.outbox.enqueue({ dedupKey: "task-b-1h", sendAt: hours(9), title: "t", body: "b" }); // moved later
    assert.equal(t.find("u1", "task-b-1h")!.sentAt, deliveredAt);
    await t.outbox.reconcile("task-", new Set(["task-b-1h"]));
    assert.equal(t.find("u1", "task-b-1h")!.cancelledAt, null);
  });

  test("a row cancelled by the older version (marked sent before its time) comes back too", async () => {
    const t = setup();
    t.rows.push({ uid: "u1", key: "task-c-3h", sendAt: hours(48), sentAt: hours(-5), cancelledAt: null, title: "t", body: "b" });
    await t.outbox.enqueue({ dedupKey: "task-c-3h", sendAt: hours(48), title: "t", body: "b" });
    assert.equal(t.find("u1", "task-c-3h")!.sentAt, null);
  });

  test("a cancelled reminder whose time has passed is not brought back late", async () => {
    const t = setup();
    await t.outbox.enqueue({ dedupKey: "task-e-1h", sendAt: hours(2), title: "t", body: "b" });
    await t.outbox.reconcile("task-", new Set());
    t.at(T0 + 3 * 3600_000);
    await t.outbox.enqueue({ dedupKey: "task-e-1h", sendAt: hours(2), title: "t", body: "b" });
    assert.ok(t.find("u1", "task-e-1h")!.sentAt);
  });

  test("a task un-checked after being checked off gets its reminder back", async () => {
    const t = setup();
    const push = { dedupKey: "task-d-1h", sendAt: hours(10), title: "t", body: "b" };
    await t.outbox.enqueue(push);
    await t.outbox.reconcile("task-", new Set()); // checked off
    await t.outbox.reconcile("task-", new Set(["task-d-1h"])); // un-checked: still cancelled until it is queued again
    assert.deepEqual(await t.store.undeliveredKeys("u1", "task-"), []);
    await t.outbox.enqueue(push);
    assert.deepEqual(await t.store.undeliveredKeys("u1", "task-"), ["task-d-1h"]);
  });

  test("reconcile cancels only waiting rows of its prefix that are not live", async () => {
    const t = setup();
    for (const key of ["task-a-1h", "task-b-1h", "smart2:x"]) await t.outbox.enqueue({ dedupKey: key, sendAt: hours(24), title: "t", body: "b" });
    t.rows.push({ uid: "u1", key: "task-c-1h", sendAt: hours(-3), sentAt: hours(-3), cancelledAt: null, title: "t", body: "b" });
    await t.outbox.reconcile("task-", new Set(["task-a-1h"]));
    assert.equal(t.find("u1", "task-a-1h")!.sentAt, null);
    assert.ok(t.find("u1", "task-b-1h")!.sentAt);
    assert.equal(t.find("u1", "smart2:x")!.sentAt, null);
    assert.equal(t.find("u1", "task-c-1h")!.cancelledAt, null); // delivered earlier: untouched
  });

  test("another account's rows are never touched", async () => {
    const t = setup("u1");
    t.rows.push({ uid: "u2", key: "task-a-1h", sendAt: hours(24), sentAt: null, cancelledAt: null, title: "t", body: "b" });
    await t.outbox.reconcile("task-", new Set());
    assert.equal(t.find("u2", "task-a-1h")!.sentAt, null);
  });

  test("nothing is written when signed out, and a failing table never throws", async () => {
    const signedOut = setup(null);
    await signedOut.outbox.enqueue({ dedupKey: "task-a-1h", sendAt: hours(5), title: "t", body: "b" });
    await signedOut.outbox.reconcile("task-", new Set());
    assert.equal(signedOut.rows.length, 0);

    const fail = async () => { throw new Error("offline"); };
    const broken = createOutbox({
      sessionUserId: async () => "u1",
      store: { read: fail, upsert: fail, undeliveredKeys: fail, cancel: fail },
    });
    await broken.enqueue({ dedupKey: "k", sendAt: hours(1), title: "t", body: "b" });
    await broken.reconcile("task-", new Set());
  });

  test("what counts as a cancellation", () => {
    assert.equal(wasCancelled(null), false);
    assert.equal(wasCancelled({ sendAt: hours(5), sentAt: null, cancelledAt: null }), false); // waiting
    assert.equal(wasCancelled({ sendAt: hours(5), sentAt: hours(1), cancelledAt: null }), true); // marked before due
    assert.equal(wasCancelled({ sendAt: hours(5), sentAt: hours(5), cancelledAt: null }), false); // delivered on time
    assert.equal(wasCancelled({ sendAt: hours(5), sentAt: hours(6), cancelledAt: null }), false); // delivered late
    assert.equal(wasCancelled({ sendAt: hours(5), sentAt: hours(6), cancelledAt: hours(6) }), true); // marked cancelled
  });
});
