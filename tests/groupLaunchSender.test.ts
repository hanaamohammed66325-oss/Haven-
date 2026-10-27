import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import ts from "typescript";
import * as launch from "../supabase/functions/_shared/groupLaunch.ts";
import { SESSION_ANNOUNCEMENT } from "../supabase/functions/send-email/sessionAnnouncement.ts";

function loadTemplate(source: string) {
  const exports: Record<string, Function> = {};
  const input = source.slice(0, source.indexOf("serve(async")) + "\nexport { renderTemplate };";
  const compiled = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { exports, require: (name: string) => name.includes("_shared/groupLaunch") ? launch : name.includes("sessionAnnouncement") ? { SESSION_ANNOUNCEMENT } : {} });
  return exports.renderTemplate;
}
test("all existing email templates and variants retain their original rendered content", () => {
  const original = loadTemplate(execFileSync("git", ["show", "HEAD:supabase/functions/send-email/index.ts"], { encoding: "utf8" }));
  const current = loadTemplate(readFileSync(new URL("../supabase/functions/send-email/index.ts", import.meta.url), "utf8"));
  for (const name of ["trial_started", "trial_ending", "payment_receipt", "cancellation", "payment_failed", "password_changed", "email_change_notice", "reengage"]) {
    for (const variant of ["setup", "grades", "back", "notif"]) {
      const data = { variant, plan_label_ar: "خطة", plan_label_en: "Plan", amount_sar: 20, date: "2026-10-27", payment_id: "example", new_email: "example@example.invalid", ip: "127.0.0.1" };
      assert.equal(JSON.stringify(current(name, data)), JSON.stringify(original(name, data)), `${name}/${variant}`);
    }
  }
  assert.equal(JSON.stringify(current("session_announcement_20261016", {})), JSON.stringify(SESSION_ANNOUNCEMENT));
  assert.equal(JSON.stringify(current(launch.GROUP_LAUNCH_TEMPLATE, {})), JSON.stringify(launch.renderGroupLaunchEmail()));
});

function loadSender(quotaOk = true) {
  const source = readFileSync(new URL("../supabase/functions/send-email/index.ts", import.meta.url), "utf8");
  let handler: (req: Request) => Promise<Response>;
  const requests: { headers: Record<string, string>; body: string }[] = [];
  let records = 0;
  const query: Record<string, unknown> = {};
  for (const name of ["select", "eq"]) query[name] = () => query;
  query.maybeSingle = async () => ({ data: null, error: null });
  query.insert = async () => { records++; return { error: null }; };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Request, Response, AbortSignal, Deno: { env: { get: (key: string) => key === "SCHEDULER_SECRET" ? "local-test-only" : "test-value" } },
    require(name: string) {
      if (name.includes("_shared/groupLaunch")) return launch;
      if (name.includes("sessionAnnouncement")) return { SESSION_ANNOUNCEMENT };
      if (name.includes("http/server")) return { serve: (fn: typeof handler) => { handler = fn; } };
      if (name.includes("supabase-js")) return { createClient: () => ({ from: () => query }) };
      throw Error(name);
    },
    fetch: async (url: string, options: { headers: Record<string, string>; body: string }) => {
      requests.push(options);
      if (url.endsWith("/usage")) return new Response(JSON.stringify(quotaOk ? { emails: { daily: { used: 5, limit: 100 }, monthly: { used: 25, limit: 3000 } }, contacts: { used: 10 } } : { error: "private provider error" }), { status: quotaOk ? 200 : 403 });
      return new Response(JSON.stringify({ id: "provider-accepted" }), { status: 200 });
    },
  });
  return { call: (payload: object, auth = "local-test-only") => handler(new Request("https://example.invalid", { method: "POST", headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) })), requests, records: () => records };
}

test("authenticated usage lookup reads quota without sending email or writing history", async () => {
  const h = loadSender();
  assert.equal((await h.call({ mode: "usage" }, "wrong")).status, 401);
  assert.equal(h.requests.length, 0);
  const response = await h.call({ mode: "usage" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.usage.emails.daily.limit, 100);
  assert.equal(body.usage.contacts, undefined);
  assert.equal(h.records(), 0);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].body, undefined);
  assert.equal((await loadSender(false).call({ mode: "usage" })).status, 503);
});
test("launch sender requires authentication and a fixed campaign dedup key", async () => {
  const h = loadSender();
  const payload = { to: "example@example.invalid", template: launch.GROUP_LAUNCH_TEMPLATE };
  assert.equal((await h.call(payload, "wrong")).status, 401);
  assert.equal((await h.call(payload)).status, 400);
  assert.equal(h.requests.length, 0);
});
test("launch email uses provider idempotency plus durable history; older email keeps its plaintext", async () => {
  const h = loadSender();
  const uid = "00000000-0000-4000-8000-000000000001";
  const response = await h.call({ to: "example@example.invalid", template: launch.GROUP_LAUNCH_TEMPLATE, user_id: uid, dedup_key: launch.GROUP_LAUNCH_ID });
  assert.equal(response.status, 200);
  assert.equal(h.requests[0].headers["Idempotency-Key"], `${launch.GROUP_LAUNCH_ID}/${uid}`);
  assert.match(JSON.parse(h.requests[0].body).text, /والكثير قادم قريبًا/);
  assert.equal(h.records(), 1);
  await h.call({ to: "example@example.invalid", template: "session_announcement_20261016" });
  assert.equal(JSON.parse(h.requests[1].body).text, SESSION_ANNOUNCEMENT.text);
  assert.equal(h.requests[1].headers["Idempotency-Key"], undefined);
});
