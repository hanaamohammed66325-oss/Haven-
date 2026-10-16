"use client";
import { useEffect, useRef, useState } from 'react';
import { supabase, useC, fmtNum } from './_lib';
import { OutcomeCard } from './OutcomeCard';
import { OUTCOME_KEYS, parseGrowthOverview, parseEngagementOverview, type OutcomeKey } from '@/lib/adminOutcomeMetrics';

function useOverview<T>(rpc: string, account: string, refresh: number, parse: (raw: unknown, account: string) => T | null) {
  const revision = useRef(0);
  const [state, setState] = useState<{ account: string; value: T | null; unavailable: boolean }>({ account, value: null, unavailable: false });
  useEffect(() => {
    const request = ++revision.current;
    setState({ account, value: null, unavailable: false });
    void (async () => {
      try {
        const result = await supabase.rpc(rpc, { p_expected_account: account });
        const value = !result.error ? parse(result.data, account) : null;
        if (request === revision.current) setState({ account, value, unavailable: !value });
      } catch { if (request === revision.current) setState({ account, value: null, unavailable: true }); }
    })();
    return () => { revision.current++; };
  }, [rpc, account, refresh, parse]);
  return state.account === account ? state : { account, value: null, unavailable: false };
}

export function GrowthOutcomes({ account, refresh, ar }: { account: string; refresh: number; ar: boolean }) {
  const C = useC(), state = useOverview('growth_admin_overview', account, refresh, parseGrowthOverview);
  const text = (a: string, e: string) => ar ? a : e;
  const titles: Record<OutcomeKey, [string, string]> = {
    referral_share: ['مستخدمون جدد عبر الإحالات', 'New users from referrals'], group_share: ['مستخدمون جدد عبر المجموعات', 'New users from groups'],
    referral_activation: ['تفعيل الإحالات خلال 7 أيام', 'Referral activation within 7 days'], group_activation: ['بدء استخدام المجموعة خلال 7 أيام', 'First group session within 7 days'],
    group_repeat: ['العودة للمجموعة في الأسبوع الثاني', 'Group return in week two'], week2: ['من استمر باستخدام Haven؟', 'Who kept using Haven?'], week4: ['استخدام مفيد في الأسبوع الرابع', 'Useful activity in week four'],
  };
  const descriptions: Record<OutcomeKey, [string, string]> = {
    referral_share: ['من التسجيلات الجديدة', 'of new signups'],
    group_share: ['من التسجيلات الجديدة', 'of new signups'],
    referral_activation: ['من إدخالات الرمز التي اكتملت مهلة متابعتها', 'of code submissions with complete follow-up'],
    group_activation: ['من المنضمين الذين اكتملت مهلة متابعتهم', 'of joined members with complete follow-up'],
    group_repeat: ['عودة بعد جلسة أولى؛ مرة واحدة لكل عضو ومجموعة', 'return after a first session; per member/group'],
    week2: ['استخدم ميزة مفيدة في الأسبوع الثاني', 'used a useful feature in week two'],
    week4: ['من مسارات الإحالة أو المجموعة المكتملة؛ دون تكرار الشخص', 'of mature referral/group entrants; unique people'],
  };
  if (!state.value) return <p className="mb-4 text-xs" role="status" style={{ color: C.textDim }}>{state.unavailable ? text('تعذّر تحميل ملخص النسب. قد يحتاج تحديث الخادم؛ تفاصيل النمو الحالية ما زالت متاحة.', 'Outcome summary unavailable. The server may need its update; existing Growth details remain available.') : text('جارٍ تحميل ملخص النسب…', 'Loading outcome summary…')}</p>;
  const v = state.value;
  return <div className="mb-6">
    <h2 className="font-semibold mb-2" style={{ color: C.text }}>{text('هل الميزات تدعم النمو؟', 'Are the features contributing to growth?')}</h2>
    <p className="text-xs mb-3" style={{ color: C.textDim }}>{text('آخر 28 يومًا · الألوان توضّح التغيّر عن الفترة السابقة.', 'Last 28 days · colors show change from the previous period.')}</p>
    {!v.tracking_enabled && <p className="text-xs mb-3" style={{ color: C.warningText }}>{text('تسجيل مصادر الانضمام متوقف حاليًا؛ الجلسات تعمل بصورة طبيعية.', 'Signup-source tracking is off; sessions still work normally.')}</p>}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{(['referral_share','group_share','week2'] as const).map(key => <OutcomeCard key={key} title={titles[key][ar ? 0 : 1]} detail={descriptions[key][ar ? 0 : 1]} current={v.current.metrics[key]} previous={v.previous.metrics[key]} available={v.tracking_enabled} ar={ar} countFirst={key !== 'week2'} />)}</div>
    <details className="text-xs mt-3" style={{ color: C.textDim }}><summary className="cursor-pointer">{text('المزيد وطريقة الحساب', 'More metrics and calculation')}</summary>
      <p className="my-2 leading-6">{text('نسب التسجيل تخص آخر 28 يومًا؛ نسب التفعيل والمتابعة تخص أفواجًا أقدم اكتملت مهلة متابعتها. قد يأتي الشخص بإحالة ودعوة مجموعة معًا، لذلك لا تُجمع النسب. التجربة مستبعدة. الأخضر والأحمر لفرق واضح فقط؛ عند تقارب الفترتين يظهر الأصفر، وعند نقص البيانات يظهر الرمادي. تحتاج المقارنة إلى 10 ملاحظات مكتملة على الأقل لكل فترة.', 'Signup shares cover the last 28 days; follow-up uses older, fully observed cohorts. Referral and group sources may overlap, so do not add them. Trials are excluded. Green/red indicate a clear difference; amber an inconclusive comparison; gray insufficient data. Comparison requires at least 10 complete observations per period.')}</p>
      <p className="my-2">{text('حسابات تجربة مستبعدة: ', 'Excluded trial accounts: ')}{fmtNum(v.trial_accounts)} · {new Date(v.as_of).toLocaleString(ar ? 'ar-SA-u-nu-latn' : 'en-GB', {timeZone:'Asia/Riyadh'})}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{OUTCOME_KEYS.filter(key => !['referral_share','group_share','week2'].includes(key)).map(key => <OutcomeCard key={key} title={titles[key][ar ? 0 : 1]} detail={descriptions[key][ar ? 0 : 1]} current={v.current.metrics[key]} previous={v.previous.metrics[key]} available={v.tracking_enabled} ar={ar}/>)}</div>
    </details>
  </div>;
}

