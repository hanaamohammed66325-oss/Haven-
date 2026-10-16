export const GROWTH_VIEWS = ["referrals", "referral_members", "groups", "group_members", "sources"] as const;
export type GrowthView = typeof GROWTH_VIEWS[number];
export type GrowthMetric = { yes: number; total: number; unknown: number };
export type GrowthActivity = { weeks_active: number; weeks_observed: number; days: number; last_active: string | null; features: string[]; complete: boolean };
export type GrowthCursor = { id: string; rank: number; pending: number; at: string | null };
export type GrowthRewards = { earned: number; available: number; earned_thresholds: number[]; reward_vip: boolean; outfits: string[]; companions: string[]; theme: string | null; badge: string | null };
export type GrowthRow = {
  id: string; title: string | null; user_id: string | null; created_at: string | null; entry_at: string | null; last_at: string | null; joined_at?: string | null;
  counted: number; pending: number; incomplete: number; members: number; rounds: number; minutes: number; acquired: number; overlap: number; review_flags: number;
  week2: GrowthMetric; week4: GrowthMetric; repeat: GrowthMetric; activity: GrowthActivity | null; reasons: string[];
  rewards?: GrowthRewards | null;
};
export type GrowthPage = {
  account_id: string; view: GrowthView; target: string | null; as_of: string; tracking_started_at: string; tracking_enabled: boolean; program_enabled: boolean;
  survey_totals: { friend: number; social: number; skipped: number };
  summary: { owners: number; counted: number; pending: number; incomplete: number; groups: number };
  baseline: { week2: GrowthMetric; week4: GrowthMetric; repeat: GrowthMetric }; rows: GrowthRow[]; next_cursor: GrowthCursor | null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1e9;
export const date = (v: unknown): v is string => typeof v === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const optionalDate = (v: unknown) => v === null || date(v);
const optionalId = (v: unknown) => v === null || typeof v === "string" && UUID.test(v);
export const metric = (v: unknown): v is GrowthMetric => record(v) && count(v.yes) && count(v.total) && count(v.unknown) && v.yes <= v.total;
const features = ["courses", "grades", "planner", "pomodoro", "group", "check_in"];
const reasons = ["same_mailbox", "reciprocal", "signup_burst"];
export function parseGrowthPage(raw: unknown, accountId: string, view: GrowthView, target: string | null): GrowthPage | null {
  if (!record(raw) || raw.account_id !== accountId || raw.view !== view || raw.target !== target || !date(raw.as_of) || !date(raw.tracking_started_at) || typeof raw.program_enabled !== "boolean" || typeof raw.tracking_enabled !== "boolean") return null;
  if (!record(raw.survey_totals) || !["friend", "social", "skipped"].every(k => count((raw.survey_totals as Record<string, unknown>)[k]))) return null;
  if (!record(raw.summary) || !["owners", "counted", "pending", "incomplete", "groups"].every(k => count((raw.summary as Record<string, unknown>)[k]))) return null;
  if (!record(raw.baseline) || !["week2", "week4", "repeat"].every(k => metric((raw.baseline as Record<string, unknown>)[k]))) return null;
  if (!Array.isArray(raw.rows) || raw.rows.length > 50) return null;
  const ids = new Set<string>();
  for (const row of raw.rows) {
    if (!record(row) || typeof row.id !== "string" || !(UUID.test(row.id) || view === "sources" && /^\d{4}-\d{2}-\d{2}$/.test(row.id)) || ids.has(row.id)) return null;
    ids.add(row.id);
    if (row.rewards !== undefined && row.rewards !== null) {
      const r = row.rewards;
      if (!record(r) || !count(r.earned) || !count(r.available) || r.earned > r.available || r.available > 30 || typeof r.reward_vip !== "boolean") return null;
      if (!Array.isArray(r.earned_thresholds) || new Set(r.earned_thresholds).size !== r.earned_thresholds.length || !r.earned_thresholds.every(n => [1,2,4,6,8,10].includes(n))) return null;
      if (!Array.isArray(r.outfits) || r.outfits.length > 10 || new Set(r.outfits).size !== r.outfits.length || !r.outfits.every(id => typeof id === "string" && ["king","crown","gradcap","glasses","beanie","flower","headphones","scarf","bowtie"].includes(id))) return null;
      if (!Array.isArray(r.companions) || r.companions.length > 2 || new Set(r.companions).size !== r.companions.length || !r.companions.every(id => id === "fox" || id === "tiger")) return null;
      if (!(r.theme === null || ["aurora","coral","ambassador"].includes(String(r.theme))) || !(r.badge === null || ["first","bronze","silver","gold","diamond"].includes(String(r.badge)))) return null;
    }
    if ("joined_at" in row && !optionalDate(row.joined_at)) return null;
    if (!(row.title === null || typeof row.title === "string" && [...row.title].length <= 120) || !optionalId(row.user_id) || !["created_at", "entry_at", "last_at"].every(k => optionalDate(row[k]))) return null;
    if (!["counted", "pending", "incomplete", "members", "rounds", "minutes", "acquired", "overlap", "review_flags"].every(k => count(row[k])) || !["week2", "week4", "repeat"].every(k => metric(row[k]))) return null;
    if (!Array.isArray(row.reasons) || row.reasons.length > 3 || new Set(row.reasons).size !== row.reasons.length || !row.reasons.every(r => reasons.includes(r))) return null;
    if (row.activity !== null) {
      const a = row.activity;
      if (!record(a) || !count(a.weeks_active) || !count(a.weeks_observed) || a.weeks_active > a.weeks_observed || a.weeks_observed > 4 || !count(a.days) || a.days > 29 || !optionalDate(a.last_active) || typeof a.complete !== "boolean") return null;
      if (!Array.isArray(a.features) || a.features.length > features.length || new Set(a.features).size !== a.features.length || !a.features.every(f => features.includes(f))) return null;
    }
  }
  const cursor = raw.next_cursor;
  if (cursor !== null && (!record(cursor) || typeof cursor.id !== "string" || !(UUID.test(cursor.id) || view === "sources" && /^\d{4}-\d{2}-\d{2}$/.test(cursor.id)) || !count(cursor.rank) || !count(cursor.pending) || !optionalDate(cursor.at))) return null;
  return raw as unknown as GrowthPage;
}
/** Descriptive peer comparison; colors never change rewards or claim causality. */
export function wilson(yes: number, total: number): [number, number] {
  if (!count(yes) || !count(total) || !total || yes > total) return [0, 1];
  const z = 1.959963984540054, p = yes / total, scale = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / scale;
  const width = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / scale;
  return [yes === 0 ? 0 : Math.max(0, center - width), yes === total ? 1 : Math.min(1, center + width)];
}
export function growthStatus(value: GrowthMetric, pooled: GrowthMetric): "good" | "watch" | "low" | "neutral" {
  const peers = { yes: pooled.yes - value.yes, total: pooled.total - value.total };
  if (value.unknown || value.total < 10 || peers.total < 10 || peers.yes < 0 || peers.yes > peers.total) return "neutral";
  const [lo, hi] = wilson(value.yes, value.total), [peerLo, peerHi] = wilson(peers.yes, peers.total);
  if (lo > peerHi) return "good";
  if (hi < peerLo) return "low";
  return value.yes / value.total < peers.yes / peers.total ? "watch" : "neutral";
}
/** Reference boundary model for elapsed cohorts; server has the same windows. */
export function growthOpportunity(entryAt: string, actionTimes: string[], asOf: string, coverageStart: string) {
  const start = Date.parse(entryAt), end = Date.parse(asOf), covered = Date.parse(coverageStart), day = 86400000;
  if (![start, end, covered].every(Number.isFinite) || end < start) throw new Error("Invalid observation interval");
  const times = actionTimes.map(Date.parse).filter(t => Number.isFinite(t) && t >= start && t <= end && t < start + 28 * day);
  const complete = start >= covered, weeks = Math.min(4, Math.floor((end - start) / (7 * day)));
  const active = Array.from({ length: weeks }, (_, i) => times.some(t => t >= start + i * 7 * day && t < start + (i + 1) * 7 * day)).filter(Boolean).length;
  const window = (from: number, until: number): GrowthMetric => end < start + until * day ? { yes: 0, total: 0, unknown: 0 } : !complete ? { yes: 0, total: 0, unknown: 1 } : { yes: +times.some(t => t >= start + from * day && t < start + until * day), total: 1, unknown: 0 };
  return { week2: window(7, 14), week4: window(21, 28), weeks_active: active, weeks_observed: weeks, complete };
}
