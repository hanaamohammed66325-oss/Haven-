import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingReferralRewards, acknowledgeReferralRewards, parseClaimedReferralRewards } from "../src/lib/referralRewardNotices";
import { parseReferralProfile } from "../src/lib/referrals";
import { AMBASSADOR_RUNGS } from "../src/lib/ambassadorRewards";
const id = "00000000-0000-4000-8000-000000000001";
const profile = (count: number, vip = false) => parseReferralProfile({ account_id: id, available: false, code: null, eligible: false, answered: false, source: null, claimed_code: null, status: "none", activated_count: count, earned_xp: AMBASSADOR_RUNGS.filter(r => r.count <= count).reduce((s, r) => s + (r.xp || 0), 0), reward_vip: vip, unlocked_thresholds: AMBASSADOR_RUNGS.filter(r => vip || r.count <= count).map(r => r.count), pending_count: 0, expired_count: 0 }, id)!;
test("offline awards show once, multiple milestones merge, later milestones remain pending", () => {
  assert.deepEqual(pendingReferralRewards(profile(4), [1]).map(r => r.count), [2, 4]);
  const seen = acknowledgeReferralRewards([1], [2, 4]);
  assert.deepEqual(pendingReferralRewards(profile(4), seen), []);
  assert.deepEqual(pendingReferralRewards(profile(6), seen).map(r => r.count), [6]);
});
test("VIP access without counted milestones never fabricates a referral celebration", () => {
  assert.deepEqual(pendingReferralRewards(profile(0, true), []), []);
  assert.deepEqual(pendingReferralRewards(profile(1, true), []).map(r => r.count), [1]);
});
test("malformed storage and foreign account keys cannot acknowledge other account rewards", () => {
  assert.deepEqual(pendingReferralRewards(profile(2), { count: 2 }).map(r => r.count), [1, 2]);
  assert.deepEqual(acknowledgeReferralRewards(["1", 999, 2], [1, 2]), [1, 2]);
  assert.equal(parseClaimedReferralRewards({ account_id: "other-account", thresholds: [1] }, id), null);
  assert.equal(parseClaimedReferralRewards({ account_id: id, thresholds: [1, 1] }, id), null);
  assert.equal(parseClaimedReferralRewards({ account_id: id, thresholds: [999] }, id), null);
  assert.deepEqual(parseClaimedReferralRewards({ account_id: id, thresholds: [4, 1] }, id)?.map(r => r.count), [1, 4]);
});
