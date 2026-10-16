import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { audioFileProblem, MAX_AUDIO_BYTES, parseAudioPreferences } from "../src/lib/studyAudio/catalog";
import { RoundAudioAlerts } from "../src/lib/studyAudio/roundAlerts";
import { StudyAudioPlayer } from "../src/lib/studyAudio/player";
import { listPersonalTracks, savePersonalTrack } from "../src/lib/studyAudio/storage";
import type { StudyRound } from "../src/lib/study/types";

const original = new Map(["Audio", "AudioContext", "window", "localStorage", "indexedDB"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const memory = new Map<string, string>();
let dbData: Record<string, Map<string, unknown>>, failFiles = false, failOpen = false, notes = 0;
class FakeAudio {
  static instances: FakeAudio[] = [];
  static rejectPlay = false;
  static rejectProbe = false;
  static finishPlay: (() => void) | null = null;
  static waitPlay = false;
  src: string; volume = 1; loop = false; preload = ""; plays = 0;
  onplaying: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onloadeddata: (() => void) | null = null;
  constructor(src = "") { this.src = src; FakeAudio.instances.push(this); }
  async play() {
    this.plays++;
    if (FakeAudio.rejectPlay) throw new Error("autoplay blocked");
    if (FakeAudio.waitPlay) await new Promise<void>((resolve) => { FakeAudio.finishPlay = resolve; });
    this.onplaying?.();
  }
  pause() { this.onpause?.(); }
  removeAttribute() { this.src = ""; }
  load() { if (this.src.startsWith("blob:")) queueMicrotask(() => FakeAudio.rejectProbe ? this.onerror?.() : this.onloadeddata?.()); }
}
class FakeContext {
  state = "suspended"; currentTime = 0; destination = {};
  async resume() { this.state = "running"; }
  async close() { this.state = "closed"; }
  createOscillator() { return { type: "", frequency: { value: 0 }, connect() {}, disconnect() {}, start() { notes++; }, stop() {}, onended: null }; }
  createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
}
function fakeDatabase() {
  return {
    close() {},
    transaction(_stores: string[], mode: string) {
      const copy = Object.fromEntries(Object.entries(dbData).map(([key, value]) => [key, new Map(value)]));
      let aborted = false;
      const tx = {
        oncomplete: null as (() => void) | null, onabort: null as (() => void) | null, onerror: null as (() => void) | null,
        error: null as Error | null,
        abort() { aborted = true; this.error = new Error("quota"); queueMicrotask(() => this.onabort?.()); },
        objectStore(name: string) {
          const request = (result: unknown) => { const req = { result, onsuccess: null as (() => void) | null }; queueMicrotask(() => req.onsuccess?.()); return req; };
          return {
            getAll: () => request([...copy[name].values()]), get: (id: string) => request(copy[name].get(id)),
            put: (value: { id?: string }, key?: string) => {
              if (failFiles && name === "files") throw new Error("quota");
              copy[name].set(key ?? value.id!, value);
            },
            delete: (id: string) => copy[name].delete(id),
          };
        },
      };
      setTimeout(() => { if (!aborted) { if (mode === "readwrite") dbData = copy; tx.oncomplete?.(); } }, 0);
      return tx;
    },
  };
}
beforeEach(() => {
  FakeAudio.instances = []; memory.clear(); notes = 0; failFiles = failOpen = false;
  FakeAudio.rejectPlay = FakeAudio.rejectProbe = FakeAudio.waitPlay = false; FakeAudio.finishPlay = null;
  dbData = { tracks: new Map(), files: new Map() };
  const fake = {
    Audio: FakeAudio,
    window: { AudioContext: FakeContext },
    localStorage: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) },
    indexedDB: { open() {
      const req = { result: fakeDatabase(), error: new Error("disabled"), onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
      queueMicrotask(() => failOpen ? req.onerror?.() : req.onsuccess?.()); return req;
    } },
  };
  for (const [key, value] of Object.entries(fake)) Object.defineProperty(globalThis, key, { value, configurable: true });
});
after(() => {
  for (const [key, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test("file boundaries reject empty, oversized and non-audio files without requiring a MIME type", () => {
  assert.equal(audioFileProblem({ name: "my rain.MP3", size: MAX_AUDIO_BYTES }), null);
  assert.equal(audioFileProblem({ name: "rain.mp3", size: MAX_AUDIO_BYTES + 1 }), "size");
  assert.equal(audioFileProblem({ name: "rain.mp3", size: 0 }), "size");
  assert.equal(audioFileProblem({ name: "document.pdf", size: 123 }), "format");
});
test("corrupt preferences cannot set invalid volume, autoplay or toggles", () => {
  assert.deepEqual(parseAudioPreferences({ selected: 3, volume: NaN, loop: "yes", alerts: null }), { selected: null, volume: .45, loop: true, alerts: true });
  assert.equal(parseAudioPreferences({ volume: 7 }).volume, 1);
});
test("restored selection and volume do not create or start any media", async () => {
  memory.set("haven-study-audio-prefs", JSON.stringify({ selected: "snow", volume: .12, loop: false, alerts: false }));
  const player = new StudyAudioPlayer(); await player.load();
  assert.equal(player.snapshot().selected, "snow"); assert.equal(player.snapshot().volume, .12);
  assert.equal(player.snapshot().playing, false); assert.equal(FakeAudio.instances.length, 0);
  player.dispose();
});
test("switching tracks releases the old media; pause/resume, repeat and volume use one current media", async () => {
  const player = new StudyAudioPlayer(); await player.load();
  await player.play("snow"); const first = FakeAudio.instances[0];
  player.preferences({ volume: .15, loop: false }); assert.equal(first.volume, .15); assert.equal(first.loop, false);
  player.pause(); assert.equal(player.snapshot().playing, false);
  await player.play(); assert.equal(first.plays, 2);
  await player.play("rain"); assert.equal(first.src, ""); assert.equal(FakeAudio.instances.length, 2);
  player.dispose(); assert.equal(FakeAudio.instances[1].src, "");
});
test("personal file saves, survives a new player and deletes both metadata and audio", async () => {
  const first = new StudyAudioPlayer(); await first.load();
  await first.play("snow");
  await first.add(new File(["test bytes"], "My Rain.mp3", { type: "audio/mpeg" }));
  assert.equal(first.snapshot().playing, false);
  const track = first.snapshot().files[0]; assert.equal(track.name, "My Rain"); assert.equal(track.temporary, undefined);
  first.dispose();
  const second = new StudyAudioPlayer(); await second.load();
  assert.equal(second.snapshot().files[0].id, track.id); assert.equal(second.snapshot().selected, track.id);
  await second.play(); assert.equal(second.snapshot().playing, true);
  await second.remove(track.id); assert.equal(second.snapshot().selected, null);
  assert.equal((await listPersonalTracks()).length, 0); assert.equal(dbData.files.size, 0); second.dispose();
});
test("quota failure is atomic and offers explicitly temporary playback", async () => {
  failFiles = true;
  await assert.rejects(savePersonalTrack({ id: "local-1", name: "Rain", size: 10 }, new Blob(["rain"])));
  assert.equal(dbData.tracks.size, 0); assert.equal(dbData.files.size, 0);
  const player = new StudyAudioPlayer(); await player.load();
  await player.add(new File(["rain"], "Rain.mp3"));
  assert.equal(player.snapshot().problem, "temporary"); assert.equal(player.snapshot().files[0].temporary, true);
  await player.play(); assert.equal(player.snapshot().playing, true); player.dispose();
});
test("disabled storage still permits ready audio", async () => {
  failOpen = true; const player = new StudyAudioPlayer(); await player.load();
  assert.equal(player.snapshot().problem, "storage"); await player.play("snow"); assert.equal(player.snapshot().playing, true); player.dispose();
});
test("a browser playback refusal is recoverable with a new explicit play", async () => {
  const player = new StudyAudioPlayer(); FakeAudio.rejectPlay = true;
  await player.play("snow"); assert.equal(player.snapshot().problem, "play"); assert.equal(player.snapshot().busy, false);
  FakeAudio.rejectPlay = false; await player.play(); assert.equal(player.snapshot().playing, true); player.dispose();
});
test("a pending media load can be cancelled and cannot turn playback back on", async () => {
  const player = new StudyAudioPlayer(); FakeAudio.waitPlay = true;
  const pending = player.play("snow"); assert.equal(player.snapshot().busy, true);
  player.pause(); FakeAudio.finishPlay?.(); await pending;
  assert.equal(player.snapshot().playing, false); assert.equal(FakeAudio.instances[0].src, ""); player.dispose();
});
test("an undecodable audio file is rejected before it reaches device storage", async () => {
  const player = new StudyAudioPlayer(); FakeAudio.rejectProbe = true;
  await player.add(new File(["not audio"], "broken.mp3"));
  assert.equal(player.snapshot().problem, "format"); assert.equal(player.snapshot().importing, false);
  assert.equal(dbData.tracks.size, 0); assert.equal(dbData.files.size, 0); player.dispose();
});
test("a late personal-file read cannot replace a newer ready-track selection", async () => {
  await savePersonalTrack({ id: "local-1", name: "Rain", size: 10 }, new Blob(["rain"]));
  const player = new StudyAudioPlayer(); const pending = player.play("local-1"); await player.play("snow"); await pending;
  assert.equal(player.snapshot().selected, "snow"); assert.equal(FakeAudio.instances.length, 1); assert.equal(player.snapshot().playing, true); player.dispose();
});
test("alerts require a user gesture, respect mute, and restore the latest ambience volume after ducking", async () => {
  const player = new StudyAudioPlayer(); assert.equal(await player.notify("study"), false);
  await player.play("snow"); assert.equal(await player.notify("study"), true); assert.equal(notes, 2);
  assert.equal(FakeAudio.instances[0].volume, .45 * .25);
  player.preferences({ volume: .8, alerts: false }); assert.equal(FakeAudio.instances[0].volume, .8 * .25);
  assert.equal(await player.notify("break"), false);
  await new Promise((resolve) => setTimeout(resolve, 1100)); assert.equal(FakeAudio.instances[0].volume, .8); player.dispose();
});
test("late storage initialization does not discard its file list when the user plays immediately", async () => {
  await savePersonalTrack({ id: "local-1", name: "Rain", size: 10 }, new Blob(["rain"]));
  const player = new StudyAudioPlayer(); const loading = player.load(); await player.play("snow"); await loading;
  assert.equal(player.snapshot().files.length, 1); assert.equal(player.snapshot().selected, "snow"); player.dispose();
});

const round = (patch: Partial<StudyRound> = {}): StudyRound => ({ id: "r1", seq: 1, startsAt: 1000, studyMs: 60_000, breakMs: 30_000, pausedAt: null, pausedTotalMs: 0, phase: "study", othersMayStartAt: 0, participants: [], ...patch });
test("shared round rings each boundary once, never on reload or a repeated snapshot", () => {
  const alerts = new RoundAudioAlerts(), r = round();
  assert.equal(alerts.observe(r, 2000), null);
  assert.equal(alerts.observe(r, 61_000), "study"); assert.equal(alerts.observe({ ...r }, 62_000), null);
  assert.equal(alerts.observe(r, 91_000), "break"); assert.equal(alerts.observe(r, 92_000), null);
  assert.equal(new RoundAudioAlerts().observe(r, 62_000), null);
});
test("pause, cancellation, new round and stale background return do not manufacture an alert", () => {
  const alerts = new RoundAudioAlerts();
  alerts.observe(round(), 2000);
  assert.equal(alerts.observe(round({ pausedAt: 5000 }), 92_000), null);
  assert.equal(alerts.observe(round({ phase: "cancelled" }), 92_000), null);
  assert.equal(alerts.observe(round({ id: "r2" }), 2000), null);
  assert.equal(alerts.observe(round({ id: "r2" }), 200_000), null);
});
