import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultGamification } from "../src/lib/gamification";
import { preserveEarnedBadges } from "../src/lib/badgeProgress";

test("an older same-tier device cannot remove an earned badge", () => {
  const saved = { ...defaultGamification, badges: ["first-checkin", "safe"] };
  const incoming = { ...saved, xp: 100, badges: ["organized"] };
  const next = preserveEarnedBadges(saved, incoming);
  assert.deepEqual(next.badges, ["first-checkin", "safe", "organized"]);
  assert.equal(next.xp, 100);
  assert.deepEqual(saved.badges, ["first-checkin", "safe"]);
});
test("higher XP from an old tier does not downgrade Silver", () => {
  const saved = { ...defaultGamification, badgeTier: 2, badges: ["organized"] };
  const next = preserveEarnedBadges(saved, { ...defaultGamification, xp: 900 });
  assert.equal(next.badgeTier, 2);
  assert.deepEqual(next.badges, ["organized"]);
});
test("promotion does not award bronze badges as silver badges", () => {
  const saved = { ...defaultGamification, badges: ["first-checkin", "safe"] };
  const promoted = { ...defaultGamification, badgeTier: 2, badges: [] };
  assert.deepEqual(preserveEarnedBadges(saved, promoted), promoted);
});
test("inactivity does not remove earned badges during synchronization", () => {
  const saved = { ...defaultGamification, badgeTier: 2, badges: ["safe"] };
  const next = preserveEarnedBadges(saved, { ...saved, badges: [], streak: { current: 0, longest: 18, lastActiveDate: null } });
  assert.deepEqual(next.badges, ["safe"]);
  assert.equal(next.badgeTier, 2);
  assert.equal(next.streak.current, 0);
});
