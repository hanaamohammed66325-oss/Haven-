// supabase/functions/send-email/index.ts v5
// Transactional email via Resend. v5 changes:
//   - Added: reengage template (win-back / onboarding nudge) with variants
//     'setup' | 'grades' | 'back'. Called by reengage-tick for lapsed users
//     who have no push subscription (email is their only reachable channel).
// v4: password_changed, email_change_notice; emojis removed from subjects.
// Every email is BILINGUAL: Arabic block first, divider, English block.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
function j(o: unknown, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } }); }

const FROM_ADDRESS = 'Haven <noreply@havenstudent.com>';
const BRAND = '#2b3648';

interface TemplateData { plan_label_ar?: string; plan_label_en?: string; amount_sar?: number | string; date?: string; payment_id?: string; new_email?: string; ip?: string; variant?: string; }

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
      Haven &mdash; <a href="https://havenstudent.com" style="color:${BRAND};text-decoration:none;">havenstudent.com</a><br>
      <span dir="rtl">هذا بريد آلي، يرجى عدم الرد عليه.</span> &middot; This is an automated message, please don't reply.
    </div>
  </div>
</body></html>`;
}
function btnPair(url: string, labelAr = 'إدارة الاشتراك', labelEn = 'Manage subscription'): string {
  return `<div style="margin:20px 0;text-align:center;"><a href="${url}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;">${labelAr} &middot; ${labelEn}</a></div>`;
}

function renderTemplate(template: string, d: TemplateData): { subject: string; html: string } {
  const appUrl = 'https://havenstudent.com/profile';
  const h = (color: string, ar: string, en: string) => ({ ar: `<h1 style="color:${color};font-size:19px;margin:0 0 12px;">${ar}</h1>`, en: `<h1 style="color:${color};font-size:19px;margin:0 0 12px;">${en}</h1>` });

  if (template === 'trial_started') {
    const t = h(BRAND, 'أهلاً بك في Haven', 'Welcome to Haven');
    return { subject: 'تم تفعيل تجربتك المجانية · Your free trial is active',
      html: shell(
        `${t.ar}<p>تم تفعيل تجربتك المجانية لمدة ٣٠ يوم.</p><p><strong>الخطة:</strong> ${d.plan_label_ar}<br><strong>تنتهي التجربة:</strong> ${d.date}</p><p>لن يتم خصم أي مبلغ خلال التجربة. يمكنك الإلغاء قبل انتهائها بدون رسوم.</p>`,
        `${t.en}<p>Your 30-day free trial is now active.</p><p><strong>Plan:</strong> ${d.plan_label_en}<br><strong>Trial ends:</strong> ${d.date}</p><p>You won't be charged during the trial. Cancel anytime before it ends at no cost.</p>${btnPair(appUrl)}`) };
  }
  if (template === 'trial_ending') {
    const t = h(BRAND, 'تجربتك تنتهي قريباً', 'Your trial ends soon');
    return { subject: 'تجربتك تنتهي قريباً · Your free trial ends soon',
      html: shell(
        `${t.ar}<p>تنتهي تجربتك المجانية في <strong>${d.date}</strong>.</p><p><strong>الخطة:</strong> ${d.plan_label_ar} — ${d.amount_sar} ريال</p><p>إذا لم تلغِ قبل ذلك، سيبدأ الخصم تلقائياً.</p>`,
        `${t.en}<p>Your free trial ends on <strong>${d.date}</strong>.</p><p><strong>Plan:</strong> ${d.plan_label_en} — ${d.amount_sar} SAR</p><p>If you don't cancel before then, billing starts automatically.</p>${btnPair(appUrl)}`) };
  }
  if (template === 'payment_receipt') {
    const t = h(BRAND, 'شكراً لك', 'Thank you');
    const rowAr = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#8a8f98;">${k}</td><td style="padding:6px 0;text-align:left;"><strong>${v}</strong></td></tr>`;
    const rowEn = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#8a8f98;">${k}</td><td style="padding:6px 0;text-align:right;"><strong>${v}</strong></td></tr>`;
    return { subject: 'إيصال اشتراك Haven · Your Haven receipt',
      html: shell(
        `${t.ar}<p>تم تجديد اشتراكك بنجاح.</p><table style="width:100%;border-collapse:collapse;">${rowAr('الخطة', d.plan_label_ar!)}${rowAr('المبلغ', d.amount_sar + ' ريال')}${rowAr('التاريخ', d.date!)}${rowAr('رقم العملية', d.payment_id!)}</table>`,
        `${t.en}<p>Your subscription has been renewed successfully.</p><table style="width:100%;border-collapse:collapse;">${rowEn('Plan', d.plan_label_en!)}${rowEn('Amount', d.amount_sar + ' SAR')}${rowEn('Date', d.date!)}${rowEn('Payment ID', d.payment_id!)}</table>${btnPair(appUrl)}`) };
  }
  if (template === 'cancellation') {
    const t = h(BRAND, 'تم إلغاء اشتراكك', 'Subscription cancelled');
    return { subject: 'تم إلغاء اشتراكك · Subscription cancelled',
      html: shell(
        `${t.ar}<p>تم إلغاء اشتراكك بنجاح.</p><p><strong>وصولك مستمر حتى:</strong> ${d.date}</p><p>لن يتم أي خصم بعد ذلك. يمكنك إعادة الاشتراك في أي وقت.</p>`,
        `${t.en}<p>Your subscription has been cancelled.</p><p><strong>Access continues until:</strong> ${d.date}</p><p>No further charges. You can resubscribe anytime.</p>${btnPair(appUrl)}`) };
  }
  if (template === 'payment_failed') {
    const t = h('#c0392b', 'فشل الخصم', 'Payment failed');
    return { subject: 'فشل خصم اشتراكك · Payment failed',
      html: shell(
        `${t.ar}<p>لم نتمكن من خصم رسوم اشتراكك.</p><p><strong>الخطة:</strong> ${d.plan_label_ar} — ${d.amount_sar} ريال</p><p>يرجى تحديث بيانات بطاقتك خلال ٧ أيام لاستمرار الوصول.</p>`,
        `${t.en}<p>We couldn't charge your subscription.</p><p><strong>Plan:</strong> ${d.plan_label_en} — ${d.amount_sar} SAR</p><p>Please update your card within 7 days to keep access.</p>${btnPair(appUrl)}`) };
  }
  if (template === 'password_changed') {
    const t = h(BRAND, 'تم تغيير كلمة المرور', 'Your password was changed');
    return { subject: 'تم تغيير كلمة المرور · Your Haven password was changed',
      html: shell(
        `${t.ar}<p>تم تغيير كلمة المرور الخاصة بحسابك على Haven في <strong>${d.date}</strong>.</p><p>لقد تم تسجيل الخروج من جميع الأجهزة الأخرى تلقائياً كإجراء أمني.</p><p><strong>إذا لم تكن أنت من قام بهذا التغيير</strong>، تواصل معنا فوراً على <a href="mailto:support@havenstudent.com" style="color:${BRAND};">support@havenstudent.com</a> وأعد تعيين كلمة المرور من صفحة تسجيل الدخول.</p>`,
        `${t.en}<p>The password for your Haven account was changed on <strong>${d.date}</strong>.</p><p>All other devices have been signed out automatically as a security measure.</p><p><strong>If you did not make this change</strong>, contact us immediately at <a href="mailto:support@havenstudent.com" style="color:${BRAND};">support@havenstudent.com</a> and reset your password from the sign-in page.</p>`) };
  }
  if (template === 'email_change_notice') {
    const t = h(BRAND, 'طلب تغيير البريد الإلكتروني', 'Email change request');
    return { subject: 'طلب تغيير البريد الإلكتروني · Email change requested',
      html: shell(
        `${t.ar}<p>تم طلب تغيير البريد الإلكتروني لحسابك على Haven إلى:</p><p style="background:#f4f2ee;padding:12px 16px;border-radius:8px;font-family:monospace;" dir="ltr">${d.new_email}</p><p>أُرسلت رسائل تأكيد إلى بريدك الحالي والجديد. لن يتم تغيير البريد إلا بعد الضغط على رابط التأكيد في كلا الرسالتين.</p><p><strong>إذا لم تكن أنت</strong>، تجاهل رسائل التأكيد وستبقى بياناتك كما هي، وتواصل معنا على <a href="mailto:support@havenstudent.com" style="color:${BRAND};">support@havenstudent.com</a>.</p>`,
        `${t.en}<p>A request was made to change the email address for your Haven account to:</p><p style="background:#f4f2ee;padding:12px 16px;border-radius:8px;font-family:monospace;">${d.new_email}</p><p>Confirmation emails were sent to your current and new addresses. The change will not take effect until both links are clicked.</p><p><strong>If you did not make this request</strong>, ignore the confirmation emails and no change will occur, and contact us at <a href="mailto:support@havenstudent.com" style="color:${BRAND};">support@havenstudent.com</a>.</p>`) };
  }
  if (template === 'reengage') {
    // Win-back / onboarding nudge. Gender-neutral Arabic. CTA lands on the app
    // with ?reengage=1 so the in-app nudge modal greets the returning user.
    const variant = d.variant === 'setup' ? 'setup' : d.variant === 'grades' ? 'grades' : 'back';
    const backUrl = 'https://havenstudent.com/dashboard?reengage=1';
    const setupUrl = 'https://havenstudent.com/courses?reengage=1';
    const url = variant === 'setup' ? setupUrl : backUrl;
    const t = h(BRAND, 'معدلك بانتظارك في Haven', 'Your GPA is waiting in Haven');
    const arBody = variant === 'setup'
      ? '<p>حسابك جاهز، وباقي تضيف موادك عشان نبدأ نحسب لك المعدل ونذكّرك بمحاضراتك واختباراتك. الإضافة تاخذ دقيقة.</p>'
      : variant === 'grades'
      ? '<p>موادك جاهزة في Haven — باقي درجاتك عشان نحسب معدلك ونتابع تقدّمك.</p>'
      : '<p>مرّت فترة من آخر زيارة لـ Haven. تحديث سريع لدرجاتك يبيّن لك وين وصلت، وتذكيراتك جاهزة عشان ما يفوتك اختبار ولا محاضرة.</p>';
    const enBody = variant === 'setup'
      ? '<p>Your account is ready — add your courses so we can start tracking your GPA and remind you about lectures and exams. It takes a minute.</p>'
      : variant === 'grades'
      ? '<p>Your courses are set up in Haven — add your grades so we can calculate your GPA and follow your progress.</p>'
      : "<p>It's been a while since your last visit to Haven. A quick grade update shows where you stand, and your reminders are ready so you don't miss an exam or a lecture.</p>";
    return { subject: 'معدلك بانتظارك في Haven · Your GPA is waiting in Haven',
      html: shell(`${t.ar}${arBody}`, `${t.en}${enBody}${btnPair(url, 'افتح Haven', 'Open Haven')}`) };
  }
  return { subject: 'Haven', html: shell(`<p>${template}</p>`, `<p>${template}</p>`) };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);
  try {
    const schedulerSecret = Deno.env.get('SCHEDULER_SECRET');
    if (!schedulerSecret) return j({ error: 'SCHEDULER_SECRET not configured' }, 500);
    const authHeader = req.headers.get('Authorization') ?? '';
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!m || m[1] !== schedulerSecret) return j({ error: 'Unauthorized' }, 401);

    const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
    if (!resendKey || resendKey.includes('PLACEHOLDER')) return j({ error: 'RESEND_API_KEY not configured' }, 503);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const payloadIn = await req.json().catch(() => ({}));
    const to = String(payloadIn.to ?? '');
    const template = String(payloadIn.template ?? '');
    const data: TemplateData = payloadIn.data ?? {};
    const dedupKey = payloadIn.dedup_key ? String(payloadIn.dedup_key) : null;
    const userId = payloadIn.user_id ? String(payloadIn.user_id) : null;
    if (!to || !template) return j({ error: 'Missing to or template' }, 400);

    if (dedupKey && userId) {
      const { data: already } = await admin.from('notifications_sent').select('id').eq('user_id', userId).eq('item_key', dedupKey).eq('kind', 'email').maybeSingle();
      if (already) return j({ ok: true, skipped: 'dedup', dedup_key: dedupKey });
    }

    const { subject, html } = renderTemplate(template, data);
    const resp = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }) });
    const respJson = await resp.json().catch(() => ({}));
    if (!resp.ok) return j({ error: 'Resend send failed', detail: respJson, status: resp.status }, 502);

    if (dedupKey && userId) await admin.from('notifications_sent').insert({ user_id: userId, item_key: dedupKey, kind: 'email' });
    return j({ ok: true, id: respJson.id, template });
  } catch (err) {
    return j({ error: (err as Error).message }, 500);
  }
});
