// Group study: an open group page kept in step with the server, driven by a
// fake server and a fake clock. Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createGroupSession,
  type ChannelHandlers,
  type SessionEnv,
  type StudyTransport,
} from "@/lib/study/session";
import { StudyError } from "@/lib/study/types";

const G = "11111111-1111-4111-8111-111111111111";
const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const R1 = "22222222-2222-4222-8222-222222222222";
const S1 = "44444444-4444-4444-8444-444444444444";
const MIN = 60_000;
const T0 = Date.parse("2026-10-06T18:00:00.000Z");

const iso = (ms: number) => new Date(ms).toISOString();

/** Lets every pending promise callback run. */
async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

function fakeEnv(opts: { handheld?: boolean; hidden?: boolean } = {}) {
  let now = T0;
  let hidden = opts.hidden ?? false;
  let seq = 0;
  let ids = 0;
  const timers = new Map<number, { at: number; fn: () => void; every: number | null }>();
  const vis = new Set<() => void>();
  const online = new Set<() => void>();
  const env: SessionEnv = {
    now: () => now,
    setTimeout: (fn, ms) => {
      timers.set(++seq, { at: now + ms, fn, every: null });
      return seq;
    },
    clearTimeout: (h) => void timers.delete(h as number),
    setInterval: (fn, ms) => {
      timers.set(++seq, { at: now + ms, fn, every: ms });
      return seq;
    },
    clearInterval: (h) => void timers.delete(h as number),
    isHidden: () => hidden,
    onVisibilityChange: (fn) => {
      vis.add(fn);
      return () => void vis.delete(fn);
    },
    onOnline: (fn) => {
      online.add(fn);
      return () => void online.delete(fn);
    },
    handheld: opts.handheld ?? false,
    randomId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
  };
  return {
    env,
    timerCount: () => timers.size,
    /** Moves the clock, running each timer when it falls due. */
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        let due: [number, { at: number; fn: () => void; every: number | null }] | null = null;
        for (const entry of timers) if (entry[1].at <= end && (!due || entry[1].at < due[1].at)) due = entry;
        if (!due) break;
        const [id, t] = due;
        now = t.at;
        if (t.every) t.at += t.every;
        else timers.delete(id);
        t.fn();
        await flush();
      }
      now = end;
      await flush();
    },
    async setHidden(h: boolean) {
      hidden = h;
      for (const f of vis) f();
      await flush();
    },
    async goOnline() {
      for (const f of online) f();
      await flush();
    },
  };
}

interface FakeChannel {
  topic: string;
  handlers: ChannelHandlers;
  tracked: boolean[];
  closed: boolean;
}

