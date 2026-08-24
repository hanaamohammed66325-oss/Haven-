"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Badge, useC, useS, callAdmin, fmtDateTime, fmtSar, Loading, StatCard } from "./_lib";

interface Detail {
  profile: {
    id: string; email: string; created_at: string;
    last_sign_in_at: string | null; email_confirmed_at: string | null;
    banned_until: string | null; full_name: string; is_vip: boolean; is_admin: boolean;
  } | null;
  subscription: {
    id: string; status: string; billing_cycle: string; amount_sar: number;
    trial_ends_at: string | null; expires_at: string | null; next_billing_at: string | null;
    cancelled_at: string | null; last_payment_at: string | null; last_payment_id: string | null;
    coupon_code: string | null; discount_percent: number | null;
  } | null;
  payment_summary: { total_paid_sar: number; payment_count: number; last_payment_at: string | null } | null;
  push_devices: number;
  tickets: Array<{ id: string; subject: string; status: string; priority: string; category: string; created_at: string; updated_at: string }> | null;
  activity: Array<{ kind: string; ts: string; detail: Record<string, unknown> }> | null;
}

export function UserDetailSection({
  session, userId, onBack,
}: {
  session: Session;
  userId: string;
  onBack: () => void;
}) {
  const C = useC();
  const S = useS();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await callAdmin(session, "user_detail", { user_id: userId });
    if (res?.ok) setDetail(res.detail);
    setLoading(false);
  }, [session, userId]);

  useEffect(() => { void load(); }, [load]);

  if (loading || !detail) return <Loading text="Loading user…" />;
  const p = detail.profile;
  const s = detail.subscription;
  const ps = detail.payment_summary;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} style={S.btnSec}>← Users</button>
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: C.text }}>{p?.email ?? "—"}</h1>
          <div className="text-[11px]" style={{ color: C.textDim }}>{userId}</div>
        </div>
        <div className="ms-auto flex gap-2">
          {p?.is_admin && <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: C.warning + "22", color: C.warning }}>ADMIN</span>}
          {p?.is_vip &&   <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: C.indigoBg, color: C.indigo }}>VIP</span>}
        </div>
      </div>

      {/* Profile */}
      <div className="rounded-xl border p-5 mb-4" style={{ borderColor: C.border, background: C.panel }}>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: C.textDim }}>Profile</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
          <KV label="Name" value={p?.full_name || "—"} />
          <KV label="Joined" value={fmtDateTime(p?.created_at)} />
          <KV label="Last seen" value={p?.last_sign_in_at ? fmtDateTime(p.last_sign_in_at) : "—"} />
          <KV label="Email confirmed" value={p?.email_confirmed_at ? fmtDateTime(p.email_confirmed_at) : "No"} />
          <KV label="Account status" value={p?.banned_until ? "Banned" : "Active"} />
          <KV label="Push devices" value={String(detail.push_devices)} />
        </div>
      </div>

      {/* Subscription + payment summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2 rounded-xl border p-5" style={{ borderColor: C.border, background: C.panel }}>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: C.textDim }}>Subscription</h2>
          {!s ? (
            <p className="text-[13px]" style={{ color: C.textFaint }}>No subscription — free tier.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-[13px]">
              <KV label="Status" value={<Badge status={s.status} />} />
              <KV label="Plan" value={s.billing_cycle} />
              <KV label="Amount" value={fmtSar(s.amount_sar)} />
              <KV label="Trial ends" value={s.trial_ends_at ? fmtDateTime(s.trial_ends_at) : "—"} />
              <KV label="Next billing" value={s.next_billing_at ? fmtDateTime(s.next_billing_at) : "—"} />
              <KV label="Expires" value={s.expires_at ? fmtDateTime(s.expires_at) : "—"} />
              <KV label="Last payment" value={s.last_payment_at ? fmtDateTime(s.last_payment_at) : "—"} />
              <KV label="Coupon" value={s.coupon_code ? `${s.coupon_code} (−${s.discount_percent}%)` : "—"} />
              <KV label="Cancelled" value={s.cancelled_at ? fmtDateTime(s.cancelled_at) : "—"} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <StatCard label="Total paid" value={fmtSar(ps?.total_paid_sar ?? 0)} accent={C.success} />
          <StatCard label="# Payments" value={ps?.payment_count ?? 0} />
        </div>
      </div>

      {/* Tickets */}
      <div className="rounded-xl border p-5 mb-4" style={{ borderColor: C.border, background: C.panel }}>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: C.textDim }}>Support tickets</h2>
        {!detail.tickets?.length ? (
          <p className="text-[13px]" style={{ color: C.textFaint }}>No tickets from this user.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {detail.tickets.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: C.panel2 }}>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: C.text }}>{t.subject}</div>
                  <div className="text-[11px]" style={{ color: C.textDim }}>{t.category} · {fmtDateTime(t.created_at)}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Badge status={t.priority} kind="priority" />
                  <Badge status={t.status} kind="ticket" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity */}
      <div className="rounded-xl border p-5" style={{ borderColor: C.border, background: C.panel }}>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: C.textDim }}>Activity</h2>
        {!detail.activity?.length ? (
          <p className="text-[13px]" style={{ color: C.textFaint }}>No activity recorded.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {detail.activity.map((a, i) => (
              <div key={`${a.kind}-${a.ts}-${i}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: C.panel2 }}>
                <span className="text-[13px]" style={{ color: C.text }}>{a.kind.replace(/_/g, " ")}</span>
                <span className="text-[11px]" style={{ color: C.textDim }}>{fmtDateTime(a.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  const C = useC();
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.textFaint }}>{label}</div>
      <div style={{ color: C.text, fontWeight: 500 }}>{value}</div>
    </div>
  );
}
