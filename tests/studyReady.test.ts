import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoStudyServer, DEMO_GROUP, DEMO_ME } from "../src/lib/study/demo";
import { parseState } from "../src/lib/study/parse";

const free = { key: "", courseId: null, task: null, title: null, courseName: null };
function fixture() {
  const s = new DemoStudyServer("Owner", "#a8d98a", "#edb7c8", 0);
  s.setOnline(s.members[1].userId, true); s.openSittingAs(DEMO_ME, 2);
  s.setFocusAs(DEMO_ME, free); s.setFocusAs(s.members[1].userId, free);
  return s;
}
const state = async (s: DemoStudyServer) => parseState(await s.transport.state(DEMO_GROUP))!;

test("ready is separate from work and missing readiness blocks ordinary start", async () => {
  const s = fixture(); s.setReadyAs(DEMO_ME, true);
  await s.transport.startRound(DEMO_GROUP, 15, 5);
  const v = await state(s);
  assert.equal(v.round, null); assert.equal(v.sitting?.focusWarning, true);
  assert.deepEqual(v.sitting?.missingFocus, []);
  assert.deepEqual(v.sitting?.missingReady, [s.members[1].userId]);
  s.setReadyAs(s.members[1].userId, true);
  await s.transport.startRound(DEMO_GROUP, 15, 5);
  assert.ok((await state(s)).round);
  await assert.rejects(s.transport.setReady!(DEMO_GROUP, true), /round_running/);
});

test("confirmation overrides acknowledged readiness only and preserves selected work", async () => {
  const s = fixture(); s.setReadyAs(DEMO_ME, true);
  await s.transport.startRound(DEMO_GROUP, 15, 5, true, [s.members[1].userId]);
  assert.deepEqual((await state(s)).round?.participants[1].focus, free);
  s.skipToBoundary(); s.skipToBoundary(); s.skipToBoundary();
  assert.equal((await state(s)).members.some(m => m.ready), false);
  await s.transport.startRound(DEMO_GROUP, 15, 5);
  assert.equal((await state(s)).round?.seq, 1);
});

test("changing work or leaving clears readiness and new arrivals require confirmation", async () => {
  const s = fixture(); s.setReadyAs(DEMO_ME, true); s.setFocusAs(DEMO_ME, free);
  assert.equal((await state(s)).members[0].ready, false);
  s.setReadyAs(s.members[1].userId, true); s.setOnline(s.members[1].userId, false);
  s.setOnline(s.members[1].userId, true);
  assert.equal((await state(s)).members[1].ready, false);
  s.setReadyAs(DEMO_ME, true); s.setOnline(s.members[2].userId, true);
  await s.transport.startRound(DEMO_GROUP, 15, 5, true, [s.members[1].userId]);
  assert.equal((await state(s)).round, null);
});
