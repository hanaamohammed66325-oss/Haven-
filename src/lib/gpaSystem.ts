import type { GpaMode, GpaSystemReference } from "@/types";
import type { GradeScheme } from "./gradeSchemes";
import { validPriorGpa } from "./gpaInputs";

/** Names, source IDs and display ordering do not change grading semantics. */
export function captureGpaSystem(scheme: GradeScheme, reviewId?: string): GpaSystemReference {
  return {
    version: 1,
    ...(reviewId ? { reviewId } : {}),
    max: scheme.max,
    percent: !!scheme.percent,
    bands: scheme.bands.map(({ letter, points, min }) => ({ letter, points, min }))
      .sort((a, b) => a.letter < b.letter ? -1 : a.letter > b.letter ? 1 : 0),
  };
}

export function readGpaSystem(raw: unknown): GpaSystemReference | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 || typeof r.max !== "number" || !Number.isFinite(r.max) || r.max <= 0 ||
      typeof r.percent !== "boolean" || !Array.isArray(r.bands) || r.bands.length < 2 || r.bands.length > 40) return undefined;
  const bands: GpaSystemReference["bands"] = [];
  for (const band of r.bands) {
    if (!band || typeof band !== "object") return undefined;
    const b = band as Record<string, unknown>;
    if (typeof b.letter !== "string" || !b.letter || b.letter.length > 24 ||
        typeof b.points !== "number" || !Number.isFinite(b.points) || b.points < 0 ||
        typeof b.min !== "number" || !Number.isFinite(b.min) || b.min < 0 || b.min > 100) return undefined;
    bands.push({ letter: b.letter, points: b.points, min: b.min });
  }
  return { version: 1, max: r.max, percent: r.percent, bands,
    ...(typeof r.reviewId === "string" && r.reviewId.length <= 80 ? { reviewId: r.reviewId } : {}) };
}

/** Review identity only; compatible with browsers without randomUUID. */
export function gpaReviewId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/** Previous GPA depends on scale and letter points, not learned percent cutoffs. */
function comparisonSystem(scheme: GradeScheme) {
  const { max, percent, bands } = captureGpaSystem(scheme);
  return { max, percent, bands: bands.map(({ letter, points }) => ({ letter, points })) };
}

export function gpaSystemChanged(scheme: GradeScheme, previous?: GpaSystemReference): boolean {
  if (!previous) return false;
  return JSON.stringify(comparisonSystem(scheme)) !== JSON.stringify(comparisonSystem({ ...scheme, ...previous }));
}

/** Shared review reason for notices and calculation validity.
 * A known rule change requires review even if the number still fits the new scale.
 * Zero prior credits never prevent showing the semester's own result. */
export function priorGpaReview(
  gpa: number,
  hours: number,
  scheme: GradeScheme,
  previous?: GpaSystemReference,
): "systemChanged" | "invalid" | null {
  if (hours > 0 && !validPriorGpa(gpa, scheme.max)) return "invalid";
  return gpaSystemChanged(scheme, previous) ? "systemChanged" : null;
}

/** C1: establish a legacy reference only at a real grading-rule transition. */
export function legacyReferenceBeforeChange(
  hours: number, previous: GpaSystemReference | undefined, before: GradeScheme, after: GradeScheme,
): GpaSystemReference | undefined {
  if (previous || !(hours > 0) || !gpaSystemChanged(after, captureGpaSystem(before))) return undefined;
  return captureGpaSystem(before, gpaReviewId());
}

/** A held result may display the original record, but must not imply a calculation. */
export function heldPreviousGpa(
  result: number | null, mode: GpaMode, gpa: number, hours: number, scheme: GradeScheme, previous?: GpaSystemReference,
): number | null {
  return result == null && mode === "cumulative" && hours > 0 && Number.isFinite(gpa) && priorGpaReview(gpa, hours, scheme, previous) === "invalid" ? gpa : null;
}

export type PriorGpaReviewReason = NonNullable<ReturnType<typeof priorGpaReview>> | "requested";

/** Opaque deterministic dedupe key; reference identity separates later repeat transitions. */
export function priorGpaReviewKey(reference: GpaSystemReference | undefined, scheme: GradeScheme, reason: PriorGpaReviewReason, term: string) {
  const value = JSON.stringify([term, reason, reference?.reviewId ?? null,
    reference ? comparisonSystem({ ...scheme, ...reference }) : null, comparisonSystem(scheme)]);
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ value.charCodeAt(i), 0x85ebca6b);
  }
  return `v1:${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}
