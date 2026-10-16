import { springValue } from 'motion';

/** One live Motion owner per animal, driven by the existing scene frame/clock. */
export function createCompanionContinuity(kind) {
  let clock = 0, last = null, paused = false, initialized = false, distance = 0;
  let pose = 'stand', wantedPose = 'stand', poseAt = 0, facing = false, turnAt = null;
  const drivers = new Set();
  const driver = tick => ({ start: () => drivers.add(tick), stop: () => drivers.delete(tick), now: () => clock });
  const tuning = { stiffness: 420, damping: 41, mass: 1, restDelta: .03, restSpeed: .05, driver };
  const x = springValue(0, tuning), y = springValue(0, tuning);
  const head = springValue(0, { ...tuning, stiffness: 180, damping: 27 });
  const tail = springValue(0, { ...tuning, stiffness: 150, damping: 25 });
  const values = [x, y, head, tail];
  const targets = new Map();
  const aim = (value, target) => { if (targets.get(value) !== target) { targets.set(value, target); value.set(target); } };
  let previousX = 0, previousY = 0, speed = 0, targetX = 0, targetY = 0, originX = 0, originY = 0;
  function sample(a, now, reduced = false) {
    const delta = last === null || paused ? 0 : Math.max(0, Math.min(64, now - last));
    last = now; clock += delta;
    targetX = a.left - originX; targetY = a.top - originY;
    if (!initialized || reduced) {
      x.jump(targetX); y.jump(targetY); head.jump(a.head || 0); tail.jump(a.tail || 0);
      if (!initialized) { previousX = targetX; previousY = targetY; facing = !!a.faceLeft; pose = wantedPose = a.pose || 'stand'; }
      initialized = true;
    } else {
      aim(x, targetX); aim(y, targetY); aim(head, a.head || 0); aim(tail, a.tail || 0);
      for (const tick of [...drivers]) tick(clock);
    }
    const dx = x.get() - previousX, moved = Math.abs(dx);
    speed = delta ? Math.max(moved, Math.abs(y.get() - previousY)) / (delta / 1000) : 0;
    if (moved > .03) distance += moved;
    previousX = x.get(); previousY = y.get();
    const requested = a.pose || 'stand';
    if (requested !== wantedPose) { wantedPose = requested; poseAt = clock; }
    const age = clock - poseAt;
    let displayPose = requested;
    // Existing pixel poses supply a short lower/fold or stir/rise bridge.
    if (!reduced && pose !== wantedPose && (pose === 'curl' || wantedPose === 'curl')) {
      displayPose = wantedPose === 'curl' ? (age < 380 ? 'sniff' : 'curl') : (age < 240 ? 'curl' : age < 480 ? 'sniff' : requested);
      if (age >= 480) pose = wantedPose;
    } else pose = wantedPose;
    if (!!a.faceLeft !== facing) {
      turnAt ??= clock;
      if (reduced || moved < .4 && clock - turnAt >= 140) { facing = !!a.faceLeft; turnAt = null; }
      // A moving animal faces its actual path, not a newly chosen endpoint.
      else if (moved > .4) facing = dx < 0;
    } else turnAt = null;
    return { ...a, left: x.get() + originX, top: y.get() + originY, pose: displayPose, faceLeft: facing,
      head: head.get(), tail: tail.get(), phase: a.phase === 2 && (a.lift || 0) > 1 ? 2 : moved > .08 ? distance / (kind === 'fox' ? 22 : 27) * 4 : 0 };
  }
  return {
    sample,
    // Moving the floor changes the reference, never the animal's spring or gait.
    translate(dx, dy) { originX += dx; originY += dy; },
    // Arrival follows the actual rendered point/clock, including manual drivers.
    settled: () => initialized && Math.abs(x.get() - targetX) < .6 && Math.abs(y.get() - targetY) < .6 && speed < 8,
    pause(now) { paused = true; last = now; },
    resume(now) { if (paused) { paused = false; last = now; } },
    reset() { initialized = false; distance = 0; speed = 0; originX = originY = 0; last = null; paused = false; turnAt = null; targets.clear(); for (const v of values) v.jump(0); },
    dispose() { for (const v of values) v.destroy(); drivers.clear(); },
  };
}

/** Calm pixel life, independent of how long a finite action happened to last. */
export function companionIdle(t, sleeping = false) {
  const cycle = ((t % 5.7) + 5.7) % 5.7;
  return { pose: sleeping ? 'curl' : cycle > 4.8 && cycle < 5.05 ? 'blink' : 'stand',
    breath: (.5 - .5 * Math.cos(t * 1.3)) * (sleeping ? .18 : .14),
    head: sleeping ? 0 : cycle > 2.3 && cycle < 2.9 ? .35 : 0,
    tail: sleeping ? 0 : cycle > 3.3 && cycle < 4.1 ? Math.sin((cycle - 3.3) / .8 * Math.PI) * .4 : 0 };
}
