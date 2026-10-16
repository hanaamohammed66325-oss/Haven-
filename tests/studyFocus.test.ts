import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoStudyServer, DEMO_GROUP, DEMO_ME } from "../src/lib/study/demo";
import { parseFocus, parseHarvest, parseState } from "../src/lib/study/parse";
import { resolveStudyFocus, studyFocusLocked } from "../src/lib/study/focus";
import { addStudyAwards } from "../src/lib/study/awards";
import type { StudyFocus } from "../src/lib/study/types";
import type { Course, PomodoroStats } from "../src/types/index";

const id = "00000000-0000-4000-8000-000000000099";
const focus: StudyFocus = { key: `planner:${id}`, courseId: null, task: `planner:${id}`, title: "قراءة فصل", courseName: null };
const free: StudyFocus = { key: "", courseId: null, task: null, title: null, courseName: null };
function fixture() {
  const server = new DemoStudyServer("Hanaa", "#a8d98a", "#edb7c8", 0);
  server.setOnline(server.members[1].userId, true);
  server.openSittingAs(DEMO_ME, 2);
  return server;
}
const state = async (server: DemoStudyServer) => parseState(await server.transport.state(DEMO_GROUP))!;

test("unchosen work differs from an explicit free session and invalid keys are rejected", () => {
  assert.deepEqual(resolveStudyFocus("", [], []), free);
  assert.equal(resolveStudyFocus("missing", [], []), null);
  assert.equal(parseFocus(null), null);
  assert.equal(parseFocus({ key: "invalid", title: "wrong" }), null);
  assert.deepEqual(parseFocus({ key: "", title: "ignored", course_id: id }), free);
  const course = { id, name: "رياضيات" } as Course;
  assert.equal(resolveStudyFocus(id, [course], [])?.title, "رياضيات");
});

test("start warns all members without starting; waiting keeps choice available", async () => {
  const server = fixture();
  server.setReadyAs(DEMO_ME, true); server.setReadyAs(server.members[1].userId, true);
  await server.transport.startRound(DEMO_GROUP, 15, 5);
  let view = await state(server);
  assert.equal(view.round, null); assert.equal(view.sitting?.focusWarning, true);
  assert.equal(view.sitting?.missingFocus?.length, 2);
  await server.transport.setFocus!(DEMO_GROUP, focus);
  server.setFocusAs(server.members[1].userId, free);
  view = await state(server);
  assert.deepEqual(view.sitting?.missingFocus, []);
  assert.equal(view.members[0].focus?.title, focus.title);
  server.setReadyAs(DEMO_ME, true); server.setReadyAs(server.members[1].userId, true);
  await server.transport.startRound(DEMO_GROUP, 15, 5);
  assert.ok((await state(server)).round);
});

test("confirm gives only acknowledged missing members a free round", async () => {
  const server = fixture();
  await server.transport.setFocus!(DEMO_GROUP, focus);
  server.setReadyAs(DEMO_ME, true); server.setReadyAs(server.members[1].userId, true);
  await server.transport.startRound(DEMO_GROUP, 15, 5, true, [server.members[1].userId]);
  const view = await state(server);
  assert.deepEqual(view.round?.participants.find((p) => p.userId === server.members[1].userId)?.focus, free);
  assert.equal(view.round?.participants.find((p) => p.userId === DEMO_ME)?.focus?.title, focus.title);
  assert.equal(view.sitting?.focusWarning, false);
});

test("a new unselected arrival requires a fresh confirmation", async () => {
  const server = fixture();
  await server.transport.setFocus!(DEMO_GROUP, focus);
  const acknowledged = [server.members[1].userId];
  server.setOnline(server.members[2].userId, true);
  server.setReadyAs(DEMO_ME, true); server.setReadyAs(server.members[1].userId, true);
  await server.transport.startRound(DEMO_GROUP, 15, 5, true, acknowledged);
  assert.equal((await state(server)).round, null);
});

test("task is locked while scheduled, studying and paused; editing next round preserves prior reward", async () => {
  const server = fixture();
  await server.transport.setFocus!(DEMO_GROUP, focus);
  server.setFocusAs(server.members[1].userId, free);
  server.setReadyAs(DEMO_ME, true); server.setReadyAs(server.members[1].userId, true);
  await server.transport.startRound(DEMO_GROUP, 15, 5);
  assert.equal(studyFocusLocked(await state(server), Date.now()), true);
  await assert.rejects(server.transport.setFocus!(DEMO_GROUP, free), /round_running/);
  server.skip(4000);
  await server.transport.pauseRound(DEMO_GROUP);
  await assert.rejects(server.transport.setFocus!(DEMO_GROUP, free), /round_running/);
  await server.transport.resumeRound(DEMO_GROUP);
  server.skipToBoundary();
  assert.equal(studyFocusLocked(await state(server), Date.now()), false);
  assert.equal(server.harvestDetails[0].focus?.title, focus.title);
  await server.transport.setFocus!(DEMO_GROUP, { ...focus, title: "مهمة الجولة التالية" });
  assert.equal(server.harvestDetails[0].focus?.title, focus.title);
  assert.equal((await state(server)).round?.participants[0].focus?.title, focus.title);
  await server.transport.state(DEMO_GROUP);
  assert.equal(server.harvestDetails.length, 2);
});

test("old harvest stays readable and per-leaf metadata stays aligned when unknown owners are removed", () => {
  const member = { user_id: DEMO_ME, flower_color: "#edb7c8", display_name: "Hanaa" };
  const old = parseHarvest({ members: [member], pads: [DEMO_ME] });
  assert.deepEqual(old?.pads, [DEMO_ME]); assert.equal(old?.details, undefined);
  const next = parseHarvest({ members: [member], pads: [id, DEMO_ME], details: [
    { id, focus: null }, { id: DEMO_GROUP, focus: { key: focus.key, task: focus.task, title: focus.title } },
  ] });
  assert.equal(next?.details?.length, 1); assert.equal(next?.details?.[0].focus?.title, focus.title);
});

test("personal lotus projection retains the round's course, task and historical title", () => {
  const previous: PomodoroStats = { totalSessions: 0, totalFocusMinutes: 0, lilyPadCount: 0,
    currentDailyStreak: 0, longestDailyStreak: 0, lastSessionDate: null, recentDays: [], pads: [] };
  const next = addStudyAwards(previous, [{ id, minutes: 15, awardedAt: Date.now(), groupId: DEMO_GROUP,
    focus: { ...focus, courseId: id } }]);
  assert.equal(next.pads[0].task, focus.task); assert.equal(next.pads[0].courseId, id);
  assert.equal(next.pads[0].title, focus.title); assert.equal(previous.pads.length, 0);
});

test("a different organizer cannot be bypassed by confirm-start", async () => {
  const server = new DemoStudyServer("Hanaa", "#a8d98a", "#edb7c8", 0);
  server.setOnline(server.members[1].userId, true);
  server.openSittingAs(server.members[1].userId, 2);
  await assert.rejects(server.transport.startRound(DEMO_GROUP, 15, 5, true, [DEMO_ME, server.members[1].userId]), /not_organizer/);
});
