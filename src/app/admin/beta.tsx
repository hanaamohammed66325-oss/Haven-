"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useC, useS, callAdmin, fmtDate, fmtDateTime, Loading, SectionHeader, StatCard } from "./_lib";

interface BetaCode {
  id: string;
  code: string;
  email: string;
  used_by: string | null;
  used_at: string | null;
  expires_at: string | null;
  active: boolean;
  created_by: string;
  notes: string | null;
  created_at: string;
}
interface BetaTester {
  id: string;
  email: string;
  beta_code_used: string | null;
  beta_activated_at: string | null;
}
interface BetaStats {
  total_codes: number;
  used_codes: number;
  active_codes: number;
  expired_codes: number;
  active_testers: number;
  max_testers: number;
}

export function BetaSection({ session }: { session: Session }) {
  const C = useC();
  const S = useS();
  const [codes, setCodes] = useState<BetaCode[]>([]);
  const [testers, setTesters] = useState<BetaTester[]>([]);
  const [stats, setStats] = useState<BetaStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [newEmail, setNewEmail] = useState("");
  const [newExpires, setNewExpires] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await callAdmin(session, "beta_stats");
    if (res?.ok) {
      setCodes(res.codes ?? []);
      setTesters(res.testers ?? []);
      setStats(res.stats ?? null);
    }
    setLoading(false);
  }, [session]);
  useEffect(() => { void load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess(null);
    setCreateLoading(true);
    const res = await callAdmin(session, "beta_create", {
      email: newEmail.trim().toLowerCase(),
      expires_at: newExpires || null,
      notes: newNotes.trim() || null,
    });
    if (res?.ok) {
      setCreateSuccess(res.beta_code?.code ?? "Created");
      setNewEmail("");
      setNewExpires("");
      setNewNotes("");
      void load();
    } else {
      setCreateError(res?.error ?? "Failed");
    }
    setCreateLoading(false);
  };

  const revoke = async (c: BetaCode) => {
    if (!confirm(`Revoke beta code ${c.code} for ${c.email}?${c.used_by ? " This will also remove beta access from the tester." : ""}`)) return;
    const res = await callAdmin(session, "beta_revoke", { id: c.id });
    if (res?.ok) void load();
  };

  const toggle = async (c: BetaCode) => {
    const res = await callAdmin(session, "beta_toggle", { id: c.id, active: !c.active });
    if (res?.ok) setCodes((prev) => prev.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)));
  };

  const codeStatus = (c: BetaCode) => {
    if (c.used_by) return "used";
    if (!c.active) return "revoked";
    if (c.expires_at && new Date(c.expires_at) < new Date()) return "expired";
    return "available";
  };

  return (
    <div>
      <SectionHeader title="Beta Testing" />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Active Testers" value={`${stats.active_testers} / ${stats.max_testers}`} accent={C.primary} />
          <StatCard label="Available Codes" value={stats.active_codes} accent={C.success} />
          <StatCard label="Used Codes" value={stats.used_codes} />
          <StatCard label="Total Codes" value={stats.total_codes} />
        </div>
      )}

      {/* Create form */}
      <div className="rounded-xl border p-5 mb-6" style={{ borderColor: C.border, background: C.panel }}>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: C.textDim }}>
          Generate beta code
        </h2>
        <form onSubmit={create}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label style={S.label}>Tester email *</label>
              <input
                required type="email"
                placeholder="tester@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                style={S.input}
              />
            </div>
            <div>
              <label style={S.label}>Expires</label>
              <input
                type="date"
                value={newExpires}
                onChange={(e) => setNewExpires(e.target.value)}
                style={S.input}
              />
            </div>
            <div>
              <label style={S.label}>Notes</label>
              <input
                type="text"
                placeholder="Optional notes"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                style={S.input}
              />
            </div>
          </div>
          {createError && <p className="text-[12px] mb-3" style={{ color: C.danger }}>{createError}</p>}
          {createSuccess && (
            <div className="mb-3 rounded-lg p-3" style={{ background: C.successBg }}>
              <span className="text-[13px] font-semibold" style={{ color: C.successText }}>
                Code generated:{" "}
                <span style={{ fontFamily: "monospace", letterSpacing: "0.05em" }}>{createSuccess}</span>
              </span>
              <span className="text-[11px] block mt-1" style={{ color: C.successText, opacity: 0.7 }}>
                Send this code to the tester. It can only be used by the email above.
              </span>
            </div>
          )}
          <button
            type="submit"
            disabled={createLoading}
            style={{ ...S.btnPrimary, opacity: createLoading ? 0.5 : 1 }}
          >
            {createLoading ? "…" : "Generate code"}
          </button>
        </form>
      </div>

      {loading ? (
        <Loading text="Loading beta data…" />
      ) : (
        <>
          {/* Codes table */}
          <h2 className="text-[14px] font-semibold mb-3" style={{ color: C.text }}>Beta Codes</h2>
          <div className="overflow-x-auto rounded-xl border mb-8" style={{ borderColor: C.border }}>
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  {["Code", "Email", "Status", "Created", "Expires", "Used at", "Notes", ""].map((h) => (
                    <th key={h} style={S.tableHead}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center" style={{ color: C.textFaint }}>
                      No beta codes yet. Generate one above.
                    </td>
                  </tr>
                ) : (
                  codes.map((c) => {
                    const st = codeStatus(c);
                    const statusColor = st === "available" ? { bg: C.successBg, fg: C.successText }
                      : st === "used" ? { bg: C.tint(C.primary, "22"), fg: C.primary }
                      : st === "expired" ? { bg: C.tint(C.warning, "22"), fg: C.warningText }
                      : { bg: C.dangerBg, fg: C.danger };
                    return (
                      <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: st === "revoked" ? 0.45 : 1 }}>
                        <td style={{ ...S.tableCell, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.03em" }}>
                          {c.code}
                        </td>
                        <td style={{ ...S.tableCell, color: C.textMuted }}>{c.email}</td>
                        <td style={S.tableCell}>
                          <span
                            className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                            style={{ background: statusColor.bg, color: statusColor.fg }}
                          >
                            {st}
                          </span>
                        </td>
                        <td style={{ ...S.tableCell, color: C.textMuted }}>{fmtDate(c.created_at)}</td>
                        <td style={{ ...S.tableCell, color: C.textMuted }}>{c.expires_at ? fmtDate(c.expires_at) : "Never"}</td>
                        <td style={{ ...S.tableCell, color: C.textMuted }}>{c.used_at ? fmtDateTime(c.used_at) : "—"}</td>
                        <td style={{ ...S.tableCell, color: C.textFaint, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.notes ?? "—"}
                        </td>
                        <td style={S.tableCell}>
                          <div className="flex gap-1">
                            {!c.used_by && (
                              <button
                                onClick={() => toggle(c)}
                                className="text-[12px] px-3 py-1.5 rounded-lg font-medium"
                                style={{ background: C.border, color: c.active ? C.warningText : C.successText, border: "none", cursor: "pointer" }}
                              >
                                {c.active ? "Disable" : "Enable"}
                              </button>
                            )}
                            <button
                              onClick={() => revoke(c)}
                              className="text-[12px] px-3 py-1.5 rounded-lg font-medium"
                              style={{ background: C.dangerBg, color: C.danger, border: "none", cursor: "pointer" }}
                            >
                              Revoke
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Active testers */}
          <h2 className="text-[14px] font-semibold mb-3" style={{ color: C.text }}>Active Testers</h2>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  {["Email", "Beta Code", "Activated"].map((h) => (
                    <th key={h} style={S.tableHead}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {testers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center" style={{ color: C.textFaint }}>
                      No active beta testers yet.
                    </td>
                  </tr>
                ) : (
                  testers.map((t) => (
                    <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ ...S.tableCell, fontWeight: 500 }}>{t.email ?? "—"}</td>
                      <td style={{ ...S.tableCell, fontFamily: "monospace", color: C.textMuted }}>
                        {t.beta_code_used ?? "—"}
                      </td>
                      <td style={{ ...S.tableCell, color: C.textMuted }}>
                        {t.beta_activated_at ? fmtDateTime(t.beta_activated_at) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