/** A fake server. Each snapshot call answers with `snapshot` (or a handler set by the test). */
function fakeServer() {
  const calls: string[] = [];
  const channels: FakeChannel[] = [];
  const pokes: { target: string; tap: string }[] = [];
  const s = {
    version: 5,
    epoch: 1,
    serverTime: T0,
    round: null as Record<string, unknown> | null,
    sitting: { id: S1, organizer_id: ME, started_at: iso(T0 - MIN) } as Record<string, unknown> | null,
  };
  const snapshot = () => ({
    server_time: iso(s.serverTime),
    group: { id: G, name: "مجموعة", version: s.version, epoch: s.epoch, is_owner: true, cap: 10 },
    members: [
      { user_id: ME, seat: 0, display_name: "m0", havi_name: "Havi", havi_color: "#477680", flower_color: "#ffffff", is_owner: true, is_me: true, fresh: true },
      { user_id: B, seat: 1, display_name: "m1", havi_name: "Havi", havi_color: "#477680", flower_color: "#ffffff", is_owner: false, is_me: false, fresh: true },
    ],
    sitting: s.sitting,
    round: s.round,
  });
  let answer: (fn: string) => Promise<unknown> = async () => snapshot();
  const reply = (fn: string) => {
    calls.push(fn);
    return answer(fn);
  };
  const transport: StudyTransport = {
    state: () => reply("state"),
    heartbeat: () => reply("heartbeat"),
    openSitting: () => reply("open"),
    setDesks: () => reply("desks"),
    startRound: () => reply("start"),
    pauseRound: () => reply("pause"),
    resumeRound: () => reply("resume"),
    leaveRound: () => reply("leaveRound"),
    poke: async (_g, target, tap) => {
      calls.push("poke");
      pokes.push({ target, tap });
      return true;
    },
    openChannel: async (topic, _me, handlers) => {
      const ch: FakeChannel = { topic, handlers, tracked: [], closed: false };
      channels.push(ch);
      return {
        track: async (awake) => void ch.tracked.push(awake),
        close: async () => void (ch.closed = true),
      };
    },
  };
  return {
    s,
    snapshot,
    calls,
    channels,
    pokes,
    transport,
    setAnswer(f: (fn: string) => Promise<unknown>) {
      answer = f;
    },
    count: (fn: string) => calls.filter((c) => c === fn).length,
  };
}

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("a group page", () => {
  test("opens with a check-in, then listens on the group's current topic", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    assert.deepEqual(srv.calls, ["heartbeat"]);
    assert.equal(session.view().state?.group.version, 5);
    assert.deepEqual(srv.channels.map((c) => c.topic), [`study:${G}:1`]);
    // Connected: catch up, and say I'm awake.
    srv.channels[0].handlers.onStatus("subscribed");
    await flush();
    assert.equal(session.view().connected, true);
    assert.equal(srv.count("state"), 1);
    assert.deepEqual(srv.channels[0].tracked, [true]);
    session.dispose();
  });

  test("an older snapshot arriving late never replaces a newer one", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    const slow = deferred<unknown>();
    srv.setAnswer(async () => slow.promise);
    session.refresh(); // in flight, will answer with version 6
    srv.s.version = 7;
    srv.setAnswer(async () => srv.snapshot());
    await session.pause().catch(() => {}); // answers at once with version 7
    assert.equal(session.view().state?.group.version, 7);
    srv.s.version = 6;
    slow.resolve(srv.snapshot());
    await flush();
    assert.equal(session.view().state?.group.version, 7);
    session.dispose();
  });

  test("a 'changed' hint fetches only when it is newer than the screen; requests don't pile up", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    const h = srv.channels[0].handlers;
    h.onChanged(5);
    h.onChanged(4);
    await flush();
    assert.equal(srv.count("state"), 0);
    const slow = deferred<unknown>();
    srv.setAnswer(async () => slow.promise);
    h.onChanged(6);
    h.onChanged(7);
    h.onChanged(8);
    await flush();
    assert.equal(srv.count("state"), 1); // one in flight, one more queued
    srv.s.version = 8;
    srv.setAnswer(async () => srv.snapshot());
    slow.resolve(srv.snapshot());
    await flush();
    assert.equal(srv.count("state"), 2);
    assert.equal(session.view().state?.group.version, 8);
    session.dispose();
  });

  test("a new epoch moves the page to the new topic and closes the old one", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    srv.s.version = 6;
    srv.s.epoch = 2;
    srv.channels[0].handlers.onChanged(6);
    await flush();
    assert.deepEqual(srv.channels.map((c) => [c.topic, c.closed]), [
      [`study:${G}:1`, true],
      [`study:${G}:2`, false],
    ]);
    // Hints still arriving on the old topic are ignored.
    srv.channels[0].handlers.onChanged(99);
    await flush();
    assert.equal(srv.count("state"), 1);
    session.dispose();
    assert.equal(srv.channels[1].closed, true);
  });

  test("removed from the group: the page ends, its channel closes and its timers stop", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    srv.setAnswer(async () => {
      throw new StudyError("not_member");
    });
    srv.channels[0].handlers.onChanged(6);
    await flush();
    assert.equal(session.view().ended, "not_member");
    assert.equal(srv.channels[0].closed, true);
    assert.equal(env.timerCount(), 0);
    await env.advance(10 * MIN);
    assert.equal(srv.count("heartbeat"), 1);
    await assert.rejects(session.pause(), (e) => e instanceof StudyError && e.code === "not_member");
    session.dispose();
  });

  test("offline: asks again later, and at once when the connection comes back", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    srv.setAnswer(async () => {
      throw new StudyError("network");
    });
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    assert.equal(session.view().state, null);
    srv.setAnswer(async () => srv.snapshot());
    await env.advance(5_000);
    assert.equal(srv.count("state"), 1);
    assert.equal(session.view().state?.group.version, 5);
    await env.goOnline();
    assert.equal(srv.count("state"), 2);
    session.dispose();
  });
});

