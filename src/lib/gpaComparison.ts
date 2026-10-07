/** Verification uses the same two-decimal precision as the displayed result. */
export type GpaComparison = "match" | "rounding" | "mismatch";
const displayed = (v: number) => Math.round(Number(v.toFixed(2)) * 100);
export function sameDisplayedGpa(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && displayed(a) === displayed(b);
}

/** Preserve explicitly entered trailing decimals; portal prior GPAs default to two. */
export function priorGpaDecimals(raw: string): number {
  return Math.max(2, Math.min(6, (raw.replace(",", ".").split(".")[1] ?? "").length));
}

/** Compatibility with nearest rounding, not proof of a university's rounding policy.
 * The calculator callback retains the caller's repeat adjustments and GPA caps.
 * Upper endpoints are conservatively excluded to avoid accepting a rounding tie
 * that cannot be reached by the supplied prior GPA interval.
 */
export function compareCumulativeGpa(
  ours: number,
  portal: number,
  before: number,
  hours: number,
  max: number,
  calculate: (prior: number) => number | null,
  decimals = 2,
): GpaComparison {
  if (sameDisplayedGpa(ours, portal)) return "match";
  if (![ours, portal, before, hours, max].every(Number.isFinite) || hours <= 0 || decimals < 2 || decimals > 6) return "mismatch";
  const half = 0.5 * 10 ** -decimals;
  const lower = calculate(Math.max(0, before - half));
  // Stay within the half-open prior interval; exact caps remain reachable.
  const upper = calculate(Math.min(max, before + half - 1e-10));
  if (lower == null || upper == null) return "mismatch";
  const target = displayed(portal);
  return target >= displayed(lower) && target <= displayed(upper) ? "rounding" : "mismatch";
}
