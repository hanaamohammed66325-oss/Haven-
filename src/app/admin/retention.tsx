"use client";

// Retention — is Haven keeping the users it brings in? Reads the guarded
// SECURITY DEFINER function admin_retention_stats() DIRECTLY via supabase.rpc
// (verifies admin server-side with is_admin_current), so no edge-function
// deploy is needed. Everything is derived from public.user_events 'app_open'
// rows written on every launch (AppShell), with a `standalone` flag for
// installed-PWA opens.
//
// The one subtlety this page is built around: a traffic spike (e.g. a launch
// day) floods the base with brand-new users who literally have not had time to
// return, which drags a naive "return rate" toward zero. So the headline uses a
// COHORT rate — only users who have had ≥1 / ≥3 / ≥7 days of opportunity — while
// the raw counts stay visible below for context.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  supabase, useC, useS, StatCard, ClickableCard, SectionHeader, Loading, ErrorBanner,
  fmtNum, fmtDateTime, timeAgo, useDebounce,
} from "./_lib";
import { useDrill } from "./_drill";

interface UserRow {
  email: string | null;
  opens: number;
  active_days: number;
  first_open: string | null;
  last_open: string | null;
  ever_standalone: boolean;
}
interface Retention {
  total_users: number;
  tracked_users: number;
  tracking_since: string | null;
  new_today: number;
  new_7d: number;
  freq: { one: number; two_three: number; four_seven: number; eight_ten: number; eleven_plus: number };
  days: { one: number; two_three: number; four_seven: number; eight_plus: number };
  states: { new: number; active: number; slipping: number; dormant: number };
  cohorts: { c1d: number; r1d: number; c3d: number; r3d: number; c7d: number; r7d: number };
  returned_users: number;
  avg_opens: number;
  avg_active_days: number;
  dau: number; wau: number; mau: number;
  users: UserRow[];
}

// Pick the most meaningful cohort: prefer the longest window that still has a
// usable sample (≥8 users), so the rate isn't computed off 1–2 people.
function pickCohort(c: Retention["cohorts"]) {
  if (c.c7d >= 8) return { window: "7-day", cohort: c.c7d, returned: c.r7d };
  if (c.c3d >= 8) return { window: "3-day", cohort: c.c3d, returned: c.r3d };
  return { window: "1-day", cohort: c.c1d, returned: c.r1d };
}