describe("check-ins (the 10-minute rule)", () => {
  test("a computer checks in every 2 minutes, hidden or not", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    await env.setHidden(true);
    await env.advance(6 * MIN);
    assert.equal(srv.count("heartbeat"), 4);
    session.dispose();
  });

  test("a phone stops at once when hidden, and checks in as soon as it is back", async () => {
    const env = fakeEnv({ handheld: true });
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    await env.setHidden(true);
    await env.advance(12 * MIN);
    assert.equal(srv.count("heartbeat"), 1);
    await env.setHidden(false);
    assert.equal(srv.count("heartbeat"), 2);
    await env.advance(2 * MIN);
    assert.equal(srv.count("heartbeat"), 3);
    session.dispose();
  });

  test("a phone opened hidden still loads the group, without checking in", async () => {
    const env = fakeEnv({ handheld: true, hidden: true });
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    assert.deepEqual(srv.calls, ["state"]);
    assert.equal(session.view().state?.group.version, 5);
    session.dispose();
  });
});

describe("sleep (looks only)", () => {
  test("in-app navigation retains the channel but sleeps Havi until the room is visible", async () => {
    const env = fakeEnv({ handheld: true });
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    const ch = srv.channels[0]; ch.handlers.onStatus("subscribed"); await flush();
    session.setRoomVisible(false);
    assert.equal(session.view().awake.get(ME), false);
    assert.equal(ch.closed, false);
    await env.setHidden(true); await env.setHidden(false);
    assert.equal(session.view().awake.get(ME), false);
    session.setRoomVisible(true);
    assert.equal(session.view().awake.get(ME), true);
    assert.equal(ch.closed, false);
    session.dispose();
    assert.equal(ch.closed, true);
  });
  test("a peer sleeps if a phone freezes before delivering hidden; another visible device stays awake", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    const h = srv.channels[0].handlers;
    h.onPresence({ [B]: [{ awake: true, seen_at: T0 }] });
    assert.equal(session.view().awake.get(B), true);
    await env.advance(30_000);
    assert.equal(session.view().awake.get(B), false);
    h.onPresence({ [B]: [{ awake: true, seen_at: T0 }, { awake: true, seen_at: T0 + 30_000 }] });
    assert.equal(session.view().awake.get(B), true);
    session.dispose();
  });
  test("a hidden phone publishes sleep before timers can be suspended", async () => {
    const env = fakeEnv({ handheld: true });
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    const ch = srv.channels[0];
    ch.handlers.onStatus("subscribed");
    await flush();
    await env.setHidden(true);
    assert.equal(session.view().awake.get(ME), false);
    assert.deepEqual(ch.tracked, [true, false]);
    await env.setHidden(false);
    assert.equal(session.view().awake.get(ME), true);
    assert.deepEqual(ch.tracked, [true, false, true]);
    session.dispose();
  });
  test("hidden 30 seconds: my Havi sleeps; back: awake", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    const ch = srv.channels[0];
    ch.handlers.onStatus("subscribed");
    await flush();
    await env.setHidden(true);
    await env.advance(29_000);
    assert.deepEqual(ch.tracked, [true]);
    await env.advance(1_000);
    assert.deepEqual(ch.tracked, [true, false]);
    assert.equal(session.view().awake.get(ME), false);
    await env.setHidden(false);
    assert.deepEqual(ch.tracked, [true, false, true]);
    assert.equal(session.view().awake.get(ME), true);
    // A short look away does not sleep; returning renews the visible lease.
    await env.setHidden(true);
    await env.advance(10_000);
    await env.setHidden(false);
    assert.deepEqual(ch.tracked, [true, false, true, true]);
    session.dispose();
  });

  test("the others' awake state comes from Presence, by member", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    srv.channels[0].handlers.onPresence({ [B]: [{ awake: false }, { awake: true }], stranger: [{ awake: true }] });
    assert.deepEqual([...session.view().awake.entries()], [[B, true]]);
    session.dispose();
  });
});

