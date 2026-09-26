"use client";

// Top users — who uses Haven the most. Reads the guarded admin_top_users()
// directly via supabase.rpc (one row per user with any app_open), and ranks
// client-side so switching the ranking metric is instant.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, useC, useS, SectionHeader, Loading, ErrorBanner, fmtNum, timeAgo, useDebounce } from "./_lib";

interface TopUser {
  user_id: string;
  email: string | null;
  opens: number;
  active_days: number;
  first_open: string | null;
  last_open: string | null;
  courses: number;
  planner_items: number;
  planner_done: number;
  pomodoros: number;
  check_ins: number;
  page_views: number;
  absences: number;
  university: string | null;
}

type RankKey = "active_days" | "opens" | "content" | "planner_done" | "pomodoros";

const RANKS: { key: RankKey; label: string; hint: string }[] = [
  { key: "active_days",  label: "Active days",  hint: "distinct days they opened Haven — the real loyalty signal" },
  { key: "opens",        label: "Opens",        hint: "every app launch" },
  { key: "content",      label: "Content",      hint: "courses + planner items they created" },
  { key: "planner_done", label: "Tasks done",   hint: "planner items checked off" },
  { key: "pomodoros",    label: "Pomodoro",     hint: "completed focus sessions" },
];

const score = (u: TopUser, k: RankKey) =>
  k === "content" ? u.courses + u.planner_items : u[k];

export function TopUsersSection({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const C = useC();
  const S = useS();
  const [rows, setRows] = useState<TopUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rank, setRank] = useState<RankKey>("active_days");
  const [q, setQ] = useState("");
  const query = useDebounce(q, 250);
  const [limit, setLimit] = useState(25);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: e } = await supabase.rpc("admin_top_users");
    if (e) setError(e.message);
    else setRows((data as TopUser[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Rank over EVERYONE first so a user's # stays their true place while searching.
  const ranked = useMemo(() => {
    if (!rows) return [];
    return [...rows]
      .sort((a, b) => score(b, rank) - score(a, rank) || b.active_days - a.active_days || b.opens - a.opens)
      .map((u, i) => ({ ...u, place: i + 1 }));
  }, [rows, rank]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? ranked.filter((u) => (u.email ?? "").toLowerCase().includes(needle)) : ranked;
  }, [ranked, query]);
  const shown = filtered.slice(0, limit);

  if (loading && !rows) return <Loading text="Loading top users…" />;

  const current = RANKS.find((r) => r.key === rank)!;
  const cols = ["#", "User", "Active days", "Opens", "Courses", "Planner (done / all)", "Pomodoro", "Absences logged", "University", "Last open"];

  return (
    <div>
      <SectionHeader
        title="Top users"
        action={
          <button onClick={() => void load()} className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}>
            {loading ? "…" : "↻ Refresh"}
          </button>
        }
      />
      {error && <ErrorBanner message={error} onRetry={load} />}

      {rows && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: C.border, background: C.panel }}>
            <span className="text-[11px] font-semibold uppercase tracking-wide me-1" style={{ color: C.textDim }}>Rank by</span>
            {RANKS.map((r) => (
              <button
                key={r.key}
                onClick={() => { setRank(r.key); setLimit(25); }}
                className="rounded-full px-3 py-1 text-[12px] font-medium"
                style={{ background: rank === r.key ? C.primary : C.border, color: rank === r.key ? "#fff" : C.textMuted, border: "none", cursor: "pointer" }}
              >
                {r.label}
              </button>
            ))}
            <span className="text-[11px] ms-1" style={{ color: C.textFaint }}>· {current.hint}</span>
          </div>

          {/* Podium — the top three at a glance */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ranked.slice(0, 3).map((u) => (
              <button
                key={u.user_id}
                onClick={() => onOpenUser(u.user_id)}
                className="rounded-xl border p-5 text-start transition-shadow hover:shadow-md"
                style={{ borderColor: u.place === 1 ? C.tint(C.warning, "66") : C.border, background: u.place === 1 ? C.tint(C.warning, "11") : C.panel, cursor: "pointer" }}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.textDim }}>#{u.place}</div>
                <div className="text-[14px] font-semibold truncate" style={{ color: C.text }}>{u.email ?? "—"}</div>
                <div className="text-[26px] font-bold leading-none tabular-nums mt-3" style={{ color: u.place === 1 ? C.warning : C.text }}>
                  {fmtNum(score(u, rank))}
                </div>
                <div className="text-[12px] mt-1" style={{ color: C.textDim }}>{current.label.toLowerCase()}</div>
              </button>
            ))}
          </div>

          <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(25); }} placeholder="Search by email…" style={{ ...S.input, maxWidth: 320 }} />

          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
            <table className="w-full text-[13px]">
              <thead><tr>{cols.map((h) => <th key={h} style={S.tableHead}>{h}</th>)}</tr></thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr><td colSpan={cols.length} className="px-4 py-8 text-center" style={{ color: C.textFaint }}>No users match.</td></tr>
                ) : shown.map((u) => (
                  <tr key={u.user_id} className="admin-hover-row" onClick={() => onOpenUser(u.user_id)} style={{ cursor: "pointer" }}>
                    <td style={{ ...S.tableCell, color: C.textDim, fontWeight: 600 }}>{u.place}</td>
                    <td style={{ ...S.tableCell, fontWeight: 500 }}>{u.email ?? "—"}</td>
                    <td style={{ ...S.tableCell, fontWeight: rank === "active_days" ? 700 : 400 }}>{u.active_days}</td>
                    <td style={{ ...S.tableCell, fontWeight: rank === "opens" ? 700 : 400 }}>{u.opens}</td>
                    <td style={{ ...S.tableCell, fontWeight: rank === "content" ? 700 : 400 }}>{u.courses}</td>
                    <td style={{ ...S.tableCell, fontWeight: rank === "planner_done" || rank === "content" ? 700 : 400 }}>
                      {u.planner_done} <span style={{ color: C.textFaint }}>/ {u.planner_items}</span>
                    </td>
                    <td style={{ ...S.tableCell, fontWeight: rank === "pomodoros" ? 700 : 400 }}>{u.pomodoros}</td>
                    <td style={{ ...S.tableCell, color: C.textDim }}>{u.absences}</td>
                    <td style={{ ...S.tableCell, color: C.textDim, maxWidth: 200 }} className="truncate">{u.university ?? "—"}</td>
                    <td style={{ ...S.tableCell, color: C.textDim, whiteSpace: "nowrap" }}>{timeAgo(u.last_open)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > limit && (
            <button
              onClick={() => setLimit((l) => l + 50)}
              className="self-start rounded-lg px-4 py-2 text-[12px] font-medium"
              style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}
            >
              Show more ({fmtNum(filtered.length - limit)} left)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
