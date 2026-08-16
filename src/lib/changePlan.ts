// Client wrapper for the change-plan Edge Function, which handles BOTH changing
// the plan and reactivating a cancelled subscription. Shared by the /profile
// subscription section and the /premium plan cards so the request + error
// mapping live in one place.

import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase";
import { PLANS } from "./premium";

const CHANGE_PLAN_URL = `${SUPABASE_URL}/functions/v1/change-plan`;

export type PlanCycle = "4months" | "6months" | "yearly";

export type ChangePlanResult =
  | {
      ok: true;
      status: string;
      plan: PlanCycle;
      amount_sar: number;
      next_billing_at: string | null;
      was_cancelled: boolean;
      plan_changed: boolean;
    }
  | { ok: false; code: "NO_SESSION" | "NO_SUBSCRIPTION" | "GENERIC"; error: string };

/** The i18n label key for a billing-cycle slug, or null if unknown. */
export function planLabelKeyFor(cycle: string | null): string | null {
  const p = PLANS.find((x) => x.cycle === cycle);
  return p ? p.labelKey : null;
}

/** Change plan / resubscribe. Never throws — returns a typed result. */
export async function changePlan(plan: PlanCycle): Promise<ChangePlanResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: "NO_SESSION", error: "no session" };

  try {
    const res = await fetch(CHANGE_PLAN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ plan }),
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok || !json?.ok) {
      const code = json?.code === "NO_SUBSCRIPTION" ? "NO_SUBSCRIPTION" : "GENERIC";
      return { ok: false, code, error: String(json?.error ?? "request failed") };
    }
    return {
      ok: true,
      status: String(json.status),
      plan: json.plan as PlanCycle,
      amount_sar: Number(json.amount_sar),
      next_billing_at: json.next_billing_at ? String(json.next_billing_at) : null,
      was_cancelled: Boolean(json.was_cancelled),
      plan_changed: Boolean(json.plan_changed),
    };
  } catch (e) {
    return { ok: false, code: "GENERIC", error: e instanceof Error ? e.message : String(e) };
  }
}
