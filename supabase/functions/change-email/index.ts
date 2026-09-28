// supabase/functions/change-email/index.ts v4
// v4: Arabic copy addresses the reader in the masculine-default form (Haven is
// for both genders) instead of the feminine one.
// v3 changes: use admin.auth.admin.generateLink() (bypasses email rate limits)
// to produce the two confirmation URLs, then send both emails ourselves via
// Resend so we never hit Supabase's built-in email throttling.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SITE_URL = 'https://havenstudent.com';
const FROM_ADDRESS = 'Haven <noreply@havenstudent.com>';
const BRAND = '#2b3648';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function j(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function shell(arBlock: string, enBlock: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f4f2ee;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"><div style="max-width:540px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;"><div style="background:${BRAND};padding:24px 28px;"><div style="color:#fff;font-size:22px;font-weight:700;">Haven</div></div><div style="padding:28px;color:#1f2733;font-size:15px;line-height:1.7;"><div dir="rtl" style="text-align:right;">${arBlock}</div><div style="height:1px;background:#eee;margin:26px 0;"></div><div dir="ltr" style="text-align:left;">${enBlock}</div></div><div style="padding:18px 28px;border-top:1px solid #eee;color:#8a8f98;font-size:12px;text-align:center;">Haven &mdash; <a href="${SITE_URL}" style="color:${BRAND};text-decoration:none;">havenstudent.com</a><br><span dir="rtl">هذا بريد آلي، يرجى عدم الرد عليه.</span> &middot; This is an automated message, please don't reply.</div></div></body></html>`;
}
function button(url: string): string {
  return `<div style="margin:20px 0;text-align:center;"><a href="${url}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;">تأكيد التغيير &middot; Confirm change</a></div>`;
}

function renderChangeEmail(newEmail: string, actionUrl: string, isCurrent: boolean): { subject: string; html: string } {
  const subject = 'تأكيد تغيير البريد الإلكتروني · Confirm email change';
  const arBlock = `<h1 style="color:${BRAND};font-size:19px;margin:0 0 12px;">تأكيد تغيير البريد الإلكتروني</h1>` +
    (isCurrent
      ? `<p>تم طلب تغيير بريدك الإلكتروني على Haven إلى <strong>${newEmail}</strong>.</p><p>اضغط على الزر أدناه للموافقة من بريدك الحالي. لن يتغيّر البريد إلا بعد الضغط على الرابطين (على بريدك الحالي والجديد).</p>`
      : `<p>تم طلب تفعيل هذا البريد (<strong>${newEmail}</strong>) كبريد جديد لحساب في Haven.</p><p>اضغط على الزر أدناه لتأكيد أن هذا بريدك. لن يتغيّر البريد إلا بعد تأكيد الرابط المرسل للبريد الحالي أيضاً.</p>`) +
    button(actionUrl) +
    `<p style="color:#8a8f98;font-size:13px;">إذا لم تطلب ذلك، تجاهل الرسالة ولن يتغيّر شيء.</p>`;
  const enBlock = `<h1 style="color:${BRAND};font-size:19px;margin:0 0 12px;">Confirm email change</h1>` +
    (isCurrent
      ? `<p>A change to your Haven email to <strong>${newEmail}</strong> was requested.</p><p>Click the button above from your current address to approve. Your email will only change after both links (on your current and new addresses) are confirmed.</p>`
      : `<p>This address (<strong>${newEmail}</strong>) was set as the new email for a Haven account.</p><p>Click the button above to confirm this is your address. The email will only change after the link sent to the current address is also confirmed.</p>`) +
    `<p style="color:#8a8f98;font-size:13px;">If you didn't request this, ignore this email and nothing will change.</p>`;
  return { subject, html: shell(arBlock, enBlock) };
}

async function sendResend(to: string, subject: string, html: string, resendKey: string): Promise<boolean> {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
  });
  return resp.ok;
}

// Rewrite Supabase's confirmation URL to our own /email-changed handler.
function rewriteToOurPage(supabaseLink: string): string {
  try {
    const u = new URL(supabaseLink);
    const tokenHash = u.searchParams.get('token_hash') ?? '';
    if (!tokenHash) return supabaseLink;
    return `${SITE_URL}/email-changed?token_hash=${tokenHash}&type=email_change`;
  } catch {
    return supabaseLink;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
    if (!resendKey) return j({ error: 'RESEND_API_KEY not configured' }, 503);
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Authenticate caller
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return j({ error: 'Missing authorization' }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return j({ error: 'Invalid session' }, 401);
    const user = userData.user;
    const currentEmail = user.email ?? '';
    if (!currentEmail) return j({ error: 'no_email' }, 400);

    const body = await req.json().catch(() => ({}));
    const currentPassword = String(body.current_password ?? '');
    const newEmail = String(body.new_email ?? '').trim().toLowerCase();

    if (!currentPassword) return j({ error: 'current_password_required' }, 400);
    if (!newEmail || !isValidEmail(newEmail)) return j({ error: 'invalid_email' }, 400);
    if (newEmail === currentEmail.toLowerCase()) return j({ error: 'same_email' }, 400);

    // Check the new email isn't already in use
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const clash = (existing?.users ?? []).some((u) => (u.email ?? '').toLowerCase() === newEmail && u.id !== user.id);
    if (clash) return j({ error: 'email_taken' }, 409);

    // Verify current password (still uses signIn but this is per-IP not per-user
    // and normally isn't the throttled endpoint we were hitting).
    const anon = createClient(supabaseUrl, anonKey);
    const { error: signInErr } = await anon.auth.signInWithPassword({ email: currentEmail, password: currentPassword });
    if (signInErr) return j({ error: 'wrong_current_password' }, 401);
    await anon.auth.signOut().catch(() => {});

    // Use ADMIN API to generate both confirmation links. This bypasses the
    // Auth service's email-send throttling entirely.
    // deno-lint-ignore no-explicit-any
    const genCur: any = await (admin.auth.admin as any).generateLink({
      type: 'email_change_current',
      email: currentEmail,
      newEmail: newEmail,
      options: { redirectTo: `${SITE_URL}/email-changed` },
    });
    if (genCur.error) return j({ error: 'generate_link_failed', detail: genCur.error.message }, 500);

    // deno-lint-ignore no-explicit-any
    const genNew: any = await (admin.auth.admin as any).generateLink({
      type: 'email_change_new',
      email: currentEmail,
      newEmail: newEmail,
      options: { redirectTo: `${SITE_URL}/email-changed` },
    });
    if (genNew.error) return j({ error: 'generate_link_failed', detail: genNew.error.message }, 500);

    const linkCur = genCur.data?.properties?.action_link ?? '';
    const linkNew = genNew.data?.properties?.action_link ?? '';
    if (!linkCur || !linkNew) return j({ error: 'no_action_links' }, 500);

    const urlCur = rewriteToOurPage(linkCur);
    const urlNew = rewriteToOurPage(linkNew);

    const emailCur = renderChangeEmail(newEmail, urlCur, true);
    const emailNew = renderChangeEmail(newEmail, urlNew, false);

    // Send both emails via Resend directly (no rate limits on our side).
    const [okCur, okNew] = await Promise.all([
      sendResend(currentEmail, emailCur.subject, emailCur.html, resendKey),
      sendResend(newEmail, emailNew.subject, emailNew.html, resendKey),
    ]);
    if (!okCur || !okNew) return j({ error: 'send_email_failed', current: okCur, new: okNew }, 502);

    return j({ ok: true, new_email: newEmail });
  } catch (err) {
    return j({ error: (err as Error).message }, 500);
  }
});
