import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import * as shared from "../supabase/functions/_shared/groupLaunch.ts";
import * as campaign from "../supabase/functions/group-launch/campaign.ts";
import * as quotaRules from "../supabase/functions/_shared/groupLaunchQuota.ts";

const now = Date.parse("2026-10-27T10:00:00Z");
const old = new Date(now - 30 * 86_400_000).toISOString();
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** Exercise the real endpoint and installed PostgREST query builder. All HTTP
 * and push providers are intercepted; no credentials or live recipients. */
function harness(count = 635, push = false) {
  let clock = now, armed = false, quotaAvailable = true, pushError: number | null = null;
  let handler: (req: Request) => Promise<Response>;
  let row: { key: string; value: string; updated_at: string } | null = null;
  let declineNextPatch = false;
  const requests: { method: string; urlBytes: number; revision: string | null }[] = [];
  const reads: { path: string; accept: string | null }[] = [];
  const sendErrors: string[] = [];
  const emails: Record<string, unknown>[] = [], pushes: Record<string, unknown>[] = [];
  const users = Array.from({ length: count }, (_, i) => ({ id: uid(i + 1), created_at: old, last_sign_in_at: push && i === 0 ? new Date(now - 4 * 86_400_000).toISOString() : old,
    email_confirmed_at: old, email: "sample@example.invalid" }));
  const http: typeof fetch = async (input, init) => {
    const url = new URL(String(input)), method = init?.method ?? "GET";
    reads.push({ path: url.pathname, accept: new Headers(init?.headers).get("accept") });
    if (url.pathname === "/auth/v1/admin/users") {
      const start = (Number(url.searchParams.get("page")) - 1) * 200;
      return json({ users: users.slice(start, start + 200) });
    }
    if (url.pathname.startsWith("/auth/v1/admin/users/")) return json(users.find(u => url.pathname.endsWith(u.id)));
    if (url.pathname.endsWith("/profiles")) {
      const profiles = users.map(u => ({ id: u.id, last_active_at: u.last_sign_in_at, preferences: { language: "en" } }));
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const found = id && !id.startsWith("in.") ? profiles.filter(p => p.id === id) : profiles;
      return json(init?.headers && new Headers(init.headers).get("accept")?.includes("vnd.pgrst.object") ? found[0] : found);
    }
    if (url.pathname.endsWith("/push_subscriptions")) return json(push ? [
      { id: uid(9001), user_id: uid(1), endpoint: "https://push.example.invalid/1", p256dh: "test", auth: "test" },
      { id: uid(9002), user_id: uid(1), endpoint: "https://push.example.invalid/2", p256dh: "test", auth: "test" },
    ] : []);
    assert.ok(url.pathname.endsWith("/app_config"), url.pathname);
    if (url.searchParams.get("key") === `eq.${shared.GROUP_LAUNCH_SCHEDULE_KEY}`) return json(armed ? [{ value: JSON.stringify({ enabled: true, frontendReady: true, serverOpened: true, startsAt: shared.GROUP_LAUNCH_STARTS_AT, expiresAt: shared.GROUP_LAUNCH_EXPIRES_AT }) }] : []);
    if (method === "POST") {
      if (row) return json({ code: "23505" }, 409);
      const body = JSON.parse(String(init?.body));
      row = { ...body, updated_at: "2026-10-27T09:59:59.000001+00:00" };
      return json(null, 201);
    }
    if (method === "PATCH") {
      requests.push({ method, urlBytes: Buffer.byteLength(url.href), revision: url.searchParams.get("updated_at") });
      if (url.href.length > 8192) return json({ message: "URI too long" }, 414);
      if (declineNextPatch) { declineNextPatch = false; return json([]); }
      if (!row || url.searchParams.get("updated_at") !== `eq.${row.updated_at}`) return json([]);
      const next = JSON.parse(String(init?.body));
      assert.ok(Date.parse(next.updated_at) > Date.parse(row.updated_at), "every write advances the database revision, even within the same millisecond");
      const updated = { ...row, ...next, updated_at: next.updated_at.replace("Z", "+00:00") };
      row = updated;
      return json([{ updated_at: updated.updated_at, key: updated.key }]);
    }
    return json(row ? [row] : []);
  };
  const source = readFileSync(new URL("../supabase/functions/group-launch/index.ts", import.meta.url), "utf8");
  class Clock extends Date { constructor(value: string | number = clock) { super(value); } static now() { return clock; } }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: {}, Request, Response, Date: Clock, AbortSignal, console,
    Deno: { env: { get: (key: string) => key === "SUPABASE_URL" ? "https://database.example.invalid" : "local-test-only" } },
    require(name: string) {
      if (name.includes("http/server")) return { serve: (fn: typeof handler) => { handler = fn; } };
      if (name.includes("supabase-js")) return { createClient: (url: string, key: string, options: object) => createClient(url, key, { ...options, global: { fetch: http } }) };
      if (name.includes("web-push")) return { __esModule: true, default: { setVapidDetails() {}, async sendNotification(_subscription: unknown, payload: string) { pushes.push(JSON.parse(payload)); if (pushError !== null) throw { statusCode: pushError }; } } };
      if (name.includes("groupLaunchQuota")) return quotaRules;
      if (name.includes("_shared")) return shared;
      if (name.includes("campaign")) return { ...campaign, deliverNextLaunch: (deps: Parameters<typeof campaign.deliverNextLaunch>[0]) => campaign.deliverNextLaunch({ ...deps, async send(...args) { try { return await deps.send(...args); } catch (error) { sendErrors.push(String(error)); throw error; } } }) };
      throw Error(name);
    },
    fetch: async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.mode === "usage") return quotaAvailable ? json({ ok: true, usage: { emails: {
        daily: { used: 0, limit: 100, resets_at: new Date(Math.floor(clock / 86_400_000) * 86_400_000 + 86_400_000).toISOString() },
        monthly: { used: 0, limit: 3000, resets_at: "2026-11-01T00:00:00Z" },
      } } }) : json({ error: "quota unavailable" }, 503);
      emails.push(body); return json({ ok: true });
    },
  });
  return {
    call: (body: object) => handler(new Request("https://endpoint.example.invalid", { method: "POST", headers: { Authorization: "Bearer local-test-only", "Content-Type": "application/json" }, body: JSON.stringify(body) })),
    activate: () => handler(new Request("https://endpoint.example.invalid", { method: "POST", headers: { Authorization: "Bearer local-test-only", "Content-Type": "application/json" }, body: JSON.stringify({ mode: "activate", publicLaunchConfirmed: true, freeQuotaVerified: true, freeEmailBudget: 90, startsAt: new Date(now).toISOString(), expiresAt: new Date(now + 7 * 86_400_000).toISOString() }) })),
    state: () => campaign.parseLaunchState(row!.value), requests, emails, pushes, reads, sendErrors,
    decline: () => { declineNextPatch = true; },
    corruptRevision: () => { row!.updated_at = "invalid"; },
    arm: () => { armed = true; }, time: (value: number) => { clock = value; }, quota: (enabled: boolean) => { quotaAvailable = enabled; },
    pushFailure: (status: number) => { pushError = status; },
  };
}