export function SustainedUseOutcomes({ account, refresh }: { account: string; refresh: number }) {
  const C = useC(), state = useOverview('admin_sustained_use', account, refresh, parseEngagementOverview);
  if (!state.value) return <p className="text-xs" role="status" style={{ color: C.textDim }}>{state.unavailable ? 'Useful-usage summary unavailable. The server update may not be installed yet.' : 'Loading useful-usage summary…'}</p>;
  const v = state.value, percent = (n: number, total: number) => total ? `${(100 * n / total).toFixed(1)}%` : '—';
  const card = (title: string, n: number, denominator: number, detail: string) => <div key={title} className="border rounded-xl p-4" style={{ background: C.panel, borderColor: C.border }}>
    <h3 className="text-xs font-semibold" style={{ color: C.textMuted }}>{title}</h3>
    <div className="text-2xl font-bold my-2" style={{ color: C.primary }}>{fmtNum(n)} <span className="text-base">· {percent(n, denominator)}</span></div>
    <p className="text-xs" style={{ color: C.textDim }}>{fmtNum(n)} / {fmtNum(denominator)} · {detail}</p>
  </div>;
  return <section dir="rtl">
    <h2 className="font-semibold mb-2" style={{ color: C.text }}>الاستخدام المنتظم لـ Haven</h2>
    <div className="border rounded-xl p-4" style={{ borderColor: C.border, background: C.panel }}>
      <p className="text-lg font-semibold" style={{ color: C.text }}>{fmtNum(v.sustained_users)} من أصل {fmtNum(v.total_accounts)} يستخدمون Haven بانتظام</p>
      <strong className="block text-2xl my-2" style={{ color: C.primary }}>{percent(v.sustained_users, v.total_accounts)}</strong>
      <p className="text-xs" style={{ color: C.textDim }}>يشمل الحسابات القديمة والجديدة بحسب نشاط آخر 28 يومًا · استخدام فعلي للميزات، وليس مجرد فتح التطبيق.</p>
      <h3 className="font-semibold text-sm mt-3" style={{ color: C.text }}>أكثر الميزات استخدامًا</h3>
      {v.features.filter(f => f.users > 0).sort((a,b) => b.users-a.users).slice(0,3).map(f => <p key={f.feature} className="text-xs leading-7" style={{ color: C.textMuted }}>{{grades:'تسجيل الدرجات',planner:'إنجاز المهام',pomodoro:'جلسات بومودورو',group:'الجلسات الجماعية'}[f.feature]}: {fmtNum(f.users)} · {percent(f.users,v.observed_users)}</p>)}
      {!v.observed_users && <p className="text-xs mt-2" style={{ color: C.textDim }}>لا توجد إجراءات مفيدة مسجّلة خلال هذه الفترة.</p>}
      <p className="text-xs mt-2" style={{ color: C.textDim }}>نسب الميزات من أصحاب الاستخدام الفعلي خلال الفترة، وقد يستخدم الشخص أكثر من ميزة.</p>
    </div>
    <details className="text-xs mt-3" style={{ color: C.textDim }}><summary className="cursor-pointer">كيف يُحسب الاستخدام المنتظم؟</summary>
    <p className="text-xs leading-6 my-2">استخدام مفيد في 7 أيام مختلفة، و10 إجراءات مفيدة على الأقل، عبر ميزتين أو استخدام متكرر لميزة واحدة خلال آخر 28 يومًا. تُحتسب المهام المكتملة والدرجات المسجّلة والجلسات المكتملة؛ الزيارات والتسجيل اليومي وحدهما لا يكفيان. تُستثنى حسابات الإدارة المحددة وحسابات التجربة من جميع الأعداد والنسب. عدد الحسابات المستبعدة: {fmtNum(v.excluded_accounts)}.</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {card('Sustained users / all accounts', v.sustained_users, v.total_accounts, 'all eligible accounts')}
      {card('Sustained users / useful-usage audience', v.sustained_users, v.observed_users, 'people with a meaningful action in this period')}
      {card('Several features used consistently', v.multi_feature_users, v.observed_users, 'sustained users with at least two useful features')}
      {card('One feature used consistently', v.specialist_users, v.observed_users, 'sustained users with one useful feature')}
      {card('Current streak of at least 7', v.high_streak_users, v.total_accounts, 'app or Pomodoro; expired streaks excluded')}
    </div>
    <div className="border rounded-xl mt-3 p-4" style={{ borderColor: C.border, background: C.panel }}>
      <h3 className="font-semibold text-sm mb-2" style={{ color: C.text }}>Where meaningful use happens</h3>
      {v.features.map(f => <p key={f.feature} className="text-xs leading-7" style={{ color: C.textMuted }}>{f.feature}: {fmtNum(f.users)} users · {percent(f.users, v.observed_users)} of useful-usage audience · {fmtNum(f.actions)} meaningful actions</p>)}
      <p className="text-xs mt-2" style={{ color: C.textDim }}>Feature audiences overlap. Repeated saves of the same task, grade or session are not separately identified by the current event log; action counts are recorded activity, not unique content created.</p>
    </div>
    <p className="text-xs mt-3" style={{ color: C.warningText }}>Purchase likelihood: not measured. Checkout is currently simulated and disabled during the free launch, so these users are a usage-qualified audience, not a predicted paying audience. No payment probability is inferred.</p>
    </details>
  </section>;
}
