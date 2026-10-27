import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { GROUP_LAUNCH_STARTS_AT } from "../supabase/functions/_shared/groupLaunch.ts";
import { freeLaunchEmailBudget } from "../supabase/functions/_shared/groupLaunchQuota.ts";
import { groupStudyAvailable } from "../src/lib/featureFlags";
import { whatsNewVersion } from "../src/lib/whatsNew";

const launch = Date.parse(GROUP_LAUNCH_STARTS_AT);
const quota = (used = 0) => ({ emails: { daily: { used, limit: 100, resets_at: "2026-10-27T00:00:00Z" }, monthly: { used: 10, limit: 3000, resets_at: "2026-11-01T00:00:00Z" } } });

test("Saudi midnight is a single absolute launch instant, with a separate unread release", () => {
  assert.equal(GROUP_LAUNCH_STARTS_AT, "2026-10-26T21:00:00.000Z");
  assert.equal(groupStudyAvailable(launch - 1), false);
  assert.equal(groupStudyAvailable(launch), true);
  assert.equal(groupStudyAvailable(launch + 1), true);
  assert.equal(whatsNewVersion(false), 6); assert.equal(whatsNewVersion(true), 7);
});

test("email allowances follow actual free usage, preserve reservations and fail closed", () => {
  assert.deepEqual(freeLaunchEmailBudget(quota(), launch), { date: "2026-10-26", used: 0, limit: 90 });
  assert.equal(freeLaunchEmailBudget(quota(70), launch)?.limit, 20);
  assert.deepEqual(freeLaunchEmailBudget(quota(80), launch, 10), { date: "2026-10-26", used: 10, limit: 20 });
  assert.equal(freeLaunchEmailBudget(quota(100), launch), null);
  assert.equal(freeLaunchEmailBudget(quota(90), launch, 90)?.limit, 90);
  for (const usage of [null, {}, { emails: { daily: { limit: null }, monthly: {} } }, quota(-1), quota(101), quota(0.5)]) assert.equal(freeLaunchEmailBudget(usage, launch), null);
  const monthly = quota(); monthly.emails.monthly.used = 2998;
  assert.equal(freeLaunchEmailBudget(monthly, launch), null);
  assert.equal(freeLaunchEmailBudget(quota(), Date.parse("2026-10-27T00:00:00Z")), null, "stale provider windows never grant quota");
});

test("an existing included monthly plan supports capped zero-overage sending without purchasing anything", () => {
  const usage = { emails: { daily: { used: 4, limit: null, resets_at: "2026-10-27T00:00:00Z" }, monthly: { used: 65, limit: 50_000, resets_at: "2026-11-21T12:08:44Z" } } };
  assert.deepEqual(freeLaunchEmailBudget(usage, launch), { date: "2026-10-26", used: 0, limit: 90 });
  usage.emails.monthly.used = 49_980;
  assert.equal(freeLaunchEmailBudget(usage, launch)?.limit, 10);
  usage.emails.monthly.used = 49_995;
  assert.equal(freeLaunchEmailBudget(usage, launch), null);
  assert.equal(freeLaunchEmailBudget({ emails: { ...usage.emails, monthly: { ...usage.emails.monthly, limit: null } } }, launch), null);
});

test("launch subscription wakes at the boundary, on return, and cleans up without remounting the app", () => {
  let now = launch - 1000, next = 0, signals = 0;
  const timers = new Map<number, () => void>(), windowEvents = new Map<string, () => void>(), documentEvents = new Map<string, () => void>();
  let hook: { subscribe: (fn: () => void) => () => void; client: () => boolean; server: () => boolean };
  const exports: { useGroupStudyEnabled?: () => boolean } = {};
  const doc = { hidden: false, addEventListener: (name: string, fn: () => void) => documentEvents.set(name, fn), removeEventListener: (name: string) => documentEvents.delete(name) };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/components/useGroupStudyEnabled.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, Date: { now: () => now, parse: Date.parse }, document: doc,
    window: { addEventListener: (name: string, fn: () => void) => windowEvents.set(name, fn), removeEventListener: (name: string) => windowEvents.delete(name) },
    setTimeout: (fn: () => void) => { timers.set(++next, fn); return next; }, clearTimeout: (id: number) => timers.delete(id),
    require(name: string) {
      if (name === "react") return { useSyncExternalStore: (subscribe: typeof hook.subscribe, client: () => boolean, server: () => boolean) => { hook = { subscribe, client, server }; return client(); } };
      if (name.includes("featureFlags")) return { GROUP_STUDY_ENABLED: false, groupStudyAvailable: () => now >= launch };
      return { GROUP_LAUNCH_STARTS_AT };
    },
  });
  assert.equal(exports.useGroupStudyEnabled!(), false);
  assert.equal(hook!.server(), false, "after launch static HTML still hydrates its closed snapshot safely");
  const stop = hook!.subscribe(() => { signals++; });
  assert.equal(timers.size, 1); now = launch;
  [...timers.values()][0]();
  assert.equal(hook!.client(), true); assert.equal(signals, 1); assert.equal(timers.size, 0);
  documentEvents.get("visibilitychange")!(); windowEvents.get("focus")!();
  assert.equal(signals, 3);
  stop(); assert.equal(windowEvents.size, 0); assert.equal(documentEvents.size, 0); assert.equal(timers.size, 0);
});

test("an older welcome save finishing across launch cannot advance the new release", async () => {
  const source = readFileSync(new URL("../src/components/WhatsNewModal.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("modal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let next = "";
  const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "next") next = node.initializer!.getText(ast); ts.forEachChild(node, visit); };
  visit(ast); assert.ok(next);
  let finish: (ok: boolean) => void = () => {};
  const saving = new Promise<boolean>(resolve => { finish = resolve; });
  const changes: string[] = [];
  const context = { page: { id: "audio" }, busy: false, accountId: "a", WHATS_NEW_VERSION: 6, preview: false,
    currentAccount: { current: "a" }, currentRelease: { current: 6 }, last: false,
    setBusy() {}, setError() {}, markWhatsNewSeen: () => saving,
    setDirection: () => changes.push("direction"), setIndex: () => changes.push("index"), close: () => changes.push("close"), router: { push: () => changes.push("navigation") } };
  const handler = vm.runInNewContext(ts.transpileModule(`const next = ${next}; next;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const pending = handler(); context.currentRelease.current = 7; finish(true); await pending;
  assert.deepEqual(changes, []);
});
