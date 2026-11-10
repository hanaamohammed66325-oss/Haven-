import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { versionIcons } from '../scripts/version-icons.mjs';

const read = (p) => readFileSync(p, 'utf8').replaceAll('\r\n', '\n');
const manifest = JSON.parse(read('public/manifest.json'));
const oldManifest = JSON.parse(read('tests/fixtures/app-icon-legacy-manifest.json'));

test('installed identity and shortcuts are preserved; every new icon is byte-identical', () => {
  const withoutIcons = (m) => ({ ...m, icons: undefined, shortcuts: m.shortcuts.map(s => ({ ...s, icons: undefined })) });
  assert.deepEqual(withoutIcons(manifest), withoutIcons(oldManifest));
  const current = [...manifest.icons, ...manifest.shortcuts.flatMap(s => s.icons)];
  const previous = [...oldManifest.icons, ...oldManifest.shortcuts.flatMap(s => s.icons)];
  for (let i = 0; i < current.length; i++) {
    const original = 'public' + previous[i].src.split('?')[0];
    const bytes = readFileSync(original);
    assert.deepEqual(readFileSync('public' + current[i].src), bytes);
    assert.ok(current[i].src.includes(createHash('sha256').update(bytes).digest('hex').slice(0, 12)));
    assert.deepEqual({ ...current[i], src: undefined }, { ...previous[i], src: undefined });
  }
  for (const url of Object.values(JSON.parse(read('src/lib/appIcons.json')))) {
    assert.ok(existsSync('public' + url));
    const original = url.replace(/\.[a-f0-9]{12}(?=\.png$)/, '');
    assert.deepEqual(readFileSync('public' + url), readFileSync('public' + original));
  }
});

test('version generation is repeatable and does not change files on each build', () => {
  const before = read('public/manifest.json');
  const metadata = read('src/lib/appIcons.json');
  versionIcons();
  assert.equal(read('public/manifest.json'), before);
  assert.equal(read('src/lib/appIcons.json'), metadata);
});

function worker(fetcher, saved = new Map(), options = {}) {
  const listeners = {};
  const writes = [];
  const caches = {
    match: async (r) => saved.get(r.url)?.clone(),
    open: async () => ({
      match: async r => saved.get(r.url)?.clone(),
      put: async (r, response) => { if (options.cacheFull) throw Error('quota'); writes.push(r.url); saved.set(r.url, response.clone()); },
    }),
  };
  vm.runInNewContext(read('public/sw.js'), {
    self: { addEventListener: (n, cb) => listeners[n] = cb, location: { origin: 'https://havenstudent.com' } },
    caches, fetch: fetcher, Request, Response, URL, setTimeout: options.fastTimeout ? (fn) => setTimeout(fn, 5) : setTimeout, clearTimeout, Promise,
  });
  return {
    writes,
    request: path => {
      let result;
      listeners.fetch({ request: new Request('https://havenstudent.com' + path), respondWith: p => result = p });
      return result;
    },
  };
}

for (const path of ['/manifest.json', '/icons/apple-touch-icon.png', '/icons/icon-192.png?v=2', '/favicon.svg']) {
  test(`fresh response beats old saved icon/metadata: ${path}`, async () => {
    const saved = new Map([['https://havenstudent.com' + path, new Response('old')]]);
    let cacheMode;
    const sw = worker(async request => { cacheMode = request.cache; return new Response('current'); }, saved);
    assert.equal(await (await sw.request(path)).text(), 'current');
    assert.equal(cacheMode, 'no-cache');
    assert.equal(await saved.get('https://havenstudent.com' + path).text(), 'current');
  });
}

test('offline and HTTP errors retain correct saved icons and manifest', async () => {
  for (const path of ['/manifest.json', '/icons/icon-192.png']) {
    const saved = new Map([['https://havenstudent.com' + path, new Response('correct')]]);
    for (const fetcher of [async () => { throw Error('offline'); }, async () => new Response('error', { status: 503 })]) {
      const sw = worker(fetcher, saved);
      assert.equal(await (await sw.request(path)).text(), 'correct');
      assert.equal(sw.writes.length, 0);
    }
  }
});

test('failed uncached icons return a failure status instead of a false successful image', async () => {
  assert.equal((await worker(async () => { throw Error('offline'); }).request('/icons/missing.png')).status, 504);
  assert.equal((await worker(async () => new Response('', { status: 404 })).request('/icons/missing.png')).status, 404);
});

test('API, cross-origin, notification delivery and JS assets retain their existing paths', async () => {
  const sw = worker(async () => new Response('asset'));
  assert.equal(sw.request('/api/live'), undefined);
  assert.equal(await (await sw.request('/_next/static/chunk.js')).text(), 'asset');
  assert.match(read('public/sw.js'), /icon: '\/icons\/icon-192.png'/);
  assert.match(read('src/components/RegisterSW.jsx'), /updateViaCache: "none"/);
});


test('a full cache cannot replace a fresh correct icon with an error', async () => {
  const sw = worker(async () => new Response('correct'), new Map(), { cacheFull: true });
  assert.equal(await (await sw.request('/icons/icon-192.png')).text(), 'correct');
});

test('slow network falls back to the saved correct icon', async () => {
  const saved = new Map([['https://havenstudent.com/icons/icon-192.png', new Response('correct')]]);
  const sw = worker(() => new Promise(() => {}), saved, { fastTimeout: true });
  assert.equal(await (await sw.request('/icons/icon-192.png')).text(), 'correct');
});
