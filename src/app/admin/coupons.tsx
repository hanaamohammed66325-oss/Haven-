"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useC, useS, callAdmin, fmtDate, fmtSar, Loading, SectionHeader, ErrorBanner } from "./_lib";

interface Coupon {
  id: string; code: string; percent_off: number;
  max_uses: number | null; uses_count: number;
  expires_at: string | null; active: boolean; created_at: string;
  influencer_id: string | null;
  influencer_name: string | null;
  paid_subscribers: number;
  revenue_sar: number;
}
interface Influencer {
  id: string; name: string; handle: string | null; platform: string | null;
  commission_percent: number; active: boolean; created_at: string;
  coupon_count: number;
  total_uses: number;
  active_subscribers: number;
  paid_subscribers: number;
  revenue_sar: number;
  commission_sar: number;
}
type Tab = "coupons" | "influencers";

export function CouponsSection({ session }: { session: Session }) {
  const C = useC();
  const [tab, setTab] = useState<Tab>("coupons");

  return (
    <div>
      <SectionHeader
        title="Marketing"
        action={
          <div className="flex rounded-lg p-1" style={{ background: C.border }}>
            <TabBtn active={tab === "coupons"} onClick={() => setTab("coupons")} label="🏷️ Coupons" />
            <TabBtn active={tab === "influencers"} onClick={() => setTab("influencers")} label="⭐ Influencers" />
          </div>
        }
      />
      {tab === "coupons" ? <CouponsTab session={session} /> : <InfluencersTab session={session} />}
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  const C = useC();
  return (
    <button
      onClick={onClick}
      className="rounded-md px-4 py-2 text-[12px] font-medium transition-colors"
      style={{
        background: active ? C.panel : "transparent",
        color: active ? C.text : C.textMuted,
        border: "none", cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

// ==========================================================================
// COUPONS TAB
// ==========================================================================
function CouponsTab({ session }: { session: Session }) {
  const C = useC();
  const S = useS();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newPercent, setNewPercent] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpires, setNewExpires] = useState("");
  const [newInfluencerId, setNewInfluencerId] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    const [cRes, iRes] = await Promise.all([
      callAdmin(session, "coupons_list"),
      callAdmin(session, "influencers_list"),
    ]);
    if (cRes?.ok) setCoupons(cRes.coupons ?? []);
    else setLoadError(cRes?.error ?? "Failed to load coupons");
    if (iRes?.ok) setInfluencers(iRes.influencers ?? []);
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
      influencer_id: newInfluencerId || null,
    });
    if (res?.ok) {
      setNewCode(""); setNewPercent(""); setNewMaxUses(""); setNewExpires(""); setNewInfluencerId("");
      void load();
    } else setCreateError(res?.error ?? "Failed");
    setCreateLoading(false);
  };

  return (
    <div>
      {loadError && <ErrorBanner message={loadError} onRetry={load} />}

      <div className="rounded-xl border p-5 mb-6" style={{ borderColor: C.border, background: C.panel }}>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: C.textDim }}>Create coupon</h2>
        <form onSubmit={create}>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div><label style={S.label}>Code *</label><input required type="text" placeholder="SAVE20" value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} style={S.input} /></div>
            <div><label style={S.label}>Discount % *</label><input required type="number" min={1} max={100} placeholder="20" value={newPercent} onChange={(e) => setNewPercent(e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Max uses</label><input type="number" min={1} placeholder="Unlimited" value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Expires</label><input type="date" value={newExpires} onChange={(e) => setNewExpires(e.target.value)} style={S.input} /></div>
            <div>
              <label style={S.label}>Link to influencer</label>
              <select value={newInfluencerId} onChange={(e) => setNewInfluencerId(e.target.value)} style={S.input}>
                <option value="">None</option>
                {influencers.filter((i) => i.active).map((i) => (
                  <option key={i.id} value={i.id}>{i.name}{i.handle ? ` (${i.handle})` : ""}</option>
                ))}
              </select>
            </div>
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
                {["Code", "Discount", "Used / Max", "Paid subs", "Revenue", "Influencer", "Expires", "Status", ""].map((h) => (
                  <th key={h} style={S.tableHead}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center" style={{ color: C.textFaint }}>No coupons yet.</td></tr>
              ) : (
                coupons.map((c) => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: c.active ? 1 : 0.45 }}>
                    <td style={{ ...S.tableCell, fontFamily: "monospace", fontWeight: 700 }}>{c.code}</td>
                    <td style={{ ...S.tableCell, color: C.successText, fontWeight: 600 }}>{c.percent_off}%</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{c.uses_count} / {c.max_uses ?? "∞"}</td>
                    <td style={{ ...S.tableCell, color: C.text, fontWeight: 500 }}>{c.paid_subscribers}</td>
                    <td style={{ ...S.tableCell, color: C.warningText, fontWeight: 600 }}>{fmtSar(c.revenue_sar)}</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{c.influencer_name ? <span style={{ background: C.indigoBg, color: C.indigo, padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{c.influencer_name}</span> : <span style={{ color: C.textFaint }}>—</span>}</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{c.expires_at ? fmtDate(c.expires_at) : "Never"}</td>
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

// ==========================================================================
// INFLUENCERS TAB
// ==========================================================================
function InfluencersTab({ session }: { session: Session }) {
  const C = useC();
  const S = useS();
  const [rows, setRows] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Influencer | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    const res = await callAdmin(session, "influencers_list");
    if (res?.ok) setRows(res.influencers ?? []);
    else setLoadError(res?.error ?? "Failed to load influencers");
    setLoading(false);
  }, [session]);
  useEffect(() => { void load(); }, [load]);

  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue_sar || 0), 0);
  const totalCommission = rows.reduce((s, r) => s + Number(r.commission_sar || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.paid_subscribers || 0), 0);

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryStat label="Influencers" value={String(rows.filter((r) => r.active).length)} />
        <SummaryStat label="Total paid subs" value={String(totalPaid)} accent={C.primary} />
        <SummaryStat label="Total revenue" value={fmtSar(totalRevenue)} accent={C.warning} />
        <SummaryStat label="Total commission owed" value={fmtSar(totalCommission)} accent={C.danger} />
      </div>

      {loadError && <ErrorBanner message={loadError} onRetry={load} />}

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowCreate(true)} style={S.btnPrimary}>+ Add influencer</button>
      </div>

      {loading ? (
        <Loading text="Loading influencers…" />
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Name", "Handle", "Platform", "Coupons", "Uses", "Active subs", "Paid subs", "Revenue", "Comm %", "Comm SAR", "Status", ""].map((h) => (
                  <th key={h} style={S.tableHead}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-10 text-center" style={{ color: C.textFaint }}>No influencers yet. Click "+ Add influencer" to start.</td></tr>
              ) : (
                rows.map((i) => (
                  <tr key={i.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: i.active ? 1 : 0.45 }}>
                    <td style={{ ...S.tableCell, fontWeight: 600 }}>{i.name}</td>
                    <td style={{ ...S.tableCell, color: C.textMuted, fontFamily: "monospace" }}>{i.handle ?? "—"}</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{i.platform ?? "—"}</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{i.coupon_count}</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{i.total_uses}</td>
                    <td style={{ ...S.tableCell, color: C.primary, fontWeight: 500 }}>{i.active_subscribers}</td>
                    <td style={{ ...S.tableCell, color: C.text, fontWeight: 600 }}>{i.paid_subscribers}</td>
                    <td style={{ ...S.tableCell, color: C.warningText, fontWeight: 600 }}>{fmtSar(i.revenue_sar)}</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{i.commission_percent}%</td>
                    <td style={{ ...S.tableCell, color: C.danger, fontWeight: 600 }}>{fmtSar(i.commission_sar)}</td>
                    <td style={S.tableCell}>
                      <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: i.active ? C.successBg : C.border, color: i.active ? C.successText : C.textFaint }}>
                        {i.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={S.tableCell}>
                      <button onClick={() => setEditing(i)} className="text-[12px] px-3 py-1.5 rounded-lg font-medium" style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <InfluencerModal session={session} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); void load(); }} />}
      {editing &&    <InfluencerModal session={session} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const C = useC();
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: accent ? C.tint(accent, "44") : C.border, background: accent ? C.tint(accent, "11") : C.panel }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.textDim }}>{label}</div>
      <div className="text-[22px] font-bold" style={{ color: accent ?? C.text }}>{value}</div>
    </div>
  );
}