describe("taps on a Havi", () => {
  test("joined sender uses direct transport, falls back with the same id, and skips ambiguous echoes", async () => {
    const clock = fakeEnv(), srv = fakeServer();
    const original = srv.transport.openChannel;
    const sent: Array<{target:string;tap:string;recipients:readonly string[]}> = [];
    let direct = true;
    srv.transport.openChannel = async (...args) => ({...await original(...args), sendPoke: async (target,tap,recipients) => {
      sent.push({target,tap,recipients});
      args[2].onPoke(target,tap); // An ambiguous acknowledgement can still have delivered.
      return direct;
    }});
    const session = createGroupSession(G, ME, srv.transport, clock.env);
    await flush();
    const h = srv.channels[0].handlers;
    h.onStatus("subscribed"); h.onPresence({[B]:[{awake:true}]});
    await flush();
    const seen:string[]=[];session.onPoke(id=>seen.push(id));
    session.poke(B); await flush();
    assert.equal(sent.length,1); assert.equal(srv.pokes.length,0);
    assert.deepEqual(new Set(sent[0].recipients),new Set([B]));
    direct=false;
    const id=session.poke(B);await flush();
    assert.deepEqual(srv.pokes,[{target:B,tap:id}]);assert.deepEqual(seen,[]);
    session.dispose();
  });
  test("offline round participants do not block direct taps; connected sleeping legacy clients still trigger fallback", async () => {
    for (const capable of [false, true]) {
      const clock = fakeEnv(), srv = fakeServer();
      let peerConnected = false;
      srv.s.round = {
        id: R1, seq: 1, starts_at: iso(T0), study_ms: 25 * MIN, break_ms: 5 * MIN,
        paused_at: null, paused_total_ms: 0, phase: "study", others_may_start_at: iso(T0 + 33 * MIN),
        participants: [{user_id: ME, active: true, left_reason: null}, {user_id: B, active: true, left_reason: null}],
      };
      srv.setAnswer(async () => {
        const raw = srv.snapshot();
        return capable ? {...raw, members: raw.members.map(m => ({...m, on_page: m.user_id === ME || peerConnected, awake: m.user_id === ME}))} : raw;
      });
      const original = srv.transport.openChannel;
      const sent: Array<readonly string[]> = [];
      srv.transport.openChannel = async (...args) => ({...await original(...args), sendPoke: async (_target, _tap, recipients) => {
        sent.push(recipients);
        return !recipients.includes(B); // B is a legacy receiver when connected.
      }});
      const session = createGroupSession(G, ME, srv.transport, clock.env);
      try {
        await flush();
        const h = srv.channels[0].handlers;
        h.onStatus("subscribed"); await flush();
        assert.equal(session.view().state?.round?.participants.find(p => p.userId === B)?.active, true);
        session.poke(ME); await flush();
        assert.deepEqual(sent, [[]]);
        assert.equal(srv.pokes.length, 0, "offline participant must not force RPC");

        peerConnected = true; srv.s.version++;
        session.refresh(); await flush();
        h.onPresence({[B]: [{awake: false}]});
        assert.equal(session.view().awake.get(B), false, "connected sleeping member remains present");
        const tap = session.poke(ME); await flush();
        assert.deepEqual(sent[1], [B]);
        assert.deepEqual(srv.pokes, [{target: ME, tap}], "connected legacy receiver retains the fallback");
      } finally { session.dispose(); }
    }
  });
  test("five distinct taps arrive once each even if the channel repeats a delivery", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    const seen: string[] = [];
    session.onPoke((id) => seen.push(id));
    const h = srv.channels[0].handlers;
    h.onPresence({ [B]: [{ awake: true }] });
    for (let i = 0; i < 5; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      h.onPoke(B, id);
      h.onPoke(B, id);
    }
    assert.deepEqual(seen, [B, B, B, B, B]);
    session.dispose();
  });
  test("my own tap's echo is skipped; the others' taps reach the page", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    const seen: string[] = [];
    session.onPoke((target) => seen.push(target));
    const tap = session.poke(B);
    await flush();
    assert.deepEqual(srv.pokes, [{ target: B, tap }]);
    const h = srv.channels[0].handlers;
    h.onPoke(B, tap);
    h.onPoke(ME, "99999999-9999-4999-8999-999999999999");
    assert.deepEqual(seen, [ME]);
    session.dispose();
  });
  test("malformed, unseated, repeated and excessive received taps are ignored", async () => {
    const clock = fakeEnv(), srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, clock.env);
    await flush();
    let count = 0;
    session.onPoke(() => count++);
    const h = srv.channels[0].handlers;
    h.onPoke(B, G); // Not present at a desk.
    h.onPoke(ME, "not-a-uuid");
    h.onPoke(G, R1); // Not a member.
    assert.equal(count, 0);
    for (let i = 0; i < 30; i++) {
      const tap = `00000000-0000-4000-8000-${String(100 + i).padStart(12, "0")}`;
      h.onPoke(ME, tap);
      h.onPoke(ME, tap);
    }
    assert.equal(count, 20);
    await clock.advance(1000);
    h.onPoke(ME, R1);
    assert.equal(count, 21);
    session.dispose();
  });
  test("sender permits twenty taps per rolling second and recovers after the window", async () => {
    const clock = fakeEnv(), srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, clock.env);
    await flush();
    for (let i = 0; i < 30; i++) session.poke(B);
    await flush();
    assert.equal(srv.pokes.length, 20);
    await clock.advance(1000);
    session.poke(B);
    await flush();
    assert.equal(srv.pokes.length, 21);
    session.dispose();
  });
});

