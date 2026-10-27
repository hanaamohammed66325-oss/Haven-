import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/** Runs the real component's effects and input handlers with a controllable
 * frame clock; no browser, GPU, account or source-pattern assertions. */
function filmHarness(ratio = 1, reduced = false) {
  let now = 20_000, frameId = 0, presentations = 0, copies = 0, transform = "";
  let bounds = { left: 0, top: 0, width: 550, height: 330 };
  const pending = new Map<number, (time: number) => void>();
  const canvasEvents = new Map<string, Function>(), docEvents = new Map<string, Function>(), windowEvents = new Map<string, Function>();
  const context = { setTransform() {}, clearRect() {}, drawImage() { copies++; } };
  const canvas = { width: 300, height: 150, dataset: {} as Record<string, string>, style: { set transform(value: string) { transform = value; presentations++; }, get transform() { return transform; } }, parentElement: { getBoundingClientRect: () => bounds }, getContext: () => context, getBoundingClientRect: () => { throw Error("Gesture mapping must use the untransformed viewport"); },
    addEventListener: (key: string, fn: Function) => canvasEvents.set(key, fn), removeEventListener: (key: string) => canvasEvents.delete(key), setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {} };
  const sources: Array<{ width: number; height: number; getContext: () => object }> = [];
  const document = { hidden: false, createElement: () => { const c = { width: 0, height: 0, getContext: () => ({}) }; sources.push(c); return c; },
    addEventListener: (key: string, fn: Function) => docEvents.set(key, fn), removeEventListener: (key: string) => docEvents.delete(key) };
  const window = { devicePixelRatio: ratio, addEventListener: (key: string, fn: Function) => windowEvents.set(key, fn), removeEventListener: (key: string) => windowEvents.delete(key) };
  const draws: number[] = [];
  let instances = 0, disposed = 0;
  class Scene {
    ui = { landed: true, count: 1, level: 0 }; hoveredMember = null;
    constructor() { instances++; }
    draw(_context: unknown, time: number) { draws.push(time); }
    zoomStep() {} resize() {} dispose() { disposed++; }
  }
  const refs: Array<{ current: any }> = [];
  const effects: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  let refCursor = 0, effectCursor = 0, commits: Array<() => void> = [];
  const react = {
    useRef(value: unknown) { const index = refCursor++; return refs[index] ??= { current: index === 0 ? canvas : value }; },
    useState(value: unknown) { return [value, () => {}]; },
    useEffect(fn: () => (() => void) | void, deps: unknown[]) {
      const index = effectCursor++, old = effects[index];
      if (!old || deps.some((d, i) => d !== old.deps[i])) commits.push(() => { old?.cleanup?.(); effects[index] = { deps: [...deps], cleanup: fn() || undefined }; });
    },
  };
  const exports: Record<string, Function> = {};
  const source = readFileSync(new URL("../src/components/whats-new/GroupLakeFilm.tsx", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, document, window, performance: { now: () => now }, process: { env: { NODE_ENV: "test" } },
    requestAnimationFrame: (fn: (time: number) => void) => { pending.set(++frameId, fn); return frameId; }, cancelAnimationFrame: (id: number) => pending.delete(id),
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: () => null, jsxs: () => null };
      if (name === "motion/react") return { motion: { button: "button", span: "span", div: "div" }, AnimatePresence: "presence", useReducedMotion: () => reduced, animate: (_a: number, _b: number, options: { onUpdate: (v: number) => void }) => { options.onUpdate(1); return { stop() {} }; } };
      if (name === "@/i18n") return { useT: () => ({ t: (key: string) => key, lang: "ar" }) };
      if (name.includes("motion/icons")) return {};
      if (name.includes("study/scene")) return { StudyScene: Scene };
      if (name.endsWith(".css")) return { default: {} };
      throw Error(name);
    },
  });
  const render = (paused = false, replay = 0) => {
    refCursor = effectCursor = 0; commits = [];
    exports.GroupLakeFilm({ paused, replay });
    for (const commit of commits) commit();
  };
  const advance = (ms: number) => { now += ms; const callbacks = [...pending.values()]; pending.clear(); for (const callback of callbacks) callback(now); };
  render();
  return { canvas, sources, draws, render, advance,
    stats: () => ({ presentations: draws.length, pending: pending.size, instances, disposed, copies }),
    frames: (hz: number, count: number) => { for (let i = 0; i < count; i++) advance(1000 / hz); },
    move: () => canvasEvents.get("pointermove")!({ pointerId: 1, clientX: 200, clientY: 100 }),
    zoom: () => canvasEvents.get("wheel")!({ deltaY: -20, clientX: 200, clientY: 100, preventDefault() {} }),
    hide: () => { document.hidden = true; docEvents.get("visibilitychange")!(); },
    show: () => { document.hidden = false; docEvents.get("visibilitychange")!(); },
    resize: (width: number, height: number) => { bounds = { ...bounds, width, height }; windowEvents.get("resize")?.(); },
    dispose: () => { for (const effect of effects) effect.cleanup?.(); },
  };
}

