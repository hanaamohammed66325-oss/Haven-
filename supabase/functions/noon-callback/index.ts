// supabase/functions/noon-callback/index.ts
//
// noon's hosted checkout redirects the customer's browser here after payment
// (this is the `returnUrl` set by noon-initiate). We NEVER trust the redirect
// alone: we re-fetch the order from noon server-side, and only on a confirmed
// success do we activate the subscription. Then we 302 the browser back to the
// app. Deploy with verify_jwt = FALSE (the browser arrives without a JWT).
//
// SECRETS: same NOON_* + APP_BASE_URL as noon-initiate.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const PLAN_MONTHS: Record<string, number> = { '4months': 4, '6months': 6, 'yearly': 12 };

function noonBase(): string {
  return (Deno.env.get('NOON_API_BASE') ?? 'https://api-test.sa.noonpayments.com').replace(/\/+$/, '');
}
function noonAuthHeader(): string {
  const mode = Deno.env.get('NOON_KEY_MODE') ?? 'Test';
  const biz = Deno.env.get('NOON_BUSINESS_ID') ?? '';
  const app = Deno.env.get('NOON_APP_NAME') ?? '';
  const key = Deno.env.get('NOON_API_KEY') ?? '';
  return `Key_${mode} ${btoa(`${biz}.${app}:${key}`)}`;
}
function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { Location: to } });
}

serve(async (req) => {
  const appBase = (Deno.env.get('APP_BASE_URL') ?? 'https://havenstudent.com').replace(/\/+$/, '');
  try {
    // noon appends the order id to the returnUrl (GET); some setups POST it.
    const url = new URL(req.url);
    let orderId =
      url.searchParams.get('orderId') ||
      url.searchParams.get('order.id') ||
      url.searchParams.get('id') ||
      '';
    if (!orderId && req.method === 'POST') {
      const form = await req.formData().catch(() => null);
      if (form) orderId = String(form.get('orderId') ?? form.get('order.id') ?? form.get('id') ?? '');
    }
    if (!orderId) return redirect(`${appBase}/premium?payment=error`);

    // ---- Verify the order with noon (source of truth) ----
    const res = await fetch(`${noonBase()}/payment/v1/order/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: noonAuthHeader() },
    });
    const json = await res.json().catch(() => ({}));
    const order = json?.result?.order ?? {};
    const txns = json?.result?.transactions ?? [];
    const orderStatus = String(order.status ?? '').toUpperCase();
    const txnOk = Array.isArray(txns) && txns.some((t: { status?: string }) => String(t?.status ?? '').toUpperCase() === 'SUCCESS');
    const success = txnOk || orderStatus === 'CAPTURED' || orderStatus === 'AUTHORIZED';

    if (!res.ok || !success) {
      console.error('noon verify failed', res.status, orderStatus, JSON.stringify(json).slice(0, 500));
      return redirect(`${appBase}/premium?payment=failed`);
    }

    // ---- Activate the subscription row keyed by the stored noon order id ----
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: sub } = await admin
      .from('subscriptions')
      .select('id, plan, amount_sar')
      .eq('last_payment_id', String(orderId))
      .maybeSingle();
    if (!sub?.id) {
      console.error('noon callback: no subscription for order', orderId);
      return redirect(`${appBase}/premium?payment=error`);
    }

    const months = PLAN_MONTHS[sub.plan] ?? 1;
    const now = new Date();
    const expires = new Date(now);
    expires.setMonth(expires.getMonth() + months);

    await admin.from('subscriptions').update({
      status: 'active',
      last_payment_at: now.toISOString(),
      expires_at: expires.toISOString(),
      next_billing_at: expires.toISOString(),
      updated_at: now.toISOString(),
    }).eq('id', sub.id);

    return redirect(`${appBase}/profile?subscribed=1`);
  } catch (err) {
    console.error('noon callback error', (err as Error).message);
    return redirect(`${appBase}/premium?payment=error`);
  }
});
