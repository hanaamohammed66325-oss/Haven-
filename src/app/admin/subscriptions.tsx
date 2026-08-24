"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Badge, useC, useS, callAdmin, fmtDate, fmtDateTime, fmtSar, Loading, SectionHeader } from "./_lib";

interface SubRow {
  id: string; user_id: string; email: string;
  status: string; billing_cycle: string; amount_sar: number;
  trial_ends_at: string | null; expires_at: string | null;
  next_billing_at: string | null; last_payment_at: string | null;
  created_at: string; cancelled_at: string | null;
  coupon_code: string | null; discount_percent: number | null;
}

export function SubscriptionsSection({
  session, onOpenUser,
}: {
  session: Session; onOpenUser: (id: string) => void;
}) {
  const C = useC();
  const S = useS();
  const [rows, setRows] = useState<SubRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await callAdmin(session, "subscriptions_list", { status, search, limit: pageSize, offset });
    if (res?.ok) { setRows(res.subscriptions ?? []); setTotal(res.total ?? 0); }
    setLoading(false);
  }, [session, status, search, offset]);
  useEffect(() => { void load(); }, [load]);

  const filters = [
    { id: "all",             label: "All" },
    { id: "active",          label: "Active" },
    { id: "trial",           label: "Trial" },
    { id: "expired",         label: "Expired" },
    { id: "cancelled",       label: "Cancelled" },
    { id: "payment_failed",  label: "Payment failed" },
  ];

  return (
    <div>
      <SectionHeader
        title={`Subscriptions${total > 0 ? ` (${total.toLocaleString()})` : ""}`}
        action={
          <input
            type="text" placeholder="Search email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            style={{ ...S.input, width: 240, fontSize: 13 }}
          />
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => { setStatus(f.id); setOffset(0); }}
            className="rounded-full px-3 py-1 text-[12px] font-medium"
            style={{
              background: status === f.id ? C.primarySoft : C.border,
              color: status === f.id ? "#fff" : C.textMuted,
              border: "none", cursor: "pointer",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && rows.length === 0 ? (
        <Loading text="Loading subscriptions…" />
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Customer", "Plan", "Status", "Amount", "Started", "Next billing", "Trial ends", "Coupon"].map((h) => (
                  <th key={h} style={S.tableHead}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center" style={{ color: C.textFaint }}>No subscriptions.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => onOpenUser(r.user_id)}
                    className="transition-colors hover:bg-[#111827] cursor-pointer"
                    style={{ borderBottom: `1px solid ${C.border}` }}
                  >
                    <td style={{ ...S.tableCell, fontWeight: 500 }}>{r.email || "—"}</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{r.billing_cycle}</td>
                    <td style={S.tableCell}><Badge status={r.status} /></td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{fmtSar(r.amount_sar)}</td>
                    <td style={{ ...S.tableCell, color: C.textDim }}>{fmtDate(r.created_at)}</td>
                    <td style={{ ...S.tableCell, color: C.textDim }}>{r.next_billing_at ? fmtDate(r.next_billing_at) : "—"}</td>
                    <td style={{ ...S.tableCell, color: C.textDim }}>{r.trial_ends_at ? fmtDate(r.trial_ends_at) : "—"}</td>
                    <td style={S.tableCell}>{r.coupon_code ? <span style={{ background: C.indigoBg, color: C.indigo, padding: "2px 6px", borderRadius: 4, fontSize: 11, fontFamily: "monospace" }}>{r.coupon_code} −{r.discount_percent}%</span> : <span style={{ color: C.textFaint }}>—</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12px]" style={{ color: C.textDim }}>Showing {offset + 1}–{Math.min(offset + pageSize, total)} of {total.toLocaleString()}</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))} style={{ ...S.btnSec, opacity: offset === 0 ? 0.5 : 1 }}>← Prev</button>
            <button disabled={offset + pageSize >= total} onClick={() => setOffset(offset + pageSize)} style={{ ...S.btnSec, opacity: offset + pageSize >= total ? 0.5 : 1 }}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