describe("rounds", () => {
  test("the page asks again just after the study time ends, then after the break", async () => {
    // A hidden phone: no check-ins, so only the boundaries ask.
    const env = fakeEnv({ handheld: true });
    const srv = fakeServer();
    srv.s.round = {
      id: R1, seq: 1, starts_at: iso(T0), study_ms: 25 * MIN, break_ms: 5 * MIN,
      paused_at: null, paused_total_ms: 0, phase: "study", others_may_start_at: iso(T0 + 33 * MIN), participants: [],
    };
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    await env.setHidden(true);
    srv.setAnswer(async () => {
      srv.s.serverTime = env.env.now();
      return srv.snapshot();
    });
    await env.advance(25 * MIN);
    assert.equal(srv.count("heartbeat"), 1);
    assert.equal(srv.count("state"), 0);
    await env.advance(1);
    assert.equal(srv.count("state"), 1);
    await env.advance(5 * MIN);
    assert.equal(srv.count("state"), 2);
    session.dispose();
  });

  test("the server's clock is followed, not the device's", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    srv.s.serverTime = T0 + 7_000; // the device is 7 seconds behind
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    assert.equal(session.view().offsetMs, 7_000);
    assert.equal(session.serverNow(), T0 + 7_000);
    session.dispose();
  });

  test("bad durations are refused here; a refusal from the server refreshes the screen", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    await assert.rejects(session.start(3, 5), (e) => e instanceof StudyError && e.code === "invalid_duration");
    assert.equal(srv.count("start"), 0);
    srv.setAnswer(async (fn) => {
      if (fn === "start") throw new StudyError("not_organizer");
      return srv.snapshot();
    });
    await assert.rejects(session.start(25, 5), (e) => e instanceof StudyError && e.code === "not_organizer");
    await flush();
    assert.equal(srv.count("state"), 1);
    assert.equal(session.view().ended, null);
    session.dispose();
  });

  test("opening a sitting and setting the desks: bad numbers are refused here", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    srv.s.sitting = null;
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    await assert.rejects(session.openSitting(1), (e) => e instanceof StudyError && e.code === "invalid_desks");
    await assert.rejects(session.setDesks(11), (e) => e instanceof StudyError && e.code === "invalid_desks");
    assert.equal(srv.count("open") + srv.count("desks"), 0);
    await assert.rejects(session.openSitting(3), /invalid_desks/);
    srv.s.version = 6;
    srv.s.sitting = { id: S1, organizer_id: ME, started_at: iso(T0), desk_count: 2, desks_for_seq: 1 };
    await session.openSitting(2);
    assert.equal(session.view().state?.sitting?.deskCount, 2);
    srv.s.version = 7;
    srv.s.sitting = { ...srv.s.sitting, desk_count: 2 };
    await session.setDesks(2);
    assert.equal(session.view().state?.sitting?.deskCount, 2);
    assert.deepEqual(srv.calls.slice(1), ["open", "desks"]);
    session.dispose();
  });

  test("an action's answer updates the screen at once", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    srv.s.version = 6;
    srv.s.round = {
      id: R1, seq: 1, starts_at: iso(T0 + 3_000), study_ms: 25 * MIN, break_ms: 5 * MIN,
      paused_at: null, paused_total_ms: 0, phase: "scheduled", others_may_start_at: iso(T0 + 33 * MIN),
      participants: [{ user_id: ME, active: true, left_reason: null }, { user_id: B, active: true, left_reason: null }],
    };
    let changes = 0;
    session.subscribe(() => changes++);
    await session.start(25, 5);
    assert.equal(session.view().state?.round?.id, R1);
    assert.equal(changes, 1);
    session.dispose();
  });
});

