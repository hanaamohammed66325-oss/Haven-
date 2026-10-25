import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { framePan } from '../src/components/notes/useNotebookNavigation';
import * as touchPolicy from '../src/lib/notes/touchNavigation';
import * as noteTypes from '../src/lib/notes/types';
import * as shapes from '../src/lib/notes/shapes';
import * as strokeInput from '../src/lib/notes/strokeInput';
import * as inkGestures from '../src/lib/notes/inkGestures';
import * as realInk from '../src/lib/notes/ink';
import { DEFAULT_ERASER_SETTINGS, DEFAULT_HIGHLIGHTER_TUNING, DEFAULT_INK_TUNING, DEFAULT_SHAPE_HOLD } from '../src/lib/notes/notesPreferences';

function frames() {
  let next = 0;
  const pending = new Map<number, FrameRequestCallback>();
  return {
    request: (callback: FrameRequestCallback) => { pending.set(++next, callback); return next; },
    cancel: (id: number) => { pending.delete(id); },
    tick: (time = 0) => { const work = [...pending.values()]; pending.clear(); work.forEach(callback => callback(time)); },
    size: () => pending.size,
  };
}

function scrollTarget() {
  let x = 1000, y = 1000, writes = 0;
  return {
    get scrollLeft() { return x; }, set scrollLeft(value) { x = value; writes++; },
    get scrollTop() { return y; }, set scrollTop(value) { y = value; writes++; },
    writes: () => writes,
  };
}

// Run the production hooks with a deterministic effect/frame host. No browser
// storage, account, page data, network, or installed test renderer is involved.
function hookHost(path: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  let cursor = 0;
  const slots: { value?: unknown; deps?: unknown[]; cleanup?: () => void }[] = [];
  const effects: (() => void)[] = [];
  const changed = (a?: unknown[], b?: unknown[]) => !a || !b || a.length !== b.length || a.some((value, i) => value !== b[i]);
  const react = {
    useRef(value: unknown) { const slot = slots[cursor++] ??= {}; return slot.value ??= { current: value }; },
    useCallback(value: unknown, deps: unknown[]) { const slot = slots[cursor++] ??= {}; if (changed(slot.deps, deps)) { slot.value = value; slot.deps = deps; } return slot.value; },
    useEffect(effect: () => (() => void) | void, deps: unknown[]) {
      const slot = slots[cursor++] ??= {};
      if (changed(slot.deps, deps)) { slot.deps = deps; effects.push(() => { slot.cleanup?.(); slot.cleanup = effect() || undefined; }); }
    },
  };
  const exports = {} as Record<string, (...args: any[]) => any>;
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, {
    exports, require(name: string) { if (name === 'react') return react; if (name in imports) return imports[name]; throw new Error(`Unexpected dependency: ${name}`); },
    setTimeout, clearTimeout, performance, ...globals,
  });
  return {
    render(name: string, ...args: unknown[]) { cursor = 0; const result = exports[name](...args); while (effects.length) effects.shift()!(); return result; },
    dispose() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

test('pan batches high-rate input into display frames and retains every fractional delta', () => {
  const clock = frames(), root = scrollTarget(), pan = framePan(root, clock.request, clock.cancel);
  for (let frame = 0; frame < 120; frame++) {
    for (let sample = 0; sample < 8; sample++) pan.move(.125, -.25);
    assert.equal(clock.size(), 1);
    clock.tick(frame * 1000 / 120);
  }
  assert.equal(root.writes(), 240, 'two axis writes per frame, rather than per input event');
  assert.equal(root.scrollLeft, 880);
  assert.equal(root.scrollTop, 1240);
  pan.move(3, 4); pan.flush();
  assert.equal(root.scrollLeft, 877); assert.equal(root.scrollTop, 1236);
  assert.equal(clock.size(), 0);
  pan.move(50, 60); pan.discard(); clock.tick();
  assert.equal(root.scrollLeft, 877); assert.equal(root.scrollTop, 1236);
});

function nativeNavigation(direction: 'vertical' | 'horizontal' = 'vertical', enabled = true) {
  const listeners = new Map<string, Set<Function>>(), options = new Map<Function, any>(), clock = frames();
  class Element { matches() { return false; } closest() { return null; } }
  const root = Object.assign(scrollTarget(), {
    scrollWidth: 3000, clientWidth: 500, scrollHeight: 4000, clientHeight: 700,
    addEventListener(name: string, fn: Function, config: unknown) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); options.set(fn, config); },
    removeEventListener(name: string, fn: Function) { listeners.get(name)?.delete(fn); options.delete(fn); },
    hasPointerCapture: () => false, setPointerCapture() {}, releasePointerCapture() {},
  });
  const host = hookHost('../src/components/notes/useNotebookNavigation.ts', { 'react-dom': { flushSync: (fn: Function) => fn() }, '@/lib/notes/touchNavigation': touchPolicy }, {
    Element, requestAnimationFrame: clock.request, cancelAnimationFrame: clock.cancel, window: { addEventListener() {}, removeEventListener() {} },
  });
  const zoom: number[] = [], progress: number[] = [];
  let commits = 0, cancellations = 0;
  const navigation = host.render('useNotebookNavigation', { current: root }, (factor: number) => zoom.push(factor), false,
    enabled ? { direction, onProgress: (value: number) => progress.push(value), onCommit: () => { commits++; } } : null, true);
  navigation.registerTouchCancellation(() => { cancellations++; });
  const touch = (type: string, points: number[][]) => {
    let prevented = false;
    const event = { type, touches: points.map(([x, y]) => ({ clientX: x, clientY: y, radiusX: 4, radiusY: 4 })), cancelable: true, preventDefault() { prevented = true; } };
    for (const fn of [...listeners.get(type) ?? []]) fn(event);
    return prevented;
  };
  const pointer = (type: string, pointerType = 'touch') => { for (const fn of listeners.get(type) ?? []) fn({ type, pointerId: 1, pointerType, width: 8, height: 8, target: new Element(), preventDefault() { throw Error('normal native navigation must not be prevented'); } }); };
  return { root, clock, host, touch, pointer, zoom, progress, commits: () => commits, cancellations: () => cancellations,
    moveListeners: () => [...listeners.get('touchmove') ?? []].map(fn => options.get(fn)) };
}

