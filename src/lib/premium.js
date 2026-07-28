// ---------------------------------------------------------------------------
// SINGLE SOURCE OF TRUTH for all premium gating.
//
// Flip ENFORCE_PREMIUM to true at launch to lock every premium feature. Nothing
// else needs to change: while it's false, every gate below reports
// "allowed / unlimited", so the whole app stays open exactly as it is today.
//
// Wiring contract used across the app:
//   canUse(featureKey, sub)   -> boolean   (feature gates)
//   courseLimit(sub)          -> number    (Infinity = unlimited)
//   canUseTheme(themeId, sub) -> boolean   (theme gates)
// `sub` is the user's subscription row (plan, status, trial_ends_at, expires_at),
// read once near the top of the app and passed in. `null`/loading is treated as
// "no active subscription" by the helpers — callers decide what to show while
// the row is still loading.
// ---------------------------------------------------------------------------

// The launch switch. Keep false until payments go live.
export const ENFORCE_PREMIUM = false;

// Duration-based plans (months) — the values shown in the Go Premium card.
// Kept here so pricing and gating never drift apart.
export const PLANS = [
  { id: "4", months: 4, priceSar: 20, labelKey: "planDur4", priceKey: "planPrice4", perMonthKey: "planPerMo4" },
  { id: "6", months: 6, priceSar: 25, labelKey: "planDur6", priceKey: "planPrice6", perMonthKey: "planPerMo6", tagKey: "betterValue" },
  { id: "12", months: 12, priceSar: 40, labelKey: "planDur12", priceKey: "planPrice12", perMonthKey: "planPerMo12", tagKey: "bestValue" },
];
export const DEFAULT_PLAN_ID = "12";

// Feature catalogue. `tier: "free"` is available to everyone; `tier: "premium"`
// requires an active subscription (once ENFORCE_PREMIUM is on). `labelKey` is the
// i18n key used by the marketing card so the list and the gates share one source.
export const FEATURES = {
  unlimitedCourses: { tier: "premium", labelKey: "premiumBenefit1" },
  planner: { tier: "premium", labelKey: "premiumBenefit2" },
  finalNeeded: { tier: "premium", labelKey: "premiumBenefit4" },
  havi: { tier: "premium", labelKey: "premiumBenefit5" },
  semesterHistory: { tier: "premium" },
  // Free for everyone — never gated. Listed so its tier is explicit and can't
  // accidentally be marketed as premium.
  gpaCumulative: { tier: "free" },
};

// Which features the Go Premium card advertises, in order. Reads FEATURES for
// labels so marketing and gating can never drift.
export const PREMIUM_LIST = ["unlimitedCourses", "planner", "finalNeeded", "havi"];

// Free-tier limits.
export const FREE_COURSE_LIMIT = 3;
// Free themes map to the app's two always-free theme ids ("original" default +
// "dark"): "haven" is the original/default theme, "midnight" is the dark one.
export const FREE_THEMES = ["haven", "midnight"];

// --- subscription evaluation -----------------------------------------------

/** Does this subscription row grant an ACTIVE paid entitlement right now?
 *  Accepts either snake_case (DB row) or camelCase (db.getSubscription) fields. */
export function isActive(sub) {
  if (!sub) return false;
  const plan = sub.plan;
  if (!plan || plan === "free") return false;
  const status = sub.status;
  const trialEndsAt = sub.trial_ends_at ?? sub.trialEndsAt ?? null;
  const expiresAt = sub.expires_at ?? sub.expiresAt ?? null;
  const inFuture = (d) => !d || new Date(d).getTime() > Date.now();
  if (status === "active") return inFuture(expiresAt);
  if (status === "trialing") return inFuture(trialEndsAt);
  return false;
}

// --- gates ------------------------------------------------------------------
// IMPORTANT: while ENFORCE_PREMIUM is false, every gate is a no-op that reports
// allowed / unlimited, so nothing is locked before launch.

/** Can this subscription use the given feature? */
export function canUse(featureKey, sub) {
  if (!ENFORCE_PREMIUM) return true;
  const feature = FEATURES[featureKey];
  if (!feature) return true; // unknown key -> never block
  if (feature.tier === "free") return true;
  return isActive(sub);
}

/** Max number of courses this subscription may create (Infinity = unlimited). */
export function courseLimit(sub) {
  if (!ENFORCE_PREMIUM) return Infinity;
  return isActive(sub) ? Infinity : FREE_COURSE_LIMIT;
}

/** Can this subscription select the given theme? */
export function canUseTheme(themeId, sub) {
  if (!ENFORCE_PREMIUM) return true;
  if (FREE_THEMES.includes(themeId)) return true;
  return isActive(sub);
}
