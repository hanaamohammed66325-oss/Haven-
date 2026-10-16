// Exercise the real registry with a fake SDK, without account or network calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type { ChannelHandlers } from "@/lib/study/session";

const channels: Array<{ topic: string; status: (s: string) => void; removed: boolean; broadcasts: Map<string, (msg: { payload: unknown }) => void> }> = [];
let closeOnSubscribe = false;
const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
const mock = {
  async rpc(name: string, args: Record<string, unknown>) {
    calls.push({ name, args });
    return { data: { server_time: "2026-10-11T12:00:00Z" }, error: null };
  },
  realtime: { setAuth: async () => {} },
  channel(topic: string) {
    const entry = { topic, status: (_s: string) => {}, removed: false, broadcasts: new Map<string, (msg: { payload: unknown }) => void>() };
    channels.push(entry);
    const ch = {
      on: (kind: string, filter: { event: string }, callback: (msg: { payload: unknown }) => void) => {
        if (kind === "broadcast") entry.broadcasts.set(filter.event, callback);
        return ch;
      },
      subscribe: (cb: (s: string) => void) => {
        entry.status = cb;
        if (closeOnSubscribe) cb("CLOSED");
        return ch;
      },
      presenceState: () => ({}),
      track: async () => {},
      entry,
    };
    return ch;
  },
  async removeChannel(ch: { entry: { removed: boolean; status: (s: string) => void } }) {
    ch.entry.removed = true;
    ch.entry.status("CLOSED");
  },
};
(globalThis as unknown as { studySdkMock: unknown }).studySdkMock = mock;
const hook = registerHooks({
  load(url, context, next) {
    if (url.endsWith("/src/lib/supabase.ts")) return {
      format: "module", shortCircuit: true,
      source: "export const supabase = globalThis.studySdkMock;",
    };
    return next(url, context);
  },
});
const { studyTransport } = await import("@/lib/study/client");
hook.deregister();
const handler = (seen: string[]): ChannelHandlers => ({
  onChanged() {}, onPoke() {}, onPresence() {}, onStatus: (s) => seen.push(s),
});

test("real transport supports readiness and confirms exactly the acknowledged preparation members", async () => {
  assert.ok(studyTransport.setReady, "readiness cannot stay available in demo transport only");
  await studyTransport.setReady("group", true);
  await studyTransport.setReady("group", false);
  await studyTransport.startRound("group", 15, 5, true, ["peer"]);
  assert.deepEqual(calls.slice(-3), [
    { name: "study_set_ready", args: { p_group: "group", p_ready: true } },
    { name: "study_set_ready", args: { p_group: "group", p_ready: false } },
    { name: "study_start_round_with_focus", args: { p_group: "group", p_study_minutes: 15,
      p_break_minutes: 5, p_confirm_missing: true, p_missing_ids: ["peer"] } },
  ]);
});

test("CLOSED registry entries are replaced; closing the old reference preserves the replacement", async () => {
  const topic = "registry-recovery";
  const seen: string[] = [];
  const old = await studyTransport.openChannel(topic, "me", handler(seen));
  const original = channels.findLast(ch => ch.topic === topic)!;
  original.status("CLOSED");
  assert.deepEqual(seen, ["closed"]);
  const fresh = await studyTransport.openChannel(topic, "me", handler([]));
  const replacement = channels.findLast(ch => ch.topic === topic)!;
  assert.notEqual(replacement, original);
  await old.close();
  const count = channels.length;
  const other = await studyTransport.openChannel(topic, "me", handler([]));
  assert.equal(channels.length, count);
  await fresh.close();
  assert.equal(replacement.removed, false); // another subscriber still owns it
  await other.close();
  assert.equal(replacement.removed, true);
});

test("a synchronous close before handler attachment is replayed and never cached", async () => {
  closeOnSubscribe = true;
  const seen: string[] = [];
  const old = await studyTransport.openChannel("sync-close", "me", handler(seen));
  await Promise.resolve();
  assert.deepEqual(seen, ["closed"]);
  closeOnSubscribe = false;
  const count = channels.length;
  const fresh = await studyTransport.openChannel("sync-close", "me", handler([]));
  assert.equal(channels.length, count + 2);
  await old.close();
  await fresh.close();
});

test("poke parser accepts legacy and new envelopes and ignores malformed payloads", async () => {
  const target = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tap = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const seen: unknown[] = [];
  const channel = await studyTransport.openChannel("poke-parser", target, { ...handler([]), onPoke: (id, key) => seen.push([id, key]) });
  const deliver = channels.findLast(ch => ch.topic === "poke-parser")!.broadcasts.get("poke")!;
  for (const payload of [null, 3, [], {}, {target, tap: "bad"}, {target: "bad", tap}]) deliver({payload});
  assert.deepEqual(seen, []);
  for (const payload of [{user_id: target, tap}, {target, tap}, {payload: {user_id: target, tap}}]) deliver({payload});
  assert.deepEqual(seen, [[target,tap],[target,tap],[target,tap]]);
  await channel.close();
});
