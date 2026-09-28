// supabase/functions/auth-email-hook/index.ts v5
// v5: Arabic copy addresses the reader in the masculine-default form (Haven is
// for both genders) instead of the feminine one.
// v4: hard-code SITE_URL to havenstudent.com so confirmation links always
// point to the app (not to the Supabase project URL, which Auth sometimes
// sends as site_url in the payload).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const SITE_URL = 'https://havenstudent.com';
const FROM_ADDRESS = 'Haven <noreply@havenstudent.com>';
const BRAND = '#2b3648';

function j(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
}

function shell(arBlock: string, enBlock: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f4f2ee;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:540px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
    <div style="background:${BRAND};padding:24px 28px;"><div style="color:#fff;font-size:22px;font-weight:700;">Haven</div></div>
    <div style="padding:28px;color:#1f2733;font-size:15px;line-height:1.7;">
      <div dir="rtl" style="text-align:right;">${arBlock}</div>
      <div style="height:1px;background:#eee;margin:26px 0;"></div>
      <div dir="ltr" style="text-align:left;">${enBlock}</div>
    </div>
    <div style="padding:18px 28px;border-top:1px solid #eee;color:#8a8f98;font-size:12px;text-align:center;">
      Haven &mdash; <a href="${SITE_URL}" style="color:${BRAND};text-decoration:none;">havenstudent.com</a><br>
      <span dir="rtl">هذا بريد آلي، يرجى عدم الرد عليه.</span> &middot; This is an automated message, please don't reply.
    </div>
  </div>
</body></html>`;
}
function button(url: string, ar: string, en: string): string {
  return `<div style="margin:20px 0;text-align:center;"><a href="${url}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;">${ar} &middot; ${en}</a></div>`;
}
function heading(ar: string, en: string) {
  return {
    ar: `<h1 style="color:${BRAND};font-size:19px;margin:0 0 12px;">${ar}</h1>`,
    en: `<h1 style="color:${BRAND};font-size:19px;margin:0 0 12px;">${en}</h1>`,
  };
}

function normalizeSecret(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('v1,')) s = s.slice(3);
  if (s.startsWith('whsec_')) s = s.slice(6);
  return s;
}

async function verify(rawBody: string, id: string, timestamp: string, sigHeader: string, secretRaw: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const signed = `${id}.${timestamp}.${rawBody}`;
    const b64 = normalizeSecret(secretRaw);
    let secretBytes: Uint8Array;
    try {
      secretBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } catch (_e) {
      return { ok: false, detail: 'secret_not_base64' };
    }
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    const versions = sigHeader.trim().split(/\s+/).map((s) => s.split(','));
    for (const [v, s] of versions) {
      if (v === 'v1' && s === expected) return { ok: true };
    }
    return { ok: false, detail: 'signature_mismatch' };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

interface HookPayload {
  user: { email: string; id: string };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
    new_email?: string;
  };
}

function render(action: string, tokenHash: string, newEmail?: string): { subject: string; html: string } {
  if (action === 'signup') {
    const url = `${SITE_URL}/welcome?token_hash=${tokenHash}&type=signup`;
    const t = heading('تأكيد بريدك الإلكتروني', 'Confirm your email');
    return { subject: 'تأكيد بريدك الإلكتروني · Confirm your email',
      html: shell(
        `${t.ar}<p>أهلاً بك في Haven. اضغط على الزر أدناه لتأكيد بريدك الإلكتروني وتفعيل حسابك.</p>${button(url, 'تأكيد البريد', 'Confirm email')}<p style="color:#8a8f98;font-size:13px;">إذا لم تقم بإنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة.</p>`,
        `${t.en}<p>Welcome to Haven. Click the button above to confirm your email address and activate your account.</p><p style="color:#8a8f98;font-size:13px;">If you didn't create this account, you can safely ignore this email.</p>`) };
  }

  if (action === 'recovery') {
    const url = `${SITE_URL}/reset-password?token_hash=${tokenHash}&type=recovery`;
    const t = heading('إعادة تعيين كلمة المرور', 'Reset your password');
    return { subject: 'إعادة تعيين كلمة المرور · Reset your Haven password',
      html: shell(
        `${t.ar}<p>تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك على Haven.</p><p>اضغط على الزر أدناه لتعيين كلمة مرور جديدة. ينتهي الرابط خلال ساعة واحدة.</p>${button(url, 'إعادة تعيين كلمة المرور', 'Reset password')}<p style="color:#8a8f98;font-size:13px;">إذا لم تطلب ذلك، تجاهل الرسالة ولن يتغيّر شيء.</p>`,
        `${t.en}<p>We received a request to reset the password for your Haven account.</p><p>Click the button above to set a new password. The link expires in one hour.</p><p style="color:#8a8f98;font-size:13px;">If you didn't request this, ignore this email and nothing will change.</p>`) };
  }

  if (action === 'email_change' || action === 'email_change_new' || action === 'email_change_current') {
    const url = `${SITE_URL}/email-changed?token_hash=${tokenHash}&type=email_change`;
    const t = heading('تأكيد تغيير البريد الإلكتروني', 'Confirm email change');
    const target = newEmail ? `<strong>${newEmail}</strong>` : '';
    return { subject: 'تأكيد تغيير البريد الإلكتروني · Confirm email change',
      html: shell(
        `${t.ar}<p>تم طلب تغيير بريدك الإلكتروني على Haven${target ? ' إلى ' + target : ''}.</p><p>اضغط على الزر أدناه لتأكيد التغيير. لن يتغيّر بريدك إلا بعد تأكيد الرابطين (على بريدك الحالي والجديد).</p>${button(url, 'تأكيد التغيير', 'Confirm change')}<p style="color:#8a8f98;font-size:13px;">إذا لم تطلب ذلك، تجاهل الرسالة ولن يتغيّر شيء.</p>`,
        `${t.en}<p>A change to your Haven email${target ? ' to ' + target : ''} was requested.</p><p>Click the button above to confirm the change. Your email will only change after both links (on your current and new addresses) are confirmed.</p><p style="color:#8a8f98;font-size:13px;">If you didn't request this, ignore this email and nothing will change.</p>`) };
  }

  if (action === 'magiclink') {
    const url = `${SITE_URL}/welcome?token_hash=${tokenHash}&type=magiclink`;
    const t = heading('رابط تسجيل الدخول', 'Your sign-in link');
    return { subject: 'رابط تسجيل الدخول · Sign in to Haven',
      html: shell(
        `${t.ar}<p>اضغط على الزر أدناه لتسجيل الدخول إلى حسابك على Haven.</p>${button(url, 'تسجيل الدخول', 'Sign in')}`,
        `${t.en}<p>Click the button above to sign in to your Haven account.</p>`) };
  }

  if (action === 'invite') {
    const url = `${SITE_URL}/welcome?token_hash=${tokenHash}&type=invite`;
    const t = heading('دعوة للانضمام إلى Haven', 'You\'re invited to Haven');
    return { subject: 'دعوة للانضمام إلى Haven · You\'re invited to Haven',
      html: shell(
        `${t.ar}<p>تمت دعوتك للانضمام إلى Haven. اضغط على الزر أدناه لقبول الدعوة.</p>${button(url, 'قبول الدعوة', 'Accept invite')}`,
        `${t.en}<p>You've been invited to join Haven. Click the button above to accept.</p>`) };
  }

  const t = heading('إشعار من Haven', 'Notice from Haven');
  return { subject: 'إشعار من Haven · Haven notice',
    html: shell(
      `${t.ar}<p>تلقينا طلباً يتطلب إشعارك. إذا لم تقم بذلك، تجاهل الرسالة.</p>`,
      `${t.en}<p>We received a request that required notifying you. If you didn't do this, please ignore.</p>`) };
}

