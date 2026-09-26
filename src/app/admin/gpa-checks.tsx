"use client";

// GPA checks — what students told us when they compared our GPA with their
// university portal: the end-of-term window and "try it on a past term" on the
// Profile page. Course details are only here when the student agreed to share
// them (and are hidden again if they withdrew). From those courses' real
// letters next to their percentages, the page works out where each letter
// starts at universities that don't publish cutoffs; approving them applies
// them to that university's students (grade_cutoffs table).

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, useC, StatCard, SectionHeader, Loading, ErrorBanner, fmtDate } from "./_lib";
import { catalogBySlug, detectScheme, matchCatalog, type GradeScheme } from "@/lib/gradeSchemes";
import { learnCutoffs, validCutoffs, type Observation } from "@/lib/cutoffLearning";

interface EventRow {
  user_id: string;
  email: string | null;
  event: string;
  at: string;
  meta: Record<string, unknown> | null;
}

interface SharedCourse {
  name?: string;
  hours?: number;
  pct?: number | null;
  /** end-of-term: our estimate and the official result */
  estimated?: string | null;
  official?: string | number | null;
  /** past term: the transcript letter */
  letter?: string;
  mark?: number;
}

const REASON_LABEL: Record<string, string> = {
  repeat: "Repeated course",
  notCounted: "A course that doesn't count",
  hours: "Wrong credit hours",
  unknown: "Doesn't know",
};

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const coursesOf = (m: Record<string, unknown> | null): SharedCourse[] =>
  Array.isArray(m?.courses) ? (m!.courses as SharedCourse[]) : [];

/** A past term's cumulative result: the whole check when shared, else just the result. */
const cumResultOf = (m: Record<string, unknown> | null): string | null => {
  const c = m?.cum && typeof m.cum === "object" ? (m.cum as Record<string, unknown>) : null;
  return str(c?.result) ?? str(m?.cum_result);
};

/** Catalogue slug of the university an event came from. */
function slugOf(m: Record<string, unknown> | null): string | null {
  const direct = str(m?.catalog);
  if (direct) return direct;
  const name = str(m?.university);
  return name ? matchCatalog(name)?.slug ?? null : null;
}

/** The scheme the app uses for a catalogue university (estimated cutoffs). */
function schemeFor(slug: string): GradeScheme | null {
  const u = catalogBySlug(slug);
  if (!u) return null;
  return detectScheme({ universitySlug: "other", universityName: u.ar, major: "", level: "" }).scheme;
}

