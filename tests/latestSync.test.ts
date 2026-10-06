// Only the newest snapshot is sent, one request at a time, retried on failure.
// Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { latestSync } from "@/lib/latestSync";

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A send whose requests finish only when the test says so. */
function controlledSend(results: boolean[] = []) {
  const sent: string[] = [];
  const pending: ((ok: boolean) => void)[] = [];
  const send = (v: string) =>
    new Promise<boolean>((resolve) => {
      sent.push(v);
      pending.push(resolve);
    });
  const finish = (ok = results.shift() ?? true) => pending.shift()?.(ok);
  return { send, sent, finish, pending };
}

describe("latestSync", () => {
  test("one request at a time; the newest waiting snapshot replaces older ones", async () => {
    const s = controlledSend();
    const { push } = latestSync(s.send, []);
    push("a");
    push("b"); // waits: "a" is in flight
    push("c"); // replaces "b"
    await tick();
    assert.deepEqual(s.sent, ["a"]);
    s.finish();
    await tick();
    assert.deepEqual(s.sent, ["a", "c"]);
    s.finish();
    await tick();
    assert.deepEqual(s.sent, ["a", "c"]);
  });

  test("an older snapshot never lands after a newer one", async () => {
    const s = controlledSend();
    const { push } = latestSync(s.send, []);
    push("old");
    push("new");
    s.finish();
    await tick();
    s.finish();
    await tick();
    assert.equal(s.sent.at(-1), "new");
    assert.equal(s.pending.length, 0);
  });

  test("a failed send is retried, then waits for the next push", async () => {
    const s = controlledSend([false, false, false]);
    const { push } = latestSync(s.send, [1, 1]);
    push("a");
    for (let i = 0; i < 3; i++) {
      await tick();
      s.finish();
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.deepEqual(s.sent, ["a", "a", "a"]); // first try + 2 retries, then stops
    push("a");
    await tick();
    assert.deepEqual(s.sent, ["a", "a", "a", "a"]);
    s.finish(true);
  });

  test("a snapshot pushed during a retry wait is the one retried", async () => {
    const s = controlledSend([false]);
    const { push } = latestSync(s.send, [5]);
    push("a");
    await tick();
    s.finish(); // fails
    push("b");
    await new Promise((r) => setTimeout(r, 15));
    assert.deepEqual(s.sent, ["a", "b"]);
    s.finish(true);
  });

  test("retry() sends a snapshot kept after the retries ran out", async () => {
    const s = controlledSend([false]);
    const { push, retry } = latestSync(s.send, []);
    push("a");
    await tick();
    s.finish(); // fails, no retries left: kept
    await tick();
    assert.deepEqual(s.sent, ["a"]);
    retry();
    await tick();
    assert.deepEqual(s.sent, ["a", "a"]);
    s.finish(true);
    await tick();
    retry(); // nothing waiting
    await tick();
    assert.deepEqual(s.sent, ["a", "a"]);
  });

  test("a throwing send counts as a failure", async () => {
    let calls = 0;
    const { push } = latestSync(async () => {
      calls++;
      if (calls === 1) throw new Error("network");
      return true;
    }, [1]);
    push("a");
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls, 2);
  });
});