test('normal finger scrolling is browser-owned and has no nonpassive move listener or JavaScript scroll writes', () => {
  const fixture = nativeNavigation(), { root, touch, pointer, clock, host } = fixture;
  const before = root.writes();
  pointer('pointerdown'); assert.equal(touch('touchstart', [[100, 300]]), false);
  pointer('pointercancel'); // Safari cancels PointerEvents when native scrolling starts.
  for (let i = 1; i <= 40; i++) assert.equal(touch('touchmove', [[100, 300 - i * 4]]), false);
  touch('touchend', []); clock.tick(1000);
  assert.equal(root.writes(), before, 'the browser can keep flinging independently of the main thread');
  assert.ok(fixture.moveListeners().every(options => options.passive));
  assert.equal(fixture.commits(), 0, 'a fling away from the end cannot append pages');
  host.dispose();
});

test('end-pull starts on the page, survives native pointer cancellation, and appends exactly once on release in both directions', () => {
  for (const direction of ['vertical', 'horizontal'] as const) {
    const fixture = nativeNavigation(direction), { root, touch, pointer, host } = fixture;
    if (direction === 'vertical') root.scrollTop = 3250; else root.scrollLeft = 2450;
    touch('touchstart', [[250, 300]]); pointer('pointercancel');
    if (direction === 'vertical') root.scrollTop = 3300; else root.scrollLeft = 2500;
    touch('touchmove', [direction === 'vertical' ? [250, 140] : [90, 300]]);
    assert.equal(fixture.progress.at(-1), 110, 'only deliberate distance beyond the end counts');
    assert.equal(fixture.commits(), 0);
    touch('touchend', []); touch('touchend', []);
    assert.equal(fixture.commits(), 1); assert.equal(fixture.progress.at(-1), 0);
    host.dispose();
  }
});

