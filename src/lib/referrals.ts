export type DiscoverySource = "friend" | "social";
import { AMBASSADOR_RUNGS } from "./ambassadorRewards";

export type ReferralStatus = "none" | "pending" | "active" | "expired" | "owner_removed";
export type ReferralProfile = {
  accountId: string;
  available: boolean;
  code: string | null;
  eligible: boolean;
  source: DiscoverySource | null;
  answered: boolean;
  claimedCode: string | null;
  status: ReferralStatus;
  activatedCount: number;
  earnedXp: number;
  rewardVip?: boolean;
  unlockedThresholds: readonly number[];
  pendingCount: number;
  expiredCount: number;
};
export type ReferralInput = { source?: DiscoverySource | null; code?: string; skip?: boolean };
export type ReferralError = "source_required" | "invalid_code" | "own_code" | "already_claimed" | "not_eligible" | "rate_limited" | "source_locked" | "unavailable" | "network" | "account_changed";
export type ReferralResult = { ok: true; profile: ReferralProfile } | { ok: false; error: ReferralError };
export type ReferralApi = { load: (accountId: string) => Promise<unknown>; submit: (input: ReferralInput, accountId: string) => Promise<unknown> };

export function normalizeReferralCode(value: string) {
  return value.trim().toUpperCase().replace(/[٠-٩]/g, n => String(n.charCodeAt(0) - 0x660)).replace(/\s/g, "");
}
export function validReferralCode(value: string) { return /^HVN-[A-F0-9]{10}$/.test(normalizeReferralCode(value)); }

export function parseReferralProfile(raw: unknown, accountId: string): ReferralProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (v.account_id !== accountId || typeof v.available !== "boolean" || typeof v.eligible !== "boolean" || typeof v.answered !== "boolean") return null;
  if (v.source !== null && v.source !== "friend" && v.source !== "social") return null;
  if (!["none", "pending", "active", "expired", "owner_removed"].includes(String(v.status))) return null;
  if (!Number.isSafeInteger(v.activated_count) || Number(v.activated_count) < 0 || !Number.isSafeInteger(v.earned_xp) || Number(v.earned_xp) < 0) return null;
  if (v.code !== null && (typeof v.code !== "string" || !validReferralCode(v.code))) return null;
  if (v.claimed_code !== null && (typeof v.claimed_code !== "string" || !validReferralCode(v.claimed_code))) return null;
  if (v.available && !v.code) return null;
  if (![v.pending_count, v.expired_count].every(n => Number.isSafeInteger(n) && Number(n) >= 0)) return null;
  if (!Array.isArray(v.unlocked_thresholds) || new Set(v.unlocked_thresholds).size !== v.unlocked_thresholds.length) return null;
  // Before supporting revocation, define earned milestone/XP semantics and revise this contract.
  const earned = AMBASSADOR_RUNGS.filter(r => r.count <= Number(v.activated_count));
  if (v.reward_vip !== undefined && typeof v.reward_vip !== "boolean") return null;
  // Manual cosmetic grants never fabricate counted referrals or earned XP.
  const unlocked = v.reward_vip === true ? AMBASSADOR_RUNGS : earned;
  if (v.unlocked_thresholds.length !== unlocked.length || !unlocked.every(r => (v.unlocked_thresholds as unknown[]).includes(r.count))) return null;
  if (v.earned_xp !== earned.reduce((xp, r) => xp + (r.xp || 0), 0)) return null;
  return { accountId, available: v.available, code: v.code as string | null, eligible: v.eligible, source: v.source as DiscoverySource | null, answered: v.answered, claimedCode: v.claimed_code as string | null, status: v.status as ReferralStatus, activatedCount: Number(v.activated_count), earnedXp: Number(v.earned_xp), rewardVip: v.reward_vip === true, unlockedThresholds: Object.freeze(unlocked.map(r => r.count)), pendingCount: Number(v.pending_count), expiredCount: Number(v.expired_count) };
}

