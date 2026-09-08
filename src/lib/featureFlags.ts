// Central launch toggles for features that are built but not yet released.
// Flip a flag to `true` to launch that feature (it becomes reachable and its
// nav entry unlocks). Kept in one place so a launch is a one-line change.

import { ENFORCE_PREMIUM } from "./premium";

/** Pomodoro is built but held behind a "coming soon" lock for the initial launch. */
export const POMODORO_ENABLED = false;

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
