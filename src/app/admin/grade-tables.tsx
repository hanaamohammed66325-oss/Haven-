"use client";

// GPA systems — what students told us about their university's points table.
// Shown at the top of the admin GPA page (gpa-checks.tsx).
// The app detects a table from the unverified catalogue (lib/gradeCatalog) and
// asks the student to confirm it; a "no" or an unknown university invites them
// to enter their own. This page gathers those answers so a wrong catalogue
// table can be corrected for everyone at that university. Each answer is also
// in the user's activity feed (grade_table_* events). Students are classified
// with the SAME detection code the app uses.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, useC, StatCard, Loading, ErrorBanner, fmtDate } from "./_lib";
import { useDrill, type DrillUser } from "./_drill";
import { detectScheme, gradeTableStatus, customScheme, type GradeScheme } from "@/lib/gradeSchemes";
import type { AcademicInfo, CustomSchemeData, GradeCheck } from "@/types";

interface Row {
  user_id: string;
  email: string | null;
  last_active_at: string | null;
  slug: string | null;
  name: string | null;
  scheme_id: string | null;
  grade_check: GradeCheck | null;
  custom_scheme: CustomSchemeData | null;
}

type Kind = "confirmed" | "rejected" | "custom" | "pending" | "unknown" | "verified";

interface Classified extends Row {
  kind: Kind;
  uni: string;
  country: string;
  groupKey: string;
  catalogTable: GradeScheme | null;
}

function classify(r: Row): Classified {
  const academic = {
    universitySlug: r.slug,
    universityName: r.name ?? "",
    major: "",
    level: "",
    gpaSchemeId: (r.scheme_id ?? "auto") as AcademicInfo["gpaSchemeId"],
    gradeCheck: r.grade_check ?? undefined,
    customScheme: r.custom_scheme ?? undefined,
  };
  // What the catalogue alone would give, ignoring a custom table.
  const base = detectScheme({ ...academic, gpaSchemeId: "auto" });
  const status = gradeTableStatus(academic);
  const custom = r.scheme_id === "custom" && !!customScheme(r.custom_scheme);
  const kind: Kind = custom
    ? "custom"
    : status === "confirm"
    ? "pending"
    : status === "rejected"
    ? "rejected"
    : status === "unknown"
    ? "unknown"
    : base.source === "catalog" && r.grade_check?.answer === "yes"
    ? "confirmed"
    : "verified";
  return {
    ...r,
    kind,
    uni: base.catalog?.ar ?? r.name ?? r.slug ?? "—",
    country: base.catalog?.country ?? "",
    groupKey: base.catalog?.slug ?? `typed:${(r.name ?? "").trim().toLowerCase()}`,
    catalogTable: base.source === "catalog" ? base.scheme : null,
  };
}

const KIND_LABEL: Record<Kind, string> = {
  confirmed: "Confirmed",
  rejected: "Said it's wrong",
  custom: "Entered own table",
  pending: "Not answered yet",
  unknown: "University not in catalogue",
  verified: "Verified / chosen by hand",
};

/** [letter, points (or lowest % on a percentage scale), lowest % when a points
 *  table also gives it] */
type Chip = [string, number, number?];

function TableChips({ rows, compare }: { rows: Chip[]; compare?: Chip[] }) {
  const C = useC();
  return (
    <div dir="ltr" className="flex flex-wrap gap-1">
      {rows.map(([l, p, min], i) => {
        const differs = compare && (compare[i]?.[0] !== l || compare[i]?.[1] !== p);
        return (
          <span
            key={i}
            className="rounded px-1.5 py-0.5 text-[11px] tabular-nums"
            style={{ background: differs ? C.warning : C.border, color: differs ? "#fff" : C.text }}
          >
            {l} {p}
            {min != null && <span style={{ opacity: 0.7 }}> · {min}%+</span>}
          </span>
        );
      })}
    </div>
  );
}

const schemeRows = (s: GradeScheme): Chip[] => s.bands.map((b) => [b.letter, s.percent ? b.min : b.points]);
const customRows = (c: CustomSchemeData): Chip[] =>
  c.bands.map((b): Chip => (c.percent ? [b.letter, b.min ?? 0] : [b.letter, b.points, b.min ?? undefined]));

