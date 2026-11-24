import { supabase } from "./supabase";

export type ReviewKind = "semester" | "cumulative";
export type ReviewSource = "current" | "past";
export type ReviewReason = "hours" | "grade" | "notCounted" | "repeat" | "unknown";
export interface ReviewComparison {
  ours: string;
  portal: string;
}
export type ReviewResults = Partial<Record<ReviewKind, ReviewComparison>>;
export interface ReviewSnapshot {
  source: ReviewSource;
  termId: string;
  label: string;
  scheme: string;
  max: number;
  results: ReviewResults;
  details: Record<string, unknown>;
  reason?: ReviewReason;
  submissionId?: string;
}
export interface ReviewStatus {
  id: string;
  source: ReviewSource;
  termId: string;
  label: string;
  status: "open" | "pending" | "waiting" | "resolved";
  affectedKinds?: ReviewKind[];
  resolution: string | null;
  revision: number;
}
export interface AdminReview extends ReviewStatus {
  email: string;
  scheme: string;
  max: number;
  results: ReviewResults;
  details: Record<string, unknown>;
  reason: ReviewReason;
  createdAt: string;
  contactedAt: string | null;
  classification?: "unknown" | "app" | "inputs" | "program";
  timeline?: Array<{ action: string; at: string; actor: string | null; note: string | null }>;
}

export const REVIEW_CHANGED = "haven:gpa-review-changed";

export const reviewComparison = (ours: number, portal: number): ReviewComparison => ({
  ours: ours.toFixed(2),
  portal: portal.toFixed(2),
});

export async function submitGpaReview(snapshot: ReviewSnapshot, create: boolean, expectedRevision?: number) {
  const { data, error } = await supabase.rpc("save_gpa_review_case", {
    p_snapshot: snapshot,
    p_create: create,
    p_expected_revision: expectedRevision ?? null,
  });
  if (error) throw error;
  const status = data as ReviewStatus | null;
  if (status?.id) window.dispatchEvent(new Event(REVIEW_CHANGED));
  return status;
}

export async function studentGpaReviews() {
  const { data, error } = await supabase.rpc("my_gpa_review_cases");
  if (error) throw error;
  return (data ?? []) as ReviewStatus[];
}

export async function adminGpaReviews(includeCases: boolean) {
  const { data, error } = await supabase.rpc("admin_gpa_review_cases", { p_include_cases: includeCases });
  if (error) throw error;
  return data as { cases: AdminReview[]; newGpa: number; newSupport: number };
}

export type AdminReviewAction = "triage" | "contact" | "resolve" | "note" | "wait" | "reopen";
export async function updateGpaReview(id: string, action: AdminReviewAction, revision: number, evidence?: {
  results?: ReviewResults;
  resolution?: string;
  note?: string;
  classification?: AdminReview["classification"];
}) {
  const { error } = await supabase.rpc("admin_update_gpa_review_case", {
    p_id: id, p_action: action, p_revision: revision, p_evidence: evidence ?? null,
  });
  if (error) throw error;
}
