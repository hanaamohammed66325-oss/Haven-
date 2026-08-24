"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useC, useS, callAdmin, fmtDate, Loading, SectionHeader } from "./_lib";

interface Coupon {
  id: string; code: string; percent_off: number;
  max_uses: number | null; uses_count: number;
  expires_at: string | null; active: boolean; created_at: string;
}

export function CouponsSection({ session }: { session: Session }) {
  const C = useC();
  const S = useS();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState("");
  const [newPercent, setNewPercent] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpires, setNewExpires] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await callAdmin(session, "coupons_list");
    if (res?.ok) setCoupons(res.coupons ?? []);
    setLoading(false);
  }, [session]);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (c: Coupon) => {
    const res = await callAdmin(session, "coupon_toggle", { id: c.id, active: !c.active });
    if (res?.ok) setCoupons((prev) => prev.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)));
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setCreateError(""); setCreateLoading(true);
    const res = await callAdmin(session, "coupon_create", {
      code: newCode.trim().toUpperCase(),
      percent_off: Number(newPercent),
      max_uses: newMaxUses ? Number(newMaxUses) : null,
      expires_at: newExpires || null,
    });
    if (res?.ok) { setCoupons((p) => [res.coupon, ...p]); setNewCode(""); setNewPercent(""); setNewMaxUses(""); setNewExpires(""); }
    else setCreateError(res?.error ?? "Failed");
    setCreateLoading(false);
  };

  return (
    <div>
      <SectionHeader title="Coupons" />

      <div className="rounded-xl border p-5 mb-6" style={{ borderColor: C.border, background: C.panel }}>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: C.textDim }}>Create coupon</h2>
        <form onSubmit={create}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div><label style={S.label}>Code *</label><input required type="text" placeholder="SAVE20" value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} style={S.input} /></div>
            <div><label style={S.label}>Discount % *</label><input required type="number" min={1} max={100} placeholder="20" value={newPercent} onChange={(e) => setNewPercent(e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Max uses</label><input type="number" min={1} placeholder="Unlimited" value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Expires</label><input type="date" value={newExpires} onChange={(e) => setNewExpires(e.target.value)} style={S.input} /></div>
          </div>
          {createError && <p className="text-[12px] mb-3" style={{ color: C.danger }}>{createError}</p>}
          <button type="submit" disabled={createLoading} style={{ ...S.btnPrimary, opacity: createLoading ? 0.5 : 1 }}>{createLoading ? "…" : "Create coupon"}</button>
        </form>
      </div>

      {loading ? (
        <Loading text="Loading coupons…" />
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Code", "Discount", "Used / Max", "Expires", "Created", "Status", ""].map((h) => (
                  <th key={h} style={S.tableHead}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center" style={{ color: C.textFaint }}>No coupons yet.</td></tr>
              ) : (
                coupons.map((c) => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: c.active ? 1 : 0.45 }}>
                    <td style={{ ...S.tableCell, fontFamily: "monospace", fontWeight: 700 }}>{c.code}</td>
                    <td style={{ ...S.tableCell, color: C.successText, fontWeight: 600 }}>{c.percent_off}%</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{c.uses_count} / {c.max_uses ?? "∞"}</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{c.expires_at ? fmtDate(c.expires_at) : "Never"}</td>
                    <td style={{ ...S.tableCell, color: C.textDim }}>{fmtDate(c.created_at)}</td>
                    <td style={S.tableCell}>
                      <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: c.active ? C.successBg : C.border, color: c.active ? C.successText : C.textFaint }}>
                        {c.active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td style={S.tableCell}>
                      <button onClick={() => toggle(c)} className="text-[12px] px-3 py-1.5 rounded-lg font-medium" style={{ background: C.border, color: c.active ? C.danger : C.successText, border: "none", cursor: "pointer" }}>
                        {c.active ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