test("real endpoint keeps CAS URLs short for a large audience and claims one email across concurrent workers", async t => {
  const h = harness();
  assert.equal((await h.call({ mode: "prepare" })).status, 200);
  assert.equal(h.state().deliveries.length, 635);
  assert.equal((await h.activate()).status, 200);
  const results = await Promise.all([h.call({ mode: "send" }), h.call({ mode: "send" })]);
  assert.ok(results.every(r => r.status === 200));
  assert.equal(h.emails.length, 1);
  assert.equal(h.emails[0].template, shared.GROUP_LAUNCH_TEMPLATE);
  assert.equal(h.emails[0].dedup_key, shared.GROUP_LAUNCH_ID);
  assert.equal(h.state().deliveries.filter(d => d.status === "sent").length, 1);
  assert.equal(h.state().emailBudget?.used, 1);
  assert.ok(h.requests.every(r => r.urlBytes < 400 && r.revision?.startsWith("eq.")), JSON.stringify(h.requests));
  t.diagnostic(`audience=635; maximum CAS URL=${Math.max(...h.requests.map(r => r.urlBytes))} bytes; provider calls=${h.emails.length}`);
});

test("activation conflict reports busy without pretending the draft became active", async () => {
  const h = harness(1); await h.call({ mode: "prepare" }); h.decline();
  assert.equal((await h.activate()).status, 409);
  assert.equal(h.state().phase, "draft");
  assert.equal(h.emails.length, 0);
});