describe("closing the page", () => {
  test("per-page leases distinguish devices, renew, and close with increasing sequence", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const visits: Array<{ page: string; open: boolean; awake: boolean; seq: number }> = [];
    srv.transport.pageState = async (_group, page, open, awake, seq) => {
      visits.push({ page, open, awake, seq });
      return srv.snapshot();
    };
    const first = createGroupSession(G, ME, srv.transport, env.env);
    const second = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    assert.notEqual(visits[0].page, visits[1].page);
    await env.advance(15_000);
    assert.equal(visits.filter((v) => v.open).length, 4);
    const firstId = visits[0].page;
    first.dispose();
    await flush();
    assert.equal(visits.at(-1)?.page, firstId);
    assert.equal(visits.at(-1)?.open, false);
    const lastSeq = visits.at(-1)!.seq;
    assert.ok(lastSeq > visits[0].seq);
    await env.advance(15_000);
    assert.equal(visits.filter((v) => v.page === firstId).length, 3);
    assert.equal(visits.at(-1)?.open, true);
    second.dispose();
  });
  test("dispose stops every timer and closes the channel; late answers are ignored", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    const slow = deferred<unknown>();
    srv.setAnswer(async () => slow.promise);
    session.refresh();
    session.dispose();
    assert.equal(env.timerCount(), 0);
    assert.equal(srv.channels[0].closed, true);
    srv.s.version = 9;
    slow.resolve(srv.snapshot());
    await flush();
    assert.equal(session.view().state?.group.version, 5);
  });

  test("a channel that opens after the page closed is closed at once", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const opened = deferred<void>();
    const open = srv.transport.openChannel;
    srv.transport.openChannel = async (...args) => {
      await opened.promise;
      return open(...args);
    };
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    session.dispose();
    opened.resolve();
    await flush();
    assert.equal(srv.channels.length, 1);
    assert.equal(srv.channels[0].closed, true);
  });
});


describe("closed channel recovery", () => {
  test("reopens the same epoch after checking access, even with an identical snapshot", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    const old = srv.channels[0];
    old.handlers.onStatus("subscribed");
    await flush();
    old.handlers.onStatus("closed");
    await flush();
    assert.equal(old.closed, true);
    assert.equal(session.view().connected, false);
    await env.goOnline();
    assert.equal(srv.channels.length, 1); // backoff still applies
    await env.advance(3_000);
    assert.equal(srv.channels.length, 2);
    assert.equal(srv.channels[1].topic, old.topic);
    old.handlers.onStatus("subscribed"); // late old callback ignored
    assert.equal(session.view().connected, false);
    srv.channels[1].handlers.onStatus("subscribed");
    await flush();
    assert.equal(session.view().connected, true);
    session.dispose();
  });

  test("does not reopen after access is lost", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    srv.channels[0].handlers.onStatus("closed");
    srv.setAnswer(async () => { throw new StudyError("not_member"); });
    await env.advance(3_000);
    assert.equal(session.view().ended, "not_member");
    assert.equal(srv.channels.length, 1);
    assert.equal(env.timerCount(), 0);
    session.dispose();
  });

  test("dispose cancels a scheduled reconnect", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    srv.channels[0].handlers.onStatus("closed");
    session.dispose();
    await env.advance(60_000);
    assert.equal(srv.channels.length, 1);
    assert.equal(env.timerCount(), 0);
  });

  test("a channel closed before open resolves cannot replace the next channel", async () => {
    const env = fakeEnv();
    const srv = fakeServer();
    const open = srv.transport.openChannel;
    srv.transport.openChannel = async (...args) => {
      const ch = await open(...args);
      if (srv.channels.length === 1) args[2].onStatus("closed");
      return ch;
    };
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    assert.equal(srv.channels[0].closed, true);
    await env.advance(3_000);
    assert.equal(srv.channels.length, 2);
    srv.channels[1].handlers.onStatus("subscribed");
    await flush();
    assert.equal(session.view().connected, true);
    session.dispose();
    assert.equal(srv.channels[1].closed, true);
  });
});


