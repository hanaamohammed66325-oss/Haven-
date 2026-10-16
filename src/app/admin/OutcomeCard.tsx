"use client";
import { useC } from './_lib';
import { metricPercent, periodStatus } from '@/lib/adminOutcomeMetrics';
import type { GrowthMetric } from '@/lib/growth';

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const n = (v: number) => fmt.format(v);

export function OutcomeCard({ title, detail, current, previous, available = true, ar = true, countFirst = false }: {
  title: string; detail: string; current: GrowthMetric; previous?: GrowthMetric; available?: boolean; ar?: boolean; countFirst?: boolean;
}) {
  const C = useC();
  const pct = metricPercent(current), old = previous ? metricPercent(previous) : null;
  const status = available && previous ? periodStatus(current, previous) : 'neutral';
  const ink = { good: C.successText, low: C.danger, watch: C.warningText, neutral: C.textMuted }[status];
  const label = !available ? (ar ? 'الرصد متوقف' : 'Tracking off') : !current.total ? (ar ? 'بانتظار البيانات' : 'Awaiting data') :
    { good: ar ? 'تحسّن' : 'Improving', low: ar ? 'تراجع' : 'Declining', watch: ar ? 'دون تغيّر واضح' : 'No clear change', neutral: ar ? 'البيانات لم تكتمل' : 'Not enough data yet' }[status];
  return <article className="min-w-0 rounded-xl border p-4" style={{ borderColor: C.border, background: C.panel }}>
    <h3 className="text-sm font-semibold" style={{ color: C.text }}>{title}</h3>
    <div className="flex flex-wrap items-baseline gap-2 my-2"><strong className="text-2xl tabular-nums" style={{ color: available ? ink : C.textMuted }}>{available && pct !== null ? countFirst ? n(current.yes) : n(pct) + '%' : '—'}</strong>
      <span className="text-xs" style={{ color: ink }}>{label}</span></div>
    <p className="text-xs" style={{ color: C.textDim }}>{available && pct !== null && countFirst ? n(pct) + '% · ' : ''}{detail}</p>
    <details className="text-xs mt-2" style={{ color: C.textDim }}><summary className="cursor-pointer">{ar ? 'عرض التفاصيل' : 'View details'}</summary>
    <p className="mt-2">{ar ? `${n(current.yes)} من أصل ${n(current.total)}` : `${n(current.yes)} out of ${n(current.total)}`}</p>
    {available && pct !== null && old !== null && <p className="text-xs mt-2" style={{ color: C.textDim }}>{ar ? 'مقابل الفترة السابقة: ' : 'Versus previous period: '}{pct >= old ? '+' : ''}{n(pct - old)} {ar ? 'نقطة مئوية' : 'percentage points'}</p>}
    {!!current.unknown && <p className="text-xs mt-2" style={{ color: C.warningText }}>{ar ? 'سجلات ذات تغطية غير مكتملة: ' : 'Records with incomplete coverage: '}{n(current.unknown)}</p>}
    </details>
  </article>;
}
