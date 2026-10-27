import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as launch from "../supabase/functions/_shared/groupLaunch.ts";

function harness(now: number, armed = true, failed = false) {
  let handler: (req: Request) => Promise<Response>;
  let profileReads = 0, providers = 0;
  const source = readFileSync(new URL("../supabase/functions/reengage-tick/index.ts", import.meta.url), "utf8");
  class Clock extends Date { constructor(value: string | number = now) { super(value); } static now() { return now; } }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: {}, Request, Response, URL, Date: Clock, console,
    Deno: { env: { get: (key: string) => key === "REENGAGE_ENABLED" ? "true" : "local-test-only" } },
    require(name: string) {
      if (name.includes("http/server")) return { serve: (fn: typeof handler) => { handler = fn; } };
      if (name.includes("_shared")) return launch;
      if (name.includes("web-push")) return { __esModule: true, default: { sendNotification: async () => { providers++; } } };
      if (name.includes("supabase-js")) return { createClient: () => ({ from: (table: string) => {
        const q: Record<string, unknown> = {};
        for (const key of ["select", "eq", "not", "lt", "gt"]) q[key] = () => q;
        q.maybeSingle = async () => ({ data: armed ? { value: JSON.stringify({ enabled: true }) } : null, error: failed ? {} : null });
        q.limit = async () => { assert.equal(table, "profiles"); profileReads++; return { data: [], error: null }; };
        return q;
      } }) };
      throw Error(name);
    },
    fetch: async () => { providers++; throw Error("No provider is permitted in this test"); },
  });
  return { call: () => handler(new Request("https://example.invalid", { headers: { Authorization: "Bearer local-test-only" } })), counts: () => ({ profileReads, providers }) };
}

test("generic reengagement yields throughout the launch window even when its secret enables it", async () => {
  const h = harness(Date.parse(launch.GROUP_LAUNCH_STARTS_AT));
  const body = await (await h.call()).json();
  assert.equal(body.disabled, true);
  assert.deepEqual(h.counts(), { profileReads: 0, providers: 0 });
});

test("generic reengagement resumes outside the launch window and on an unarmed site", async () => {
  for (const [now, armed] of [[Date.parse(launch.GROUP_LAUNCH_STARTS_AT) - 1, true], [Date.parse(launch.GROUP_LAUNCH_EXPIRES_AT), true], [Date.parse(launch.GROUP_LAUNCH_STARTS_AT), false]] as const) {
    const h = harness(now, armed);
    assert.equal((await h.call()).status, 200);
    assert.deepEqual(h.counts(), { profileReads: 1, providers: 0 });
  }
});

test("an unavailable overlap check cannot trigger generic contacts", async () => {
  const h = harness(Date.parse(launch.GROUP_LAUNCH_STARTS_AT), true, true);
  assert.equal((await h.call()).status, 503);
  assert.deepEqual(h.counts(), { profileReads: 0, providers: 0 });
});