test("the film paints every 60/120 Hz animation callback and keeps the same elapsed time", () => {
  const endings: number[] = [];
  for (const hz of [60, 120]) {
    const film = filmHarness(), before = film.stats().presentations;
    film.frames(hz, hz);
    assert.equal(film.stats().presentations - before, hz);
    endings.push(film.draws.at(-1)!);
    film.dispose();
  }
  assert.ok(Math.abs(endings[0] - endings[1]) < 1e-6);
});
test("pointer and animated zoom bursts coalesce with the next display frame", () => {
  const film = filmHarness(), before = film.stats().presentations;
  for (let i = 0; i < 30; i++) { film.move(); film.zoom(); }
  assert.equal(film.stats().presentations, before);
  assert.equal(film.stats().pending, 1);
  film.advance(1000 / 60);
  assert.equal(film.stats().presentations, before + 1);
  film.dispose();
});
test("pause and hidden tabs stop the loop; resuming excludes hidden wall time", () => {
  const film = filmHarness(); film.frames(60, 2);
  const last = film.draws.at(-1)!;
  film.hide(); assert.equal(film.stats().pending, 0);
  film.advance(60_000); film.show(); film.advance(1000 / 60);
  assert.ok(Math.abs(film.draws.at(-1)! - last - 1000 / 60) < 1e-6);
  film.render(true); const before = film.stats().presentations;
  assert.equal(film.stats().pending, 0);
  film.frames(60, 60); assert.equal(film.stats().presentations, before);
  film.move(); film.advance(16); assert.equal(film.stats().presentations, before + 1);
  assert.equal(film.stats().pending, 0);
  film.render(false); film.advance(16); assert.equal(film.stats().pending, 1);
  film.dispose(); assert.equal(film.stats().pending, 0);
  assert.equal(film.stats().disposed, 1);
});
test("native camera draws a density-matched canvas without enlarging/copying its bitmap", () => {
  const film = filmHarness(1);
  assert.equal(film.canvas.width, 1125); assert.equal(film.canvas.height, 675);
  assert.equal(film.sources.length, 0, "no intermediate canvas is allocated");
  assert.equal(film.canvas.style.transform, "");
  film.resize(300, 180); film.move(); film.zoom(); film.advance(16);
  assert.equal(film.canvas.width, 1125); assert.equal(film.canvas.height, 675);
  assert.equal(film.stats().copies, 0);
  assert.equal(film.stats().instances, 1); film.dispose();
  const dense = filmHarness(3);
  assert.equal(dense.canvas.width, 1650); assert.equal(dense.canvas.height, 990);
  dense.resize(2400, 1440); dense.advance(16);
  assert.ok(dense.canvas.width * dense.canvas.height < 3_510_000, "backing allocation stays bounded on huge displays");
  dense.dispose();
});
test("replay replaces the old loop once; reduced motion retains a still interactive scene", () => {
  const film = filmHarness(); film.frames(60, 5); film.render(false, 1);
  assert.equal(film.stats().instances, 2); assert.equal(film.stats().disposed, 1);
  assert.equal(film.stats().pending, 1); assert.equal(film.canvas.width, 1125);
  film.dispose(); assert.equal(film.stats().pending, 0);
  const still = filmHarness(1, true), before = still.stats().presentations;
  still.frames(120, 120); assert.equal(still.stats().presentations, before);
  still.zoom(); still.advance(8); assert.equal(still.stats().presentations, before + 1);
  assert.equal(still.stats().pending, 0); still.dispose();
});