export function GpaChecksSection({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const C = useC();
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [approved, setApproved] = useState<Record<string, { cutoffs: Record<string, number>; samples: number; updated_at: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [events, cutoffs] = await Promise.all([
      supabase.rpc("admin_gpa_checks"),
      supabase.from("grade_cutoffs").select("university, cutoffs, samples, updated_at"),
    ]);
    if (events.error) {
      setError(
        /function|schema cache/i.test(events.error.message)
          ? `${events.error.message} — admin_gpa_checks() isn't in the database yet (migration 20260926_gpa_checks.sql).`
          : events.error.message
      );
    } else setRows(events.data as EventRow[]);
    if (!cutoffs.error && cutoffs.data) {
      setApproved(
        Object.fromEntries(
          (cutoffs.data as { university: string; cutoffs: Record<string, number>; samples: number; updated_at: string }[]).map(
            (r) => [r.university, r]
          )
        )
      );
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => rows ?? [], [rows]);
  const count = (event: string, pred: (m: Record<string, unknown>) => boolean = () => true) =>
    all.filter((r) => r.event === event && pred(r.meta ?? {})).length;

  const reasons = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) {
      if (r.event !== "term_mismatch_reason" && r.event !== "past_term_reason" && r.event !== "term_cum_reason") continue;
      const k = str(r.meta?.reason) ?? "unknown";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  // Shared reports with course details. The end-of-term flow can send the same
  // term twice (grades saved, then a reason): keep each student's latest.
  const reports = useMemo(() => {
    const seen = new Set<string>();
    const out: EventRow[] = [];
    for (const r of all) {
      if (!coursesOf(r.meta).length) continue;
      const key = r.event.startsWith("past_")
        ? `${r.user_id}|past|${str(r.meta?.name) ?? ""}`
        : r.event.startsWith("term_cum") ? `${r.user_id}|cum` : `${r.user_id}|term`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }, [all]);

  // Real letters next to percentages, per university, one per course.
  const byUni = useMemo(() => {
    const m = new Map<string, { obs: Observation[]; users: Set<string> }>();
    const seen = new Set<string>();
    for (const r of all) {
      const slug = slugOf(r.meta);
      if (!slug) continue;
      for (const c of coursesOf(r.meta)) {
        const letter = typeof c.official === "string" ? c.official : c.letter;
        if (!letter || typeof c.pct !== "number") continue;
        const key = `${r.user_id}|${c.name ?? ""}|${c.pct}|${letter}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const g = m.get(slug) ?? { obs: [], users: new Set<string>() };
        g.obs.push({ letter, pct: c.pct });
        g.users.add(r.user_id);
        m.set(slug, g);
      }
    }
    return [...m.entries()]
      .map(([slug, g]) => ({ slug, scheme: schemeFor(slug), ...g }))
      .filter((g) => g.scheme && (g.scheme.approxCutoffs || approved[g.slug]) && !g.scheme.percent)
      .sort((a, b) => b.obs.length - a.obs.length);
  }, [all, approved]);

  if (loading && !rows) return <Loading text="Loading GPA checks…" />;

  return (
    <div>
      <SectionHeader
        title="GPA checks"
        action={
          <button
            onClick={() => void load()}
            className="rounded-lg px-3 py-1.5 text-[12px]"
            style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}
          >
            {loading ? "…" : "↻ Refresh"}
          </button>
        }
      />
      {error && <ErrorBanner message={error} onRetry={load} />}

      {rows && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="End of term: matched" value={count("term_gpa_match")} accent={C.success} />
            <StatCard
              label="End of term: differed"
              value={count("term_gpa_mismatch")}
              accent={C.warning}
              sub={`${count("term_gpa_mismatch", (m) => m.consent === true)} shared details`}
            />
            <StatCard label="Past terms: matched" value={count("past_term_checked", (m) => m.result === "match")} accent={C.success} />
            <StatCard
              label="Past terms: differed"
              value={count("past_term_checked", (m) => m.result === "mismatch")}
              accent={C.warning}
              sub={`${count("past_term_checked", (m) => m.result === "mismatch" && coursesOf(m).length > 0)} shared details`}
            />
            <StatCard label="Cumulative, end of term: matched" value={count("term_cum_checked", (m) => m.result === "match")} accent={C.success} />
            <StatCard
              label="Cumulative, end of term: differed"
              value={count("term_cum_checked", (m) => m.result === "mismatch")}
              accent={C.warning}
              sub={`${count("term_cum_checked", (m) => m.result === "mismatch" && m.consent === true)} shared details`}
            />
            <StatCard label="Cumulative, past terms: matched" value={count("past_term_checked", (m) => cumResultOf(m) === "match")} accent={C.success} />
            <StatCard
              label="Cumulative, past terms: differed"
              value={count("past_term_checked", (m) => cumResultOf(m) === "mismatch")}
              accent={C.warning}
            />
          </div>

          {reasons.length > 0 && (
            <div>
              <h3 className="text-[13px] font-semibold mb-2" style={{ color: C.text }}>
                Why students think it differed
              </h3>
              <div className="flex flex-wrap gap-2">
                {reasons.map(([k, n]) => (
                  <span key={k} className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                    {REASON_LABEL[k] ?? k} · <b className="tabular-nums">{n}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          <CutoffsBlock groups={byUni} approved={approved} onSaved={load} />

          <RepeatRules rows={all.filter((r) => r.event === "repeat_policy_other")} onOpenUser={onOpenUser} />

          <div>
            <h3 className="text-[13px] font-semibold mb-2" style={{ color: C.text }}>
              Shared reports
            </h3>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border, background: C.panel }}>
              {reports.length === 0 ? (
                <p className="p-6 text-center text-[13px]" style={{ color: C.textFaint }}>
                  No student has shared course details yet.
                </p>
              ) : (
                reports.slice(0, 60).map((r, i) => <Report key={`${r.user_id}${r.at}`} row={r} last={i === reports.length - 1} onOpenUser={onOpenUser} />)
              )}
            </div>
          </div>

          <p className="text-[12px]" style={{ color: C.textFaint }}>
            Course details appear only when the student agreed to share them; a student who withdrew consent shows no end-of-term
            details. Every check is also in the user&apos;s activity feed.
          </p>
        </div>
      )}
    </div>
  );
}

function Report({ row, last, onOpenUser }: { row: EventRow; last: boolean; onOpenUser: (id: string) => void }) {
  const C = useC();
  const m = row.meta ?? {};
  const past = row.event.startsWith("past_");
  const cumTerm = row.event.startsWith("term_cum");
  // The cumulative figures: the end-of-term check's own, or a past term's.
  const cum = cumTerm ? m : m.cum && typeof m.cum === "object" ? (m.cum as Record<string, unknown>) : null;
  const slug = slugOf(m);
  const uni = (slug && catalogBySlug(slug)?.ar) || str(m.university) || "—";
  const ours = num(m.ours);
  const portal = num(m.portal);
  const reason = str(m.reason);
  const courses = coursesOf(m);
  return (
    <div className="px-5 py-3.5 flex flex-col gap-2" style={{ borderBottom: last ? "none" : `1px solid ${C.border}` }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span dir="auto" className="text-[13px] font-medium" style={{ color: C.text }}>
          {uni}
        </span>
        <span className="text-[11px] rounded px-1.5 py-0.5" style={{ background: C.border, color: C.textMuted }}>
          {past ? `Past term${str(m.name) ? ` · ${str(m.name)}` : ""}` : cumTerm ? "End of term · cumulative" : "End of term"}
        </span>
        {cum && (
          <span className="text-[12px] tabular-nums" style={{ color: cum.result === "match" ? C.success : C.warning }}>
            cumulative: before {num(cum.before) ?? "—"} over {num(cum.hours) ?? "—"}h · ours {num(cum.ours) ?? "—"} · portal {num(cum.portal) ?? "—"}
          </span>
        )}
        <span className="text-[12px] tabular-nums" style={{ color: C.textMuted }}>
          ours {ours ?? "—"} · portal {portal ?? "—"}
          {m.result === "match" && <span style={{ color: C.success }}> · matched</span>}
        </span>
        {reason && (
          <span className="text-[12px]" style={{ color: C.warning }}>
            {REASON_LABEL[reason] ?? reason}
          </span>
        )}
        <button
          onClick={() => onOpenUser(row.user_id)}
          className="text-[11px] underline-offset-2 hover:underline ms-auto"
          style={{ color: C.primary, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {row.email ?? "user"} · {fmtDate(row.at)}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[12px] tabular-nums" style={{ color: C.text }}>
          <thead>
            <tr style={{ color: C.textFaint }}>
              <th className="text-start font-medium pe-4">Course</th>
              <th className="text-start font-medium pe-4">Hours</th>
              <th className="text-start font-medium pe-4">%</th>
              {!past && <th className="text-start font-medium pe-4">Our letter</th>}
              <th className="text-start font-medium pe-4">{past ? "Letter / mark" : "Official"}</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c, i) => {
              const actual = past ? c.letter ?? c.mark ?? null : c.official ?? null;
              const differs = !past && actual != null && c.estimated != null && String(actual) !== c.estimated;
              return (
                <tr key={i}>
                  <td dir="auto" className="pe-4">{c.name || `#${i + 1}`}</td>
                  <td className="pe-4">{c.hours ?? "—"}</td>
                  <td className="pe-4">{c.pct ?? "—"}</td>
                  {!past && <td className="pe-4">{c.estimated ?? "—"}</td>}
                  <td className="pe-4" style={differs ? { color: C.warning, fontWeight: 600 } : undefined}>
                    {actual ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Group = { slug: string; scheme: GradeScheme | null; obs: Observation[]; users: Set<string> };

function CutoffsBlock({
  groups,
  approved,
  onSaved,
}: {
  groups: Group[];
  approved: Record<string, { cutoffs: Record<string, number>; samples: number; updated_at: string }>;
  onSaved: () => void;
}) {
  const C = useC();
  return (
    <div>
      <h3 className="text-[13px] font-semibold mb-1" style={{ color: C.text }}>
        Grade cutoffs from students&apos; results
      </h3>
      <p className="text-[12px] mb-2" style={{ color: C.textDim }}>
        For universities that don&apos;t publish where each letter starts. Each shared course&apos;s % next to its real letter narrows
        the cutoff down. Nothing changes for students until you approve.
      </p>
      <div className="flex flex-col gap-3">
        {groups.length === 0 ? (
          <div className="rounded-xl border p-6 text-center text-[13px]" style={{ borderColor: C.border, background: C.panel, color: C.textFaint }}>
            No results with a % yet.
          </div>
        ) : (
          groups.map((g) => <CutoffCard key={g.slug} group={g} approved={approved[g.slug]} onSaved={onSaved} />)
        )}
      </div>
    </div>
  );
}

function CutoffCard({
  group,
  approved,
  onSaved,
}: {
  group: Group;
  approved?: { cutoffs: Record<string, number>; samples: number; updated_at: string };
  onSaved: () => void;
}) {
  const C = useC();
  const scheme = group.scheme!;
  const rows = useMemo(() => learnCutoffs(scheme, group.obs), [scheme, group.obs]);
  const initial = () =>
    Object.fromEntries(rows.map((r) => [r.letter, String(approved?.cutoffs[r.letter] ?? r.suggested ?? r.current)]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const u = catalogBySlug(group.slug);
  const conflicts = rows.filter((r) => r.conflict).length;

  const parsed = rows.map((r) => {
    const v = Number(values[r.letter]);
    return values[r.letter]?.trim() && isFinite(v) ? v : null;
  });
  const ok = validCutoffs(parsed);

  const save = async (withdraw = false) => {
    setBusy(true);
    setMsg("");
    const cutoffs = withdraw ? null : Object.fromEntries(rows.map((r, i) => [r.letter, parsed[i]]));
    const { error } = await supabase.rpc("admin_set_grade_cutoffs", {
      p_university: group.slug,
      p_cutoffs: cutoffs,
      p_samples: group.users.size,
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else {
      setMsg(withdraw ? "Withdrawn — students are back on the estimate." : "Approved — applies to this university's students.");
      onSaved();
    }
  };

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: C.border, background: C.panel }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
        <span dir="auto" className="text-[13px] font-medium" style={{ color: C.text }}>
          {u?.ar ?? group.slug}
        </span>
        <span className="text-[11px]" style={{ color: C.textDim }}>
          {u?.country} · {group.obs.length} results from {group.users.size} students
        </span>
        {approved && (
          <span className="text-[11px] rounded px-1.5 py-0.5" style={{ background: C.successBg, color: C.successText }}>
            approved {fmtDate(approved.updated_at)}
          </span>
        )}
        {conflicts > 0 && (
          <span className="text-[11px]" style={{ color: C.warning }}>
            {conflicts} contradicting boundar{conflicts === 1 ? "y" : "ies"} — instructors may set letters themselves
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="text-[12px] tabular-nums" style={{ color: C.text }}>
          <thead>
            <tr style={{ color: C.textFaint }}>
              <th className="text-start font-medium pe-4">Letter</th>
              <th className="text-start font-medium pe-4">Seen</th>
              <th className="text-start font-medium pe-4">Estimate</th>
              <th className="text-start font-medium pe-4">Suggested</th>
              <th className="text-start font-medium pe-4">Starts at %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.letter}>
                <td className="pe-4 font-medium" dir="ltr">{r.letter}</td>
                <td className="pe-4" style={{ color: r.n ? C.text : C.textFaint }}>
                  {r.n ? `${r.n} · ${r.min}–${r.max}%` : "—"}
                </td>
                <td className="pe-4" style={{ color: C.textMuted }}>{r.current}</td>
                <td className="pe-4" style={{ color: r.conflict ? C.warning : C.text }}>
                  {r.conflict ? "conflict" : r.suggested ?? "—"}
                </td>
                <td className="pe-4 py-0.5">
                  <input
                    value={values[r.letter] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [r.letter]: e.target.value }))}
                    inputMode="decimal"
                    dir="ltr"
                    className="w-16 rounded px-1.5 py-0.5 text-[12px]"
                    style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}` }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          disabled={!ok || busy}
          onClick={() => void save()}
          className="rounded-lg px-3 py-1.5 text-[12px] font-medium"
          style={{ background: ok ? C.primary : C.border, color: ok ? C.primaryText : C.textFaint, border: "none", cursor: ok ? "pointer" : "default" }}
        >
          {approved ? "Update approved cutoffs" : "Approve cutoffs"}
        </button>
        <button
          onClick={() => setValues(initial())}
          className="rounded-lg px-3 py-1.5 text-[12px]"
          style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}
        >
          Reset
        </button>
        {approved && (
          <button
            disabled={busy}
            onClick={() => void save(true)}
            className="rounded-lg px-3 py-1.5 text-[12px]"
            style={{ background: "transparent", color: C.danger, border: `1px solid ${C.border}`, cursor: "pointer" }}
          >
            Withdraw
          </button>
        )}
        {!ok && (
          <span className="text-[11px]" style={{ color: C.warning }}>
            Every letter needs a % and they must go down strictly.
          </span>
        )}
        {msg && (
          <span className="text-[11px]" style={{ color: C.textMuted }}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}

/** Rules for repeated courses that students described themselves ("other"),
 *  at universities outside Saudi Arabia — to add as real options. Until then
 *  the app counts both attempts for them. Latest answer per student. */
function RepeatRules({ rows, onOpenUser }: { rows: EventRow[]; onOpenUser: (id: string) => void }) {
  const C = useC();
  const latest = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((r) => (seen.has(r.user_id) ? false : (seen.add(r.user_id), true)));
  }, [rows]);
  return (
    <div>
      <h3 className="text-[13px] font-semibold mb-1" style={{ color: C.text }}>
        How students say their university counts a repeated course
      </h3>
      <p className="text-[12px] mb-2" style={{ color: C.textDim }}>
        Students outside Saudi Arabia who picked &ldquo;Other&rdquo;. Until their rule is added as an option, their GPA counts both
        attempts.
      </p>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border, background: C.panel }}>
        {latest.length === 0 ? (
          <p className="p-6 text-center text-[13px]" style={{ color: C.textFaint }}>
            None yet.
          </p>
        ) : (
          latest.map((r, i) => {
            const slug = slugOf(r.meta);
            const uni = (slug && catalogBySlug(slug)?.ar) || str(r.meta?.university) || "—";
            return (
              <div
                key={`${r.user_id}${r.at}`}
                className="px-5 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"
                style={{ borderBottom: i === latest.length - 1 ? "none" : `1px solid ${C.border}` }}
              >
                <span dir="auto" className="text-[13px] font-medium" style={{ color: C.text }}>
                  {uni}
                </span>
                <span dir="auto" className="text-[13px] flex-1 min-w-[12rem]" style={{ color: C.textMuted }}>
                  {str(r.meta?.note) ?? "—"}
                </span>
                <button
                  onClick={() => onOpenUser(r.user_id)}
                  className="text-[11px] underline-offset-2 hover:underline"
                  style={{ color: C.primary, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {r.email ?? "user"} · {fmtDate(r.at)}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
