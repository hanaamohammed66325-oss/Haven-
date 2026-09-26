"use client";

// Term dates students set — students whose university has no calendar on
// record get a note in the app that term dates differ between universities
// (components/TermCheckCard), and set their own. Here: each such university by
// name, most students first, with the dates its students set and how many
// confirmed them — the research queue for the next calendars to add. Read
// through admin_term_date_reports() (admin only; lib/termDateReports groups).

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, useC, useS, StatCard, SectionHeader, Loading, ErrorBanner, timeAgo } from "./_lib";
import { COUNTRY_NAMES } from "@/lib/countryHolidays";
import { groupTermDateReports, type TermDateRow } from "@/lib/termDateReports";

export function TermDatesSection() {
  const C = useC();
  const S = useS();
  const [rows, setRows] = useState<TermDateRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: e } = await supabase.rpc("admin_term_date_reports");
    if (e) {
      setError(
        /function|schema cache|does not exist/i.test(e.message)
          ? `${e.message} — the term dates migration (20261005_term_date_reports.sql) isn't in the database yet.`
          : e.message
      );
    } else setRows((data ?? []) as TermDateRow[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => groupTermDateReports(rows ?? []), [rows]);

  if (loading && !rows) return <Loading text="Loading term dates…" />;

  const students = groups.reduce((n, g) => n + g.students.length, 0);
  const confirmed = groups.reduce((n, g) => n + g.students.filter((s) => s.confirmed).length, 0);
  const country = (code: string | null) => (code ? COUNTRY_NAMES[code]?.ar ?? (code === "SA" ? "السعودية" : code) : "—");

  return (
    <div>
      <SectionHeader
        title="Term dates students set"
        action={
          <button onClick={() => void load()} style={S.btnSec}>
            {loading ? "…" : "↻ Refresh"}
          </button>
        }
      />
      {error && <ErrorBanner message={error} onRetry={load} />}

      {rows && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Universities without a calendar" value={groups.length} />
            <StatCard label="Their students" value={students} />
            <StatCard label="Set or confirmed their dates" value={confirmed} accent={C.success} />
          </div>

          <p className="text-[12px] leading-relaxed" style={{ color: C.textDim }}>
            Students whose university has no term dates on record see a note that term dates differ between universities, and set theirs.
            Each university below shows the dates its students have now (finals = start + teaching weeks), most common first. &quot;Sign-up
            default&quot; = never changed from the dates set at sign-up.
          </p>

          <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border, background: C.panel }}>
            {groups.length === 0 ? (
              <p className="p-6 text-center text-[13px]" style={{ color: C.textFaint }}>
                No student at a university without a calendar yet.
              </p>
            ) : (
              groups.map((g) => {
                const isOpen = open === g.key;
                const n = g.students.filter((s) => s.confirmed).length;
                const defaults = g.students.filter((s) => s.placeholder).length;
                return (
                  <div key={g.key} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <button
                      onClick={() => setOpen(isOpen ? null : g.key)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-start"
                      style={{ background: "none", border: "none", cursor: "pointer", color: C.text }}
                    >
                      <div>
                        <div className="text-[13px] font-semibold" dir="auto">{g.label}</div>
                        <div className="text-[11px]" style={{ color: C.textDim }}>{country(g.country)}</div>
                      </div>
                      <div className="text-[12px] whitespace-nowrap" style={{ color: C.textMuted }}>
                        {g.students.length} students · {n} confirmed{defaults ? ` · ${defaults} sign-up default` : ""}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4">
                        {g.dates.length === 0 ? (
                          <p className="text-[12px]" style={{ color: C.textFaint }}>Only sign-up defaults so far.</p>
                        ) : (
                          <table className="w-full">
                            <thead>
                              <tr>
                                {["Start", "Finals", "End", "Students", "Confirmed"].map((h) => (
                                  <th key={h} style={S.tableHead}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {g.dates.map((d) => (
                                <tr key={`${d.start}|${d.finals}|${d.end}`}>
                                  <td style={S.tableCell}>{d.start}</td>
                                  <td style={S.tableCell}>{d.finals}</td>
                                  <td style={S.tableCell}>{d.end}</td>
                                  <td style={S.tableCell}>{d.n}</td>
                                  <td style={S.tableCell}>{d.confirmed}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <p className="text-[11px] mt-2" style={{ color: C.textDim }}>
                          Last active: {g.students.map((s) => timeAgo(s.row.last_active_at)).join(" · ")}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
