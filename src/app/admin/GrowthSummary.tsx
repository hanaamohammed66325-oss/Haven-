"use client";
import { useEffect, useRef, useState } from "react";
import { supabase, useC, fmtNum } from "./_lib";

interface Summary {
  account_id: string;
  as_of: string;
  excluded_accounts: number;
  tracking_started_at: string;
  accounts: {
    total: number; confirmed: number; unconfirmed: number;
    new_7d: number; new_prev_7d: number; new_30d: number;
    with_course: number; active_7d: number; useful_7d: number;
  };
  weekly: { week: string; signups: number; confirmed: number }[];
  sources: { cohort: number; social: number; friend: number; skipped: number; unanswered: number; unconfirmed: number; code_entered: number };
  referrals: { claims: number; counted: number };
  groups: { groups: number; members: number; rounds: number; students_with_rounds: number };
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const allNums = (o: unknown, keys: string[]) => !!o && typeof o === "object" && keys.every(k => isNum((o as Record<string, unknown>)[k]));

/** Strict parse: any missing or malformed field makes the whole summary unavailable, never a wrong number. */
function parseSummary(raw: unknown, account: string): Summary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.account_id !== account || typeof r.as_of !== "string" || typeof r.tracking_started_at !== "string" || !isNum(r.excluded_accounts)) return null;
  if (!allNums(r.accounts, ["total", "confirmed", "unconfirmed", "new_7d", "new_prev_7d", "new_30d", "with_course", "active_7d", "useful_7d"])) return null;
  if (!allNums(r.sources, ["cohort", "social", "friend", "skipped", "unanswered", "unconfirmed", "code_entered"])) return null;
  if (!allNums(r.referrals, ["claims", "counted"]) || !allNums(r.groups, ["groups", "members", "rounds", "students_with_rounds"])) return null;
  if (!Array.isArray(r.weekly) || !r.weekly.every(w => w && typeof w.week === "string" && isNum(w.signups) && isNum(w.confirmed))) return null;
  return r as unknown as Summary;
}

