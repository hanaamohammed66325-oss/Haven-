import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as shared from "../supabase/functions/_shared/groupLaunch.ts";
import * as campaign from "../supabase/functions/group-launch/campaign.ts";

const uid = "00000000-0000-4000-8000-000000000001";
function harness() {
  let handler: (request: Request) => Promise<Response>;
  let value: string | null = null, writes = 0, providers = 0;
  const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const query = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const fn of ["select", "eq", "limit"]) q[fn] = () => q;
    q.maybeSingle = async () => ({ data: value ? { value, updated_at: old } : null, error: null });
    q.insert = async (row: { value: string }) => { if (value !== null) return { error: { code: "23505" } }; value = row.value; writes++; return { error: null }; };
    q.in = async () => ({ data: table === "profiles" ? [{ id: uid, last_active_at: old, preferences: {} }] : [], error: null });
    return q;
  };
  const source = readFileSync(new URL("../supabase/functions/group-launch/index.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: {}, Request, Response, Date, AbortSignal, console,
    Deno: { env: { get: (name: string) => name === "SCHEDULER_SECRET" ? "local-only-test" : "test-value" } },
    require(name: string) {
      if (name.includes("http/server")) return { serve: (fn: typeof handler) => { handler = fn; } };
      if (name.includes("supabase-js")) return { createClient: () => ({ from: query, auth: { admin: { listUsers: async () => ({ data: { users: [{ id: uid, created_at: old, last_sign_in_at: old, email_confirmed_at: old, email: "example@example.invalid" }] }, error: null }) } } }) };
      if (name.includes("web-push")) return { default: { sendNotification: async () => { providers++; } } };
      if (name.includes("_shared")) return shared;
      if (name.includes("campaign")) return campaign;
      throw Error(name);
    },
    fetch: async () => { providers++; throw Error("must not call a provider during preparation"); },
  });
  return {
    call: (body: object, bearer = "local-only-test") => handler(new Request("https://example.invalid", { method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })),
    counts: () => ({ writes, providers }), value: () => value,
  };
}
test("campaign endpoint rejects unauthorized requests and previews counts without writing or disclosing recipients", async () => {
  const h = harness();
  assert.equal((await h.call({}, "wrong")).status, 401);
  const response = await h.call({});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.email, 1); assert.equal(body.push, 0); assert.equal(body.dryRun, true);
  assert.equal(JSON.stringify(body).includes(uid), false);
  assert.deepEqual(h.counts(), { writes: 0, providers: 0 });
});
test("preparation creates a draft snapshot once, and send remains disabled", async () => {
  const h = harness();
  assert.equal((await h.call({ mode: "prepare" })).status, 200);
  const initial = h.value();
  assert.equal(campaign.parseLaunchState(initial!).phase, "draft");
  assert.equal((await h.call({ mode: "prepare" })).status, 409);
  assert.equal(h.value(), initial);
  const result = await (await h.call({ mode: "send" })).json();
  assert.equal(result.status, "disabled");
  assert.deepEqual(h.counts(), { writes: 1, providers: 0 });
});
test("activation without reviewed public launch and verified free quota is rejected", async () => {
  const h = harness(); await h.call({ mode: "prepare" });
  assert.equal((await h.call({ mode: "activate" })).status, 400);
  assert.equal(campaign.parseLaunchState(h.value()!).phase, "draft");
  assert.deepEqual(h.counts(), { writes: 1, providers: 0 });
});

test("scheduled tick cannot prepare or contact anyone before the absolute launch time", async () => {
  const h = harness();
  if (Date.now() >= Date.parse(shared.GROUP_LAUNCH_STARTS_AT)) return;
  assert.equal((await (await h.call({ mode: "tick" })).json()).status, "outside_launch_window");
  assert.deepEqual(h.counts(), { writes: 0, providers: 0 });
});
