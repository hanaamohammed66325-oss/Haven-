import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReferralAnswersPage } from "../src/lib/referralAnswers";

const account = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const created = "2026-10-23T11:00:00+00:00";
const row = { id, email: "new@example.com", created_at: created, source: null, answered_at: null, code_status: "none", pilot: false };
const page = (overrides: Record<string, unknown> = {}) => ({ account_id: account, rows: [row], next_cursor: { id, created_at: created }, ...overrides });

test("admin answers contract keeps account identity and pagination bound to returned rows", () => {
  assert.equal(parseReferralAnswersPage(page(), account)?.rows[0].email, "new@example.com");
  assert.equal(parseReferralAnswersPage(page({ account_id: id }), account), null);
  assert.equal(parseReferralAnswersPage(page({ next_cursor: { id: account, created_at: created } }), account), null);
  assert.equal(parseReferralAnswersPage(page({ rows: [] }), account), null);
});

test("admin answers contract distinguishes skipped and unanswered without accepting unknown states", () => {
  assert.equal(parseReferralAnswersPage(page({ rows: [{ ...row, answered_at: created }] }), account)?.rows[0].source, null);
  assert.equal(parseReferralAnswersPage(page({ rows: [{ ...row, source: "friend", code_status: "counted", pilot: true }] }), account)?.rows[0].code_status, "counted");
  for (const bad of [{ ...row, source: "advertisement" }, { ...row, code_status: "approved" }, { ...row, email: { value: "x" } }]) {
    assert.equal(parseReferralAnswersPage(page({ rows: [bad], next_cursor: null }), account), null);
  }
});

test("admin RPC guards private data before reading it and exposes no raw code", () => {
  const sql = readFileSync("supabase/migrations/20261023111357_admin_referral_answers.sql", "utf8");
  assert.ok(sql.indexOf("public.is_admin_current() is distinct from true") < sql.indexOf("from auth.users u"));
  assert.ok(sql.includes("security definer set search_path = ''"));
  assert.ok(sql.includes("revoke all on function public.referral_admin_answers(uuid,timestamptz,uuid,integer) from public, anon, authenticated, service_role"));
  assert.ok(sql.includes("grant execute on function public.referral_admin_answers(uuid,timestamptz,uuid,integer) to authenticated"));
  assert.ok(sql.includes("limit lim + 1"));
  assert.ok(sql.includes("(u.created_at, u.id) < (p_before_created_at, p_before_id)"));
  assert.ok(!sql.includes("'claimed_code',"));
});
