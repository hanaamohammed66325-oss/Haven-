import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { drawGroupLotus, drawGroveBloom } from "../src/lib/pomodoro/pondRenderer";
import { mixColor } from "../src/lib/pomodoro/math";
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
before(() => Object.defineProperty(globalThis, "document", { configurable: true,
  value: { createElement: () => ({ getContext: () => ({ fillStyle: "#000000" }) }) } }));
after(() => { if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
  else Reflect.deleteProperty(globalThis, "document"); });
function recorder() {
  const ellipses: unknown[][] = [], fills: string[] = [];
  let color = "", petal = false, clips = 0;
  const ctx = new Proxy({}, {
    get: (_obj, name) => (...args: unknown[]) => {
      if (name === "ellipse") { ellipses.push(args); petal = true; }
      if (name === "arc") petal = false;
      if (name === "fill" && petal) fills.push(color);
      if (name === "clip") clips++;
    },
    set: (_obj, name, value) => { if (name === "fillStyle") color = value; return true; },
  }) as CanvasRenderingContext2D;
  return { ctx, ellipses, fills, clips: () => clips };
}
test("two members keep native ten-petal geometry with five whole petals each", () => {
  const native = recorder(), group = recorder();
  drawGroveBloom(native.ctx, 0, 0, 30, 0, "#ffaabb");
  drawGroupLotus(group.ctx, 0, 0, 30, ["#ffaabb", "#aabbff"]);
  assert.deepEqual(group.ellipses, native.ellipses);
  assert.equal(group.clips(), 0);
});
test("every group size receives equal whole petals without clipping colors", () => {
  for (let n = 2; n <= 10; n++) {
    const colors = Array.from({ length: n }, (_, i) => `#${(0x304050 + i * 0x10101).toString(16)}`);
    const group = recorder();
    drawGroupLotus(group.ctx, 0, 0, 30, colors);
    const total = n * Math.ceil(10 / n);
    assert.equal(group.ellipses.length, total);
    assert.equal(group.clips(), 0);
    for (const color of colors) {
      const light = mixColor(color, "#ffffff", .42);
      assert.equal(group.fills.filter(c => c === color || c === light).length, total / n);
    }
  }
});
