import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareHandwriting, recognizeHandwriting } from '../src/lib/notes/handwritingClient';

test('model preparation is shared, recognition reuses it, stale work is skipped and idle memory is released', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  const instances: FakeWorker[] = [];
  class FakeWorker extends EventTarget {
    actions: string[] = [];
    terminated = false;
    constructor() { super(); instances.push(this); }
    terminate() { this.terminated = true; }
    postMessage(data: { id: number; action: string }) {
      this.actions.push(data.action);
      queueMicrotask(() => {
        this.dispatchEvent(new MessageEvent('message', { data: { id: data.id, status: 'done', texts: data.action === 'prepare' ? [] : ['Lecture'] } }));
      });
    }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'Worker', original); else delete (globalThis as { Worker?: unknown }).Worker; });
  const first = prepareHandwriting();
  assert.equal(prepareHandwriting(), first);
  await first;
  const lines = [{ pixels: new ArrayBuffer(4), width: 1, height: 1 }];
  assert.deepEqual(await recognizeHandwriting(lines, () => {}, () => true), ['Lecture']);
  assert.equal(instances.length, 1);
  assert.deepEqual(instances[0].actions, ['prepare', 'recognize']);
  await assert.rejects(recognizeHandwriting(lines, () => {}, () => false), /cancelled/);
  assert.equal(instances[0].actions.length, 2);
  t.mock.timers.tick(300001);
  assert.equal(instances[0].terminated, true);
  await prepareHandwriting();
  assert.equal(instances.length, 2);
  t.mock.timers.tick(300001);
});
