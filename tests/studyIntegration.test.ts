import { test } from "node:test";
import assert from "node:assert/strict";
import { studyDestination, rememberStudyDestination, pendingStudyDestination, clearStudyDestination } from "../src/lib/study/destination";
import { addStudyAwards } from "../src/lib/study/awards";
import { normalizeNotifPrefs } from "../src/lib/notifPrefs";
import type { PomodoroStats } from "../src/types/index";
import { LakeWorld, type Camera } from "../src/lib/pomodoro/lakeWorld";
import { setSoloStudyActive, soloStudyActive } from "../src/lib/study/solo";
const id = "00000000-0000-4000-8000-000000000001";
const token = "a".repeat(32);
test("auth destination accepts only a single valid study id or invite token", () => {
  assert.equal(studyDestination(`/join?t=${token}`), `/join/?t=${token}`);
  assert.equal(studyDestination(`/study/?g=${id}`), `/study/?g=${id}`);
  for (const bad of ["https://evil.test", "//evil.test/study", "/dashboard", `/join/?t=${token}&t=${token}`, `/join/?t=${token}#bad`, `/study/?g=${id}&next=https://evil.test`, "/study/?g=bad", "/\\evil.test/join/"]) assert.equal(studyDestination(bad), null, bad);
});
test("invite survives auth bookkeeping and expires safely", () => {
  const map = new Map<string, string>();
  const old = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => map.set(k, v), removeItem: (k: string) => map.delete(k) } });
  try {
    rememberStudyDestination(`/join/?t=${token}`);
    assert.equal(pendingStudyDestination(), `/join/?t=${token}`);
    const key = [...map.keys()][0]; assert.ok(!key.startsWith("haven"));
    map.set(key, JSON.stringify({ path: `/join/?t=${token}`, at: Date.now() - 86_400_001 }));
    assert.equal(pendingStudyDestination(), null);
    rememberStudyDestination(`/study/?g=${id}`); clearStudyDestination(); assert.equal(pendingStudyDestination(), null);
  } finally { Object.defineProperty(globalThis, "localStorage", { configurable: true, value: old }); }
});
const empty = (): PomodoroStats => ({ totalSessions: 0, totalFocusMinutes: 0, currentDailyStreak: 0, longestDailyStreak: 0, lastSessionDate: null, recentDays: [], lilyPadCount: 0, pads: [] });
const award = (n: number, date: string, minutes = 40) => ({ id: `${id.slice(0, -1)}${n}`, minutes, awardedAt: new Date(`${date}T12:00:00`).getTime(), groupId: id });
test("awards use canonical round time/minutes, unique ids and do not mutate input", () => {
  const before = empty(); const a = award(1, "2026-10-05", 50);
  const next = addStudyAwards(before, [a, a, award(2, "2026-10-06", 15)]);
  assert.equal(before.totalSessions, 0); assert.equal(next.totalSessions, 2); assert.equal(next.totalFocusMinutes, 65);
  assert.equal(next.lastSessionDate, "2026-10-06"); assert.equal(next.currentDailyStreak, 2);
  assert.deepEqual(next.pads.map((p) => p.minutes), [50, 15]);
});
test("late older awards never rewind the student's newer streak", () => {
  const before = { ...empty(), lastSessionDate: "2026-10-07", currentDailyStreak: 8, longestDailyStreak: 8 };
  const next = addStudyAwards(before, [award(1, "2026-10-02")]);
  assert.equal(next.lastSessionDate, "2026-10-07"); assert.equal(next.currentDailyStreak, 8); assert.equal(next.longestDailyStreak, 8);
});
test("catching up multiple days extends an already established streak", () => {
  const before = { ...empty(), lastSessionDate: "2026-10-03", currentDailyStreak: 8, longestDailyStreak: 8 };
  const next = addStudyAwards(before, [award(1, "2026-10-04"), award(2, "2026-10-05")]);
  assert.equal(next.currentDailyStreak, 10); assert.equal(next.longestDailyStreak, 10);
});
test("pad cap is independent of lifetime counters and server ledger", () => {
  const awards = Array.from({ length: 205 }, (_, n) => ({ ...award(1, "2026-10-01", 5), id: String(n) }));
  const next = addStudyAwards(empty(), awards);
  assert.equal(next.pads.length, 200); assert.equal(next.lilyPadCount, 205); assert.equal(next.totalSessions, 205);
});
test("group notifications default on and explicit opt-out survives normalization", () => {
  assert.equal(normalizeNotifPrefs(undefined).groups.enabled, true);
  assert.equal(normalizeNotifPrefs({ groups: { enabled: false } }).groups.enabled, false);
  assert.equal(normalizeNotifPrefs({ groups: "broken" }).groups.enabled, true);
});
test("river hit follows translated, rotated and zoomed camera and excludes the lake", () => {
  const world = { inp: { w: 800, h: 600 }, lakeR: (x: number, y: number) => Math.hypot(x, y) / 20,
    stream: { dist: (x: number) => Math.abs(x) } } as unknown as LakeWorld;
  for (const scale of [0.25, 1, 2]) for (const rotation of [0, Math.PI / 2, -0.2]) {
    const cam: Camera = { x: 10, y: -20, s: scale, rot: rotation };
    const screen = (x: number, y: number) => ({ x: 400 + ((x-cam.x)*Math.cos(rotation)-(y-cam.y)*Math.sin(rotation))*scale,
      y: 300 + ((x-cam.x)*Math.sin(rotation)+(y-cam.y)*Math.cos(rotation))*scale });
    const river = screen(0, 70), lake = screen(0, 0), forest = screen(50, 70);
    assert.equal(LakeWorld.prototype.hitRiver.call(world, river.x, river.y, cam), true);
    assert.equal(LakeWorld.prototype.hitRiver.call(world, lake.x, lake.y, cam), false);
    assert.equal(LakeWorld.prototype.hitRiver.call(world, forest.x, forest.y, cam), false);
  }
});
test("solo marker belongs to the mounted tab session and clears on exit", () => {
  setSoloStudyActive(true); assert.equal(soloStudyActive(), true);
  setSoloStudyActive(false); assert.equal(soloStudyActive(), false);
});
