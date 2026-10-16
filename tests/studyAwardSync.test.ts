import { test } from "node:test";
import assert from "node:assert/strict";
import { syncEarnedAwards } from "../src/lib/study/awardSync";
const award = { id: "a", awardedAt: 1, minutes: 25, groupId: null };
function harness() {
  let active = true, pending = true, prefs = { pomodoroStats: { count: 0 }, gamification: { xp: 0 } };
  let accepted: unknown = null, applyCount = 0;
  const io = {
    active: () => active,
    pending: async () => pending ? [award] : [],
    read: async () => structuredClone(prefs),
    project: (p: Record<string, unknown>) => ({ pomodoroStats: { count: (p.pomodoroStats as { count: number }).count + 1 }, gamification: { xp: (p.gamification as { xp: number }).xp + 10 } }),
    apply: async (_ids: string[], expected: Record<string, unknown>, projection: Record<string, unknown>) => {
      applyCount++;
      if (JSON.stringify(expected) !== JSON.stringify(prefs)) return { ok: false, preferences: prefs };
      pending = false; prefs = projection as typeof prefs;
      return { ok: true, preferences: prefs };
    },
    accept: (p: Record<string, unknown>) => { accepted = p; },
  };
  return { io, count: () => applyCount, accepted: () => accepted, off: () => { active = false; }, on: () => { active = true; } };
}
test("successful projection then replay increments once", async () => {
  const h = harness(); assert.equal(await syncEarnedAwards(h.io), true); assert.equal(await syncEarnedAwards(h.io), true);
  assert.equal(h.count(), 1); assert.deepEqual(h.accepted(), { pomodoroStats: { count: 1 }, gamification: { xp: 10 } });
});
test("uncertain response after committed transaction reloads without adding again", async () => {
  const h = harness(); const apply = h.io.apply;
  h.io.apply = async (...args) => { await apply(...args); throw new Error("lost response"); };
  assert.equal(await syncEarnedAwards(h.io), false); assert.equal(h.accepted(), null);
  assert.equal(await syncEarnedAwards(h.io), true); assert.equal(h.count(), 1);
});
test("concurrent devices cannot both project the same pending round", async () => {
  const h = harness(); const apply = h.io.apply; let entered = 0;
  let release!: () => void; const barrier = new Promise<void>((resolve) => { release = resolve; });
  h.io.apply = async (...args) => { if (++entered === 2) release(); await barrier; return apply(...args); };
  assert.deepEqual(await Promise.all([syncEarnedAwards(h.io), syncEarnedAwards(h.io)]), [true, true]);
  assert.deepEqual(h.accepted(), { pomodoroStats: { count: 1 }, gamification: { xp: 10 } });
});
test("switching account during read neither projects nor accepts old rewards", async () => {
  const h = harness(); const read = h.io.read; h.io.read = async () => { const p = await read(); h.off(); return p; };
  assert.equal(await syncEarnedAwards(h.io), false); assert.equal(h.count(), 0); assert.equal(h.accepted(), null);
});
test("save failure leaves ledger pending, retry succeeds", async () => {
  const h = harness(); const apply = h.io.apply; h.io.apply = async () => { throw new Error("offline"); };
  assert.equal(await syncEarnedAwards(h.io), false); assert.equal(h.accepted(), null);
  h.io.apply = apply; assert.equal(await syncEarnedAwards(h.io), true); assert.equal(h.count(), 1);
});
test("persistent compare-and-swap conflicts stop after three attempts", async () => {
  const h = harness(); let calls = 0;
  h.io.apply = async () => { calls++; return { ok: false, preferences: {} as Awaited<ReturnType<typeof h.io.read>> }; };
  assert.equal(await syncEarnedAwards(h.io), false); assert.equal(calls, 3); assert.equal(h.accepted(), null);
});


test("logout and return preserve committed awards without another projection", async () => {
  const h = harness();
  assert.equal(await syncEarnedAwards(h.io), true);
  const saved = structuredClone(h.accepted());
  h.off();
  assert.equal(await syncEarnedAwards(h.io), false);
  assert.deepEqual(h.accepted(), saved);
  h.on();
  assert.equal(await syncEarnedAwards(h.io), true);
  assert.deepEqual(h.accepted(), saved);
  assert.equal(h.count(), 1);
});

test("pending earned award survives logout and applies after return", async () => {
  const h = harness();
  h.off();
  assert.equal(await syncEarnedAwards(h.io), false);
  assert.equal(h.count(), 0);
  h.on();
  assert.equal(await syncEarnedAwards(h.io), true);
  assert.deepEqual(h.accepted(), { pomodoroStats: { count: 1 }, gamification: { xp: 10 } });
});
