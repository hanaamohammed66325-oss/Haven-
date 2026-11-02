"use client";

// The students Havi alerted about data missing for an accurate GPA
// (components/HaviGpaNote). Read through admin_havi_gpa_alerts() (admin only),
// one row per student; a row opens that student's account.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, useC, useS, SectionHeader, Loading, ErrorBanner } from "./_lib";

interface AlertRow {
  user_id: string;
  email: string | null;
  first_at: string;
  last_at: string;
  shown: number;
  later: number;
  fixes: number;
  missing: string[];
  courses: number;
  last_action: "havi_gpa_note_later" | "havi_gpa_note_fix" | null;
  last_action_item: string | null;
  last_action_at: string | null;
  resolved_at: string | null;
}

const MISSING_LABEL: Record<string, string> = {
  university: "University",
  table: "Points table",
  credits: "Credit hours",
  grades: "No grades (last month)",
  weights: "Weights ≠ 100%",
  cumulative: "Cumulative GPA / hours",
};

type Filter = "all" | "open" | "resolved";

export function HaviAlertsSection({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const C = useC();
  const S = useS();
  const [rows, setRows] = useState<AlertRow[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("open");

  const load = useCallback(async () => {
    setError("");
    const { data, error: e } = await supabase.rpc("admin_havi_gpa_alerts");
    if (e) {
      setError(e.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as AlertRow[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const all = rows ?? [];
    return { all: all.length, open: all.filter((r) => !r.resolved_at).length, resolved: all.filter((r) => r.resolved_at).length };
  }, [rows]);
  const shown = (rows ?? []).filter((r) => (filter === "all" ? true : filter === "open" ? !r.resolved_at : !!r.resolved_at));

  const action = (r: AlertRow) =>
    r.last_action === "havi_gpa_note_fix"
      ? `Opened ${MISSING_LABEL[r.last_action_item ?? ""] ?? r.last_action_item ?? "item"}`
      : r.last_action === "havi_gpa_note_later"
      ? "Remind me later"
      : "No answer";

  const cols = ["Account", "Missing (last alert)", "Alerts", "Last choice", "Status", "Last alert"];

  return (
    <div>
      <SectionHeader title="Havi alerts" />
      <p className="text-[12px] mb-4" style={{ color: C.textDim }}>
        Students Havi alerted about data missing for an accurate GPA. A student counts as resolved once everything was recorded after the last alert. Click a row to open the account.
      </p>
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!rows ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {(["open", "resolved", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className="rounded-full px-3 py-1 text-[12px] font-medium"
                style={{ background: filter === f ? C.primary : C.border, color: filter === f ? "#fff" : C.textMuted, border: "none", cursor: "pointer" }}
              >
                {f === "open" ? "Still missing" : f === "resolved" ? "Resolved" : "All"} · {counts[f]}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
            <table className="w-full text-[13px]">
              <thead><tr>{cols.map((h) => <th key={h} style={S.tableHead}>{h}</th>)}</tr></thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr><td colSpan={cols.length} className="px-4 py-8 text-center" style={{ color: C.textFaint }}>No students here yet.</td></tr>
                ) : shown.map((r) => (
                  <tr key={r.user_id} className="admin-hover-row" onClick={() => onOpenUser(r.user_id)} style={{ cursor: "pointer" }}>
                    <td style={{ ...S.tableCell, fontWeight: 500 }} dir="ltr">{r.email ?? "—"}</td>
                    <td style={S.tableCell}>
                      <div className="flex flex-wrap gap-1">
                        {r.missing.map((m) => (
                          <span key={m} className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: C.tint(C.warning, "1a"), color: C.warning }}>
                            {MISSING_LABEL[m] ?? m}
                          </span>
                        ))}
                        {r.courses > 0 && <span className="text-[11px]" style={{ color: C.textDim }}>· {r.courses} {r.courses === 1 ? "course" : "courses"}</span>}
                      </div>
                    </td>
                    <td style={{ ...S.tableCell, fontVariantNumeric: "tabular-nums" }}>{r.shown}</td>
                    <td style={{ ...S.tableCell, color: C.textDim }}>{action(r)}</td>
                    <td style={{ ...S.tableCell, color: r.resolved_at ? C.success : C.warning, fontWeight: 600 }}>
                      {r.resolved_at ? "Resolved" : "Still missing"}
                    </td>
                    <td style={{ ...S.tableCell, color: C.textDim, whiteSpace: "nowrap" }}>{new Date(r.last_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