serve(async (req) => {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);
  try {
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
    const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '';
    if (!resendKey) return j({ error: 'RESEND_API_KEY not configured' }, 503);
    if (!hookSecret) return j({ error: 'SEND_EMAIL_HOOK_SECRET not configured' }, 503);

    const rawBody = await req.text();
    const id = req.headers.get('webhook-id') ?? '';
    const ts = req.headers.get('webhook-timestamp') ?? '';
    const sig = req.headers.get('webhook-signature') ?? '';
    if (!id || !ts || !sig) return j({ error: 'missing_webhook_headers' }, 401);

    const v = await verify(rawBody, id, ts, sig, hookSecret);
    if (!v.ok) return j({ error: 'invalid_signature', detail: v.detail }, 401);

    const payload = JSON.parse(rawBody) as HookPayload;
    const to = payload.user?.email;
    const action = payload.email_data?.email_action_type ?? '';
    const tokenHash = payload.email_data?.token_hash ?? '';
    const newEmail = payload.email_data?.new_email;
    if (!to || !action || !tokenHash) return j({ error: 'invalid_payload' }, 400);

    const { subject, html } = render(action, tokenHash, newEmail);

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
    });
    if (!resp.ok) {
      const detail = await resp.json().catch(() => ({}));
      return j({ error: 'resend_failed', detail }, 502);
    }
    return j({ ok: true });
  } catch (err) {
    return j({ error: (err as Error).message }, 500);
  }
});
