"use client";

// Universities — how many users come from each university. Only universities
// that at least one user picked in their academic profile appear. Free-typed
// names are folded into the known university with the SAME matcher the app
// uses to detect a grading scheme, so "KSU" and "جامعة الملك سعود" land in one row.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, useC, StatCard, SectionHeader, Loading, ErrorBanner, fmtNum } from "./_lib";
import { useDrill, type DrillUser } from "./_drill";
import { universityBySlug } from "@/lib/tools/universities";
import { matchUniversityByName } from "@/lib/gradeSchemes";

interface UniUser {
  user_id: string;
  email: string | null;
  last_active_at: string | null;
  slug: string | null;
  name: string | null;
  major: string | null;
  level: string | null;
}

interface Group { key: string; name: string; nameEn: string | null; users: UniUser[] }

function groupUsers(users: UniUser[]): Group[] {
  const groups = new Map<string, Group>();
  for (const u of users) {
    const known = (u.slug ? universityBySlug(u.slug) : undefined) ?? (u.name ? matchUniversityByName(u.name) : undefined);
    const key = known ? known.slug : `custom:${(u.name ?? "").trim().toLowerCase()}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, name: known ? known.name : (u.name ?? "—"), nameEn: known ? known.nameEn : null, users: [] };
      groups.set(key, g);
    }
    g.users.push(u);
  }
  return [...groups.values()].sort((a, b) => b.users.length - a.users.length || a.name.localeCompare(b.name));
}

export function UniversitiesSection() {
  const C = useC();
  const drill = useDrill();
  const [data, setData] = useState<{ total_users: number; users: UniUser[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data: d, error: e } = await supabase.rpc("admin_university_users");
    if (e) setError(e.message);
    else setData(d as { total_users: number; users: UniUser[] });
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => (data ? groupUsers(data.users) : []), [data]);

  if (loading && !data) return <Loading text="Loading universities…" />;

  const withUni = data?.users.length ?? 0;
  const max = Math.max(1, ...groups.map((g) => g.users.length));

  const open = (g: Group) => {
    const users: DrillUser[] = g.users.map((u) => ({
      user_id: u.user_id,
      email: u.email,
      last_active_at: u.last_active_at,
      detail: [u.major, u.level && (/^\d{1,2}$/.test(u.level) ? `Level ${u.level}` : u.level)].filter(Boolean).join(" · ") || null,
      badge: null,
    }));
    drill({ title: g.name, users });
  };

  return (
    <div>
      <SectionHeader
        title="Universities"
        action={
          <button onClick={() => void load()} className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}>
            {loading ? "…" : "↻ Refresh"}
          </button>
        }
      />
      {error && <ErrorBanner message={error} onRetry={load} />}

      {data && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Universities represented" value={groups.length} />
            <StatCard label="Users who set a university" value={withUni} sub={`of ${fmtNum(data.total_users)} users · ${data.total_users ? Math.round((withUni / data.total_users) * 100) : 0}%`} />
            <StatCard label="Top university" value={groups[0] ? groups[0].users.length : "—"} sub={groups[0]?.name} />
          </div>

          <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border, background: C.panel }}>
            {groups.length === 0 ? (
              <p className="p-8 text-center text-[13px]" style={{ color: C.textFaint }}>No user has set a university yet.</p>
            ) : groups.map((g, i) => {
              const n = g.users.length;
              const pct = withUni ? Math.round((n / withUni) * 100) : 0;
              return (
                <button
                  key={g.key}
                  onClick={() => open(g)}
                  className="admin-hover-row w-full text-start flex items-center gap-4 px-5 py-3.5"
                  style={{ background: "transparent", border: "none", borderBottom: i === groups.length - 1 ? "none" : `1px solid ${C.border}`, cursor: "pointer" }}
                >
                  <span className="w-6 text-[12px] tabular-nums shrink-0" style={{ color: C.textFaint }}>{i + 1}</span>
                  <div className="min-w-0 w-[38%] shrink-0">
                    <div dir="auto" className="text-[13px] font-medium truncate" style={{ color: C.text }}>{g.name}</div>
                    <div className="text-[11px] truncate" style={{ color: C.textDim }}>{g.nameEn ?? "Typed by hand — not in the known list"}</div>
                  </div>
                  <div className="flex-1 rounded-full overflow-hidden" style={{ background: C.border, height: 10 }}>
                    <div className="h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: C.primary, minWidth: 6 }} />
                  </div>
                  <span className="w-28 text-end text-[13px] tabular-nums shrink-0" style={{ color: C.text }}>
                    <b>{fmtNum(n)}</b> <span style={{ color: C.textFaint }}>{n === 1 ? "user" : "users"} · {pct}%</span>
                  </span>
                  <span className="text-[12px] shrink-0" style={{ color: C.textFaint }}>→</span>
                </button>
              );
            })}
          </div>
          <p className="text-[12px]" style={{ color: C.textFaint }}>
            Percentages are of users who set a university. Click a university to see its users with their major and level.
          </p>
        </div>
      )}
    </div>
  );
}
