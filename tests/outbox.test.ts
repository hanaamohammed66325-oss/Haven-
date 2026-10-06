// The cron delivers an outbox row only as it read it: a row the app changed in
// between (an absence alert brought back for tomorrow) is neither sent nor used
// up, on both the delivery and the stale-cleanup paths.
// Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { deliverOutbox, STALE_MS } from "../supabase/functions/scheduler-tick/outbox";

type Row = Record<string, unknown>;

/** A small in-memory stand-in for the Supabase query builder calls the outbox
 *  makes. `afterDueRead` runs right after the due rows are read, before any
 *  claim: the moment the app's sync can change a row. */
function fakeDb(tables: Record<string, Row[]>, afterDueRead?: () => void) {
  class Q {
    private filters: ((r: Row) => boolean)[] = [];
    private op: "select" | "update" | "delete" = "select";
    private patch: Row = {};
    private returning = false;
    private single = false;
    private lim = Infinity;
    private table: string;
    constructor(table: string) {
      this.table = table;
    }
    select() {
      if (this.op === "update") this.returning = true;
      return this;
    }
    update(patch: Row) {
      this.op = "update";
      this.patch = patch;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    eq(c: string, v: unknown) {
      this.filters.push((r) => r[c] === v);
      return this;
    }
    is(c: string, v: unknown) {
      this.filters.push((r) => (r[c] ?? null) === v);
      return this;
    }
    lte(c: string, v: string) {
      this.filters.push((r) => String(r[c]) <= v);
      return this;
    }
    in(c: string, vs: unknown[]) {
      this.filters.push((r) => vs.includes(r[c]));
      return this;
    }
    limit(n: number) {
      this.lim = n;
      return this;
    }
    maybeSingle() {
      this.single = true;
      return this;
    }
    then<A, B>(res: (v: { data: unknown; error: null }) => A, rej?: (e: unknown) => B) {
      return Promise.resolve(this.run()).then(res, rej);
    }
    private run() {
      const rows = (tables[this.table] ??= []);
      const hit = rows.filter((r) => this.filters.every((f) => f(r)));
      const shape = (out: Row[]) => (this.single ? out[0] ?? null : out);
      if (this.op === "select") {
        const data = shape(hit.slice(0, this.lim).map((r) => ({ ...r })));
        if (this.table === "scheduled_pushes" && afterDueRead) {
          const hook = afterDueRead;
          afterDueRead = undefined;
          hook();
        }
        return { data, error: null };
      }
      if (this.op === "update") {
        for (const r of hit) Object.assign(r, this.patch);
        return { data: this.returning ? shape(hit.map((r) => ({ ...r }))) : null, error: null };
      }
      tables[this.table] = rows.filter((r) => !hit.includes(r));
      return { data: null, error: null };
    }
  }
  return { from: (t: string) => new Q(t) };
}

function fakePush() {
  const sent: { title: string; body: string; id: string }[] = [];
  return { sent, webpush: { sendNotification: async (_sub: unknown, payload: string) => void sent.push(JSON.parse(payload)) } };
}

const NOW = Date.parse("2026-10-07T17:00:30.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const TODAY_8PM = iso(NOW - 30_000); // due a moment ago
const TOMORROW_8PM = iso(NOW - 30_000 + 86_400_000);
const sub = { user_id: "u1", id: "s1", endpoint: "e", p256dh: "p", auth: "a" };
const row = (over: Row = {}): Row => ({
  id: "r1",
  user_id: "u1",
  dedup_key: "att-c1-l25-p40",
  title: "Haven — تذكير",
  body: "old body",
  send_at: TODAY_8PM,
  sent_at: null,
  ...over,
});

describe("outbox delivery", () => {
  test("a due row is sent once, with its content", async () => {
    const tables = { scheduled_pushes: [row()], push_subscriptions: [sub] };
    const p = fakePush();
    assert.equal(await deliverOutbox(fakeDb(tables), p.webpush, () => {}, NOW), 1);
    assert.equal(p.sent[0].body, "old body");
    assert.equal(p.sent[0].id, "att-c1-l25-p40");
    assert.notEqual(tables.scheduled_pushes[0].sent_at, null);
    assert.equal(await deliverOutbox(fakeDb(tables), p.webpush, () => {}, NOW), 0);
  });

  test("read due → cancelled and brought back for tomorrow → the old version isn't sent or used up", async () => {
    const tables = { scheduled_pushes: [row()], push_subscriptions: [sub] };
    const live = tables.scheduled_pushes[0];
    const p = fakePush();
    const db = fakeDb(tables, () => {
      // sync_absence_alerts: cancel, then bring back for tomorrow with new text
      Object.assign(live, { sent_at: "x", cancelled_at: "x" });
      Object.assign(live, { sent_at: null, cancelled_at: null, send_at: TOMORROW_8PM, body: "new body" });
    });
    assert.equal(await deliverOutbox(db, p.webpush, () => {}, NOW), 0);
    assert.equal(p.sent.length, 0);
    assert.equal(live.sent_at, null); // still pending
    assert.equal(live.send_at, TOMORROW_8PM);

    // Tomorrow it goes out, with the new text.
    assert.equal(await deliverOutbox(fakeDb(tables), p.webpush, () => {}, Date.parse(TOMORROW_8PM) + 30_000), 1);
    assert.equal(p.sent[0].body, "new body");
  });

  test("text refreshed after the read: this tick skips it, the next sends the new text", async () => {
    const tables = { scheduled_pushes: [row()], push_subscriptions: [sub] };
    const live = tables.scheduled_pushes[0];
    const p = fakePush();
    await deliverOutbox(fakeDb(tables, () => (live.body = "new body")), p.webpush, () => {}, NOW);
    assert.equal(p.sent.length, 0);
    assert.equal(live.sent_at, null);
    await deliverOutbox(fakeDb(tables), p.webpush, () => {}, NOW + 60_000);
    assert.deepEqual(p.sent.map((s) => s.body), ["new body"]);
  });

  test("taken by another tick meanwhile: not sent twice", async () => {
    const tables = { scheduled_pushes: [row()], push_subscriptions: [sub] };
    const p = fakePush();
    await deliverOutbox(fakeDb(tables, () => (tables.scheduled_pushes[0].sent_at = "other tick")), p.webpush, () => {}, NOW);
    assert.equal(p.sent.length, 0);
  });
});

describe("outbox stale cleanup", () => {
  const STALE_AT = iso(NOW - STALE_MS - 60_000);

  test("a stale row is used up without being sent", async () => {
    const tables = { scheduled_pushes: [row({ send_at: STALE_AT })], push_subscriptions: [sub] };
    const p = fakePush();
    assert.equal(await deliverOutbox(fakeDb(tables), p.webpush, () => {}, NOW), 0);
    assert.notEqual(tables.scheduled_pushes[0].sent_at, null);
    assert.equal(p.sent.length, 0);
  });

  test("read stale → brought back for tomorrow → not used up; tomorrow it's sent", async () => {
    const tables = { scheduled_pushes: [row({ send_at: STALE_AT })], push_subscriptions: [sub] };
    const live = tables.scheduled_pushes[0];
    const p = fakePush();
    const db = fakeDb(tables, () => Object.assign(live, { send_at: TOMORROW_8PM, body: "new body" }));
    await deliverOutbox(db, p.webpush, () => {}, NOW);
    assert.equal(live.sent_at, null);
    assert.equal(live.send_at, TOMORROW_8PM);
    assert.equal(await deliverOutbox(fakeDb(tables), p.webpush, () => {}, Date.parse(TOMORROW_8PM) + 30_000), 1);
    assert.equal(p.sent[0].body, "new body");
  });

  test("a deleted task's reminder is still used up without being sent", async () => {
    const key = "task-0b8f7a7e-2b6f-4b7a-9d55-3c1f0e8a9b21-2h";
    const tables = { scheduled_pushes: [row({ dedup_key: key })], push_subscriptions: [sub], planner_items: [] };
    const p = fakePush();
    assert.equal(await deliverOutbox(fakeDb(tables), p.webpush, () => {}, NOW), 0);
    assert.notEqual(tables.scheduled_pushes[0].sent_at, null);
  });
});
