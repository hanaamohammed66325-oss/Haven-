import { test } from "node:test";
import assert from "node:assert/strict";
import { readWhatsNewSeen, hasSeenWhatsNew, saveWhatsNewSeen } from "../src/lib/whatsNew";

test("account history survives device reload and stays independent of another account", async () => {
  const accounts: Record<string, Record<string, unknown>> = { a: {}, b: {} };
  let uid = "a";
  const save = async (patch: Record<string, unknown>) => { Object.assign(accounts[uid], patch); };
  assert.equal(await saveWhatsNewSeen(5, "a", () => uid, save), true);
  assert.equal(hasSeenWhatsNew(readWhatsNewSeen(accounts.a)), true);
  uid = "b";
  assert.equal(hasSeenWhatsNew(readWhatsNewSeen(accounts.b)), false);
  uid = "a";
  assert.equal(hasSeenWhatsNew(readWhatsNewSeen(accounts[uid])), true);
});
test("failed save can retry without acknowledging a view that was not persisted", async () => {
  assert.equal(await saveWhatsNewSeen(5, "a", () => "a", async () => { throw Error("offline"); }), false);
  assert.equal(await saveWhatsNewSeen(5, "a", () => "a", async () => {}), true);
});
test("account switch during a write never acknowledges the next account", async () => {
  let uid = "a";
  assert.equal(await saveWhatsNewSeen(5, "a", () => uid, async () => { uid = "b"; }), false);
  let writes = 0;
  assert.equal(await saveWhatsNewSeen(5, "a", () => uid, async () => { writes++; }), false);
  assert.equal(writes, 0);
});
test("each release has its own key and old-device saves preserve newer releases", async () => {
  const prefs = { whatsNewSeen_v4: true, whatsNewSeen_v6: true };
  await saveWhatsNewSeen(5, "a", () => "a", async patch => { Object.assign(prefs, patch); });
  const seen = readWhatsNewSeen(prefs);
  assert.equal(hasSeenWhatsNew(seen, 4), true);
  assert.equal(hasSeenWhatsNew(seen, 5), true);
  assert.equal(hasSeenWhatsNew(seen, 6), true);
  assert.equal(hasSeenWhatsNew(seen, 7), false);
});
test("legacy device flags and malformed preference values do not mark another account", () => {
  assert.deepEqual(readWhatsNewSeen({ haven_whatsnew_seen_v5: "1", whatsNewSeen_v5: "true", whatsNewSeen_v0: true }), {});
});
