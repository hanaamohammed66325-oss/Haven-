"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, callAdmin, useC, fmtSar, StatCard, ClickableCard, SectionHeader, Loading, timeAgo, ErrorBanner } from "./_lib";
import { useDrill } from "./_drill";

interface Metrics {
  total_users: number;
  new_users_7d: number;
  new_users_30d: number;
  active_users_7d: number;
  active_users_30d: number;
  active_subs: number;
  trial_subs: number;
  pending_subs: number;
  expired_subs: number;
  cancelled_subs: number;
  failed_payments: number;
  push_devices: number;
  open_tickets: number;
  urgent_tickets: number;
  mrr_sar: number;
  revenue_30d_sar: number;
  revenue_all_sar: number;
}

interface Event {
  kind: string;
  ts: string;
  user_id: string;
  email: string;
  detail: Record<string, unknown>;
}

interface DayPoint { day: string; revenue_sar?: number; new_users?: number; cumulative_users?: number; tx_count?: number; }

interface Live {
  online_now: number; online_15m: number;
  in_app_now: number; in_browser_now: number;
  range_days: number; new_users: number; active_users: number;
}

/** Range presets (days). Months are expressed as 30-day multiples. */
const RANGE_PRESETS: { label: string; days: number }[] = [
  { label: "7 days",   days: 7 },
  { label: "30 days",  days: 30 },
  { label: "90 days",  days: 90 },
  { label: "6 months", days: 180 },
  { label: "12 months", days: 365 },
];

/** Human label for an arbitrary day count (months when it divides evenly). */
function rangeLabel(days: number): string {
  const preset = RANGE_PRESETS.find((r) => r.days === days);
  if (preset) return `last ${preset.label}`;
  if (days % 30 === 0) return `last ${days / 30} months`;
  return `last ${days} days`;
}

