import type { PriorGpaReviewReason } from "./gpaSystem";

type Log = (event: string, meta: Record<string, unknown>) => unknown;
type ReviewMeta = { reason: PriorGpaReviewReason; scheme: string; max: number };

/** One store-owned tracker serves all cards. The migration also dedupes across reloads/devices. */
export function createGpaReviewTracker(log: Log) {
  const shown = new Set<string>(), completed = new Set<string>();
  const emit = (event: string, meta: Record<string, unknown>) => {
    try { void Promise.resolve(log(event, meta)).catch(() => {}); } catch { /* Tracking never blocks review. */ }
  };
  return {
    hasShown(user: string, key: string) { return shown.has(`${user}|${key}`); },
    shown(user: string, key: string, meta: ReviewMeta) {
      const token = `${user}|${key}`;
      if (shown.has(token)) return;
      shown.add(token);
      emit("gpa_prior_review_shown", { ...meta, review_key: key });
    },
    completed(user: string, key: string, edited: boolean, meta: Omit<ReviewMeta, "reason">) {
      const token = `${user}|${key}`;
      if (completed.has(token)) return;
      completed.add(token);
      emit(edited ? "gpa_prior_edited" : "gpa_prior_confirmed", { ...meta, review_key: key });
    },
  };
}
