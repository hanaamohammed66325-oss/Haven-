import test from 'node:test';
import assert from 'node:assert/strict';
import { SOLO_MOTIONS, companionContext, chooseCompanionMotion, companionRestMs, chooseSharedMotion } from '../src/lib/haviCompanionBehavior';

test('companion context uses existing page and card semantics, with visible reminders taking priority', () => {
  for (const path of ['/schedule', '/schedule/']) assert.equal(companionContext({ path }), 'schedule');
  for (const path of ['/courses/', '/assignments/', '/attendance/']) assert.equal(companionContext({ path }), 'course');
  for (const path of ['/settings/', '/profile/', '/study/', '/pomodoro/', '/checkout/', '/premium/']) assert.equal(companionContext({ path }), 'quiet');
  assert.equal(companionContext({ role: 'current-week', path: '/dashboard/' }), 'schedule');
  assert.equal(companionContext({ role: 'course', path: '/dashboard/' }), 'course');
  assert.equal(companionContext({ path: '/dashboard/' }), 'general');
  assert.equal(companionContext({ path: '/settings/', nearDue: true }), 'alert');
});

test('weighted selection preserves every approved motion, avoids immediate repeats and spaces energetic scenes', () => {
  for (const kind of ['fox', 'tiger'] as const) {
    for (const context of ['alert', 'schedule', 'course', 'quiet', 'general']) {
      const seen = new Set<string>();
      for (let n = 0; n < 1000; n++) {
        const random = () => (n + .5) / 1000;
        const mode = chooseCompanionMotion(kind, { context }, random); seen.add(mode);
        for (const last of SOLO_MOTIONS[kind]) assert.notEqual(chooseCompanionMotion(kind, { context, last }, random), last);
        const energetic = kind === 'fox' ? 'play' : 'hop';
        assert.notEqual(chooseCompanionMotion(kind, { context, played: { [energetic]: 1000 }, now: 60999 }, random), energetic);
      }
      assert.deepEqual([...seen].sort(), [...SOLO_MOTIONS[kind]].sort());
    }
  }
});

test('page weights favor purposeful calm scenes, rather than a fixed animation carousel', () => {
  function count(kind: 'fox' | 'tiger', context: string, wanted: string[]) {
    let count = 0;
    for (let i = 0; i < 1000; i++) if (wanted.includes(chooseCompanionMotion(kind, { context }, () => (i + .5) / 1000))) count++;
    return count;
  }
  assert.ok(count('tiger', 'alert', ['guard', 'watch']) > 750);
  assert.ok(count('tiger', 'schedule', ['guard']) > count('tiger', 'general', ['guard']));
  assert.ok(count('fox', 'quiet', ['nap', 'sit']) > 850);
  assert.ok(count('fox', 'general', ['play']) > count('fox', 'quiet', ['play']));
});

test('finite gestures use short live rests, with longer purposeful naps and no repeated shared activity', () => {
  for (const kind of ['fox', 'tiger'] as const) for (const mode of SOLO_MOTIONS[kind]) {
    const min = companionRestMs(mode, () => 0), max = companionRestMs(mode, () => 1);
    if (mode === 'nap') { assert.equal(min,24000); assert.equal(max,34000); }
    else if (mode === 'sit' || mode === 'watch') { assert.equal(min,8000); assert.equal(max,13000); }
    else { assert.equal(min,1800); assert.equal(max,4200); }
  }
  assert.ok(companionRestMs('nap', () => 0) > companionRestMs('guard', () => 0));
  for (const context of ['alert', 'schedule', 'course', 'quiet', 'general']) {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const random = () => (i + .5) / 1000;
      seen.add(chooseSharedMotion(context, null, random));
      for (const last of ['greet', 'follow', 'leaf', 'rest']) assert.notEqual(chooseSharedMotion(context, last, random), last);
    }
    assert.deepEqual([...seen].sort(), ['follow', 'greet', 'leaf', 'rest']);
  }
});
