import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReferralAnswersPage } from "../src/lib/referralAnswers";

const account = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const created = "2026-10-23T11:00:00+00:00";
const row = { id, email: "new@example.com", created_at: created, source: null, answered_at: null, code_status: "none", pilot: false };
const totals = { total: 1, social: 0, friend: 0, skipped: 0, unanswered: 1, code_entered: 0, pilot_codes: 0, unclassified_codes: 0 };
const page = (overrides: Record<string, unknown> = {}) => ({ account_id: account, totals, rows: [row], next_cursor: { id, created_at: created }, ...overrides });

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

test("new-account counts retain the pilot split and reject inconsistent totals", () => {
  const valid = { total: 4, social: 1, friend: 1, skipped: 1, unanswered: 1, code_entered: 2, pilot_codes: 1, unclassified_codes: 0 };
  assert.deepEqual(parseReferralAnswersPage(page({ totals: valid }), account)?.totals, valid);
  assert.equal(valid.code_entered - valid.pilot_codes, 1);
  for (const bad of [
    { ...valid, social: 2 },
    { ...valid, code_entered: 5 },
    { ...valid, pilot_codes: 3 },
    { ...valid, unclassified_codes: 2 },
    { ...valid, skipped: -1 },
    { ...valid, total: 0 },
  ]) assert.equal(parseReferralAnswersPage(page({ totals: bad }), account), null);
  assert.equal(parseReferralAnswersPage(page({ totals: null }), account), null);
  assert.equal(parseReferralAnswersPage(page({ totals: undefined }), account)?.totals, null);
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

test("totals RPC keeps the list cohort, admin guard, and private-code boundary", () => {
  const sql = readFileSync("supabase/migrations/20261024074603_admin_referral_answer_totals.sql", "utf8");
  assert.ok(sql.indexOf("public.is_admin_current() is distinct from true") < sql.indexOf("from auth.users u"));
  assert.equal(sql.match(/u\.created_at >= tracking_start/g)?.length, 2);
  assert.ok(sql.includes("'skipped', count(*) filter (where m.source is null and m.answered_at is not null)"));
  assert.ok(sql.includes("'unanswered', count(*) filter (where m.source is null and m.answered_at is null)"));
  assert.ok(sql.includes("'code_entered', count(*) filter (where m.claimed_code is not null)"));
  assert.ok(sql.includes("'pilot_codes', count(*) filter (where m.claimed_code is not null and pc.claim_id is not null)"));
  assert.ok(sql.includes("'unclassified_codes', count(*) filter (where m.claimed_code is not null and c.id is null)"));
  assert.ok(sql.includes("'totals', totals"));
  assert.ok(sql.includes("revoke all on function public.referral_admin_answers(uuid,timestamptz,uuid,integer) from public, anon, authenticated, service_role"));
  assert.ok(sql.includes("grant execute on function public.referral_admin_answers(uuid,timestamptz,uuid,integer) to authenticated"));
  assert.ok(!sql.includes("'claimed_code',"));
});
