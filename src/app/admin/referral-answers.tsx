"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { InteractionButton } from "@/components/motion/Interaction";
import { parseReferralAnswersPage, type ReferralAnswerCursor, type ReferralAnswersPage } from "@/lib/referralAnswers";
import { Empty, ErrorBanner, Loading, supabase, useC, useS } from "./_lib";

export function ReferralAnswersSection({ accountId, onOpenUser, ar, refresh }: {
  accountId: string;
  onOpenUser: (id: string) => void;
  ar: boolean;
  refresh: number;
}) {
  const C = useC(), S = useS();
  const [cursor, setCursor] = useState<ReferralAnswerCursor | null>(null);
  const [history, setHistory] = useState<(ReferralAnswerCursor | null)[]>([]);
  const [page, setPage] = useState<ReferralAnswersPage | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(false);
  const request = useRef(0);
  const label = (a: string, e: string) => ar ? a : e;
  const number = (value: number) => new Intl.NumberFormat(ar ? "ar-SA" : "en-US").format(value);
  const when = (value: string) => new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh",
  }).format(new Date(value));

  const load = useCallback(async () => {
    const revision = ++request.current;
    setPage(null); setLoading(true); setError(false);
    try {
      const { data, error: rpcError } = await supabase.rpc("referral_admin_answers", {
        p_expected_account: accountId,
        p_before_created_at: cursor?.created_at ?? null,
        p_before_id: cursor?.id ?? null,
        p_limit: 25,
      });
      if (revision !== request.current) return;
      const parsed = !rpcError && parseReferralAnswersPage(data, accountId);
      if (parsed) setPage(parsed);
      else setError(true);
    } catch {
      if (revision === request.current) setError(true);
    } finally {
      if (revision === request.current) setLoading(false);
    }
  }, [accountId, cursor]);
  useEffect(() => { void load(); return () => { request.current++; }; }, [load, refresh]);

  const sourceLabel = (source: "friend" | "social" | null, answeredAt: string | null) =>
    source === "friend" ? label("صديق", "Friend") : source === "social" ? label("وسائل التواصل", "Social media")
      : answeredAt ? label("تخطّى السؤال", "Skipped") : label("لم يجب بعد", "Not answered yet");
  const statusLabels = {
    none: label("لم يُدخل رمزًا", "No code entered"),
    pending: label("رمز مُدخل — قيد التفعيل", "Code entered — pending"),
    counted: label("إحالة محتسبة", "Counted referral"),
    expired: label("انتهت مهلة التفعيل", "Activation window expired"),
    owner_removed: label("رمز مُدخل — تعذّر ربطه بصاحبه", "Code entered — owner unavailable"),
  };

  return <section className="mb-6 rounded-xl border p-4" style={{ borderColor: C.border, background: C.panel }}>
    <h3 className="font-semibold text-base mb-1" style={{ color: C.text }}>{label("إجابات المستخدمين الجدد", "New user answers")}</h3>
    <p className="text-xs leading-6 mb-4" style={{ color: C.textDim }}>{label("الحسابات منذ بدء تسجيل مصادر الانضمام، من الأحدث إلى الأقدم. الأوقات بتوقيت الرياض.", "Accounts since source tracking began, newest first. Times are in Riyadh.")}</p>
    {error && <div role="alert"><ErrorBanner message={label("تعذّر تحميل الإجابات. أعد المحاولة؛ قد لا يكون استعلام الأدمن مفعّلًا على الخادم بعد.", "Could not load answers. Retry; the admin query may not be installed on the server yet.")} />
      <InteractionButton type="button" className="min-h-11 mb-4" style={S.btnGhost} onClick={() => void load()}>{label("إعادة المحاولة", "Retry")}</InteractionButton></div>}
    {loading && <Loading text={label("جارٍ تحميل الإجابات…", "Loading answers…")} />}
    {!loading && page && <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {([
          [label("وسائل التواصل", "Social media"), page.totals?.social],
          [label("الأصدقاء", "Friends"), page.totals?.friend],
          [label("تخطّوا السؤال", "Skipped the question"), page.totals?.skipped],
          [label("أدخلوا رمز إحالة", "Entered a referral code"), page.totals?.code_entered],
        ] as const).map(([title, value], index) => <div key={title} className="rounded-lg border p-3" style={{ borderColor: C.border2, background: C.panel2 }}>
          <div className="text-xs mb-1" style={{ color: C.textMuted }}>{title}</div>
          <strong className="text-xl" style={{ color: C.text }}>{value === undefined ? "—" : number(value)}</strong>
          {index === 3 && page.totals && <p className="text-xs mt-1 leading-5" style={{ color: C.textDim }}>{label("تجربة خاصة: ", "Private pilot: ")}{number(page.totals.pilot_codes)} · {label("عامة: ", "Public: ")}{number(page.totals.code_entered - page.totals.pilot_codes - page.totals.unclassified_codes)}{page.totals.unclassified_codes > 0 && <> · {label("تعذّر تصنيفها: ", "Unclassified: ")}{number(page.totals.unclassified_codes)}</>}</p>}
        </div>)}
      </div>
      {page.totals ? <p className="text-xs leading-6 mb-4" style={{ color: C.textDim }}>{label("مجموع الحسابات: ", "Total accounts: ")}{number(page.totals.total)} · {label("لم يجيبوا بعد: ", "Not answered yet: ")}{number(page.totals.unanswered)}. {label("اختيار المصدر إجابة من المستخدم، وقد يتداخل مع إدخال رمز إحالة مقبول ومسجّل.", "Source is self-reported and can overlap with an accepted, recorded referral code.")}</p>
        : <p className="text-xs leading-6 mb-4" style={{ color: C.textDim }}>{label("ستظهر الأعداد بعد تفعيل استعلام الإحصاءات. تبقى الإجابات الفردية متاحة أدناه.", "Counts will appear when the totals query is enabled. Individual answers remain available below.")}</p>}
      {!page.rows.length && <Empty text={label("لا توجد حسابات في هذه الصفحة.", "No accounts on this page.")} />}
      <div className="flex flex-col gap-2">{page.rows.map(row => <article key={row.id} className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3" style={{ borderColor: C.border2, background: C.panel2 }}>
        <div className="min-w-0">
          <strong className="block break-all" dir="ltr" style={{ color: C.text }}>{row.email || label("حساب دون بريد إلكتروني", "Account without email")}</strong>
          <p className="text-xs mt-1 leading-6" style={{ color: C.textDim }}>{label("تسجيل الحساب: ", "Signed up: ")}{when(row.created_at)}</p>
          <p className="text-xs leading-6" style={{ color: C.textMuted }}>{label("الإجابة: ", "Answer: ")}{sourceLabel(row.source, row.answered_at)} · {label("الرمز: ", "Code: ")}{statusLabels[row.code_status]}{row.pilot && <> · {label("تجربة خاصة", "Private pilot")}</>}</p>
        </div>
        <InteractionButton type="button" className="min-h-11" style={S.btnGhost} onClick={() => onOpenUser(row.id)}>{label("حساب الطالب", "Student account")}</InteractionButton>
      </article>)}</div>
      <div className="flex justify-between gap-3 mt-4">
        <InteractionButton type="button" className="min-h-11" style={S.btnGhost} disabled={!history.length} onClick={() => { setCursor(history.at(-1) ?? null); setHistory(h => h.slice(0, -1)); }}>{label("السابق", "Previous")}</InteractionButton>
        <InteractionButton type="button" className="min-h-11" style={S.btnGhost} disabled={!page.next_cursor} onClick={() => { setHistory(h => [...h, cursor]); setCursor(page.next_cursor); }}>{label("التالي", "Next")}</InteractionButton>
      </div>
    </>}
  </section>;
}