describe("server finish notification", () => {
  test("a settlement hint updates the end without another heartbeat", async () => {
    const env = fakeEnv({ handheld: true });
    const srv = fakeServer();
    srv.s.round = {
      id: R1, seq: 1, starts_at: iso(T0), study_ms: 25 * MIN, break_ms: 5 * MIN,
      paused_at: null, paused_total_ms: 0, phase: "study", settled_at: null,
      others_may_start_at: iso(T0 + 33 * MIN),
      participants: [{ user_id: ME, active: true, left_reason: null }],
    };
    const session = createGroupSession(G, ME, srv.transport, env.env);
    await flush();
    await env.setHidden(true);
    await env.advance(25 * MIN);
    assert.equal(srv.count("state"), 0);
    srv.s.version = 6;
    srv.s.serverTime = T0 + 25 * MIN;
    srv.s.round = { ...srv.s.round, phase: "break", settled_at: iso(srv.s.serverTime) };
    srv.channels[0].handlers.onChanged(6);
    await flush();
    assert.equal(session.view().state?.round?.settledAt, srv.s.serverTime);
    assert.equal(srv.count("heartbeat"), 1);
    session.dispose();
  });
});


test("a restored group needs a fresh session after terminal deletion", async () => {
  const env = fakeEnv(), srv = fakeServer();
  const old = createGroupSession(G, ME, srv.transport, env.env);
  await flush();
  srv.setAnswer(async () => { throw new StudyError("group_deleted"); });
  srv.channels[0].handlers.onChanged(6);
  await flush();
  assert.equal(old.view().ended, "group_deleted");
  assert.equal(srv.channels[0].closed, true);
  srv.s.version = 7; srv.s.epoch = 3;
  srv.setAnswer(async () => srv.snapshot());
  const count = srv.calls.length;
  old.refresh(); await flush();
  assert.equal(srv.calls.length, count, "refresh cannot revive a terminal session");
  old.dispose();
  const fresh = createGroupSession(G, ME, srv.transport, env.env);
  await flush();
  assert.equal(fresh.view().ended, null);
  assert.equal(fresh.view().state?.group.version, 7);
  assert.equal(srv.channels.at(-1)?.topic, `study:${G}:3`);
  srv.channels.at(-1)!.handlers.onStatus("subscribed");
  await flush();
  assert.equal(fresh.view().connected, true);
  fresh.dispose();
});

test("duration writes are ordered and the last choice becomes shared state", async () => {
  const env = fakeEnv(), srv = fakeServer();
  const writes: number[] = [];
  let release!: () => void;
  srv.transport.setDurations = async (_g, study, rest) => {
    writes.push(study);
    if (study === 15) await new Promise<void>(resolve => { release = resolve; });
    Object.assign(srv.s.sitting!, { study_minutes: study, break_minutes: rest });
    srv.s.version++;
    return srv.snapshot();
  };
  const session = createGroupSession(G, ME, srv.transport, env.env);
  await flush();
  const first = session.setDurations(15, 5), last = session.setDurations(30, 10);
  await flush();
  assert.deepEqual(writes, [15]);
  release(); await Promise.all([first, last]);
  assert.deepEqual(writes, [15, 30]);
  assert.equal(session.view().state?.sitting?.studyMinutes, 30);
  assert.equal(session.view().state?.sitting?.breakMinutes, 10);
  session.dispose();
});
test("failed duration writes do not poison a retry or overwrite saved state", async () => {
  const env = fakeEnv(), srv = fakeServer();
  let fail = true;
  srv.transport.setDurations = async (_g, study, rest) => {
    if (fail) { fail = false; throw new StudyError("network"); }
    Object.assign(srv.s.sitting!, { study_minutes: study, break_minutes: rest });
    srv.s.version++; return srv.snapshot();
  };
  const session = createGroupSession(G, ME, srv.transport, env.env);
  await flush();
  await assert.rejects(session.setDurations(15, 5));
  assert.equal(session.view().state?.sitting?.studyMinutes, undefined);
  await session.setDurations(20, 7);
  assert.equal(session.view().state?.sitting?.studyMinutes, 20);
  session.dispose();
  await assert.rejects(session.setDurations(30, 5));
});