export function RetentionSection() {
  const C = useC();
  const drill = useDrill();
  const [data, setData] = useState<Retention | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data: d, error: e } = await supabase.rpc("admin_retention_stats");
    if (e) setError(e.message);
    else setData(d as Retention);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading && !data) return <Loading text="Loading retention…" />;

  return (
    <div>
      <SectionHeader
        title="Retention"
        action={
          <button onClick={() => void load()} className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}>
            {loading ? "…" : "↻ Refresh"}
          </button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      {data && (
        <div className="flex flex-col gap-6">
          <Verdict data={data} />

          {/* Live pulse */}
          <div>
            <SubHead text="Active users (by app open)" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="DAU · today" value={data.dau} accent={C.success} sub="opened in last 24h" />
              <StatCard label="WAU · 7 days" value={data.wau} accent={C.primary} />
              <StatCard label="MAU · 30 days" value={data.mau} />
              <StatCard
                label="Stickiness"
                value={data.mau ? `${Math.round((data.dau / data.mau) * 100)}%` : "—"}
                sub="DAU / MAU"
              />
            </div>
          </div>

          {/* Opens per user — answers "how many opened it >3 / >7 / >10 times" */}
          <div>
            <SubHead text="How many times each user opened the app (lifetime)" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BucketCard
                title="Opens per user"
                total={data.tracked_users}
                buckets={[
                  { label: "1 open", value: data.freq.one, tone: C.danger },
                  { label: "2–3", value: data.freq.two_three, tone: C.warning },
                  { label: "4–7", value: data.freq.four_seven, tone: C.primary },
                  { label: "8–10", value: data.freq.eight_ten, tone: C.success },
                  { label: "11+", value: data.freq.eleven_plus, tone: C.success },
                ]}
              />
              <BucketCard
                title="Distinct days they came back"
                total={data.tracked_users}
                buckets={[
                  { label: "1 day only", value: data.days.one, tone: C.danger },
                  { label: "2–3 days", value: data.days.two_three, tone: C.warning },
                  { label: "4–7 days", value: data.days.four_seven, tone: C.primary },
                  { label: "8+ days", value: data.days.eight_plus, tone: C.success },
                ]}
              />
            </div>
            <p className="text-[12px] mt-2" style={{ color: C.textFaint }}>
              “Opens” counts every launch; “distinct days” is the real loyalty signal — someone can open 5 times in one sitting yet never come back.
            </p>
          </div>

          {/* Where users stand right now */}
          <div>
            <SubHead text="Where users stand now" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="🌱 New (≤3d)" value={data.states.new} sub="just arrived — too early to judge" onClick={() => drill({ title: "New (≤3 days)", card: "state_new" })} />
              <StatCard label="✅ Active" value={data.states.active} accent={C.success} sub="opened in last 3 days" onClick={() => drill({ title: "Active — opened in last 3 days", card: "state_active" })} />
              <StatCard label="⚠️ Slipping" value={data.states.slipping} accent={C.warning} sub="last seen 3–14 days ago" onClick={() => drill({ title: "Slipping — last seen 3–14 days ago", card: "state_slipping" })} />
              <StatCard label="💤 Dormant" value={data.states.dormant} accent={C.danger} sub="gone >14 days" onClick={() => drill({ title: "Dormant — gone >14 days", card: "state_dormant" })} />
            </div>
          </div>

          {/* Cohort return rate */}
          <div>
            <SubHead text="Return rate by cohort (had time to come back)" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CohortCard label="Joined ≥1 day ago" cohort={data.cohorts.c1d} returned={data.cohorts.r1d} onClick={() => drill({ title: "Joined ≥1 day ago", card: "cohort", arg: "1" })} />
              <CohortCard label="Joined ≥3 days ago" cohort={data.cohorts.c3d} returned={data.cohorts.r3d} onClick={() => drill({ title: "Joined ≥3 days ago", card: "cohort", arg: "3" })} />
              <CohortCard label="Joined ≥7 days ago" cohort={data.cohorts.c7d} returned={data.cohorts.r7d} onClick={() => drill({ title: "Joined ≥7 days ago", card: "cohort", arg: "7" })} />
            </div>
            <p className="text-[12px] mt-2" style={{ color: C.textFaint }}>
              {data.new_today > 0
                ? `${fmtNum(data.new_today)} users opened Haven for the first time today, so the raw base is dominated by brand-new arrivals. Cohorts exclude them, so this is the honest "do people come back" number.`
                : `Cohorts count only users who have had at least a full day of opportunity to return.`}
            </p>
          </div>

          {/* Per-user table */}
          <div>
            <SubHead text={`Per user — ${fmtNum(data.tracked_users)} tracked of ${fmtNum(data.total_users)} total`} />
            <UsersTable rows={data.users} />
            {data.total_users > data.tracked_users && (
              <p className="text-[12px] mt-2" style={{ color: C.textFaint }}>
                {fmtNum(data.total_users - data.tracked_users)} users have no open data — they signed up before open-tracking began
                {data.tracking_since ? ` (${fmtDateTime(data.tracking_since)})` : ""} or never launched the app.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Headline verdict ----------
function Verdict({ data }: { data: Retention }) {
  const C = useC();
  const { window: win, cohort, returned } = pickCohort(data.cohorts);
  const rate = cohort > 0 ? Math.round((returned / cohort) * 100) : null;

  // Thresholds tuned for an early-stage student productivity app: a D1+ return
  // around a third is healthy; below a quarter needs attention.
  const tone = rate == null ? C.textMuted : rate >= 40 ? C.success : rate >= 25 ? C.warning : C.danger;
  const verdict =
    rate == null ? "Not enough returning users yet to judge."
    : rate >= 40 ? "Healthy — a strong share of users come back on their own."
    : rate >= 25 ? "Okay, with room to grow — many come back, many don’t."
    : "Needs work — most users don’t return after the first day.";

  return (
    <div className="rounded-2xl border p-6" style={{ borderColor: C.tint(tone, "55"), background: C.tint(tone, "11") }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.textDim }}>
            Are we keeping our users?
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-[44px] font-bold leading-none tabular-nums" style={{ color: tone }}>
              {rate == null ? "—" : `${rate}%`}
            </span>
            <span className="text-[13px]" style={{ color: C.textMuted }}>
              of the {win} cohort returned<br />
              <span style={{ color: C.textFaint }}>{fmtNum(returned)} of {fmtNum(cohort)} users came back on another day</span>
            </span>
          </div>
        </div>
        <div className="max-w-[320px] text-[13px] leading-relaxed" style={{ color: tone }}>
          {verdict}
        </div>
      </div>
    </div>
  );
}

function SubHead({ text }: { text: string }) {
  const C = useC();
  return <h2 className="text-[15px] font-semibold mb-3" style={{ color: C.text }}>{text}</h2>;
}

// ---------- Bucket bar card ----------
function BucketCard({
  title, total, buckets,
}: {
  title: string;
  total: number;
  buckets: { label: string; value: number; tone: string }[];
}) {
  const C = useC();
  const max = Math.max(1, ...buckets.map((b) => b.value));
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: C.border, background: C.panel }}>
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-[13px] font-semibold" style={{ color: C.textMuted }}>{title}</h3>
        <span className="text-[11px]" style={{ color: C.textFaint }}>{fmtNum(total)} users</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {buckets.map((b) => {
          const pct = total > 0 ? Math.round((b.value / total) * 100) : 0;
          return (
            <div key={b.label} className="flex items-center gap-3">
              <span className="text-[12px] w-20 shrink-0" style={{ color: C.textDim }}>{b.label}</span>
              <div className="flex-1 rounded-full overflow-hidden" style={{ background: C.border, height: 18 }}>
                <div className="h-full rounded-full" style={{ width: `${(b.value / max) * 100}%`, background: b.tone, minWidth: b.value > 0 ? 6 : 0 }} />
              </div>
              <span className="text-[12px] w-16 text-end tabular-nums shrink-0" style={{ color: C.text }}>
                {fmtNum(b.value)} <span style={{ color: C.textFaint }}>· {pct}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Cohort card ----------
function CohortCard({
  label, cohort, returned, onClick,
}: { label: string; cohort: number; returned: number; onClick?: () => void }) {
  const C = useC();
  const rate = cohort > 0 ? Math.round((returned / cohort) * 100) : null;
  const tone = rate == null ? C.textMuted : rate >= 40 ? C.success : rate >= 25 ? C.warning : C.danger;
  return (
    <ClickableCard onClick={onClick} className="rounded-xl border p-5" style={{ borderColor: C.border, background: C.panel }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: C.textDim }}>{label}</div>
      <div className="text-[28px] font-bold leading-none tabular-nums" style={{ color: tone }}>
        {rate == null ? "—" : `${rate}%`}
      </div>
      <div className="text-[12px] mt-2" style={{ color: C.textDim }}>
        {cohort === 0 ? "no users old enough yet" : `${fmtNum(returned)} of ${fmtNum(cohort)} returned`}
      </div>
    </ClickableCard>
  );
}

// ---------- Per-user table (searchable + sortable, client-side) ----------
type SortKey = "opens" | "active_days" | "last_open";
function UsersTable({ rows }: { rows: UserRow[] }) {
  const C = useC();
  const S = useS();
  const [q, setQ] = useState("");
  const query = useDebounce(q, 250);
  const [sort, setSort] = useState<SortKey>("opens");
  const [limit, setLimit] = useState(50);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = needle
      ? rows.filter((r) => (r.email ?? "").toLowerCase().includes(needle))
      : rows;
    const sorted = [...base].sort((a, b) => {
      if (sort === "last_open") {
        return new Date(b.last_open ?? 0).getTime() - new Date(a.last_open ?? 0).getTime();
      }
      return (b[sort] as number) - (a[sort] as number);
    });
    return sorted;
  }, [rows, query, sort]);

  const shown = filtered.slice(0, limit);

  const th = (label: string, key?: SortKey) => (
    <th
      style={{ ...S.tableHead, cursor: key ? "pointer" : "default" }}
      onClick={key ? () => { setSort(key); setLimit(50); } : undefined}
    >
      {label}{key && sort === key ? " ↓" : ""}
    </th>
  );

  return (
    <div>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setLimit(50); }}
        placeholder="Search by email…"
        style={{ ...S.input, maxWidth: 320, marginBottom: 12 }}
      />
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              {th("User")}
              {th("Opens", "opens")}
              {th("Active days", "active_days")}
              {th("First open")}
              {th("Last open", "last_open")}
              {th("Installed")}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: C.textFaint }}>No users match.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={`${r.email ?? "?"}-${i}`} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ ...S.tableCell, color: C.textMuted }}>{r.email ?? "—"}</td>
                <td style={{ ...S.tableCell, fontWeight: 700, color: C.text }}>{fmtNum(r.opens)}</td>
                <td style={{ ...S.tableCell, color: C.text }}>
                  {fmtNum(r.active_days)}
                  {r.active_days >= 2 && <span className="ms-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: C.successBg, color: C.successText }}>returned</span>}
                </td>
                <td style={{ ...S.tableCell, color: C.textDim }}>{fmtDateTime(r.first_open)}</td>
                <td style={{ ...S.tableCell, color: C.textDim }}>{timeAgo(r.last_open)}</td>
                <td style={{ ...S.tableCell }}>
                  {r.ever_standalone
                    ? <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: C.indigoBg, color: C.indigo }}>installed</span>
                    : <span style={{ color: C.textFaint }}>browser</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <button
          onClick={() => setLimit((l) => l + 100)}
          className="mt-3 rounded-lg px-4 py-2 text-[12px] font-medium"
          style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}
        >
          Show more ({fmtNum(filtered.length - limit)} left)
        </button>
      )}
    </div>
  );
}
