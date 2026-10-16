import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRewardMotions, selectedRewardMotion, isAllowedRewardMotion } from "../src/lib/rewardMotions";

test("older or malformed preferences use approved defaults and reject another theme's motion", () => {
  for (const raw of [undefined, null, [], 3, { aurora: "reflection", coral: "moon", ambassador: "petals" }]) {
    assert.deepEqual(normalizeRewardMotions(raw), { aurora: "glass", coral: "petals", ambassador: "fireflies" });
  }
  assert.equal(isAllowedRewardMotion("coral", "river"), false);
  assert.equal(isAllowedRewardMotion("ambassador", "lotus"), false);
  assert.equal(selectedRewardMotion("aurora"), "glass");
  assert.equal(isAllowedRewardMotion("coral", "glass"), false);
  assert.equal(isAllowedRewardMotion("aurora", "petals"), false);
  for (const rejected of ["reflection", "dew", "moon"]) {
    assert.equal(isAllowedRewardMotion("aurora", rejected), false);
    assert.equal(isAllowedRewardMotion("ambassador", rejected), false);
  }
  assert.equal(selectedRewardMotion("haven"), null);
});

test("independent choices survive serialization and preserve the other theme", () => {
  const first = normalizeRewardMotions({ coral: "silk", ambassador: "river" });
  const reloaded = normalizeRewardMotions(JSON.parse(JSON.stringify(first)));
  assert.equal(selectedRewardMotion("coral", reloaded), "silk");
  assert.equal(selectedRewardMotion("ambassador", reloaded), "river");
  const changed = normalizeRewardMotions({ ...reloaded, coral: "lotus" });
  assert.deepEqual(changed, { aurora: "glass", coral: "lotus", ambassador: "river" });
});

test("newly approved choices survive reload only within their own reward theme", () => {
  for (const aurora of ["liquid-silver", "silver-ribbon"]) {
    const choices = normalizeRewardMotions(JSON.parse(JSON.stringify({ aurora, coral: "silk", ambassador: "gilded-stars" })));
    assert.deepEqual(choices, { aurora, coral: "silk", ambassador: "gilded-stars" });
    assert.equal(selectedRewardMotion("aurora", choices), aurora);
    assert.equal(selectedRewardMotion("ambassador", choices), "gilded-stars");
    assert.equal(isAllowedRewardMotion("ambassador", aurora), false);
    assert.equal(isAllowedRewardMotion("coral", aurora), false);
  }
  assert.equal(isAllowedRewardMotion("aurora", "gilded-stars"), false);
  assert.equal(isAllowedRewardMotion("coral", "gilded-stars"), false);
});