export function DashboardSection({ session, showBilling }: { session: Session; showBilling: boolean }) {
  const C = useC();
  const drill = useDrill();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [revenue, setRevenue] = useState<DayPoint[]>([]);
  const [growth, setGrowth] = useState<DayPoint[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [rangeDays, setRangeDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [m, r, c, l] = await Promise.all([
      callAdmin(session, "dashboard_metrics"),
      callAdmin(session, "dashboard_recent", { limit: 15 }),
      callAdmin(session, "dashboard_charts", { days: rangeDays }),
      supabase.rpc("admin_dashboard_live", { range_days: rangeDays }),
    ]);
    if (m?.ok) setMetrics(m.metrics);
    else setError(m?.error ?? "Failed to load dashboard");
    if (r?.ok) setEvents(r.events ?? []);
    if (c?.ok) { setRevenue(c.revenue ?? []); setGrowth(c.user_growth ?? []); }
    if (!l.error) setLive(l.data as Live);
    setLoading(false);
  }, [session, rangeDays]);

  useEffect(() => { void load(); }, [load]);

  // Keep the live presence numbers fresh without a full reload.
  useEffect(() => {
    const id = setInterval(async () => {
      const { data, error } = await supabase.rpc("admin_dashboard_live", { range_days: rangeDays });
      if (!error && data) setLive(data as Live);
    }, 30000);
    return () => clearInterval(id);
  }, [rangeDays]);

  if (loading && !metrics) return <Loading text="Loading dashboard…" />;

  return (
    <div>
      <SectionHeader
        title="Overview"
        action={
          <button onClick={() => void load()} className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: C.border, color: C.textMuted, border: "none" }}>
            {loading ? "…" : "↻ Refresh"}
          </button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      {metrics && (
        <div className="flex flex-col gap-4">
          {/* Live presence — who is in the app vs the browser right now */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <LiveCard label="In app now" value={live?.in_app_now ?? 0} hint="installed app · last 5 min" accent={C.success} live onClick={() => drill({ title: "In app now", card: "in_app_now" })} />
            <LiveCard label="In browser now" value={live?.in_browser_now ?? 0} hint="website · last 5 min" accent={C.primary} live onClick={() => drill({ title: "In browser now", card: "in_browser_now" })} />
            <StatCard label="Online (total)" value={live?.online_now ?? 0} sub="active in last 5 min" onClick={() => drill({ title: "Online now", card: "online_now" })} />
            <StatCard label="Last 15 min" value={live?.online_15m ?? 0} onClick={() => drill({ title: "Active in the last 15 min", card: "online_15m" })} />
          </div>

          {/* Range selector — pick days or months */}
          <RangeSelector days={rangeDays} onChange={setRangeDays} />

          {/* Row 1 — Users (Active / New follow the selected range) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total users" value={metrics.total_users} />
            <StatCard label={`Active (${rangeLabel(rangeDays).replace("last ", "")})`} value={live?.active_users ?? metrics.active_users_30d} accent={C.primary} sub={`updates with range`} />
            <StatCard label={`New (${rangeLabel(rangeDays).replace("last ", "")})`} value={live?.new_users ?? metrics.new_users_30d} sub={`${metrics.new_users_7d} in last 7 days`} />
            <StatCard label="Push devices" value={metrics.push_devices} onClick={() => drill({ title: "Users with push devices", card: "push_devices" })} />
          </div>

          {/* Row 2 — Subscriptions (billing, hidden until launch) */}
          {showBilling && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Active subs" value={metrics.active_subs} accent={C.success} />
              <StatCard label="Trial" value={metrics.trial_subs} />
              <StatCard label="Expired" value={metrics.expired_subs} />
              <StatCard label="Cancelled" value={metrics.cancelled_subs} />
            </div>
          )}

          {/* Row 3 — Revenue (billing) + Alerts. Open tickets always shown. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {showBilling && <StatCard label="MRR" value={fmtSar(metrics.mrr_sar)} accent={C.warning} />}
            {showBilling && <StatCard label="Revenue (30d)" value={fmtSar(metrics.revenue_30d_sar)} />}
            {showBilling && <StatCard label="Failed payments" value={metrics.failed_payments} accent={metrics.failed_payments > 0 ? C.danger : undefined} />}
            <StatCard label="Open tickets" value={metrics.open_tickets} accent={metrics.urgent_tickets > 0 ? C.danger : undefined} sub={metrics.urgent_tickets > 0 ? `${metrics.urgent_tickets} urgent` : undefined} />
          </div>

          {/* Charts — revenue chart is billing-only */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
            {showBilling && <ChartCard title={`Revenue — ${rangeLabel(rangeDays)}`} points={revenue.map(p => ({ x: p.day, y: Number(p.revenue_sar || 0) }))} color={C.warning} suffix=" SAR" />}
            <ChartCard title={`New users — ${rangeLabel(rangeDays)}`} points={growth.map(p => ({ x: p.day, y: Number(p.new_users || 0) }))} color={C.primary} />
          </div>

          {/* Recent activity */}
          <div className="mt-2">
            <h2 className="text-[15px] font-semibold mb-3" style={{ color: C.text }}>Recent activity</h2>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border, background: C.panel }}>
              {events.length === 0 ? (
                <p className="p-6 text-center text-[13px]" style={{ color: C.textFaint }}>No recent activity.</p>
              ) : (
                events.map((e, i) => (
                  <div
                    key={`${e.kind}-${e.ts}-${i}`}
                    className="flex items-center justify-between px-5 py-3 gap-3"
                    style={{ borderBottom: i === events.length - 1 ? "none" : `1px solid ${C.border}` }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span style={{ fontSize: 14 }}>{iconFor(e.kind)}</span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate" style={{ color: C.text }}>{labelFor(e.kind)}</div>
                        <div className="text-[11px] truncate" style={{ color: C.textDim }}>{e.email || "—"}</div>
                      </div>
                    </div>
                    <div className="text-[11px] whitespace-nowrap" style={{ color: C.textFaint }}>{timeAgo(e.ts)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Live presence card (with pulsing dot) ----------
function LiveCard({
  label, value, hint, accent, live, onClick,
}: { label: string; value: number; hint: string; accent: string; live?: boolean; onClick?: () => void }) {
  const C = useC();
  return (
    <ClickableCard onClick={onClick} className="rounded-xl border p-5" style={{ borderColor: C.tint(accent, "55"), background: C.tint(accent, "11") }}>
      <div className="flex items-center gap-2 mb-3">
        {live && <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: accent, boxShadow: `0 0 0 3px ${C.tint(accent, "33")}` }} />}
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.textDim }}>{label}</div>
      </div>
      <div className="text-[28px] font-bold leading-none tabular-nums" style={{ color: accent }}>{value.toLocaleString("en")}</div>
      <div className="text-[12px] mt-2" style={{ color: C.textDim }}>{hint}</div>
    </ClickableCard>
  );
}

// ---------- Range selector — presets + custom days/months ----------
function RangeSelector({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  const C = useC();
  const [customVal, setCustomVal] = useState("");
  const [unit, setUnit] = useState<"days" | "months">("days");
  const isPreset = RANGE_PRESETS.some((r) => r.days === days);
  const fieldStyle: React.CSSProperties = {
    borderColor: C.border2, background: C.mode === "light" ? C.panel2 : C.border, color: C.text,
  };
  const applyCustom = () => {
    const n = Math.max(1, Math.min(3650, Math.round(Number(customVal) || 0)));
    if (!n) return;
    onChange(unit === "months" ? n * 30 : n);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: C.border, background: C.panel }}>
      <span className="text-[11px] font-semibold uppercase tracking-wide me-1" style={{ color: C.textDim }}>Range</span>
      {RANGE_PRESETS.map((r) => {
        const active = days === r.days;
        return (
          <button
            key={r.days}
            onClick={() => onChange(r.days)}
            className="rounded-full px-3 py-1 text-[12px] font-medium"
            style={{ background: active ? C.primary : C.border, color: active ? "#fff" : C.textMuted, border: "none", cursor: "pointer" }}
          >
            {r.label}
          </button>
        );
      })}
      <span className="mx-1 text-[11px]" style={{ color: C.textFaint }}>or</span>
      <input
        type="number" min={1} value={customVal}
        onChange={(e) => setCustomVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") applyCustom(); }}
        placeholder="#"
        className="w-16 rounded-lg border px-2 py-1 text-[13px] outline-none" style={fieldStyle}
      />
      <select
        value={unit} onChange={(e) => setUnit(e.target.value as "days" | "months")}
        className="rounded-lg border px-2 py-1 text-[13px] outline-none" style={fieldStyle}
      >
        <option value="days">days</option>
        <option value="months">months</option>
      </select>
      <button
        onClick={applyCustom}
        className="rounded-lg px-3 py-1 text-[12px] font-medium"
        style={{ background: C.border, color: C.text, border: "none", cursor: "pointer" }}
      >
        Apply
      </button>
      {!isPreset && <span className="text-[11px]" style={{ color: C.textFaint }}>· {rangeLabel(days)}</span>}
    </div>
  );
}

function iconFor(kind: string): string {
  if (kind === "signup") return "🆕";
  if (kind.startsWith("trial")) return "🎁";
  if (kind === "subscription_active") return "✅";
  if (kind === "subscription_cancelled") return "❌";
  if (kind === "payment_failed") return "⚠️";
  if (kind === "ticket_created") return "🎫";
  return "•";
}
function labelFor(kind: string): string {
  switch (kind) {
    case "signup": return "New signup";
    case "trial_started": return "Trial started";
    case "subscription_active": return "Subscription active";
    case "subscription_cancelled": return "Subscription cancelled";
    case "payment_failed": return "Payment failed";
    case "ticket_created": return "Ticket created";
    default: return kind.replace(/_/g, " ");
  }
}

// ---------- Simple inline SVG line chart ----------
function ChartCard({
  title, points, color, suffix = "",
}: {
  title: string;
  points: { x: string; y: number }[];
  color: string;
  suffix?: string;
}) {
  const C = useC();
  const W = 100, H = 40;
  const max = Math.max(1, ...points.map((p) => p.y));
  const total = points.reduce((s, p) => s + p.y, 0);
  const path = points.length > 0
    ? points.map((p, i) => {
        const x = (i / Math.max(1, points.length - 1)) * W;
        const y = H - (p.y / max) * (H - 4) - 2;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      }).join(" ")
    : "";
  const area = path ? `${path} L ${W} ${H} L 0 ${H} Z` : "";
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: C.border, background: C.panel }}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[13px] font-semibold" style={{ color: C.textMuted }}>{title}</h3>
        <span className="text-[16px] font-bold tabular-nums" style={{ color }}>{Math.round(total).toLocaleString()}{suffix}</span>
      </div>
      <svg width="100%" height="80" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <path d={area} fill={color} opacity="0.15" />
        <path d={path} fill="none" stroke={color} strokeWidth="0.8" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between mt-1">
        <span className="text-[10px]" style={{ color: C.textFaint }}>{points[0]?.x?.slice(5) ?? ""}</span>
        <span className="text-[10px]" style={{ color: C.textFaint }}>{points[points.length - 1]?.x?.slice(5) ?? ""}</span>
      </div>
    </div>
  );
}
