import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReferralReviewPage, parseReferralReviewRow, parseReferralReviewSave, type ReferralReviewRow } from "../src/lib/referralReview";

const admin = "00000000-0000-4000-8000-000000000001";
const claim = "00000000-0000-4000-8000-000000000002";
const peer = "00000000-0000-4000-8000-000000000003";
const now = "2026-10-14T12:00:00+00:00";
const fingerprint = "a".repeat(32);
function row(): ReferralReviewRow {
  return { id: claim, owner_id: admin, receiver_id: peer, owner_name: "Sender", receiver_name: "Student", claimed_at: now,
    status: "counted", active_days: 4, review_state: "unreviewed", review_note: "", review_updated_at: null, review_current: false,
    evidence: { version: 1, fingerprint, families: [], related_scope_limited: false, burst_scope_limited: false,
      same_mailbox: null, reciprocal: null, signup_burst: null } };
}
const page = (r: unknown = row()) => ({ account_id: admin, program_enabled: true, rows: [r], next_cursor: null });

test("review page belongs to the expected administrator and carries a bounded cursor", () => {
  const data = page();
  assert.equal(parseReferralReviewPage(data, admin)?.rows[0].status, "counted");
  assert.equal(parseReferralReviewPage(data, peer), null);
  assert.equal(parseReferralReviewPage({ ...data, next_cursor: { id: claim, claimed_at: now } }, admin)?.next_cursor?.id, claim);
  assert.equal(parseReferralReviewPage({ ...data, next_cursor: { id: peer, claimed_at: now } }, admin), null);
  assert.equal(parseReferralReviewPage({ ...data, rows: [], next_cursor: { id: claim, claimed_at: now } }, admin), null);
  assert.equal(parseReferralReviewPage({ ...data, rows: [row(), row()] }, admin), null);
  assert.equal(parseReferralReviewPage({ ...data, rows: Array.from({ length: 51 }, row) }, admin), null);
});

test("independent review families require matching evidence and preserve attribution status", () => {
  const r = row(); r.evidence.families = ["same_mailbox", "reciprocal", "signup_burst"];
  r.evidence.same_mailbox = { matches: [{ user_id: admin, claim_id: null }] };
  r.evidence.reciprocal = { claim_id: peer };
  r.evidence.signup_burst = { claim_ids: [claim, peer], from: now, to: now, sample_limited: false };
  assert.equal(parseReferralReviewRow(r)?.status, "counted");
  assert.equal(parseReferralReviewRow({ ...r, evidence: { ...r.evidence, reciprocal: null } }), null);
  assert.equal(parseReferralReviewRow({ ...r, evidence: { ...r.evidence, families: ["same_mailbox", "same_mailbox"] } }), null);
  assert.equal(parseReferralReviewRow({ ...r, evidence: { ...r.evidence, families: ["confirmed_fraud"] } }), null);
  assert.equal(parseReferralReviewRow({ ...r, evidence: { ...r.evidence, signup_burst: { ...r.evidence.signup_burst, claim_ids: [claim, claim] } } }), null);
});

test("stale evidence may retain an old note but never a current review acknowledgement", () => {
  const r = row(); r.review_note = "Earlier review"; r.review_updated_at = now;
  assert.equal(parseReferralReviewRow(r)?.review_state, "unreviewed");
  assert.equal(parseReferralReviewRow({ ...r, review_state: "reviewed" }), null);
  assert.equal(parseReferralReviewRow({ ...r, review_state: "reviewed", review_current: true })?.review_state, "reviewed");
  assert.equal(parseReferralReviewRow({ ...r, review_state: "follow_up", review_current: true, review_updated_at: null }), null);
  assert.equal(parseReferralReviewRow({ ...r, review_current: true }), null);
});

test("partial inspection and deleted invitees remain explicit without fabricating proof", () => {
  const r = row(); r.receiver_id = null; r.receiver_name = null; r.evidence.related_scope_limited = true; r.evidence.burst_scope_limited = true;
  assert.equal(parseReferralReviewRow(r)?.receiver_id, null);
  assert.equal(parseReferralReviewRow(r)?.evidence.families.length, 0);
  for (const invalid of [{ active_days: -1 }, { claimed_at: "not a date" }, { review_note: "x".repeat(2001) }, { status: "blocked" }, { id: "123" }]) {
    assert.equal(parseReferralReviewRow({ ...r, ...invalid }), null);
  }
  // PostgreSQL character limits count Unicode code points, not UTF-16 units.
  assert.ok(parseReferralReviewRow({ ...r, owner_name: "𐐀".repeat(120), review_note: "𐐀".repeat(2000) }));
  assert.equal(parseReferralReviewRow({ ...r, owner_name: "𐐀".repeat(121) }), null);
});

test("save rejects a different account/claim, while concurrency errors remain retryable", () => {
  const accepted = parseReferralReviewSave({ account_id: admin, row: row() }, admin, claim);
  assert.ok(accepted && "row" in accepted);
  assert.equal(accepted.row.id, claim);
  assert.equal(parseReferralReviewSave({ account_id: peer, row: row() }, admin, claim), null);
  assert.equal(parseReferralReviewSave({ account_id: admin, row: row() }, admin, peer), null);
  assert.deepEqual(parseReferralReviewSave({ error: "evidence_changed" }, admin, claim), { error: "evidence_changed" });
  assert.deepEqual(parseReferralReviewSave({ error: "review_changed" }, admin, claim), { error: "review_changed" });
  assert.equal(parseReferralReviewSave({ error: "blocked" }, admin, claim), null);
});
