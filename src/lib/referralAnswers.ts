import { date, record } from "./growth";

export type ReferralAnswerCursor = { id: string; created_at: string };
export type ReferralAnswerRow = {
  id: string;
  email: string | null;
  created_at: string;
  source: "friend" | "social" | null;
  answered_at: string | null;
  code_status: "none" | "pending" | "counted" | "expired" | "owner_removed";
  pilot: boolean;
};
export type ReferralAnswersPage = {
  account_id: string;
  rows: ReferralAnswerRow[];
  next_cursor: ReferralAnswerCursor | null;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = ["none", "pending", "counted", "expired", "owner_removed"];

export function parseReferralAnswersPage(raw: unknown, accountId: string): ReferralAnswersPage | null {
  if (!record(raw) || raw.account_id !== accountId || !Array.isArray(raw.rows) || raw.rows.length > 50) return null;
  const ids = new Set<string>();
  for (const row of raw.rows) {
    if (!record(row) || typeof row.id !== "string" || !uuid.test(row.id) || ids.has(row.id)) return null;
    ids.add(row.id);
    if (!(row.email === null || typeof row.email === "string" && row.email.length <= 320) || !date(row.created_at)) return null;
    if (!(row.source === null || row.source === "friend" || row.source === "social") || !(row.answered_at === null || date(row.answered_at))) return null;
    if (typeof row.code_status !== "string" || !statuses.includes(row.code_status) || typeof row.pilot !== "boolean") return null;
  }
  const cursor = raw.next_cursor;
  if (cursor !== null && (!record(cursor) || typeof cursor.id !== "string" || !uuid.test(cursor.id) || !date(cursor.created_at) || !raw.rows.length)) return null;
  if (cursor && (cursor.id !== raw.rows.at(-1).id || cursor.created_at !== raw.rows.at(-1).created_at)) return null;
  return raw as unknown as ReferralAnswersPage;
}