export function GradeTablesPanel({ reloadKey, onOpenUser }: { reloadKey: number; onOpenUser: (id: string) => void }) {
  const C = useC();
  const drill = useDrill();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: e } = await supabase.rpc("admin_grade_tables");
    if (e) {
      setError(
        /function|schema cache/i.test(e.message)
          ? `${e.message} — the admin_grade_tables() read function isn't in the database yet (migration 20260925_admin_grade_tables.sql).`
          : e.message
      );
    } else setRows(data as Row[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const all = useMemo(() => (rows ?? []).map(classify), [rows]);
  const of = (...k: Kind[]) => all.filter((r) => k.includes(r.kind));
  const submitted = of("custom");

  // One row per university with answers, most disputed first.
  const byUni = useMemo(() => {
    const m = new Map<string, { uni: string; country: string; list: Classified[] }>();
    for (const r of all) {
      if (r.kind === "verified") continue;
      const g = m.get(r.groupKey) ?? { uni: r.uni, country: r.country, list: [] };
      g.list.push(r);
      m.set(r.groupKey, g);
    }
    const disputed = (l: Classified[]) => l.filter((r) => r.kind === "rejected" || r.kind === "custom").length;
    return [...m.values()].sort((a, b) => disputed(b.list) - disputed(a.list) || b.list.length - a.list.length);
  }, [all]);

  const open = (title: string, list: Classified[]) => {
    const users: DrillUser[] = list.map((r) => ({
      user_id: r.user_id,
      email: r.email,
      last_active_at: r.last_active_at,
      detail: KIND_LABEL[r.kind],
      badge: null,
    }));
    drill({ title, users });
  };

  if (loading && !rows) return <Loading text="Loading GPA systems…" />;

  const card = (label: string, list: Classified[], accent?: string) => (
    <StatCard label={label} value={list.length} accent={accent} onClick={list.length ? () => open(label, list) : undefined} />
  );

  return (
    <div>
      <h2 className="text-[16px] font-semibold mb-1" style={{ color: C.text }}>
        GPA systems students chose
      </h2>
      <p className="text-[12px] mb-4" style={{ color: C.textDim }}>
        Whether each student confirmed the table we detected for their university, said it&apos;s wrong, or entered their own.
        Click a number to see the students.
      </p>
      {error && <ErrorBanner message={error} onRetry={load} />}

      {rows && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {card("Confirmed our table", of("confirmed"), C.success)}
            {card("Said it's wrong", of("rejected", "custom"), C.warning)}
            {card("Entered their own table", of("custom"), C.warning)}
            {card("Not answered yet", of("pending"))}
            {card("University not in catalogue", of("unknown"))}
          </div>

          <div>
            <h3 className="text-[13px] font-semibold mb-2" style={{ color: C.text }}>
              Tables students entered
            </h3>
            <p className="text-[12px] mb-2" style={{ color: C.textDim }}>
              Their GPA is worked out with their own table. Each letter shows its points (or its lowest % on a percentage scale).
            </p>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border, background: C.panel }}>
              {submitted.length === 0 ? (
                <p className="p-6 text-center text-[13px]" style={{ color: C.textFaint }}>
                  No student has entered a table yet.
                </p>
              ) : (
                submitted.map((r, i) => {
                  const theirs = customRows(r.custom_scheme!);
                  const ours = r.catalogTable ? schemeRows(r.catalogTable) : null;
                  return (
                    <div
                      key={r.user_id}
                      className="px-5 py-3.5 flex flex-col gap-2"
                      style={{ borderBottom: i === submitted.length - 1 ? "none" : `1px solid ${C.border}` }}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <span dir="auto" className="text-[13px] font-medium" style={{ color: C.text }}>
                          {r.uni}
                        </span>
                        <span className="text-[11px]" style={{ color: C.textDim }}>
                          {[r.country, r.grade_check?.at ? fmtDate(r.grade_check.at) : null].filter(Boolean).join(" · ")}
                        </span>
                        <span className="text-[11px]" style={{ color: C.textDim }}>
                          out of {r.custom_scheme!.max}
                          {r.custom_scheme!.percent ? " (percentage)" : ""}
                        </span>
                        <button
                          onClick={() => onOpenUser(r.user_id)}
                          className="text-[11px] underline-offset-2 hover:underline ms-auto"
                          style={{ color: C.primary, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        >
                          {r.email ?? "user"}
                        </button>
                      </div>
                      <div className="grid gap-1.5 md:grid-cols-[7rem_1fr] items-center">
                        <span className="text-[11px]" style={{ color: C.textFaint }}>Student&apos;s table</span>
                        <TableChips rows={theirs} compare={ours ?? undefined} />
                        {ours && (
                          <>
                            <span className="text-[11px]" style={{ color: C.textFaint }}>Catalogue table</span>
                            <TableChips rows={ours} />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <h3 className="text-[13px] font-semibold mb-2" style={{ color: C.text }}>
              By university
            </h3>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border, background: C.panel }}>
              {byUni.length === 0 ? (
                <p className="p-6 text-center text-[13px]" style={{ color: C.textFaint }}>
                  No answers yet.
                </p>
              ) : (
                byUni.map((g, i) => {
                  const n = (k: Kind) => g.list.filter((r) => r.kind === k).length;
                  return (
                    <button
                      key={g.uni + i}
                      onClick={() => open(g.uni, g.list)}
                      className="admin-hover-row w-full text-start flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
                      style={{
                        background: "transparent",
                        border: "none",
                        borderBottom: i === byUni.length - 1 ? "none" : `1px solid ${C.border}`,
                        cursor: "pointer",
                      }}
                    >
                      <span dir="auto" className="text-[13px] font-medium min-w-0 flex-1 truncate" style={{ color: C.text }}>
                        {g.uni}
                        {g.country && <span style={{ color: C.textDim }}> · {g.country}</span>}
                      </span>
                      <span className="text-[12px] tabular-nums" style={{ color: C.textMuted }}>
                        <span style={{ color: C.success }}>{n("confirmed")} yes</span> ·{" "}
                        <span style={{ color: C.warning }}>{n("rejected") + n("custom")} no</span> · {n("custom")} tables ·{" "}
                        {n("pending")} waiting{n("unknown") ? ` · ${n("unknown")} not in catalogue` : ""}
                      </span>
                      <span className="text-[12px]" style={{ color: C.textFaint }}>
                        →
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <p className="text-[12px]" style={{ color: C.textFaint }}>
            The catalogue is an unverified snapshot of ar.qurtoba.net. Highlighted cells are where a student&apos;s table
            differs from it. Each answer also appears in the user&apos;s activity feed.
          </p>
        </div>
      )}
    </div>
  );
}