export function GrowthSummary({ account, refresh, ar }: { account: string; refresh: number; ar: boolean }) {
  const C = useC();
  const revision = useRef(0);
  const [state, setState] = useState<{ account: string; value: Summary | null; failed: boolean }>({ account, value: null, failed: false });
  useEffect(() => {
    const request = ++revision.current;
    setState({ account, value: null, failed: false });
    void (async () => {
      try {
        const result = await supabase.rpc("growth_admin_summary", { p_expected_account: account });
        const value = !result.error ? parseSummary(result.data, account) : null;
        if (request === revision.current) setState({ account, value, failed: !value });
      } catch { if (request === revision.current) setState({ account, value: null, failed: true }); }
    })();
    return () => { revision.current++; };
  }, [account, refresh]);

  const text = (a: string, e: string) => ar ? a : e;
  const fmtDate = (d: string) => new Intl.DateTimeFormat(ar ? "ar-SA-u-nu-latn" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(d));
  const pct = (n: number, total: number) => total ? `${Math.round(100 * n / total)}%` : "—";
  const current = state.account === account ? state : { account, value: null, failed: false };

  if (!current.value) {
    return <p className="mb-4 text-xs" role="status" style={{ color: current.failed ? C.warningText : C.textDim }}>
      {current.failed ? text("تعذّر تحميل ملخص النمو. قد يحتاج الخادم إلى التحديث؛ التفاصيل أدناه ما زالت متاحة.", "Growth summary unavailable. The server may need its update; the details below still work.") : text("جارٍ تحميل ملخص النمو…", "Loading growth summary…")}
    </p>;
  }
  const v = current.value, a = v.accounts;
  const diff = a.new_7d - a.new_prev_7d;
  const trend = diff === 0 ? text("مثل الأسبوع السابق", "Same as previous week") : diff > 0 ? text(`+${diff} عن الأسبوع السابق`, `+${diff} vs previous week`) : text(`${diff} عن الأسبوع السابق`, `${diff} vs previous week`);
  const trendColor = diff > 0 ? C.successText : diff < 0 ? C.danger : C.textDim;
  const maxWeek = Math.max(1, ...v.weekly.map(w => w.signups));

  const stat = (title: string, value: number, sub: string, subColor?: string) =>
    <div key={title} className="border rounded-xl p-4" style={{ background: C.panel, borderColor: C.border }}>
      <div className="text-xs mb-1" style={{ color: C.textDim }}>{title}</div>
      <strong className="text-2xl" style={{ color: C.text }}>{fmtNum(value)}</strong>
      <div className="text-xs mt-1 leading-5" style={{ color: subColor ?? C.textDim }}>{sub}</div>
    </div>;
  const group = (title: string, children: React.ReactNode, note?: string) =>
    <div className="mb-5">
      <h3 className="font-semibold mb-2" style={{ color: C.text }}>{title}</h3>
      {children}
      {note && <p className="text-xs mt-2 leading-6" style={{ color: C.textDim }}>{note}</p>}
    </div>;
  const grid = "grid grid-cols-2 lg:grid-cols-4 gap-3";

  return <div className="mb-6">
    <p className="text-xs mb-4 leading-6" style={{ color: C.textDim }}>
      {text(`الأرقام لمستخدمين فعليين فقط. استُثنيت ${fmtNum(v.excluded_accounts)} حسابات تجريبية. آخر تحديث: `, `Real students only. ${fmtNum(v.excluded_accounts)} test accounts excluded. Updated: `)}
      {new Date(v.as_of).toLocaleString(ar ? "ar-SA-u-nu-latn" : "en-GB", { timeZone: "Asia/Riyadh" })}
    </p>

    {group(text("المستخدمون", "Students"), <div className={grid}>
      {stat(text("إجمالي الحسابات", "All accounts"), a.total, text(`${fmtNum(a.confirmed)} مؤكد · ${fmtNum(a.unconfirmed)} لم يؤكد بريده`, `${fmtNum(a.confirmed)} confirmed · ${fmtNum(a.unconfirmed)} unconfirmed`))}
      {stat(text("جدد آخر 7 أيام", "New, last 7 days"), a.new_7d, trend, trendColor)}
      {stat(text("جدد آخر 30 يومًا", "New, last 30 days"), a.new_30d, text("حسابات جديدة", "new accounts"))}
      {stat(text("نشطون آخر 7 أيام", "Active, last 7 days"), a.active_7d, text(`${pct(a.active_7d, a.total)} من الحسابات · فتحوا التطبيق`, `${pct(a.active_7d, a.total)} of accounts · opened the app`))}
      {stat(text("استخدموا ميزة فعليًا", "Used a feature"), a.useful_7d, text(`${pct(a.useful_7d, a.total)} من الحسابات · درجات أو مهام أو بومودورو أو جلسة جماعية آخر 7 أيام`, `${pct(a.useful_7d, a.total)} of accounts · grades, tasks, Pomodoro or group round in 7 days`))}
      {stat(text("أضافوا مقررًا", "Added a course"), a.with_course, text(`${pct(a.with_course, a.total)} من الحسابات`, `${pct(a.with_course, a.total)} of accounts`))}
    </div>, text("«نشط» يعني فتح التطبيق. «استخدم ميزة فعليًا» أقوى: إنجاز فعلي مسجّل، وليس مجرد دخول.", "'Active' means opened the app. 'Used a feature' is stronger: recorded real work, not just a visit."))}

    {group(text("التسجيل أسبوعيًا (آخر 8 أسابيع)", "Signups per week (last 8 weeks)"), <div className="border rounded-xl p-4" style={{ background: C.panel, borderColor: C.border }}>
      {v.weekly.map(w => <div key={w.week} className="flex items-center gap-3 text-xs mb-2">
        <span className="shrink-0 w-24" style={{ color: C.textDim }}>{fmtDate(w.week)}</span>
        <div className="flex-1 h-3 rounded" style={{ background: C.border }}><div className="h-3 rounded" style={{ width: `${Math.round(100 * w.signups / maxWeek)}%`, background: C.primary }} /></div>
        <span className="shrink-0 w-28 text-end" style={{ color: C.text }}>{fmtNum(w.signups)} <span style={{ color: C.textDim }}>({fmtNum(w.confirmed)} {text("مؤكد", "confirmed")})</span></span>
      </div>)}
    </div>, text("الأسبوع الأخير قد لا يكون مكتملًا.", "The latest week may be incomplete."))}

    {group(text("كيف عرفوا عن Haven؟", "How did they hear about Haven?"), <div className={grid}>
      {stat(text("وسائل التواصل", "Social media"), v.sources.social, text(`${pct(v.sources.social, v.sources.cohort)} من ${fmtNum(v.sources.cohort)}`, `${pct(v.sources.social, v.sources.cohort)} of ${fmtNum(v.sources.cohort)}`))}
      {stat(text("صديق", "A friend"), v.sources.friend, text(`${pct(v.sources.friend, v.sources.cohort)} من ${fmtNum(v.sources.cohort)}`, `${pct(v.sources.friend, v.sources.cohort)} of ${fmtNum(v.sources.cohort)}`))}
      {stat(text("تخطّوا السؤال", "Skipped"), v.sources.skipped, text(`${pct(v.sources.skipped, v.sources.cohort)} من ${fmtNum(v.sources.cohort)}`, `${pct(v.sources.skipped, v.sources.cohort)} of ${fmtNum(v.sources.cohort)}`))}
      {stat(text("لم يجيبوا بعد", "Not answered yet"), v.sources.unanswered, text(`مؤكدو البريد فقط · ${fmtNum(v.sources.unconfirmed)} آخرون لم يؤكدوا بريدهم`, `Confirmed accounts only · ${fmtNum(v.sources.unconfirmed)} more unconfirmed`))}
    </div>, text(`للحسابات المسجّلة منذ ${fmtDate(v.tracking_started_at)}، وهو بدء التتبع. الإجابة من الطالب نفسه، وليست قياسًا مؤكدًا. أدخل رمز إحالة: ${fmtNum(v.sources.code_entered)}.`, `For accounts created since ${fmtDate(v.tracking_started_at)} (tracking start). Self-reported, not a verified measurement. Entered a referral code: ${fmtNum(v.sources.code_entered)}.`))}

    {group(text("الإحالات والجلسات الجماعية", "Referrals and group sessions"), <div className={grid}>
      {stat(text("إحالات", "Referrals"), v.referrals.claims, text(`${fmtNum(v.referrals.counted)} محتسبة`, `${fmtNum(v.referrals.counted)} counted`))}
      {stat(text("مجموعات فعّالة", "Active groups"), v.groups.groups, text("فيها عضو فعلي واحد على الأقل", "with at least one real member"))}
      {stat(text("أعضاء المجموعات", "Group members"), v.groups.members, text("أعضاء حاليون", "current members"))}
      {stat(text("جولات مكتملة", "Completed rounds"), v.groups.rounds, text(`${fmtNum(v.groups.students_with_rounds)} طلاب شاركوا`, `${fmtNum(v.groups.students_with_rounds)} students took part`))}
    </div>, v.referrals.claims === 0 && v.groups.rounds === 0 ? text("لا استخدام فعلي لهما بعد؛ الإحالة والجلسات الجماعية جديدتان.", "No real use yet; both are new.") : undefined)}
  </div>;
}
