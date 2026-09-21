"use client";

// Insights — product usage analytics. Reads the guarded SECURITY DEFINER
// functions (admin_engagement_stats / admin_content_stats) DIRECTLY via
// supabase.rpc: the functions verify admin server-side (is_admin_current), so
// no edge-function deploy is needed for this page to work.

import { useCallback, useEffect, useState } from "react";
import { supabase, useC, useS, StatCard, SectionHeader, Loading, ErrorBanner, fmtNum } from "./_lib";

interface Engagement {
  total_users: number;
  online_now: number; online_15m: number; active_24h: number; active_7d: number;
  installs_standalone: number; installs_ios_push: number;
  pages: { path: string; views: number; users: number }[];
  themes: { theme: string; users: number }[];
}
interface Dist {
  users_total: number; b1: number; b2: number; b3: number; b4: number; b5plus: number;
  avg: number; max: number; total_rows: number;
}
interface AttRow {
  email: string | null; course: string | null; limit_pct: number | null;
  records: number; absent_minutes: number; absent_hours: number;
}
interface Content {
  courses: Dist; planner: Dist; lectures: Dist; components: Dist;
  attendance: {
    users_logging: number; absence_records: number;
    total_absent_minutes: number; total_absent_hours: number; excused_records: number;
    rows: AttRow[];
  };
}

