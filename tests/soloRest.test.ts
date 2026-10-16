import test from "node:test";
import assert from "node:assert/strict";
import { soloRestPose } from "../src/lib/pomodoro/soloRest";
test("a solo break starts with desk sleep, wakes, then shares phone and look poses", () => {
  assert.deepEqual(soloRestPose(0,false),{pose:"sleep",since:0});
  assert.equal(soloRestPose(20.5,false).pose,"wake");
  assert.equal(soloRestPose(25,false).pose,"phone");
  assert.equal(soloRestPose(44,false).pose,"look");
  assert.equal(soloRestPose(63,false).pose,"sleep");
});
test("reduced motion holds a fully settled sleeping pose", () => {
  assert.deepEqual(soloRestPose(0,true),soloRestPose(45,true));
  assert.deepEqual(soloRestPose(45,true),{pose:"sleep",since:2});
});

test("resuming study can finish a continuous wake stretch without a new desk",()=>{
  assert.deepEqual(soloRestPose(-2.7,false),{pose:"wake",since:0});
  assert.equal(soloRestPose(-.1,false).pose,"wake");
  assert.ok(soloRestPose(-.1,false).since>2.5);
});
