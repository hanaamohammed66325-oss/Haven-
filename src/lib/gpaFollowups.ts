import { savedGpaComparison } from "./gpaComparison";

export interface GpaFollowupEvent {
  user_id: string;
  email: string | null;
  event: string;
  at: string;
  meta: Record<string, unknown> | null;
}
export interface GpaFollowupContact {
  user_id: string;
  email: string | null;
  grp: "G2" | "G3";
  reason: string;
  contacted_at: string;
  channel: "push" | "email";
  note: string;
  closed_at: string | null;
}
export interface GpaFollowupData {
  contacts: GpaFollowupContact[];
  reviews: GpaFollowupEvent[];
  checks: GpaFollowupEvent[];
}
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const string = (value: unknown) => typeof value === "string" ? value : null;
const time = (value: string) => Date.parse(value) || 0;
const checks = new Set(["term_gpa_match", "term_gpa_mismatch", "past_term_checked", "term_cum_checked"]);
const completed = (event: GpaFollowupEvent) => event.event === "gpa_prior_confirmed" || event.event === "gpa_prior_edited";

/** Reinterpret saved comparisons at current precision, without altering historical events. */
export function followupComparison(event: GpaFollowupEvent) {
  const m = event.meta ?? {}, cumulative = event.event === "term_cum_checked";
  const nested = m.cum && typeof m.cum === "object" ? m.cum as Record<string, unknown> : null;
  const reported = event.event === "term_gpa_match" ? "match" : event.event === "term_gpa_mismatch" ? "mismatch" : string(m.result);
  const main = savedGpaComparison(number(m.ours), number(m.portal), cumulative ? string(m.comparison) : null, reported);
  const cumReported = nested ? string(nested.result) : string(m.cum_result);
  const cum = event.event === "past_term_checked"
    ? savedGpaComparison(number(nested?.ours), number(nested?.portal), string(nested?.comparison) ?? string(m.cum_comparison), cumReported) : null;
  const normalized = (v: string | null) => v === "rounding" ? "match" : v;
  const wrong = (reported === "match" || reported === "mismatch") && main != null && normalized(main) !== reported ||
    (cumReported === "match" || cumReported === "mismatch") && cum != null && normalized(cum) !== cumReported;
  const mainVerified = number(m.ours) != null && number(m.portal) != null;
  const cumVerified = number(nested?.ours) != null && number(nested?.portal) != null;
  const verifiable = (main == null || mainVerified) && (cum == null || cumVerified) && (mainVerified || cumVerified);
  const results = [main, cum].filter(v => v != null);
  return {
    main, cumulative: cum, oldResultWrong: !!wrong, verifiable,
    resolved: results.length > 0 && results.every(v => v === "match" || v === "rounding"),
  };
}

export function gpaContactFollowups(data: GpaFollowupData) {
  return data.contacts.map(contact => {
    const after = (event: GpaFollowupEvent) => event.user_id === contact.user_id && time(event.at) > time(contact.contacted_at);
    const check = data.checks.filter(e => checks.has(e.event) && after(e)).sort((a, b) => time(b.at) - time(a.at))[0];
    const review = data.reviews.filter(e => completed(e) && after(e)).sort((a, b) => time(b.at) - time(a.at))[0];
    const comparison = check ? followupComparison(check) : null;
    const status = contact.grp === "G3" ? review ? "resolved" : "waiting" : !check ? "waiting" : comparison?.resolved ? "resolved" : "not resolved";
    return { contact, check, review, comparison, status };
  });
}

export function gpaNoticeFollowups(events: GpaFollowupEvent[]) {
  const users = [...new Set(events.filter(e => e.event === "gpa_prior_review_shown").map(e => e.user_id))];
  return users.map(user => {
    const own = events.filter(e => e.user_id === user).sort((a, b) => time(a.at) - time(b.at));
    const shown = own.filter(e => e.event === "gpa_prior_review_shown");
    const latest = shown[shown.length - 1], key = string(latest.meta?.review_key);
    // A unique review key also handles out-of-order best-effort event arrivals.
    const completion = own.filter(e => completed(e) && (key ? e.meta?.review_key === key : time(e.at) >= time(latest.at))).at(-1);
    return { user_id: user, email: latest.email, firstShown: shown[0].at, latestShown: latest.at,
      status: completion ? completion.event === "gpa_prior_edited" ? "edited" : "confirmed" : "not yet", at: completion?.at ?? null };
  });
}