test('end-pull rejects cancellation, sideways swipes, pinch, short pulls and disabled/locked configuration', () => {
  for (const scenario of ['cancel', 'sideways', 'pinch', 'short', 'disabled']) {
    const fixture = nativeNavigation('vertical', scenario !== 'disabled'), { root, touch, host } = fixture;
    root.scrollTop = 3300; touch('touchstart', [[200, 300]]);
    if (scenario === 'pinch') touch('touchstart', [[200, 300], [300, 300]]);
    touch('touchmove', [scenario === 'sideways' ? [500, 180] : scenario === 'short' ? [200, 250] : [200, 180]]);
    touch(scenario === 'cancel' ? 'touchcancel' : 'touchend', []);
    assert.equal(fixture.commits(), 0, scenario); host.dispose();
  }
});

test('a deliberate native pinch cancels editing, zooms once per frame, and restores passive scrolling', () => {
  const fixture = nativeNavigation(), { touch, clock, host } = fixture;
  touch('touchstart', [[100, 200]]);
  assert.equal(touch('touchstart', [[100, 200], [200, 200]]), true);
  assert.equal(fixture.cancellations(), 1);
  assert.ok(fixture.moveListeners().some(options => !options.passive));
  touch('touchmove', [[100, 200], [220, 200]]); touch('touchmove', [[100, 200], [250, 200]]);
  clock.tick(16);
  assert.equal(fixture.zoom.length, 1); assert.ok(Math.abs(fixture.zoom[0] - 1.5) < 1e-8);
  touch('touchend', []);
  assert.ok(fixture.moveListeners().every(options => options.passive));
  touch('touchstart', [[100, 200], [200, 200]]);
  fixture.pointer('pointerdown', 'pen');
  assert.ok(fixture.moveListeners().every(options => options.passive), 'a pen interrupting a pinch must also release the blocking move listener');
  host.dispose();
});

test('manual navigation fallback coasts with time-based deceleration and stops on new input', () => {
  for (const hz of [60, 120]) {
    const root = scrollTarget(), clock = frames(), pan = framePan(root, clock.request, clock.cancel, true);
    pan.begin();
    for (let i = 1; i <= 8; i++) { pan.move(0, -16, i * 16); clock.tick(i * 16); }
    const released = root.scrollTop;
    pan.release(128);
    let previous = root.scrollTop, firstStep = 0, lastStep = 0;
    for (let i = 1; i <= hz; i++) {
      clock.tick(128 + i * 1000 / hz);
      const step = root.scrollTop - previous;
      if (i === 1) firstStep = step;
      lastStep = step; previous = root.scrollTop;
    }
    assert.ok(root.scrollTop > released + 200, 'release must continue the fling');
    assert.ok(lastStep < firstStep * .08, 'motion slows rather than stopping abruptly');
    pan.begin(); const stopped = root.scrollTop; clock.tick(3000);
    assert.equal(root.scrollTop, stopped); pan.discard();
  }
});