const ERRORS: ReferralError[] = ["invalid_code", "own_code", "already_claimed", "not_eligible", "rate_limited", "source_locked", "source_required", "unavailable"];
export type ReferralSnapshot = { phase: "idle" | "loading" | "ready" | "unavailable" | "error"; profile: ReferralProfile | null; busy: boolean };
export type ReferralProgram = ReferralSnapshot & { controller?: ReturnType<typeof createReferralController>; accountId: string | null };
export const EMPTY_REFERRAL_PROGRAM: ReferralProgram = { phase: "unavailable", profile: null, busy: false, accountId: null };

/** One account's request ownership; UI subscriptions never mix accounts. */
export function createReferralController(accountId: string, api: ReferralApi) {
  let snapshot: ReferralSnapshot = { phase: "idle", profile: null, busy: false }, loadPromise: Promise<void> | null = null, disposed = false, revision = 0;
  let lastRequestAt = Number.NEGATIVE_INFINITY;
  const listeners = new Set<() => void>();
  const publish = (next: ReferralSnapshot) => { if (disposed) return; snapshot = next; listeners.forEach(fn => fn()); };
  const accept = (raw: unknown) => {
    const profile = parseReferralProfile(raw, accountId);
    if (!profile) return false;
    publish({ phase: profile.available ? "ready" : "unavailable", profile, busy: false }); return true;
  };
  const failedRead = (phase: "error" | "unavailable", accountChanged = false) => {
    publish(snapshot.profile && !accountChanged ? { ...snapshot, busy: false } : { phase, profile: null, busy: false });
  };
  const load = () => {
    if (disposed || snapshot.busy) return Promise.resolve();
    if (loadPromise) return loadPromise;
    const request = ++revision;
    lastRequestAt = Date.now();
    // A failed background read cannot erase previously validated earned rewards.
    if (!snapshot.profile) publish({ ...snapshot, phase: "loading" });
    loadPromise = api.load(accountId).then(raw => {
      if (request !== revision || accept(raw)) return;
      const changed = !!raw && typeof raw === "object" && "account_id" in raw && raw.account_id !== accountId;
      failedRead("error", changed);
    }).catch(error => {
      if (request === revision) failedRead(error?.code === "PGRST202" || error?.code === "42883" ? "unavailable" : "error", error?.code === "42501");
    }).finally(() => { loadPromise = null; });
    return loadPromise;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    dispose: () => { disposed = true; listeners.clear(); },
    load,
    /** Passive lifecycle events share an account-owned refresh budget. */
    refresh: () => Date.now() - lastRequestAt >= (snapshot.profile ? 5 * 60 * 1000 : 30 * 1000) ? load() : Promise.resolve(),
    async submit(input: ReferralInput): Promise<ReferralResult> {
      if (disposed) return { ok: false, error: "account_changed" };
      if (snapshot.busy) return { ok: false, error: "network" };
      const code = normalizeReferralCode(input.code || "");
      if (!input.skip && input.source !== "friend" && input.source !== "social") return { ok: false, error: "source_required" };
      if (code && !validReferralCode(code)) return { ok: false, error: "invalid_code" };
      if (code && code === snapshot.profile?.code) return { ok: false, error: "own_code" };
      if (!snapshot.profile?.available) return { ok: false, error: "unavailable" };
      revision++;
      lastRequestAt = Date.now();
      publish({ ...snapshot, busy: true });
      try {
        const raw = await api.submit({ source: input.source || null, code, skip: input.skip === true }, accountId);
        if (disposed) return { ok: false, error: "account_changed" };
        if (raw && typeof raw === "object" && "error" in raw) {
          const error = String(raw.error); publish({ ...snapshot, busy: false });
          return { ok: false, error: ERRORS.includes(error as ReferralError) ? error as ReferralError : "network" };
        }
        if (!accept(raw)) { publish({ phase: "error", profile: null, busy: false }); return { ok: false, error: "account_changed" }; }
        return { ok: true, profile: snapshot.profile! };
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "42501") {
          publish({ phase: "error", profile: null, busy: false }); return { ok: false, error: "account_changed" };
        }
        publish({ ...snapshot, busy: false }); return { ok: false, error: "network" };
      }
    },
  };
}
