import test from "node:test";
import assert from "node:assert/strict";
import { acquireBodyScrollLock } from "../src/components/motion/bodyScroll";

function withBody(run: (style: { overflow: string }) => void) {
  const old = Object.getOwnPropertyDescriptor(globalThis, "document");
  const style = { overflow: "clip" };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { body: { style } } });
  try { run(style); } finally {
    if (old) Object.defineProperty(globalThis, "document", old);
    else Reflect.deleteProperty(globalThis, "document");
  }
}

test("a route can remove the outer tour before the child dialog finishes leaving", () => withBody(style => {
  const closeTour = acquireBodyScrollLock();
  const finishDialogExit = acquireBodyScrollLock();
  closeTour();
  assert.equal(style.overflow, "hidden");
  finishDialogExit();
  assert.equal(style.overflow, "clip");
}));

test("closing the child retains the full-screen scene scroll lock", () => withBody(style => {
  const leaveScene = acquireBodyScrollLock();
  const closeDialog = acquireBodyScrollLock();
  closeDialog();
  assert.equal(style.overflow, "hidden");
  leaveScene();
  assert.equal(style.overflow, "clip");
}));

test("a repeated cleanup cannot release another overlay's lock", () => withBody(style => {
  const first = acquireBodyScrollLock();
  const second = acquireBodyScrollLock();
  first(); first();
  assert.equal(style.overflow, "hidden");
  second();
  assert.equal(style.overflow, "clip");
}));
