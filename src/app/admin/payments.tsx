"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Badge, useC, useS, callAdmin, fmtDate, fmtSar, Loading, SectionHeader } from "./_lib";

interface PayRow {
  subscription_id: string; user_id: string; email: string;
  transaction_id: string | null;
  amount_sar: number; plan: string;
  subscription_status: string;
  payment_status: string;
  paid_at: string | null;
  created_at: string;
  coupon_code: string | null;
  discount_percent: number | null;
}

export function PaymentsSection({
  session, onOpenUser,
}: { session: Session; onOpenUser: (id: string) => void; }) {
  const C = useC();
  const S = useS();
  const [rows, setRows] = useState<PayRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await callAdmin(session, "payments_list", { status, search, limit: pageSize, offset });
    if (res?.ok) { setRows(res.payments ?? []); setTotal(res.total ?? 0); }
    setLoading(false);
  }, [session, status, search, offset]);
  useEffect(() => { void load(); }, [load]);

  const filters = [
    { id: "all",     label: "All" },
    { id: "paid",    label: "Paid" },
    { id: "trial",   label: "Trial (0 SAR)" },
    { id: "pending", label: "Pending" },
    { id: "failed",  label: "Failed" },
  ];

  return (
    <div>
      <SectionHeader
        title={`Payments${total > 0 ? ` (${total.toLocaleString()})` : ""}`}
        action={
          <input
            type="text" placeholder="Search email or transaction ID…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            style={{ ...S.input, width: 280, fontSize: 13 }}
          />
        }
      />

      <div className="rounded-xl border p-4 mb-5" style={{ borderColor: C.warning + "44", background: C.warning + "0a" }}>
        <p className="text-[12px]" style={{ color: C.warningText }}>
          🔒 Haven does not store bank card data, CVV, or sensitive card details. Only transaction IDs, amounts, statuses, and dates are stored for management.
        </p>
      </div>

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
        <Loading text="Loading payments…" />
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Transaction ID", "Customer", "Amount", "Plan", "Status", "Paid at", "Coupon"].map((h) => (
                  <th key={h} style={S.tableHead}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center" style={{ color: C.textFaint }}>No payments.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.subscription_id}
                    onClick={() => onOpenUser(r.user_id)}
                    className="transition-colors hover:bg-[#111827] cursor-pointer"
                    style={{ borderBottom: `1px solid ${C.border}` }}
                  >
                    <td style={{ ...S.tableCell, fontFamily: "monospace", fontSize: 11, color: C.textDim }}>{r.transaction_id ? r.transaction_id.slice(0, 20) : "—"}</td>
                    <td style={{ ...S.tableCell, fontWeight: 500 }}>{r.email || "—"}</td>
                    <td style={{ ...S.tableCell, color: C.text, fontWeight: 600 }}>{fmtSar(r.amount_sar)}</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{r.plan}</td>
                    <td style={S.tableCell}><Badge status={r.payment_status} kind="payment" /></td>
                    <td style={{ ...S.tableCell, color: C.textDim }}>{r.paid_at ? fmtDate(r.paid_at) : "—"}</td>
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