export function InsightsSection() {
  const C = useC();
  const [eng, setEng] = useState<Engagement | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [e, c] = await Promise.all([
      supabase.rpc("admin_engagement_stats"),
      supabase.rpc("admin_content_stats"),
    ]);
    if (e.error) setError(e.error.message);
    else setEng(e.data as Engagement);
    if (!c.error) setContent(c.data as Content);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading && !eng) return <Loading text="Loading insights…" />;

  return (
    <div>
      <SectionHeader
        title="Insights"
        action={
          <button onClick={() => void load()} className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}>
            {loading ? "…" : "↻ Refresh"}
          </button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      {eng && (
        <div className="flex flex-col gap-6">
          {/* Live now */}
          <div>
            <SubHead text="Live activity" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border p-5" style={{ borderColor: C.tint(C.success, "55"), background: C.tint(C.success, "11") }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: C.success, boxShadow: `0 0 0 3px ${C.tint(C.success, "33")}` }} />
                  <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.textDim }}>Online now</div>
                </div>
                <div className="text-[28px] font-bold leading-none tabular-nums" style={{ color: C.success }}>{fmtNum(eng.online_now)}</div>
                <div className="text-[12px] mt-2" style={{ color: C.textDim }}>active in last 5 min</div>
              </div>
              <StatCard label="Last 15 min" value={eng.online_15m} />
              <StatCard label="Active (24h)" value={eng.active_24h} accent={C.primary} />
              <StatCard label="Active (7d)" value={eng.active_7d} />
            </div>
          </div>

          {/* Installs */}
          <div>
            <SubHead text="App installs (added to Home Screen)" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Installed (tracked)" value={eng.installs_standalone} accent={C.indigo} sub="standalone opens — counts from now on" />
              <StatCard label="iOS installs (est.)" value={eng.installs_ios_push} sub="iOS push requires install" />
            </div>
            <p className="text-[12px] mt-2" style={{ color: C.textFaint }}>
              Install tracking was just added, so “Installed (tracked)” builds up as users open the app from the Home Screen. iOS push only works after install, so iOS push count is a reliable minimum for iPhone installs.
            </p>
          </div>

          {/* Page usage */}
          <div>
            <SubHead text="Page usage — last 30 days" />
            <PageTable pages={eng.pages} />
          </div>

          {/* Themes */}
          <div>
            <SubHead text="Themes in use" />
            <BarList items={eng.themes.map((t) => ({ label: t.theme, value: t.users }))} color={C.purple} unit="users" />
          </div>

          {/* Content distributions */}
          {content && (
            <div>
              <SubHead text="What users create" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DistCard title="Courses per user" dist={content.courses} />
                <DistCard title="Planner items per user" dist={content.planner} />
                <DistCard title="Lectures (timetable) per user" dist={content.lectures} />
                <DistCard title="Grade components per user" dist={content.components} />
              </div>
            </div>
          )}

          {/* Attendance sanity */}
          {content && (
            <div>
              <SubHead text="Attendance — logged absences (sanity check)" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <StatCard label="Users logging" value={content.attendance.users_logging} />
                <StatCard label="Absence records" value={content.attendance.absence_records} />
                <StatCard label="Total absent hours" value={`${content.attendance.total_absent_hours}`} accent={C.warning} />
                <StatCard label="Excused records" value={content.attendance.excused_records} />
              </div>
              <AttendanceTable rows={content.attendance.rows} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubHead({ text }: { text: string }) {
  const C = useC();
  return <h2 className="text-[15px] font-semibold mb-3" style={{ color: C.text }}>{text}</h2>;
}

// ---------- Distribution card (1 / 2 / 3 / 4 / 5+) ----------
function DistCard({ title, dist }: { title: string; dist: Dist }) {
  const C = useC();
  const buckets = [
    { label: "1", value: dist.b1 },
    { label: "2", value: dist.b2 },
    { label: "3", value: dist.b3 },
    { label: "4", value: dist.b4 },
    { label: "5+", value: dist.b5plus },
  ];
  const max = Math.max(1, ...buckets.map((b) => b.value));
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: C.border, background: C.panel }}>
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-[13px] font-semibold" style={{ color: C.textMuted }}>{title}</h3>
        <span className="text-[11px]" style={{ color: C.textFaint }}>{dist.users_total} users · avg {dist.avg} · max {dist.max}</span>
      </div>
      <div className="flex flex-col gap-2">
        {buckets.map((b) => (
          <div key={b.label} className="flex items-center gap-3">
            <span className="text-[12px] w-6 text-end tabular-nums" style={{ color: C.textDim }}>{b.label}</span>
            <div className="flex-1 rounded-full overflow-hidden" style={{ background: C.border, height: 18 }}>
              <div className="h-full rounded-full" style={{ width: `${(b.value / max) * 100}%`, background: C.primary, minWidth: b.value > 0 ? 6 : 0 }} />
            </div>
            <span className="text-[12px] w-10 tabular-nums" style={{ color: C.text }}>{b.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Generic labelled bar list (themes) ----------
function BarList({ items, color, unit }: { items: { label: string; value: number }[]; color: string; unit: string }) {
  const C = useC();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: C.border, background: C.panel }}>
      <div className="flex flex-col gap-2.5">
        {items.length === 0 ? (
          <span className="text-[13px]" style={{ color: C.textFaint }}>No data.</span>
        ) : items.map((i) => (
          <div key={i.label} className="flex items-center gap-3">
            <span className="text-[12px] w-24 truncate" style={{ color: C.textMuted }}>{i.label}</span>
            <div className="flex-1 rounded-full overflow-hidden" style={{ background: C.border, height: 18 }}>
              <div className="h-full rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: color, minWidth: i.value > 0 ? 6 : 0 }} />
            </div>
            <span className="text-[12px] w-16 tabular-nums" style={{ color: C.text }}>{i.value} {unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Page usage table ----------
function PageTable({ pages }: { pages: { path: string; views: number; users: number }[] }) {
  const C = useC();
  const S = useS();
  const sorted = [...pages].sort((a, b) => b.users - a.users);
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            {["Page", "Users", "Views"].map((h) => <th key={h} style={S.tableHead}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={3} className="px-4 py-8 text-center" style={{ color: C.textFaint }}>No page views recorded.</td></tr>
          ) : sorted.map((p) => (
            <tr key={p.path} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ ...S.tableCell, fontFamily: "monospace", color: C.textMuted }}>{p.path}</td>
              <td style={{ ...S.tableCell, fontWeight: 600 }}>{p.users}</td>
              <td style={{ ...S.tableCell, color: C.textDim }}>{p.views}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Attendance rows ----------
function AttendanceTable({ rows }: { rows: AttRow[] }) {
  const C = useC();
  const S = useS();
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            {["User", "Course", "Records", "Absent hours", "Absent min", "Limit %"].map((h) => <th key={h} style={S.tableHead}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: C.textFaint }}>No absences logged.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={`${r.email}-${r.course}-${i}`} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ ...S.tableCell, color: C.textMuted }}>{r.email ?? "—"}</td>
              <td style={{ ...S.tableCell, fontWeight: 500 }}>{r.course ?? "—"}</td>
              <td style={{ ...S.tableCell, color: C.textDim }}>{r.records}</td>
              <td style={{ ...S.tableCell, color: C.text, fontWeight: 600 }}>{r.absent_hours}</td>
              <td style={{ ...S.tableCell, color: C.textDim }}>{r.absent_minutes}</td>
              <td style={{ ...S.tableCell, color: C.textDim }}>{r.limit_pct ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
