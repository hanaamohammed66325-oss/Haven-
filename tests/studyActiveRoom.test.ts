import { test } from "node:test";
import assert from "node:assert/strict";
import { retainRoom, leaveRoomView, clearActiveRoom, activeRoomSnapshot } from "../src/lib/study/activeRoom";
import type { GroupSession } from "../src/lib/study/session";

function fake() {
  let sitting = true, disposed = false, visible = true;
  const listeners = new Set<() => void>();
  const session = {
    view: () => ({ ended: null, state: { sitting: sitting ? { id: "s" } : null } }),
    subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); },
    setRoomVisible: (v: boolean) => { visible = v; },
    dispose: () => { disposed = true; },
  } as unknown as GroupSession;
  return { session, get disposed() { return disposed; }, get visible() { return visible; },
    finish() { sitting = false; for (const fn of [...listeners]) fn(); } };
}

test("return retains the same session; switching accounts disposes the previous connection", () => {
  clearActiveRoom(); const a = fake();
  retainRoom("a", "g", () => a.session); leaveRoomView(a.session);
  assert.equal(a.disposed, false); assert.equal(a.visible, false);
  assert.equal(retainRoom("a", "g", () => { throw new Error("must reuse"); }), a.session);
  assert.equal(a.visible, true);
  const b = fake(); retainRoom("b", "g", () => b.session);
  assert.equal(a.disposed, true); assert.equal(activeRoomSnapshot()?.account, "b");
  clearActiveRoom(); assert.equal(b.disposed, true);
});

test("finishing keeps a mounted room usable but cleans up a retained background room", () => {
  const mounted = fake(); retainRoom("a", "g", () => mounted.session); mounted.finish();
  assert.equal(mounted.disposed, false); leaveRoomView(mounted.session);
  assert.equal(mounted.disposed, true); assert.equal(activeRoomSnapshot(), null);
  const background = fake(); retainRoom("a", "g", () => background.session);
  leaveRoomView(background.session); background.finish();
  assert.equal(background.disposed, true); assert.equal(activeRoomSnapshot(), null);
});
