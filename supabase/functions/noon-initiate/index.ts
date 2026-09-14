// supabase/functions/noon-initiate/index.ts
//
// Starts a noon payments hosted-checkout order for a Haven subscription plan.
// Flow: authenticate the caller (JWT) -> validate the plan (+ optional coupon)
// server-side -> write a `pending` subscription row -> create a noon Order
// (apiOperation INITIATE) -> store noon's order id on the row -> return noon's
// hosted payment page URL (result.checkoutData.postUrl). The browser is then
// redirected there; noon-callback verifies the result and activates the row.
//
// SECRETS (set in Supabase → Project Settings → Edge Functions, never in code):
//   NOON_API_BASE     e.g. https://api-test.sa.noonpayments.com   (test)
//                     e.g. https://api.sa.noonpayments.com         (live)
//   NOON_KEY_MODE     "Test" or "Live"  (the Authorization "Key_<mode>" prefix)
//   NOON_BUSINESS_ID  the business identifier from the portal (e.g. "haven")
//   NOON_APP_NAME     the application name/identifier from the portal
//   NOON_API_KEY      the API key for that application
//   APP_BASE_URL      e.g. https://havenstudent.com  (where the user returns)
//
// Card data NEVER touches Haven — the customer enters it on noon's hosted page.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function j(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// Server-side plan catalogue — mirrors src/lib/premium.js so a tampered client
// can't invent a cheaper plan.
const PLANS: Record<string, { months: number; amount_sar: number }> = {
  '4months': { months: 4, amount_sar: 20 },
  '6months': { months: 6, amount_sar: 25 },
  'yearly': { months: 12, amount_sar: 40 },
};

function noonBase(): string {
  return (Deno.env.get('NOON_API_BASE') ?? 'https://api-test.sa.noonpayments.com').replace(/\/+$/, '');
}
// noon auth: base64("<business>.<app>:<apiKey>") with a "Key_Test"/"Key_Live" prefix.
function noonAuthHeader(): string {
  const mode = Deno.env.get('NOON_KEY_MODE') ?? 'Test';
  const biz = Deno.env.get('NOON_BUSINESS_ID') ?? '';
  const app = Deno.env.get('NOON_APP_NAME') ?? '';
  const key = Deno.env.get('NOON_API_KEY') ?? '';
  return `Key_${mode} ${btoa(`${biz}.${app}:${key}`)}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return j({ error: 'method_not_allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    // ---- Authenticate the caller ----
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return j({ error: 'missing_authorization' }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return j({ error: 'invalid_session' }, 401);
    const user = userData.user;

    // ---- Validate the plan ----
    const body = await req.json().catch(() => ({}));
    const planKey = String(body.plan ?? '');
    const planInfo = PLANS[planKey];
    if (!planInfo) return j({ error: 'invalid_plan' }, 400);

    // ---- Optional coupon (mirrors create-subscription) ----
    let discountPercent = 0;
    let couponCode: string | null = null;
    const rawCoupon = body.coupon_code ? String(body.coupon_code).trim() : '';
    if (rawCoupon) {
      const { data: c } = await admin
        .from('coupons')
        .select('code, percent_off, max_uses, uses_count, expires_at, active')
        .ilike('code', rawCoupon)
        .maybeSingle();
      const usable = c && c.active === true &&
        (!c.expires_at || new Date(c.expires_at) > new Date()) &&
        (c.max_uses == null || Number(c.uses_count) < Number(c.max_uses));
      if (usable) { discountPercent = Number(c!.percent_off) || 0; couponCode = c!.code; }
    }
    const amount = Math.round(planInfo.amount_sar * (1 - discountPercent / 100) * 100) / 100;

    // ---- Write / reuse a pending subscription row (one per user) ----
    const now = new Date();
    const { data: existing } = await admin
      .from('subscriptions').select('id').eq('user_id', user.id)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();

    const pending = {
      user_id: user.id,
      plan: planKey,
      billing_cycle: planKey,
      status: 'pending',
      amount_sar: amount,
      coupon_code: couponCode,
      discount_percent: discountPercent || null,
      updated_at: now.toISOString(),
    };
    let subId: string;
    if (existing?.id) {
      const { data, error } = await admin.from('subscriptions').update(pending).eq('id', existing.id).select('id').single();
      if (error) return j({ error: error.message }, 500);
      subId = data.id;
    } else {
      const { data, error } = await admin.from('subscriptions').insert({ ...pending, created_at: now.toISOString() }).select('id').single();
      if (error) return j({ error: error.message }, 500);
      subId = data.id;
    }

    // ---- Create the noon Order ----
    const appBase = (Deno.env.get('APP_BASE_URL') ?? 'https://havenstudent.com').replace(/\/+$/, '');
    // Return to our own callback (server-side verify), which then redirects to the app.
    const returnUrl = `${supabaseUrl}/functions/v1/noon-callback`;
    const payload = {
      apiOperation: 'INITIATE',
      order: {
        amount,
        currency: 'SAR',
        category: 'pay',
        reference: subId, // our subscription row id, echoed back by noon
        name: `Haven ${planKey}`,
      },
      configuration: {
        returnUrl,
        locale: 'ar',
        paymentAction: 'Sale',
      },
    };

    const res = await fetch(`${noonBase()}/payment/v1/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: noonAuthHeader() },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    const postUrl = json?.result?.checkoutData?.postUrl;
    const orderId = json?.result?.order?.id;
    if (!res.ok || !postUrl || !orderId) {
      console.error('noon initiate failed', res.status, JSON.stringify(json));
      return j({ error: 'noon_initiate_failed', detail: json?.message ?? null }, 502);
    }

    // Correlate the noon order back to this row for noon-callback.
    await admin.from('subscriptions').update({ last_payment_id: String(orderId), updated_at: new Date().toISOString() }).eq('id', subId);

    return j({ ok: true, paymentUrl: postUrl, order_id: orderId, app_base: appBase });
  } catch (err) {
    return j({ error: (err as Error).message }, 500);
  }
});