test('PDF preparation serializes page rasters, prioritizes visible work and skips pages that left the window', async () => {
  const source = readFileSync(new URL('../src/components/notes/PageSurface.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('PageSurface.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nodes = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'queuePageRaster'
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ['rasterJobs', 'rasterRunner'].includes(declaration.name.getText(ast))));
  const compiled = ts.transpileModule(nodes.map(node => node.getText(ast)).join('\n') + '\nglobalThis.queue = queuePageRaster;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = vm.createContext({}); vm.runInContext(compiled, context);
  const queue = context.queue as (run: () => Promise<void>, priority: () => boolean, current: () => boolean) => Promise<void>;
  let release!: () => void, active = 0, peak = 0;
  const gate = new Promise<void>(resolve => { release = resolve; }), order: string[] = [];
  const first = queue(async () => { active++; peak = Math.max(peak, active); order.push('first'); await gate; active--; }, () => false, () => true);
  const neighbor = queue(async () => { active++; peak = Math.max(peak, active); order.push('neighbor'); active--; }, () => false, () => true);
  const visible = queue(async () => { active++; peak = Math.max(peak, active); order.push('visible'); active--; }, () => true, () => true);
  const stale = queue(async () => { throw Error('stale page must never allocate or render'); }, () => true, () => false);
  assert.deepEqual(order, ['first']); release(); await Promise.all([first, neighbor, visible, stale]);
  assert.deepEqual(order, ['first', 'visible', 'neighbor']); assert.equal(peak, 1);
  await assert.rejects(queue(async () => { throw Error('invalid PDF'); }, () => true, () => true), /invalid PDF/);
  await queue(async () => { order.push('recovery'); }, () => true, () => true);
  assert.equal(order.at(-1), 'recovery', 'a failed page must not wedge the rendering queue');
});

test('the end indicator ignores Safari synthetic clicks after touch, while mouse and keyboard remain accessible', () => {
  const source = readFileSync(new URL('../src/components/notes/NotebookEditor.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('NotebookEditor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let attributes: ts.JsxAttributes | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(ast) === 'data-note-pull-page')) attributes = node.attributes;
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(attributes);
  let clicks = 0;
  const context = vm.createContext({ suppressPullClick: { current: false }, addPageAt() { clicks++; } });
  for (const name of ['onTouchStart', 'onPointerDown', 'onClick']) {
    const attribute = attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(ast) === name) as ts.JsxAttribute;
    assert.ok(attribute?.initializer && ts.isJsxExpression(attribute.initializer));
    vm.runInContext(ts.transpileModule(`globalThis.${name} = ${attribute.initializer.expression!.getText(ast)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  }
  context.onPointerDown({ pointerType: 'touch' }); context.onTouchStart();
  context.onClick({ detail: 1, nativeEvent: {} });
  assert.equal(clicks, 0, 'older Safari can emit a MouseEvent without pointerType after a touch pull');
  context.onPointerDown({ pointerType: 'mouse' }); context.onClick({ detail: 1, nativeEvent: { pointerType: 'mouse' } });
  assert.equal(clicks, 1);
  context.onTouchStart(); context.onClick({ detail: 0, nativeEvent: {} });
  assert.equal(clicks, 2, 'keyboard activation stays available');
});

test('production touch navigation batches gap and canvas pans, flushes before pinch, and cancels pending movement', () => {
  class Element { matches() { return false; } closest() { return null; } }
  const root = Object.assign(scrollTarget(), {
    addEventListener(name: string, fn: Function) { listeners.set(name, fn); }, removeEventListener(name: string) { listeners.delete(name); },
    hasPointerCapture: () => false, setPointerCapture() {}, releasePointerCapture() {},
  });
  const listeners = new Map<string, Function>(), clock = frames(), zoom: number[] = [];
  const host = hookHost('../src/components/notes/useNotebookNavigation.ts', {
    'react-dom': { flushSync: (fn: Function) => fn() }, '@/lib/notes/touchNavigation': touchPolicy,
  }, { Element, requestAnimationFrame: clock.request, cancelAnimationFrame: clock.cancel, window: { addEventListener() {}, removeEventListener() {} } });
  const navigation = host.render('useNotebookNavigation', { current: root }, (factor: number) => zoom.push(factor), false, null, false);
  let cancelled = 0;
  navigation.registerTouchCancellation(() => { cancelled++; });
  const emit = (type: string, id: number, x: number, y: number) => listeners.get(type)!({
    type, pointerId: id, pointerType: 'touch', width: 8, height: 8, clientX: x, clientY: y,
    target: new Element(), preventDefault() {}, stopPropagation() {},
  });
  emit('pointerdown', 1, 100, 300);
  for (let i = 1; i <= 50; i++) emit('pointermove', 1, 100, 300 - i);
  assert.equal(root.writes(), 0);
  clock.tick(); assert.equal(root.scrollTop, 1050); assert.equal(root.writes(), 1);
  emit('pointermove', 1, 100, 240);
  emit('pointerup', 1, 100, 240);
  assert.equal(root.scrollTop, 1060, 'release retains the final queued delta');
  navigation.panBy(2, 3); navigation.panBy(4, 5); clock.tick();
  assert.equal(root.scrollLeft, 994); assert.equal(root.scrollTop, 1052, 'canvas-owned pans use the same batch');
  emit('pointerdown', 1, 100, 240);
  emit('pointermove', 1, 100, 230);
  emit('pointerdown', 2, 200, 230);
  assert.equal(root.scrollTop, 1062, 'pan is applied before the pinch anchor is taken');
  assert.equal(cancelled, 1);
  emit('pointermove', 2, 220, 230);
  emit('pointermove', 2, 250, 230);
  clock.tick(); assert.equal(zoom.length, 1); assert.ok(Math.abs(zoom[0] - 1.5) < 1e-8);
  emit('pointerup', 2, 250, 230);
  emit('pointermove', 1, 100, 220);
  emit('pointercancel', 1, 100, 220);
  clock.tick(); assert.equal(root.scrollTop, 1062, 'cancelled navigation must not move later');
  navigation.panBy(0, 100); host.dispose(); clock.tick();
  assert.equal(root.scrollTop, 1062, 'unmount cancels all queued movement');
});

test('unchanged page renders do not clear full-size ink overlays, but selection and content changes still repaint', () => {
  let clears = 0;
  const canvasByRef = new Map<object, any>();
  const ctx = new Proxy({}, { get: () => () => {} });
  const jsx = (type: string, props: any) => {
    if (type === 'canvas' && props.ref) {
      if (!canvasByRef.has(props.ref)) canvasByRef.set(props.ref, {
        width: 0, height: 0, style: {}, addEventListener() {}, removeEventListener() {},
        getContext: () => new Proxy(ctx, { get(target, key) { return key === 'clearRect' ? () => { clears++; } : Reflect.get(target, key); } }),
      });
      props.ref.current = canvasByRef.get(props.ref);
    }
    return { type, props };
  };
  const ink = new Proxy({
    selectionBounds: (_elements: unknown, ids: string[]) => ids.length ? { x: 10, y: 10, w: 30, h: 20 } : null,
    resizeCornerPoint: () => ({ x: 0, y: 0 }),
  }, { get(target, key) { return Reflect.get(target, key) ?? (() => {}); } });
  const host = hookHost('../src/components/notes/InkCanvas.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, '@/lib/notes/types': noteTypes, '@/lib/notes/shapes': shapes,
    '@/lib/notes/strokeInput': strokeInput, '@/lib/notes/ink': ink, '@/lib/notes/inkGestures': inkGestures,
  }, { window: { devicePixelRatio: 2 } });
  const page = noteTypes.newNotebook('isolated fixture').pages[0], noop = () => {};
  const props = {
    page, tool: 'pen', color: '#111', width: 2.5, pressure: true, tuning: DEFAULT_INK_TUNING,
    highlighterTuning: DEFAULT_HIGHLIGHTER_TUNING, shapeHold: DEFAULT_SHAPE_HOLD.pen,
    eraserSettings: DEFAULT_ERASER_SETTINGS, fillColor: '#111', fillOpacity: 0, cornerRadius: 0,
    allowTouch: false, palmRejection: false, scale: 1, rasterScale: 1, images: {}, selectionIds: [], aspectLocked: true,
    onChange: noop, onSelect: noop, onTextRequest: noop, onPan: noop, onEraserUsed: noop,
    registerTouchCancellation: () => noop,
  };
  host.render('InkCanvas', props);
  const initial = clears;
  assert.equal([...canvasByRef.values()][1].width, 1, 'idle interaction layers must not allocate a full-page bitmap');
  for (let i = 0; i < 50; i++) host.render('InkCanvas', { ...props, selectionIds: [] });
  assert.equal(clears, initial, 'new empty array identities must not trigger canvas clears');
  host.render('InkCanvas', { ...props, selectionIds: ['ink'] });
  assert.equal(clears, initial + 1, 'selecting still paints handles');
  assert.ok([...canvasByRef.values()][1].width > 1, 'selection handles acquire a sharp interaction layer on demand');
  host.render('InkCanvas', { ...props, selectionIds: ['ink'] });
  assert.equal(clears, initial + 1, 'the same selected IDs also avoid repaint');
  host.render('InkCanvas', props);
  assert.equal(clears, initial + 2, 'deselecting clears the old handles');
  assert.equal([...canvasByRef.values()][1].width, 1, 'deselecting releases the idle full-page layer');
  host.render('InkCanvas', { ...props, page: { ...page, elements: [...page.elements] } });
  assert.equal(clears, initial + 3, 'changed content still updates decorations');
  host.dispose();
  assert.ok([...canvasByRef.values()].every(canvas => canvas.width === 0 && canvas.height === 0), 'unmounted pages release canvas backing stores immediately');
});

test('a production canvas scratch gesture commits one deletion and preserves the original for Undo', () => {
  const clock = frames(), page = noteTypes.newNotebook('isolated scratch fixture').pages[0];
  page.elements = [{ id: 'target', kind: 'stroke', tool: 'line', color: '#111', pressure: false, width: 3,
    points: [{ x: 250, y: 180, p: .5, t: 0 }, { x: 250, y: 230, p: .5, t: 5 }] }];
  const original = structuredClone(page.elements), commits: unknown[] = [], noop = () => {};
  let input: any;
  const ctx = new Proxy({ globalAlpha: 1 }, { get(target, key) { return Reflect.get(target, key) ?? noop; } });
  const jsx = (type: string, props: any) => {
    if (type === 'canvas' && props.ref) {
      props.ref.current ??= { width: 0, height: 0, style: {}, addEventListener: noop, removeEventListener: noop,
        getContext: () => ctx, setPointerCapture: noop, hasPointerCapture: () => false,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: page.width, height: page.height }) };
      if (props['data-note-ink']) input = props;
    }
    return { type, props };
  };
  const host = hookHost('../src/components/notes/InkCanvas.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, '@/lib/notes/types': noteTypes, '@/lib/notes/shapes': shapes,
    '@/lib/notes/strokeInput': strokeInput, '@/lib/notes/ink': realInk, '@/lib/notes/inkGestures': inkGestures,
  }, { window: { devicePixelRatio: 1 }, requestAnimationFrame: clock.request, cancelAnimationFrame: clock.cancel });
  host.render('InkCanvas', {
    page, tool: 'pen', color: '#111', width: 2.5, pressure: true, tuning: DEFAULT_INK_TUNING,
    highlighterTuning: DEFAULT_HIGHLIGHTER_TUNING, shapeHold: { enabled: false, delayMs: 1000 },
    eraserSettings: DEFAULT_ERASER_SETTINGS, fillColor: '#111', fillOpacity: 0, cornerRadius: 0,
    allowTouch: false, palmRejection: false, scale: 1, rasterScale: 1, images: {}, selectionIds: [], aspectLocked: true,
    onChange: (elements: unknown) => commits.push(elements), onSelect: noop, onTextRequest: noop, onPan: noop,
    onEraserUsed: noop, registerTouchCancellation: () => noop,
  });
  let time = 0;
  const event = (x: number, y: number, up = false) => ({ currentTarget: input.ref.current, preventDefault: noop,
    nativeEvent: { pointerId: 9, pointerType: 'pen', button: 0, buttons: up ? 0 : 1, clientX: x, clientY: y, pressure: up ? 0 : .5, timeStamp: time += 5 } });
  input.onPointerDown(event(210,200));
  for (const [from,to,y] of [[210,310,200],[310,210,202],[210,310,204],[310,210,206]]) {
    for (let i = 1; i <= 20; i++) input.onPointerMove(event(from+(to-from)*i/20,y));
  }
  input.onPointerUp(event(210,206,true)); clock.tick();
  assert.equal(commits.length, 1, 'one gesture must produce one undoable edit');
  assert.equal((commits[0] as unknown[]).length, 0, 'the strike is consumed rather than added as ink');
  assert.deepEqual(page.elements, original, 'the editor history snapshot must remain intact');
  host.dispose();
});

test('editor tracks mixed-size pages without layout reads during scrolling and refreshes geometry after zoom', () => {
  const source = readFileSync(new URL('../src/components/notes/NotebookEditor.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('NotebookEditor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let scrollEffect: ts.CallExpression | undefined, mountEffect: ts.CallExpression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
      if (node.arguments[0]?.getText(ast).includes('const syncActivePage =')) scrollEffect = node;
      if (node.arguments[0]?.getText(ast).includes('new IntersectionObserver')) mountEffect = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(scrollEffect); assert.ok(mountEffect);
  // Execute the production effects, isolated from unrelated account/UI effects.
  const compile = (node: ts.Node) => ts.transpileModule(node.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const direction of ['vertical', 'horizontal']) {
    let reads = 0, zoom = 1, observerCount = 0, mounted = new Set<string>();
    const clock = frames(), listeners = new Map<string, Function>();
    const root = {
      scrollTop: 0, scrollLeft: 0, clientWidth: 500, clientHeight: 500,
      getBoundingClientRect: () => { reads++; return { left: 25, top: 75, width: 500, height: 500 }; },
      addEventListener(name: string, fn: Function) { listeners.set(name, fn); }, removeEventListener(name: string) { listeners.delete(name); },
    };
    const pages = [{ id: 'a', start: 0, length: 400 }, { id: 'b', start: 428, length: 800 }, { id: 'c', start: 1256, length: 600 }];
    const nodes = new Map(pages.map(page => [page.id, {
      dataset: { notePageId: page.id }, getBoundingClientRect() {
        reads++;
        const start = page.start * zoom - (direction === 'horizontal' ? root.scrollLeft : root.scrollTop);
        return direction === 'horizontal'
          ? { left: 25 + start, right: 25 + start + page.length * zoom }
          : { top: 75 + start, bottom: 75 + start + page.length * zoom };
      },
    }]));
    const currentId = { current: 'a' };
    const effects: { deps: unknown[]; cleanup?: () => void }[] = [];
    let cursor = 0;
    const context = vm.createContext({
      viewport: { current: root }, pageNodes: { current: nodes }, visiblePageIds: { current: new Set() }, currentId,
      live: { current: { pages } }, pageId: 'a', pageLayoutKey: 'mixed', fit: 1, zoom, scrollDirection: direction,
      requestAnimationFrame: clock.request, cancelAnimationFrame: clock.cancel,
      setScrolling() {}, setTimeout, clearTimeout,
      setSelected() {}, setPageId(id: string) { currentId.current = id; },
      setMountedPageIds(update: (old: Set<string>) => Set<string>) { mounted = update(mounted); },
      IntersectionObserver: class {
        constructor(_callback: unknown, _options: unknown) { observerCount++; }
        observe() {} disconnect() {}
      },
      useEffect(effect: () => (() => void) | void, deps: unknown[]) {
        const index = cursor++, old = effects[index];
        if (!old || deps.some((value, i) => value !== old.deps[i])) { old?.cleanup?.(); effects[index] = { deps, cleanup: effect() || undefined }; }
      },
    });
    const install = () => { cursor = 0; vm.runInContext(compile(mountEffect!), context); vm.runInContext(compile(scrollEffect!), context); };
    install(); clock.tick(); const initialReads = reads;
    for (let i = 0; i < 40; i++) {
      if (direction === 'horizontal') root.scrollLeft = 480 + i; else root.scrollTop = 480 + i;
      listeners.get('scroll')!(); clock.tick();
    }
    assert.equal(currentId.current, 'b');
    assert.equal(reads, initialReads, 'no page rectangle measurements belong in the scroll frame');
    context.pageId = 'b'; install();
    assert.equal(observerCount, 1, 'active-page changes must not restart virtualization');
    zoom = 2; context.zoom = 2; install(); clock.tick();
    assert.equal(currentId.current, 'a', 'zoom invalidates cached geometry before active-page detection');
    assert.equal(reads, initialReads * 2);
    effects.forEach(effect => effect.cleanup?.());
  }
});
