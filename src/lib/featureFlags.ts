// Central launch toggles for features that are built but not yet released.
// Flip a flag to `true` to launch that feature (it becomes reachable and its
// nav entry unlocks). Kept in one place so a launch is a one-line change.

import { ENFORCE_PREMIUM } from "./premium";

/** Pomodoro focus page — live. Set to `false` to hide the page and its nav entry. */
export const POMODORO_ENABLED = true;

/** Notes is available locally and in the separately assembled private build.
 * Public production stays locked until its explicit launch. No opening date. */
export const NOTES_ENABLED = process.env.NODE_ENV === "development";

/**
 * Group study (/study). Off until the whole feature is done (her rule,
 * 2026-10-06); the server also keeps it closed to all but the trial accounts.
 */
export const GROUP_STUDY_ENABLED = process.env.NODE_ENV === "development";

/** Award projection is enabled only for the same local development trial. */
/** Public opening date for group study and referrals, shown while they are closed. */
export const PUBLIC_OPENING_DATE = "2026-10-27";
export function openingDateLabel(lang: "ar" | "en"): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-ca-gregory" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${PUBLIC_OPENING_DATE}T00:00:00Z`));
}
export const GROUP_STUDY_AWARDS_ENABLED = GROUP_STUDY_ENABLED;

/**
 * Attendance calculation suspended (Hanaa, 2026-10-12; ACCURACY_PLAN.md). While
 * true, students see only their raw absence log (lectures, hours, dates): no
 * percentage, remaining allowance, denial status, absence alerts, personal
 * rules or attendance badges. The calculation code stays untouched; set to
 * `false` to bring everything back.
 */
export const ATTENDANCE_CALC_SUSPENDED: boolean = true;

/**
 * Free-launch notice shown atop billing-related policy pages while payments are
 * disabled. Pair with `ENFORCE_PREMIUM` — show only when premium is off.
 */
export const PAYMENT_DISABLED_NOTICE = {
  en: "Payments are not enabled and nothing will be charged at this time — Haven is completely free for now. The subscription and billing terms below apply only if and when paid plans are turned on in the future.",
  ar: "الدفع غير مُفعّل حالياً ولن يُخصم منك أي مبلغ — Haven مجاني بالكامل في الوقت الحالي. البنود المتعلقة بالاشتراك والفوترة أدناه تنطبق فقط عند تفعيل الخطط المدفوعة مستقبلاً.",
};

/** The billing-disabled notice while payments are off, else `undefined`.
 *  Keeps the flag↔notice coupling in one place for policy pages to consume. */
export function paymentDisabledNotice(): typeof PAYMENT_DISABLED_NOTICE | undefined {
  return ENFORCE_PREMIUM ? undefined : PAYMENT_DISABLED_NOTICE;
}
