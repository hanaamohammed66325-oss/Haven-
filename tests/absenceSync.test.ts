// Absence alerts reach the server bound to their account, newest first,
// retried when the session or the connection fails.
// Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createAbsenceSync, type AbsenceAlertRow } from "@/lib/absenceSync";

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const alert = (key: string): AbsenceAlertRow => ({ key, sendAt: "2026-10-07T17:00:00.000Z", title: "T", body: key });

/** A fake server: each account's current alert keys. The request's account is
 *  read from the "token" at call time, like the real client, and the server
 *  refuses a request whose expected account differs (42501), before writing. */
function fakeServer() {
  const rows = new Map<string, string[]>();
  const calls: { expected: string; token: string; keys: string[] }[] = [];
  let tokenUid: string | null = "A";
  let fail: string | null = null; // error code for the next call
  let beforeToken: (() => void) | null = null; // runs between the session check and the token read
  return {
    rows,
    calls,
    setToken: (u: string | null) => (tokenUid = u),
    failNext: (code: string) => (fail = code),
    onBeforeToken: (f: () => void) => (beforeToken = f),
    rpc: async (expected: string, alerts: unknown[]) => {
      await wait();
      beforeToken?.();
      beforeToken = null;
      const token = tokenUid ?? "";
      const keys = (alerts as { key: string }[]).map((a) => a.key);
      calls.push({ expected, token, keys });
      if (fail !== null) {
        const code = fail;
        fail = null;
        return { code };
      }
      if (!token || token !== expected) return { code: "42501" };
      rows.set(token, keys);
      return null;
    },
  };
}

describe("absence sync: session failures are retried, not taken as signed out", () => {
  test("pending alert → alerts off → session read fails → connection back: the cancellation goes through by itself", async () => {
    const server = fakeServer();
    let offline = false;
    const sync = createAbsenceSync({
      sessionUserId: async () => {
        if (offline) throw new Error("AuthRetryableFetchError");
        return "A";
      },
      rpc: server.rpc,
      retryDelays: [5, 5, 5],
    });
    sync.sync("A", [alert("att-c1-l25-p40")]);
    await wait(40);
    assert.deepEqual(server.rows.get("A"), ["att-c1-l25-p40"]);

    offline = true;
    sync.sync("A", []); // the student turned absence alerts off
    await wait(3);
    assert.deepEqual(server.rows.get("A"), ["att-c1-l25-p40"]); // not yet
    offline = false; // connection back, nothing else changes
    await wait(100);
    assert.deepEqual(server.rows.get("A"), []);
  });

  test("after the timed retries run out, retry() (back online) still sends it", async () => {
    const server = fakeServer();
    let offline = true;
    const sync = createAbsenceSync({
      sessionUserId: async () => {
        if (offline) throw new Error("offline");
        return "A";
      },
      rpc: server.rpc,
      retryDelays: [1],
    });
    sync.sync("A", []);
    await wait(60);
    assert.equal(server.calls.length, 0);
    offline = false;
    sync.retry();
    await wait(40);
    assert.deepEqual(server.rows.get("A"), []);
  });

  test("the newest snapshot wins, a cancellation included", async () => {
    const server = fakeServer();
    const sync = createAbsenceSync({ sessionUserId: async () => "A", rpc: server.rpc, retryDelays: [] });
    sync.sync("A", [alert("att-c1-l25-p40")]);
    sync.sync("A", [alert("att-c1-l25-p60")]);
    sync.sync("A", []);
    await wait(60);
    assert.deepEqual(server.rows.get("A"), []);
    assert.deepEqual(server.calls.at(-1)?.keys, []);
  });
});

describe("absence sync: bound to the account whose data built it", () => {
  test("account switch between the session check and the token: A's alerts never land on B", async () => {
    const server = fakeServer();
    let session = "A";
    const sync = createAbsenceSync({ sessionUserId: async () => session, rpc: server.rpc, retryDelays: [] });
    server.onBeforeToken(() => {
      session = "B";
      server.setToken("B");
    });
    sync.sync("A", [alert("att-a-l25-p40")]);
    await wait(60);
    assert.equal(server.calls[0].expected, "A");
    assert.equal(server.calls[0].token, "B");
    assert.equal(server.rows.has("B"), false); // refused before writing
  });

  test("a refused snapshot isn't counted as written", async () => {
    const server = fakeServer();
    const sync = createAbsenceSync({ sessionUserId: async () => "A", rpc: server.rpc, retryDelays: [] });
    server.failNext("42501");
    sync.sync("A", [alert("att-a-l25-p40")]);
    await wait(40);
    assert.equal(server.rows.has("A"), false);
    sync.sync("A", [alert("att-a-l25-p40")]); // same snapshot again: sent, not skipped
    await wait(40);
    assert.deepEqual(server.rows.get("A"), ["att-a-l25-p40"]);
  });

  test("another account by send time: dropped, never re-pointed at the new one", async () => {
    const server = fakeServer();
    server.setToken("B");
    const sync = createAbsenceSync({ sessionUserId: async () => "B", rpc: server.rpc, retryDelays: [5] });
    sync.sync("A", [alert("att-a-l25-p40")]);
    await wait(100);
    assert.equal(server.calls.length, 0);
    assert.equal(server.rows.size, 0);
  });

  test("signed out: dropped", async () => {
    const server = fakeServer();
    const sync = createAbsenceSync({ sessionUserId: async () => null, rpc: server.rpc, retryDelays: [5] });
    sync.sync("A", [alert("att-a-l25-p40")]);
    await wait(100);
    assert.equal(server.calls.length, 0);
  });

  test("no account's data shown (loading, demo): nothing sent", async () => {
    const server = fakeServer();
    const sync = createAbsenceSync({ sessionUserId: async () => "A", rpc: server.rpc, retryDelays: [] });
    sync.sync(null, []);
    sync.sync(undefined, [alert("att-a-l25-p40")]);
    await wait(40);
    assert.equal(server.calls.length, 0);
  });
});

describe("absence sync: server errors", () => {
  test("a network failure is retried", async () => {
    const server = fakeServer();
    const sync = createAbsenceSync({ sessionUserId: async () => "A", rpc: server.rpc, retryDelays: [2] });
    server.failNext("");
    sync.sync("A", [alert("att-a-l25-p40")]);
    await wait(80);
    assert.equal(server.calls.length, 2);
    assert.deepEqual(server.rows.get("A"), ["att-a-l25-p40"]);
  });

  test("refused input isn't retried, and isn't counted as written", async () => {
    const server = fakeServer();
    const sync = createAbsenceSync({ sessionUserId: async () => "A", rpc: server.rpc, retryDelays: [2, 2] });
    server.failNext("22023");
    sync.sync("A", [alert("att-a-l25-p40")]);
    await wait(80);
    assert.equal(server.calls.length, 1);
  });

  test("an unchanged snapshot isn't sent again; a changed one is", async () => {
    const server = fakeServer();
    const sync = createAbsenceSync({ sessionUserId: async () => "A", rpc: server.rpc, retryDelays: [] });
    sync.sync("A", [alert("att-a-l25-p40")]);
    await wait(40);
    sync.sync("A", [alert("att-a-l25-p40")]);
    await wait(40);
    assert.equal(server.calls.length, 1);
    sync.sync("A", [alert("att-a-l25-p60")]);
    await wait(40);
    assert.equal(server.calls.length, 2);
  });
});
