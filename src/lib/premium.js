// ---------------------------------------------------------------------------
// SINGLE SOURCE OF TRUTH for all premium gating.
//
// Access is granted only via the VIP flag, an active trial, or an active paid
// subscription. All predicates take (profile, subscription):
//   • profile      — the user's profiles row (needs `is_vip`); null when logged out.
//   • subscription — the user's subscriptions row (snake_case fields); null when none.
// If ENFORCE_PREMIUM is false every predicate reports "allowed / unlimited", so
// the whole app stays open.
// ---------------------------------------------------------------------------

// Enforce premium — set to true. Access is granted only via VIP flag, trial, or active subscription.
export const ENFORCE_PREMIUM = true;

// VIP access is checked server-side via profiles.is_vip (set by DB trigger).
// No email list in the client bundle for security.

// Free-tier limits
export const FREE_COURSE_LIMIT = 3;
export const FREE_THEMES = ['haven', 'midnight'];

// --- marketing / pricing catalogue -----------------------------------------
// Not gating logic — the values the Go Premium card renders. Kept here so
// pricing and gating live in one file and can't drift apart.
// `cycle` is the billing-cycle slug the create-subscription Edge Function expects
// ('4months' | '6months' | 'yearly') — the canonical id used in /checkout query
// params and the subscription API. `id` stays the short marketing id.
export const PLANS = [
  { id: "4", months: 4, priceSar: 20, cycle: "4months", labelKey: "planDur4", priceKey: "planPrice4", perMonthKey: "planPerMo4" },
  { id: "6", months: 6, priceSar: 25, cycle: "6months", labelKey: "planDur6", priceKey: "planPrice6", perMonthKey: "planPerMo6", tagKey: "betterValue" },
  { id: "12", months: 12, priceSar: 40, cycle: "yearly", labelKey: "planDur12", priceKey: "planPrice12", perMonthKey: "planPerMo12", tagKey: "bestValue" },
];
export const DEFAULT_PLAN_ID = "12";
// The billing cycle used when /checkout is opened without a valid ?plan= param.
export const DEFAULT_PLAN_CYCLE = "6months";

// Feature catalogue used only by the Go Premium marketing card (labels).
export const FEATURES = {
  unlimitedCourses: { tier: "premium", labelKey: "premiumBenefit1" },
  finalNeeded: { tier: "premium", labelKey: "premiumBenefit4" },
  havi: { tier: "premium", labelKey: "premiumBenefit5" },
  semesterHistory: { tier: "premium" },
  gpaCumulative: { tier: "free" },
};
export const PREMIUM_LIST = ["unlimitedCourses", "finalNeeded", "havi"];

// Access predicates. All take (profile, subscription) where profile can be null (logged out).
// If ENFORCE_PREMIUM is false these all return true.

export function isVip(profile) {
  return Boolean(profile?.is_vip);
}

export function isBetaTester(profile) {
  return Boolean(profile?.is_beta);
}

export function isInTrial(subscription) {
  if (!subscription) return false;
  if (subscription.status !== 'trial') return false;
  const end = subscription.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
  return end !== null && end > new Date();
}

export function isActiveSubscriber(subscription) {
  if (!subscription) return false;
  // 'active' or 'cancelled-but-still-in-paid-period' both grant access until expires_at.
  if (subscription.status !== 'active' && subscription.status !== 'cancelled') return false;
  const end = subscription.expires_at ? new Date(subscription.expires_at) : null;
  return end !== null && end > new Date();
}

export function hasActiveAccess(profile, subscription) {
  if (!ENFORCE_PREMIUM) return true;
  return isVip(profile) || isBetaTester(profile) || isInTrial(subscription) || isActiveSubscriber(subscription);
}

export function daysUntilTrialEnds(subscription) {
  if (!isInTrial(subscription)) return null;
  const end = new Date(subscription.trial_ends_at);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function canAddCourse(profile, subscription, currentCourseCount) {
  if (hasActiveAccess(profile, subscription)) return true;
  return currentCourseCount < FREE_COURSE_LIMIT;
}

export function canUseTheme(profile, subscription, themeId) {
  if (hasActiveAccess(profile, subscription)) return true;
  return FREE_THEMES.includes(themeId);
}

// Havi is fully behind premium.
export function canUseHavi(profile, subscription) {
  return hasActiveAccess(profile, subscription);
}
