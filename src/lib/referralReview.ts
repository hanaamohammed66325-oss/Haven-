export const REFERRAL_REVIEW_REASONS = ["same_mailbox", "reciprocal", "signup_burst"] as const;
export type ReferralReviewReason = typeof REFERRAL_REVIEW_REASONS[number];
export type ReferralReviewState = "unreviewed" | "reviewed" | "follow_up";
export type ReferralReviewCursor = { claimed_at: string; id: string };
export type ReferralReviewEvidence = {
  version: number;
  fingerprint: string;
  families: ReferralReviewReason[];
  related_scope_limited: boolean;
  burst_scope_limited: boolean;
  same_mailbox: { matches: { claim_id: string | null; user_id: string }[] } | null;
  reciprocal: { claim_id: string } | null;
  signup_burst: { claim_ids: string[]; from: string; to: string; sample_limited: boolean } | null;
};
export type ReferralReviewRow = {
  id: string; owner_id: string; receiver_id: string | null;
  owner_name: string | null; receiver_name: string | null; claimed_at: string;
  status: "counted" | "pending" | "expired"; active_days: number;
  evidence: ReferralReviewEvidence;
  review_state: ReferralReviewState; review_note: string;
  review_updated_at: string | null; review_current: boolean;
};
export type ReferralReviewPage = { account_id: string; program_enabled: boolean; rows: ReferralReviewRow[]; next_cursor: ReferralReviewCursor | null };
export type ReferralReviewError = "invalid_review" | "review_changed" | "claim_removed" | "evidence_changed";

type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const textWithin = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max * 2 && Array.from(v).length <= max;
const nullableName = (v: unknown): v is string | null => v === null || textWithin(v, 120);
const fingerprint = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{32}$/.test(v);

function parseEvidence(v: unknown): ReferralReviewEvidence | null {
  if (!record(v) || !count(v.version) || v.version < 1 || !fingerprint(v.fingerprint)
    || typeof v.related_scope_limited !== "boolean" || typeof v.burst_scope_limited !== "boolean"
    || !Array.isArray(v.families) || new Set(v.families).size !== v.families.length
    || v.families.some(f => !REFERRAL_REVIEW_REASONS.includes(f as ReferralReviewReason))) return null;
  const families = v.families as unknown[];
  const present = (key: ReferralReviewReason) => families.includes(key);
  if (present("same_mailbox")) {
    if (!record(v.same_mailbox) || !Array.isArray(v.same_mailbox.matches) || !v.same_mailbox.matches.length
      || v.same_mailbox.matches.length > 1000 || v.same_mailbox.matches.some(m => !record(m) || !uuid(m.user_id) || (m.claim_id !== null && !uuid(m.claim_id)))) return null;
  } else if (v.same_mailbox !== null) return null;
  if (present("reciprocal")) {
    if (!record(v.reciprocal) || !uuid(v.reciprocal.claim_id)) return null;
  } else if (v.reciprocal !== null) return null;
  if (present("signup_burst")) {
    if (!record(v.signup_burst) || !Array.isArray(v.signup_burst.claim_ids) || !v.signup_burst.claim_ids.length
      || v.signup_burst.claim_ids.length > 1000 || !v.signup_burst.claim_ids.every(uuid)
      || new Set(v.signup_burst.claim_ids).size !== v.signup_burst.claim_ids.length
      || !date(v.signup_burst.from) || !date(v.signup_burst.to) || Date.parse(v.signup_burst.from) > Date.parse(v.signup_burst.to)
      || typeof v.signup_burst.sample_limited !== "boolean") return null;
  } else if (v.signup_burst !== null) return null;
  return v as ReferralReviewEvidence;
}

export function parseReferralReviewRow(v: unknown): ReferralReviewRow | null {
  if (!record(v) || !uuid(v.id) || !uuid(v.owner_id) || (v.receiver_id !== null && !uuid(v.receiver_id))
    || !nullableName(v.owner_name) || !nullableName(v.receiver_name) || !date(v.claimed_at)
    || !["counted", "pending", "expired"].includes(String(v.status)) || !count(v.active_days)
    || !["unreviewed", "reviewed", "follow_up"].includes(String(v.review_state))
    || !textWithin(v.review_note, 2000) || typeof v.review_current !== "boolean"
    || (v.review_updated_at !== null && !date(v.review_updated_at))) return null;
  const evidence = parseEvidence(v.evidence);
  if (!evidence || (v.review_current && (v.review_state === "unreviewed" || v.review_updated_at === null))
    || (!v.review_current && v.review_state !== "unreviewed")) return null;
  return { ...v, evidence } as ReferralReviewRow;
}

export function parseReferralReviewPage(raw: unknown, accountId: string): ReferralReviewPage | null {
  if (!record(raw) || raw.account_id !== accountId || typeof raw.program_enabled !== "boolean"
    || !Array.isArray(raw.rows) || raw.rows.length > 50) return null;
  const rows = raw.rows.map(parseReferralReviewRow);
  if (rows.some(r => !r) || new Set(rows.map(r => r!.id)).size !== rows.length) return null;
  if (raw.next_cursor !== null && (!record(raw.next_cursor) || !uuid(raw.next_cursor.id) || !date(raw.next_cursor.claimed_at)
    || !rows.length || raw.next_cursor.id !== rows.at(-1)!.id || raw.next_cursor.claimed_at !== rows.at(-1)!.claimed_at)) return null;
  return { account_id: accountId, program_enabled: raw.program_enabled, rows: rows as ReferralReviewRow[], next_cursor: raw.next_cursor as ReferralReviewCursor | null };
}

export function parseReferralReviewSave(raw: unknown, accountId: string, claimId: string): { row: ReferralReviewRow } | { error: ReferralReviewError } | null {
  if (!record(raw)) return null;
  if (["invalid_review", "review_changed", "claim_removed", "evidence_changed"].includes(String(raw.error))) return { error: raw.error as ReferralReviewError };
  const row = parseReferralReviewRow(raw.row);
  return raw.account_id === accountId && row?.id === claimId ? { row } : null;
}