test("the endpoint sends the actual localized push payload to subscriptions once", async () => {
  const h = harness(1, true); await h.call({ mode: "prepare" });
  assert.equal((await h.activate()).status, 200);
  assert.equal((await (await h.call({ mode: "send" })).json()).status, "sent", JSON.stringify({ reads: h.reads, errors: h.sendErrors }));
  await h.call({ mode: "send" });
  assert.equal(h.pushes.length, 2); assert.equal(h.emails.length, 0);
  assert.equal(h.pushes[0].title, shared.groupLaunchCopy.en.pushTitle);
  assert.equal(h.pushes[0].url, "/study/"); assert.equal(h.pushes[0].id, shared.GROUP_LAUNCH_ID);
});

test("invalid database revision fails closed before a provider is contacted", async () => {
  const h = harness(1); await h.call({ mode: "prepare" }); h.corruptRevision();
  assert.equal((await h.activate()).status, 503);
  assert.equal(h.emails.length, 0); assert.equal(h.pushes.length, 0);
});

test("scheduled tick starts both channels at Saudi midnight, with no early write or duplicate", async () => {
  const h = harness(2, true); h.arm();
  h.time(Date.parse(shared.GROUP_LAUNCH_STARTS_AT) - 1);
  assert.equal((await (await h.call({ mode: "tick" })).json()).status, "outside_launch_window");
  assert.equal(h.requests.length, 0); assert.equal(h.emails.length, 0); assert.equal(h.pushes.length, 0);
  h.time(Date.parse(shared.GROUP_LAUNCH_STARTS_AT));
  const first = await (await h.call({ mode: "tick" })).json();
  assert.equal(first.push.status, "sent"); assert.equal(first.email.status, "sent");
  assert.equal(h.state().phase, "complete");
  await h.call({ mode: "tick" });
  assert.equal(h.emails.length, 1); assert.equal(h.pushes.length, 2);
});

test("unknown free quota withholds email while push proceeds, then recovers without repeating push", async () => {
  const h = harness(2, true); h.arm(); h.quota(false);
  const first = await (await h.call({ mode: "tick" })).json();
  assert.equal(first.push.status, "sent"); assert.equal(first.email.status, "needs_verified_free_email_budget");
  assert.equal(h.emails.length, 0); assert.equal(h.pushes.length, 2);
  h.quota(true);
  assert.equal((await (await h.call({ mode: "tick" })).json()).email.status, "sent");
  assert.equal(h.emails.length, 1); assert.equal(h.pushes.length, 2);
});

test("an unarmed production schedule never prepares an audience", async () => {
  const h = harness(2);
  assert.equal((await (await h.call({ mode: "tick" })).json()).status, "not_armed");
  assert.equal(h.requests.length, 0); assert.equal(h.emails.length, 0);
});

test("expired push subscriptions are skipped without blocking email; uncertain rejection still pauses", async () => {
  for (const code of [404, 410, 503]) {
    const h = harness(2, true); h.arm(); h.pushFailure(code);
    const result = await (await h.call({ mode: "tick" })).json();
    if (code === 503) {
      assert.equal(result.push.status, "needs_review"); assert.equal(h.emails.length, 0); assert.equal(h.state().phase, "paused");
    } else {
      assert.equal(result.push.status, "skipped"); assert.equal(result.email.status, "sent"); assert.equal(h.emails.length, 1); assert.equal(h.state().phase, "complete");
    }
  }
});
