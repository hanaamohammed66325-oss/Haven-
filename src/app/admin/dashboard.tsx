"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { callAdmin, useC, fmtDateTime, fmtSar, StatCard, SectionHeader, Loading, timeAgo } from "./_lib";

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

export function DashboardSection({ session }: { session: Session }) {
  const C = useC();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [revenue, setRevenue] = useState<DayPoint[]>([]);
  const [growth, setGrowth] = useState<DayPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, r, c] = await Promise.all([
      callAdmin(session, "dashboard_metrics"),
      callAdmin(session, "dashboard_recent", { limit: 15 }),
      callAdmin(session, "dashboard_charts", { days: 30 }),
    ]);
    if (m?.ok) setMetrics(m.metrics);
    if (r?.ok) setEvents(r.events ?? []);
    if (c?.ok) { setRevenue(c.revenue ?? []); setGrowth(c.user_growth ?? []); }
    setLoading(false);
  }, [session]);

  useEffect(() => { void load(); }, [load]);

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

      {metrics && (
        <div className="flex flex-col gap-4">
          {/* Row 1 — Users */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total users" value={metrics.total_users} />
            <StatCard label="Active (30d)" value={metrics.active_users_30d} accent={C.primary} sub={`${metrics.active_users_7d} active this week`} />
            <StatCard label="New (30d)" value={metrics.new_users_30d} sub={`${metrics.new_users_7d} this week`} />
            <StatCard label="Push devices" value={metrics.push_devices} />
          </div>

          {/* Row 2 — Subscriptions */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Active subs" value={metrics.active_subs} accent={C.success} />
            <StatCard label="Trial" value={metrics.trial_subs} />
            <StatCard label="Expired" value={metrics.expired_subs} />
            <StatCard label="Cancelled" value={metrics.cancelled_subs} />
          </div>

          {/* Row 3 — Revenue + Alerts */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="MRR" value={fmtSar(metrics.mrr_sar)} accent={C.warning} />
            <StatCard label="Revenue (30d)" value={fmtSar(metrics.revenue_30d_sar)} />
            <StatCard label="Failed payments" value={metrics.failed_payments} accent={metrics.failed_payments > 0 ? C.danger : undefined} />
            <StatCard label="Open tickets" value={metrics.open_tickets} accent={metrics.urgent_tickets > 0 ? C.danger : undefined} sub={metrics.urgent_tickets > 0 ? `${metrics.urgent_tickets} urgent` : undefined} />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
            <ChartCard title="Revenue — last 30 days" points={revenue.map(p => ({ x: p.day, y: Number(p.revenue_sar || 0) }))} color={C.warning} suffix=" SAR" />
            <ChartCard title="New users — last 30 days" points={growth.map(p => ({ x: p.day, y: Number(p.new_users || 0) }))} color={C.primary} />
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