// ==========================================================================
// INFLUENCER MODAL (create/edit)
// ==========================================================================
function InfluencerModal({
  session, initial, onClose, onSaved,
}: {
  session: Session;
  initial?: Influencer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const C = useC();
  const S = useS();
  const [name, setName] = useState(initial?.name ?? "");
  const [handle, setHandle] = useState(initial?.handle ?? "");
  const [platform, setPlatform] = useState(initial?.platform ?? "instagram");
  const [commission, setCommission] = useState(String(initial?.commission_percent ?? "20"));
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(initial?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!initial;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setSaving(true);
    const params = {
      name: name.trim(),
      handle: handle.trim() || null,
      platform,
      notes: notes.trim() || null,
      commission_percent: Number(commission),
      active,
    };
    const res = isEdit
      ? await callAdmin(session, "influencer_update", { id: initial!.id, ...params })
      : await callAdmin(session, "influencer_create", params);
    if (res?.ok) onSaved();
    else setError(res?.error ?? "Failed");
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: C.border }}>
          <h2 className="text-[15px] font-semibold" style={{ color: C.text }}>{isEdit ? "Edit influencer" : "Add influencer"}</h2>
          <button onClick={onClose} style={{ background: C.border, color: C.text, border: "none", borderRadius: 999, padding: 6, fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div><label style={S.label}>Name *</label><input type="text" required value={name} onChange={(e) => setName(e.target.value)} style={S.input} placeholder="Sara Ahmed" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={S.label}>Handle</label><input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} style={S.input} placeholder="@saraahmed" /></div>
            <div>
              <label style={S.label}>Platform</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={S.input}>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="twitter">Twitter/X</option>
                <option value="youtube">YouTube</option>
                <option value="snapchat">Snapchat</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label style={S.label}>Commission % (of revenue)</label>
            <input type="number" min={0} max={100} step="0.5" value={commission} onChange={(e) => setCommission(e.target.value)} style={S.input} />
            <div className="text-[11px] mt-1" style={{ color: C.textFaint }}>Applied to revenue from all coupons linked to this influencer.</div>
          </div>
          <div><label style={S.label}>Notes</label><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...S.input, resize: "vertical", fontFamily: "inherit" }} placeholder="Contact info, agreement details, etc." /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} id="influencer-active" style={{ accentColor: C.primary }} />
            <label htmlFor="influencer-active" className="text-[13px]" style={{ color: C.text }}>Active</label>
          </div>
          {error && <p className="text-[12px]" style={{ color: C.danger }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} style={S.btnSec}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.5 : 1 }}>{saving ? "…" : (isEdit ? "Save" : "Add")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
