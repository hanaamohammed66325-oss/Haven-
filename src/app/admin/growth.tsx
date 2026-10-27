"use client";
import { InteractionButton } from "@/components/motion/Interaction";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, ArrowRight, ChevronRight, RefreshCw, Users, Sprout, Link2, GraduationCap, ClipboardList, Timer, CalendarCheck, BookOpen } from "@/components/motion/icons";
import { supabase, useC, useS, SectionHeader, Loading, ErrorBanner, Empty } from "./_lib";
import { growthStatus, parseGrowthPage, type GrowthCursor, type GrowthMetric, type GrowthPage, type GrowthView } from "@/lib/growth";
import { cosmeticLabel } from "@/lib/haviCosmetics";
import { AMBASSADOR_BADGES, AMBASSADOR_RUNGS } from "@/lib/ambassadorRewards";
import { GrowthOutcomes } from "./OutcomePanels";
import { ReferralAnswersSection } from "./referral-answers";
import { GrowthSummary } from "./GrowthSummary";

export function GrowthSection({ session, onOpenUser, onOpenReview, language }: { session: Session; onOpenUser: (id: string) => void; onOpenReview: (id: string) => void; language?: "ar" | "en" }) {
  const C = useC(), S = useS(), account = session.user.id;
  const [lang, setLang] = useState(language || "ar"), ar = lang === "ar";
  const [view, setView] = useState<GrowthView>("referrals"), [target, setTarget] = useState<string | null>(null);
  const [cursor, setCursor] = useState<GrowthCursor | null>(null), [history, setHistory] = useState<(GrowthCursor | null)[]>([]);
  const [page, setPage] = useState<GrowthPage | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [overviewRefresh, setOverviewRefresh] = useState(0);
  const requestKey = JSON.stringify([view, target, cursor]);
  const binding = useRef({ account, revision: 0, pending: false, mounted: false, key: requestKey, acceptedKey: "" });
  if (binding.current.account !== account) {
    binding.current = { account, revision: binding.current.revision + 1, pending: false, mounted: false, key: requestKey, acceptedKey: "" };
    setView("referrals"); setTarget(null); setCursor(null); setHistory([]); setPage(null);
  }
  if (binding.current.key !== requestKey) { binding.current.key = requestKey; binding.current.revision++; binding.current.pending = false; }
  const text = (a: string, e: string) => ar ? a : e;
  const number = (n: number) => new Intl.NumberFormat(ar ? "ar-SA" : "en-US").format(n);
  const percent = (n: number) => number(n) + (ar ? "٪" : "%");
  const when = (d: string | null) => d ? new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(d)) : "—";
  useEffect(() => { setLang(language || (document.documentElement.lang === "en" ? "en" : "ar")); }, [language]);
  const load = useCallback(async () => {
    const current = binding.current;
    if (current.pending) return;
    const revision = ++current.revision; current.pending = true; setBusy(true); setError("");
    try {
      const result = await supabase.rpc("growth_admin_page", { p_expected_account: account, p_view: view, p_target: target, p_cursor: cursor, p_limit: 25 });
      if (binding.current !== current || revision !== current.revision || !current.mounted) return;
      const parsed = !result.error && parseGrowthPage(result.data, account, view, target);
      if (!parsed) { setPage(null); setError("load"); } else { current.acceptedKey = current.key; setPage(parsed); }
    } catch { if (binding.current === current && revision === current.revision && current.mounted) { setPage(null); setError("load"); } }
    finally { if (binding.current === current && revision === current.revision) { current.pending = false; if (current.mounted) setBusy(false); } }
  }, [account, view, target, cursor]);
  useEffect(() => { const current = binding.current; current.mounted = true; setPage(null); void load(); return () => { current.mounted = false; }; }, [load]);
  const navigate = (next: GrowthView, id: string | null = null) => { setView(next); setTarget(id); setCursor(null); setHistory([]); };
  const current = binding.current.acceptedKey === requestKey && page?.account_id === account && page.view === view && page.target === target ? page : null;
  const labels = { good: text("أعلى من المعتاد", "Above peers"), watch: text("يحتاج متابعة", "Watch"), low: text("أقل من المعتاد", "Below peers"), neutral: text("دون حكم", "Unrated") };
  const tint = { good: C.successBg, watch: C.tint(C.warning, "22"), low: C.dangerBg, neutral: C.border };
  const ink = { good: C.successText, watch: C.warningText, low: C.danger, neutral: C.textMuted };
  const metric = (m: GrowthMetric, pooled: GrowthMetric, title: string, judge = true) => {
    const status = judge ? growthStatus(m, pooled) : "neutral";
    return <div className="min-w-0"><div className="text-xs mb-1" style={{ color: C.textDim }}>{title}</div>
      <div className="flex flex-wrap items-center gap-2"><strong className="text-lg" style={{ color: C.text }}>{m.total ? percent(Math.round(100 * m.yes / m.total)) : "—"}</strong>
        <span className="rounded-full px-2 py-1 text-xs" style={{ color: ink[status], background: tint[status] }}>{labels[status]}</span></div>
      <div className="text-xs mt-1" style={{ color: C.textDim }}>{number(m.yes)} / {number(m.total)}{m.unknown ? " · " + text("تغطية غير مكتملة: ", "Incomplete coverage: ") + number(m.unknown) : ""}</div></div>;
  };
  const featureLabels: Record<string, [string, string]> = { courses: ["مقررات", "Courses"], grades: ["درجات", "Grades"], planner: ["المخطط", "Planner"], pomodoro: ["بومودورو", "Pomodoro"], group: ["جلسات جماعية", "Group sessions"], check_in: ["تسجيل يومي", "Check-in"] };
  const icons: Record<string, typeof BookOpen> = { courses: BookOpen, grades: GraduationCap, planner: ClipboardList, pomodoro: Timer, group: Users, check_in: CalendarCheck };
  return <section dir={ar ? "rtl" : "ltr"} className="text-sm">
    <SectionHeader title={text("النمو", "Growth")} action={<InteractionButton type="button" style={S.btnSec} className="min-h-11 inline-flex gap-2 items-center" disabled={busy} onClick={() => { void load(); setOverviewRefresh(n => n + 1); }}><RefreshCw size={16} aria-hidden />{text("تحديث", "Refresh")}</InteractionButton>} />
    <GrowthSummary account={account} refresh={overviewRefresh} ar={ar} />
    <details className="mb-6 rounded-xl border p-3" style={{ borderColor: C.border, background: C.panel }}><summary className="cursor-pointer min-h-11 flex items-center font-semibold" style={{ color: C.text }}>{text("مؤشرات متقدمة: هل الميزات تدعم النمو؟", "Advanced: are the features driving growth?")}</summary><div className="mt-3"><GrowthOutcomes account={account} refresh={overviewRefresh} ar={ar} /></div></details>
    <h3 className="font-semibold mb-1" style={{ color: C.text }}>{text("تفاصيل الإحالات والمجموعات", "Referral and group details")}</h3>
    <p className="mb-4 leading-6 text-xs" style={{ color: C.textDim }}>{text("متابعة الطلاب الذين جاؤوا عبر الإحالات ودعوات المجموعات، ونشاطهم المسجّل بعد الانضمام. الحسابات التجريبية مستبعدة.", "Follow students from referrals and group invitations, and their recorded activity after joining. Test accounts are excluded.")}</p>
    <div role="tablist" aria-label={text("مسارات النمو", "Growth paths")} className="flex gap-2 flex-wrap mb-4">
      {(["referrals", "groups", "sources"] as const).map((tab, i) => { const Icon = [Link2, Users, Sprout][i], selected = view === tab || (tab === "referrals" && view === "referral_members") || (tab === "groups" && view === "group_members"); return <InteractionButton key={tab} id={"growth-tab-" + tab} type="button" role="tab" aria-selected={selected} aria-controls="growth-panel" tabIndex={selected ? 0 : -1} className="min-h-11 px-4 rounded-lg border inline-flex items-center gap-2" style={{ color: selected ? C.primaryText : C.textMuted, background: selected ? C.primarySoft : C.panel, borderColor: C.border }} onClick={() => navigate(tab)} onKeyDown={e => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const direction = (e.key === "ArrowRight" ? 1 : -1) * (ar ? -1 : 1);
        const next = e.key === "Home" ? 0 : e.key === "End" ? 2 : (i + direction + 3) % 3;
        navigate((["referrals", "groups", "sources"] as const)[next]);
        e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }}><Icon size={16} aria-hidden />{[text("الإحالات", "Referrals"), text("الجلسات الجماعية", "Group study"), text("المصادر", "Sources")][i]}</InteractionButton>; })}
    </div>
    {target && <InteractionButton type="button" className="min-h-11 mb-3 inline-flex gap-2 items-center" style={S.btnGhost} onClick={() => navigate(view === "referral_members" ? "referrals" : "groups")}><ArrowRight size={16} aria-hidden />{text("العودة إلى القائمة", "Back to list")}</InteractionButton>}
    <details className="mb-5 rounded-xl border p-3" style={{ borderColor: C.border, background: C.panel }}><summary className="cursor-pointer min-h-11 flex items-center">{text("كيف تُحسب المؤشرات والألوان؟", "How are metrics and colors calculated?")}</summary><div className="leading-7 mt-2" style={{ color: C.textDim }}>
      <p>{text("الاستمرار: نشاط مفيد مسجّل في الأسبوع الثاني أو الرابع من دخول المسار. العودة للمجموعة: جولة مكتملة في المجموعة نفسها خلال الأسبوع الثاني. الانتظام: أسابيع الاستخدام من أول أربعة أسابيع مكتملة.", "Continuation: a recorded useful action in week two or four after entering this path. Group return: a completed round in the same group in week two. Regularity: active weeks among the first four completed weeks.")}</p>
      <p>{text("استمرار المجموعة يقيس الحسابات الجديدة المنسوبة إلى دعوتها. العودة للمجموعة تشمل الأعضاء ذوي تاريخ الانضمام الأول المسجّل؛ تفاصيل الأعضاء تعرض نشاط كل طالب أيضًا.", "Group continuation measures new accounts attributed to its invitation. Group return covers members with a recorded first entry; member details also show each student's activity.")}</p>
      <p>{text("الأخضر: نتائج أفضل. الأحمر: نتائج أقل. الأصفر: يحتاج متابعة. الرمادي: لا يوجد حكم بعد. نقارن مع الإحالات أو المجموعات الأخرى من النوع نفسه، ولا نحكم قبل توفر بيانات كافية. الانتظام الفردي وصف للاستخدام.", "Green: better results. Red: lower results. Amber: needs follow-up. Gray: no rating yet. We compare other referrals or groups of the same kind only when enough data is available. Individual regularity describes usage.")}</p>
      <p>{text("الأفعال: تسجيل درجات، إتمام مهمة أو جلسة بومودورو، أو جولة جماعية مكتملة. مجرد فتح التطبيق لا يكفي. المؤشرات لا تؤثر في المكافآت.", "Actions: logging grades, completing a task or Pomodoro, an earned group round. App open alone does not qualify. Metrics never affect rewards.")}</p>
      <p>{text("دعوات المجموعات تُسجّل مستقبلًا فقط. الحساب الجديد هنا انضم بدعوة خلال أربع وعشرين ساعة من تسجيله، وكانت أول مشاركة جماعية مسجّلة له. قد يظهر الطالب في مساري الإحالة والمجموعات.", "Group invitation attribution is prospective only: a newly created account joining by invitation within twenty-four hours of signup, as its first recorded group exposure. A student may appear in both referral and group paths.")}</p>
    </div></details>
    <div id="growth-panel" role="tabpanel" aria-labelledby={"growth-tab-" + (view === "referral_members" ? "referrals" : view === "group_members" ? "groups" : view)}>
    {view === "sources" && <ReferralAnswersSection key={account} accountId={account} onOpenUser={onOpenUser} ar={ar} refresh={overviewRefresh} />}
    {error && <div role="alert"><ErrorBanner message={text("تعذّر تحميل النمو. أعد المحاولة؛ قد تكون ميزة الخادم غير مفعّلة بعد.", "Could not load Growth. Retry; the server feature may not be installed yet.")} /><InteractionButton type="button" style={S.btnGhost} className="min-h-11 mb-4" disabled={busy} onClick={() => void load()}>{text("إعادة المحاولة", "Retry")}</InteractionButton></div>}
    {busy && <Loading text={text("جارٍ تحميل السجلات…", "Loading records…")} />}
    {!busy && current && <>
      {!current.tracking_enabled && <p className="mb-4" style={{ color: C.warningText }}>{text("تسجيل مصدر الانضمام للمجموعات متوقف؛ الجلسات تعمل، لكن أعداد الحسابات القادمة عبر الدعوات غير مكتملة. يبدأ التسجيل من وقت تفعيله، ولا نُسنِد الحسابات القديمة بأثر رجعي.", "Group signup-source tracking is off. Sessions still work, but invitation acquisition counts are incomplete. Tracking starts when enabled; older accounts are not attributed retroactively.")}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">{[[text("أصحاب إحالات محتسبة", "Owners with counted referrals"), current.summary.owners], [text("إحالات محتسبة", "Counted"), current.summary.counted], [text("قيد التفعيل", "Pending"), current.summary.pending], [text("لم تكتمل", "Not completed"), current.summary.incomplete]].map(([label, value]) => <div key={label} className="border rounded-xl p-3" style={{ background: C.panel, borderColor: C.border }}><div className="text-xs mb-1" style={{ color: C.textDim }}>{label}</div><strong className="text-xl" style={{ color: C.text }}>{number(Number(value))}</strong></div>)}</div>
      <p className="text-xs mb-3" style={{ color: C.textDim }}>{text("الأوقات بتوقيت الرياض. النسب تشمل فترات المتابعة المكتملة فقط. إشارات مراجعة أصحاب الرموز تخص آخر عشر إحالات؛ لا تعني إثبات التلاعب.", "Riyadh time. Rates include complete observation windows only. Owner review signals cover the latest ten referrals, not proof of abuse.")}</p>
      {!current.rows.length && <Empty text={text("لا توجد سجلات في هذه الصفحة.", "No records on this page.")} />}
      <div className="flex flex-col gap-3">{current.rows.map(row => <article key={row.id} data-growth-row={row.id} className="rounded-xl border p-4" style={{ borderColor: C.border, background: C.panel }}>
        <div className="flex flex-wrap justify-between gap-2 mb-3"><div className="min-w-0"><strong className="break-words" style={{ color: C.text }}>{row.title || (view === "sources" ? row.id : row.created_at ? text("طالب دون اسم", "Unnamed student") : text("حساب محذوف", "Deleted account"))}</strong><p className="text-xs mt-1 leading-6" style={{ color: C.textDim }}>{view === "groups" ? text("إنشاء المجموعة: ", "Group created: ") : view === "sources" ? text("بداية الأسبوع: ", "Week starts: ") : text("تسجيل الحساب: ", "Signed up: ")}{when(row.created_at)}{target && <> · {text("بداية المسار المسجّلة: ", "Recorded path entry: ")}{when(row.entry_at)}</>} · {text("آخر نشاط: ", "Last activity: ")}{when(row.last_at)}{row.joined_at && <> · {text("آخر انضمام للمجموعة: ", "Last group join: ")}{when(row.joined_at)}</>}</p></div>
          <div className="flex flex-wrap gap-2">{view === "referrals" || view === "groups" ? <InteractionButton type="button" style={S.btnGhost} className="min-h-11 inline-flex gap-1 items-center" onClick={() => navigate(view === "referrals" ? "referral_members" : "group_members", row.id)}>{text("التفاصيل", "Details")}<ChevronRight size={16} aria-hidden /></InteractionButton> : null}
            {row.user_id && <InteractionButton type="button" className="min-h-11" style={S.btnGhost} onClick={() => onOpenUser(row.user_id!)}>{text("حساب الطالب", "Student account")}</InteractionButton>}
            {view === "referrals" && <InteractionButton type="button" className="min-h-11" style={S.btnGhost} onClick={() => onOpenReview(row.id)}>{text("مراجعة الإحالات", "Review referrals")}</InteractionButton>}</div>
        </div>
        {view === "sources" ? <p style={{ color: C.textMuted }}>{text("برمز إحالة: ", "Referral code: ")}{number(row.counted)} · {text("دعوة مجموعة: ", "Group invite: ")}{number(row.acquired)} · {text("كلا المسارين: ", "Both: ")}{number(row.overlap)} · {text("دون إسناد مسجّل: ", "Neither recorded: ")}{number(row.incomplete)}<br />{text("صديق: ", "Friend: ")}{number(row.members)} · {text("وسائل التواصل: ", "Social: ")}{number(row.rounds)} · {text("تخطّى السؤال: ", "Skipped: ")}{number(row.pending)}</p> :
          <><div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-3">{metric(row.week2, current.baseline.week2, text("استمرار الأسبوع الثاني", "Week-two continuation"))}{metric(row.week4, current.baseline.week4, text("استمرار الأسبوع الرابع", "Week-four continuation"))}{(view === "groups" || view === "group_members") && metric(row.repeat, current.baseline.repeat, text("العودة للمجموعة", "Group return"))}</div>
          <p className="text-xs leading-6 mb-2" style={{ color: C.textDim }}>{view === "referrals" || view === "referral_members" ? <>{text("احتُسبت: ", "Counted: ")}{number(row.counted)} · {text("قيد التفعيل: ", "Pending: ")}{number(row.pending)} · {text("لم تكتمل: ", "Not completed: ")}{number(row.incomplete)} · {text("إشارات مراجعة: ", "Review signals: ")}{number(row.review_flags)}</> : <>{text("أعضاء حاليون: ", "Current members: ")}{number(row.members)} · {text("جولات مكتملة: ", "Completed rounds: ")}{number(row.rounds)} · {text("دقائق مشاركة: ", "Participant minutes: ")}{number(row.minutes)} · {text("حسابات جديدة بدعوة: ", "New invited accounts: ")}{number(row.acquired)}</>}</p></>}
        {row.rewards && ["referrals","referral_members","group_members"].includes(view) && <div className="border-t pt-3 mt-2 text-xs leading-6" style={{ borderColor: C.border, color: C.text }}>
          <p>{text("مكافآت مكتسبة: ", "Earned rewards: ")}<strong>{number(row.rewards.earned)}</strong> · {text("درجات مفتوحة: ", "Unlocked tiers: ")}{number(row.rewards.earned_thresholds.length)}
            {row.rewards.reward_vip && <> · <strong>{text("استثناء VIP", "VIP reward access")}</strong> · {text("إجمالي المتاح: ", "Total available: ")}{number(row.rewards.available)}</>}</p>
          <p>{text("يستخدم حاليًا: ", "Currently using: ")}{[
            ...row.rewards.outfits.map(id => cosmeticLabel(id, ar ? "ar" : "en")),
            ...row.rewards.companions.map(id => id === "fox" ? text("الثعلب", "Fox") : text("النمر", "Tiger")),
            ...(row.rewards.theme ? [text("سمة ", "Theme: ") + (AMBASSADOR_RUNGS.find(r => r.theme?.id === row.rewards?.theme)?.theme?.[ar ? "ar" : "en"] || row.rewards.theme)] : []),
            ...(row.rewards.badge ? [AMBASSADOR_BADGES.find(b => b.id === row.rewards?.badge)?.[ar ? "ar" : "en"] || row.rewards.badge] : [])
          ].join(" · ") || text("لا يستخدم مكافآت حاليًا", "No rewards in use")}</p>
          <p style={{ color: C.textDim }}>{text("العدد يشمل الأزياء والرفاق والسمات والشارات؛ النقاط منفصلة. الشارة تُعرض تلقائيًا.", "Counts include outfits, companions, themes and badges; XP is separate. The badge appears automatically.")}</p>
        </div>}
        {row.activity && <div className="border-t pt-3 mt-2" style={{ borderColor: C.border }}><p style={{ color: C.text }}>{text("الانتظام الأسبوعي: ", "Weekly regularity: ")}<strong>{row.activity.complete && row.activity.weeks_observed ? percent(Math.round(100 * row.activity.weeks_active / row.activity.weeks_observed)) : "—"}</strong> · {number(row.activity.weeks_active)} / {number(row.activity.weeks_observed)} · {text("أيام نشاط مسجّلة: ", "Recorded active days: ")}{number(row.activity.days)}{!row.activity.complete && " · " + text("تغطية غير مكتملة", "Incomplete coverage")}</p>
          <div className="flex flex-wrap gap-2 mt-2">{row.activity.features.map(f => { const Icon = icons[f]; return <span key={f} className="inline-flex gap-1 items-center text-xs rounded-full px-2 py-1" style={{ color: C.textMuted, background: C.border }}><Icon size={14} aria-hidden />{featureLabels[f][ar ? 0 : 1]}</span>; })}</div></div>}
        {!!row.reasons.length && <p className="mt-2 text-xs" style={{ color: C.warningText }}>{row.reasons.map(r => r === "same_mailbox" ? text("صندوق بريد مشترك", "Shared mailbox") : r === "reciprocal" ? text("إحالة متبادلة", "Reciprocal") : text("دفعة حسابات حديثة", "Signup burst")).join(" · ")}</p>}
      </article>)}</div>
      <div className="flex justify-between gap-3 mt-5"><InteractionButton type="button" className="min-h-11" style={S.btnGhost} disabled={!history.length} onClick={() => { setCursor(history.at(-1)!); setHistory(h => h.slice(0, -1)); }}><ArrowRight size={16} aria-hidden />{text("السابق", "Previous")}</InteractionButton><InteractionButton type="button" className="min-h-11" style={S.btnGhost} disabled={!current.next_cursor} onClick={() => { setHistory(h => [...h, cursor]); setCursor(current.next_cursor); }}>{text("التالي", "Next")}<ArrowLeft size={16} aria-hidden /></InteractionButton></div>
    </>}
    </div>
  </section>;
}
