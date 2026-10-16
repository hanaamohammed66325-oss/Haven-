import { wilson, record, count, date, metric, type GrowthMetric } from './growth';

export const OUTCOME_KEYS = ['referral_share', 'group_share', 'referral_activation', 'group_activation', 'group_repeat', 'week2', 'week4'] as const;
export type OutcomeKey = typeof OUTCOME_KEYS[number];
export type OutcomeWindow = { start: string; end: string; metrics: Record<OutcomeKey, GrowthMetric> };
export type GrowthOverview = { account_id: string; as_of: string; tracking_enabled: boolean; tracking_started_at: string; trial_accounts: number; current: OutcomeWindow; previous: OutcomeWindow };
export type OutcomeStatus = 'good' | 'watch' | 'low' | 'neutral';
const obj = record;
export const validMetric = metric;
export function metricPercent(m: GrowthMetric): number | null {
  return m.total > 0 ? 100 * m.yes / m.total : null;
}
/** Independent, equally defined observation periods; no invented universal targets. */
export function periodStatus(current: GrowthMetric, previous: GrowthMetric): OutcomeStatus {
  if (current.unknown || previous.unknown || current.total < 10 || previous.total < 10) return 'neutral';
  const [lo, hi] = wilson(current.yes, current.total), [oldLo, oldHi] = wilson(previous.yes, previous.total);
  if (lo > oldHi) return 'good';
  if (hi < oldLo) return 'low';
  return 'watch';
}
export function parseGrowthOverview(raw: unknown, account: string): GrowthOverview | null {
  if (!obj(raw) || raw.account_id !== account || !date(raw.as_of) || !date(raw.tracking_started_at) || typeof raw.tracking_enabled !== 'boolean' || !count(raw.trial_accounts)) return null;
  for (const key of ['current', 'previous']) {
    const w = raw[key];
    if (!obj(w) || !date(w.start) || !date(w.end) || Date.parse(w.start) >= Date.parse(w.end) || !obj(w.metrics) || !OUTCOME_KEYS.every(k => validMetric((w.metrics as Record<string, unknown>)[k]))) return null;
  }
  const current = raw.current as OutcomeWindow, previous = raw.previous as OutcomeWindow;
  if (current.start !== previous.end || current.end !== raw.as_of || Date.parse(current.end) - Date.parse(current.start) !== Date.parse(previous.end) - Date.parse(previous.start)) return null;
  return raw as GrowthOverview;
}

export const ENGAGEMENT_POLICY = { days: 7, actions: 10, streak: 7, windowDays: 28 } as const;
export const USEFUL_FEATURES = ['grades', 'planner', 'pomodoro', 'group'] as const;
export type UsefulFeature = typeof USEFUL_FEATURES[number];
export type UseEvidence = { days: number; actions: number; features: number; deepest_actions: number; deepest_days: number };
/** Observed product use, not satisfaction, learning outcomes or purchase probability. */
export function hasSustainedUse(v: UseEvidence): boolean {
  return Object.values(v).every(count) && v.days >= ENGAGEMENT_POLICY.days && v.actions >= ENGAGEMENT_POLICY.actions &&
    (v.features >= 2 || v.deepest_actions >= ENGAGEMENT_POLICY.actions && v.deepest_days >= ENGAGEMENT_POLICY.days);
}
export type EngagementOverview = {
  account_id: string; as_of: string; window_start: string; total_accounts: number; observed_users: number;
  sustained_users: number; multi_feature_users: number; specialist_users: number; high_streak_users: number;
  excluded_accounts: number; features: { feature: UsefulFeature; users: number; actions: number }[];
};
export function parseEngagementOverview(raw: unknown, account: string): EngagementOverview | null {
  if (!obj(raw) || raw.account_id !== account || !date(raw.as_of) || !date(raw.window_start) || Date.parse(raw.window_start) >= Date.parse(raw.as_of)) return null;
  const keys = ['total_accounts', 'observed_users', 'sustained_users', 'multi_feature_users', 'specialist_users', 'high_streak_users', 'excluded_accounts'];
  if (!keys.every(k => count(raw[k]))) return null;
  const v = raw as unknown as EngagementOverview;
  if (v.observed_users > v.total_accounts || v.sustained_users > v.observed_users || v.multi_feature_users + v.specialist_users !== v.sustained_users || v.high_streak_users > v.total_accounts) return null;
  if (!Array.isArray(v.features) || v.features.length !== USEFUL_FEATURES.length || !v.features.every(f => obj(f) && USEFUL_FEATURES.includes(f.feature) && count(f.users) && f.users <= v.observed_users && count(f.actions) && f.actions >= f.users) || new Set(v.features.map(f => f.feature)).size !== v.features.length) return null;
  return v;
}
