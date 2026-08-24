"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Badge, useC, useS, callAdmin, fmtDate, fmtSar, Loading, SectionHeader } from "./_lib";

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  sub_status: string | null;
  billing_cycle: string | null;
  amount_sar: number | null;
  trial_ends_at: string | null;
  expires_at: string | null;
  coupon_code: string | null;
  discount_percent: number | null;
  is_admin: boolean;
}

export function UsersSection({
  session, onOpenUser,
}: {
  session: Session;
  onOpenUser: (id: string) => void;
}) {
  const C = useC();
  const S = useS();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<string>("created_desc");
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await callAdmin(session, "users_list", { search, status, sort, limit: pageSize, offset });
    if (res?.ok) { setUsers(res.users ?? []); setTotal(res.total ?? 0); }
    setLoading(false);
  }, [session, search, status, sort, offset]);

  useEffect(() => { void load(); }, [load]);

  const filters: { id: string; label: string }[] = [
    { id: "all",       label: "All" },
    { id: "active",    label: "Active" },
    { id: "trial",     label: "Trial" },
    { id: "paid",      label: "Paid" },
    { id: "expired",   label: "Expired" },
    { id: "cancelled", label: "Cancelled" },
    { id: "free",      label: "Free" },
  ];

  return (
    <div>
      <SectionHeader
        title={`Users${total > 0 ? ` (${total.toLocaleString()})` : ""}`}
        action={
          <div className="flex gap-2">
            <input
              type="text" placeholder="Search email…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
              style={{ ...S.input, width: 240, fontSize: 13 }}
            />
            <select
              value={sort} onChange={(e) => setSort(e.target.value)}
              style={{ ...S.input, width: 170, fontSize: 13 }}
            >
              <option value="created_desc">Newest first</option>
              <option value="created_asc">Oldest first</option>
              <option value="last_active_desc">Last active</option>
            </select>
          </div>
        }
      />

      {/* Filters */}
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

      {/* Table */}
      {loading && users.length === 0 ? (
        <Loading text="Loading users…" />
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Email", "Plan", "Status", "Amount", "Joined", "Last seen", "Admin"].map((h) => (
                  <th key={h} style={S.tableHead}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center" style={{ color: C.textFaint }}>No users found.</td></tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => onOpenUser(u.id)}
                    className="transition-colors hover:bg-[#111827] cursor-pointer"
                    style={{ borderBottom: `1px solid ${C.border}` }}
                  >
                    <td style={{ ...S.tableCell, fontWeight: 500 }}>{u.email}</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{u.billing_cycle ?? "—"}</td>
                    <td style={S.tableCell}>{u.sub_status ? <Badge status={u.sub_status} /> : <span style={{ color: C.textFaint }}>free</span>}</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{u.amount_sar != null ? fmtSar(u.amount_sar) : "—"}</td>
                    <td style={{ ...S.tableCell, color: C.textDim }}>{fmtDate(u.created_at)}</td>
                    <td style={{ ...S.tableCell, color: C.textDim }}>{u.last_sign_in_at ? fmtDate(u.last_sign_in_at) : "—"}</td>
                    <td style={S.tableCell}>{u.is_admin && <span style={{ color: C.warning, fontSize: 14 }}>★</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12px]" style={{ color: C.textDim }}>
            Showing {offset + 1}–{Math.min(offset + pageSize, total)} of {total.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))} style={{ ...S.btnSec, opacity: offset === 0 ? 0.5 : 1 }}>← Prev</button>
            <button disabled={offset + pageSize >= total} onClick={() => setOffset(offset + pageSize)} style={{ ...S.btnSec, opacity: offset + pageSize >= total ? 0.5 : 1 }}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
