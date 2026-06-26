import { getSupabaseClient } from "./supabase/client";

export interface FeedbackInput {
  name?: string;
  email?: string;
  message: string;
}

/**
 * Insert a feedback row into Supabase. No auth required — the `feedback` table's
 * RLS policy allows the anonymous role to INSERT. Returns a simple result so the
 * UI can show inline success / error states.
 */
export async function submitFeedback(input: FeedbackInput): Promise<{ ok: boolean; error?: string }> {
  const message = input.message.trim();
  if (!message) return { ok: false, error: "empty" };

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("feedback").insert({
    name: input.name?.trim() || null,
    email: input.email?.trim() || null,
    message,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
