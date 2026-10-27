import { GROUP_LAUNCH_ID, groupLaunchChannel, type LaunchCandidate, type LaunchChannel } from "../_shared/groupLaunch.ts";

export interface LaunchDelivery { userId: string; channel: LaunchChannel; status: "pending" | "sending" | "sent" | "skipped" | "review"; attemptedAt?: string }
export interface LaunchState {
  id: typeof GROUP_LAUNCH_ID; version: 1; phase: "draft" | "active" | "paused" | "complete";
  cutoff: string; startsAt: string | null; expiresAt: string | null; publicLaunchConfirmed: boolean;
  emailBudget: { date: string; limit: number; used: number } | null;
  deliveries: LaunchDelivery[];
}
export interface LaunchStore {
  read(): Promise<{ revision: string; state: LaunchState } | null>;
  /** Atomic compare-and-set on the existing locked app_config row. */
  replace(expectedRevision: string, next: LaunchState): Promise<string | null>;
}
export function prepareLaunch(candidates: readonly LaunchCandidate[], now: number): LaunchState {
  const deliveries = candidates.flatMap(candidate => {
    const channel = groupLaunchChannel(candidate, now, now);
    return channel ? [{ userId: candidate.id, channel, status: "pending" as const }] : [];
  });
  const unique = new Map(deliveries.map(d => [d.userId, d]));
  return { id: GROUP_LAUNCH_ID, version: 1, phase: "draft", cutoff: new Date(now).toISOString(), startsAt: null, expiresAt: null, publicLaunchConfirmed: false, emailBudget: null,
    deliveries: [...unique.values()].sort((a, b) => a.channel === b.channel ? a.userId.localeCompare(b.userId) : a.channel === "push" ? -1 : 1) };
}
export function launchSummary(state: LaunchState) {
  const counts = { pending: 0, sending: 0, sent: 0, skipped: 0, review: 0, email: 0, push: 0 };
  for (const d of state.deliveries) { counts[d.status]++; counts[d.channel]++; }
  return { id: state.id, phase: state.phase, cutoff: state.cutoff, startsAt: state.startsAt, expiresAt: state.expiresAt, emailBudget: state.emailBudget, ...counts };
}
export function parseLaunchState(raw: string): LaunchState {
  const s = JSON.parse(raw);
  if (s?.id !== GROUP_LAUNCH_ID || s.version !== 1 || !["draft", "active", "paused", "complete"].includes(s.phase)
    || !Number.isFinite(Date.parse(s.cutoff)) || typeof s.publicLaunchConfirmed !== "boolean"
    || ![s.startsAt, s.expiresAt].every(d => d === null || Number.isFinite(Date.parse(d)))
    || !Array.isArray(s.deliveries) || s.deliveries.length > 20_000
    || s.deliveries.some((d: LaunchDelivery) => !/^[0-9a-f-]{36}$/i.test(d?.userId) || !["email", "push"].includes(d.channel) || !["pending", "sending", "sent", "skipped", "review"].includes(d.status))
    || new Set(s.deliveries.map((d: LaunchDelivery) => d.userId)).size !== s.deliveries.length) throw Error("Invalid campaign state");
  const b = s.emailBudget;
  if (b !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !Number.isInteger(b.limit) || b.limit < 1 || b.limit > 90 || !Number.isInteger(b.used) || b.used < 0 || b.used > b.limit)) throw Error("Invalid campaign budget");
  return s as LaunchState;
}

/** One recipient per invocation; no automatic retry after an ambiguous send.
 * Persisting `sending` BEFORE calling a provider also fences parallel workers.
 * An interrupted worker remains visible for operator review, never resends. */
export async function deliverNextLaunch(deps: {
  store: LaunchStore; candidate(userId: string): Promise<LaunchCandidate | null>;
  send(delivery: LaunchDelivery, candidate: LaunchCandidate): Promise<void | "skipped">;
  now: number;
  channel?: LaunchChannel;
}) {
  const found = await deps.store.read();
  if (!found) return { status: "not_prepared" };
  const { revision, state } = found;
  if (state.phase !== "active" || !state.publicLaunchConfirmed) return { status: "disabled" };
  if (!state.startsAt || !state.expiresAt || deps.now < Date.parse(state.startsAt) || deps.now >= Date.parse(state.expiresAt)) return { status: "outside_launch_window" };
  if (state.deliveries.some(d => d.status === "sending" || d.status === "review")) return { status: "needs_review" };
  const index = state.deliveries.findIndex(d => d.status === "pending" && (!deps.channel || d.channel === deps.channel));
  if (index < 0) {
    if (state.deliveries.some(d => d.status === "pending")) return { status: "channel_complete" };
    return { status: await deps.store.replace(revision, { ...state, phase: "complete" }) ? "complete" : "busy" };
  }
  const target = state.deliveries[index];
  const candidate = await deps.candidate(target.userId);
  const next = structuredClone(state);
  if (!candidate || groupLaunchChannel(candidate, deps.now, Date.parse(state.cutoff)) !== target.channel) {
    next.deliveries[index].status = "skipped";
    return { status: await deps.store.replace(revision, next) ? "skipped" : "busy" };
  }
  if (target.channel === "email") {
    if (!next.emailBudget || next.emailBudget.date !== new Date(deps.now).toISOString().slice(0, 10) || next.emailBudget.used >= next.emailBudget.limit) return { status: "needs_verified_free_email_budget" };
    next.emailBudget.used++;
  }
  next.deliveries[index] = { ...target, status: "sending", attemptedAt: new Date(deps.now).toISOString() };
  const claimedRevision = await deps.store.replace(revision, next);
  if (!claimedRevision) return { status: "busy" };
  let sent = false, skipped = false;
  try { skipped = await deps.send(target, candidate) === "skipped"; sent = true; } catch { /* Ambiguous delivery must be reviewed, never blindly retried. */ }
  const finished = structuredClone(next);
  finished.deliveries[index].status = sent ? skipped ? "skipped" : "sent" : "review";
  if (!sent) finished.phase = "paused";
  else if (!finished.deliveries.some(d => d.status === "pending")) finished.phase = "complete";
  if (!await deps.store.replace(claimedRevision, finished)) return { status: "needs_review" };
  return { status: sent ? skipped ? "skipped" : "sent" : "needs_review", ...launchSummary(finished) };
}
