"use client";

// Student contributions while the attendance calculation is suspended
// (ACCURACY_PLAN.md, 2026-10-12): each one is a covered portal image for one
// course, the date the portal covers, the student's yes/no/unsure on whether
// the portal and their Haven log match, and the course context frozen when it
// was sent. Review material only: nothing here changes a calculation or
// approves a rule. Read through admin_attendance_contributions() (admin only);
// images from the private `attendance-evidence` bucket by 1-hour links.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, useC, SectionHeader, Loading, ErrorBanner } from "./_lib";

const BUCKET = "attendance-evidence";
/** The free plan's file space, for the running total. */
const FREE_SPACE_BYTES = 1024 * 1024 * 1024;

interface Totals {
  total: number;
  fresh: number;
  yes: number;
  no: number;
  unsure: number;
  tracked_bytes: number;
  bucket_bytes: number;
  bucket_files: number;
  orphan_files: number;
  awaiting_deletion: number;
}

interface Contribution {
  id: string;
  /** null once the student deleted their account (kept one month). */
  user_id: string | null;
  email: string | null;
  created_at: string;
  image_path: string;
  covers_until: string | null;
  matches: "yes" | "no" | "unsure";
  rule_url: string | null;
  note: string | null;
  context: {
    university?: { slug?: string | null; name?: string };
    major?: string | null;
    level?: string | null;
    term?: { start?: string | null; end?: string | null; weeks?: number | null };
    course?: { name?: string; credits?: number; mode?: string; sessions?: { day: number; minutes: number }[] };
    absences?: { date: string | null; day: number; minutes: number; excused: boolean; late: number | null }[];
  };
  status: "new" | "reviewed";
  image_bytes: number | null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The context is student-sent JSON: read it defensively so one malformed row
// shows as unreadable instead of breaking the whole list.
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
function readContext(raw: unknown): { ctx: Contribution["context"]; malformed: boolean } {
  const c = obj(raw);
  let malformed = !raw || typeof raw !== "object" || Array.isArray(raw);
  const u = obj(c.university), t = obj(c.term), co = obj(c.course);
  const sessionsRaw = co.sessions, absRaw = c.absences;
  if (sessionsRaw !== undefined && !Array.isArray(sessionsRaw)) malformed = true;
  if (absRaw !== undefined && !Array.isArray(absRaw)) malformed = true;
  const sessions = (Array.isArray(sessionsRaw) ? sessionsRaw : []).slice(0, 50).map(obj)
    .map((x) => ({ day: num(x.day) ?? 0, minutes: num(x.minutes) ?? 0 }));
  const absences = (Array.isArray(absRaw) ? absRaw : []).slice(0, 500).map(obj)
    .map((a) => ({ date: str(a.date), day: num(a.day) ?? 0, minutes: num(a.minutes) ?? 0, excused: a.excused === true, late: num(a.late) }));
  return {
    malformed,
    ctx: {
      university: { slug: str(u.slug), name: str(u.name) ?? undefined },
      major: str(c.major),
      level: str(c.level),
      term: { start: str(t.start), end: str(t.end), weeks: num(t.weeks) },
      course: { name: str(co.name) ?? undefined, credits: num(co.credits) ?? undefined, mode: str(co.mode) ?? undefined, sessions },
      absences,
    },
  };
}
const mins = (m: number) => (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`);

export function AttendanceContributionsSection({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const C = useC();
  const [rows, setRows] = useState<Contribution[] | null>(null);
  const [error, setError] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [onlyNew, setOnlyNew] = useState(true);

  const [totals, setTotals] = useState<Totals | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Bumped on every fresh load (filter change, refresh): a page that arrives
  // for an older list is dropped instead of mixed in.
  const listSeq = useRef(0);
  const PAGE = 100;

  const signLinks = useCallback(async (list: Contribution[]) => {
    if (!list.length) return;
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(list.map((r) => r.image_path), 3600);
    const m: Record<string, string> = {};
    for (const d of signed ?? []) if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
    setUrls((u) => ({ ...u, ...m }));
  }, []);

  // Filtered and paged on the server; totals counted there too. Expired images
  // are removed by the daily clean-up job (attendance-evidence-cleanup).
  const load = useCallback(async () => {
    const my = ++listSeq.current;
    setError("");
    setLoadingMore(false);
    const [list, tot] = await Promise.all([
      supabase.rpc("admin_attendance_contributions", { p_only_new: onlyNew, p_before: null, p_before_id: null, p_limit: PAGE }),
      supabase.rpc("admin_attendance_contribution_totals"),
    ]);
    if (my !== listSeq.current) return;
    if (list.error || tot.error) {
      setError((list.error ?? tot.error)!.message);
      setRows([]);
      return;
    }
    const rowsNow = (list.data ?? []) as Contribution[];
    setRows(rowsNow);
    setMore(rowsNow.length === PAGE);
    setTotals(((tot.data ?? []) as Totals[])[0] ?? null);
    await signLinks(rowsNow);
  }, [onlyNew, signLinks]);
  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    const last = rows?.[rows.length - 1];
    if (!last || loadingMore) return;
    const my = listSeq.current;
    setLoadingMore(true);
    // The cursor is (time, id): rows sharing a time are never skipped.
    const { data, error: e } = await supabase.rpc("admin_attendance_contributions", {
      p_only_new: onlyNew, p_before: last.created_at, p_before_id: last.id, p_limit: PAGE,
    });
    if (my !== listSeq.current) return;
    setLoadingMore(false);
    if (e) return setError(e.message);
    const next = (data ?? []) as Contribution[];
    setRows((rs) => {
      const seen = new Set((rs ?? []).map((r) => r.id));
      return [...(rs ?? []), ...next.filter((r) => !seen.has(r.id))];
    });
    setMore(next.length === PAGE);
    await signLinks(next);
  };

  const setStatus = async (id: string, status: Contribution["status"]) => {
    const { error: e } = await supabase.rpc("admin_review_attendance_contribution", { p_id: id, p_status: status });
    if (e) setError(e.message);
    else setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, status } : r)) ?? rs);
  };

  const shown = rows ?? [];

  return (
    <div>
      <SectionHeader
        title="Absence contributions"
        action={
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: C.textDim }}>
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
            Only not yet reviewed
          </label>
        }
      />
      <p className="text-[12px] mb-4" style={{ color: C.textDim }}>
        The attendance calculation is suspended for every student. These are optional portal images students sent with
        their own Haven log, frozen at sending time. Review material only: a match answer is the student&apos;s, not a
        verified match, and nothing here approves a rule.
      </p>
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!rows ? (
        <Loading />
      ) : (
        <>
          {totals && (
            <p className="text-[12px] mb-4" style={{ color: C.textDim }}>
              {totals.total} contributions · {totals.fresh} not reviewed · portal and log match: {totals.yes} yes, {totals.no} no,{" "}
              {totals.unsure} not sure · images {(Number(totals.bucket_bytes) / 1024 / 1024).toFixed(1)} MB in {totals.bucket_files} files of{" "}
              {FREE_SPACE_BYTES / 1024 / 1024 / 1024} GB free space ({((Number(totals.bucket_bytes) / FREE_SPACE_BYTES) * 100).toFixed(1)}%)
              {(Number(totals.orphan_files) > 0 || Number(totals.awaiting_deletion) > 0) && (
                <span style={{ color: C.warning }}>
                  {" "}· waiting for the daily clean-up: {totals.orphan_files} unused images, {totals.awaiting_deletion} past the month after account deletion
                </span>
              )}
            </p>
          )}
          {shown.length === 0 ? (
            <p className="p-6 text-center text-[13px] rounded-xl border" style={{ color: C.textFaint, borderColor: C.border, background: C.panel }}>
              No contributions{onlyNew ? " waiting for review" : ""}.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {shown.map((r) => {
                const { ctx: x, malformed } = readContext(r.context);
                return (
                  <div key={r.id} className="rounded-xl border p-4 flex flex-col md:flex-row gap-4" style={{ borderColor: C.border, background: C.panel }}>
                    <a href={urls[r.image_path]} target="_blank" rel="noreferrer" className="md:w-72 shrink-0">
                      {urls[r.image_path] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={urls[r.image_path]} alt="" className="w-full h-auto rounded-lg border" style={{ borderColor: C.border }} />
                      ) : (
                        <span className="text-[12px]" style={{ color: C.textFaint }}>Image unavailable</span>
                      )}
                    </a>
                    <div className="min-w-0 flex-1 text-[12.5px] flex flex-col gap-1.5" style={{ color: C.text }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span dir="auto" className="font-semibold">{x.course?.name ?? "—"}</span>
                        <span style={{ color: C.textDim }} dir="auto">· {x.university?.name || "—"}</span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{
                          background: C.tint(r.matches === "yes" ? C.success : r.matches === "no" ? C.danger : C.warning, "22"),
                          color: r.matches === "yes" ? C.success : r.matches === "no" ? C.danger : C.warning,
                        }}>
                          match: {r.matches === "unsure" ? "not sure" : r.matches}
                        </span>
                      </div>
                      <div style={{ color: C.textDim }}>
                        Sent {new Date(r.created_at).toLocaleString()} · portal covers until {r.covers_until ?? "not clear"} ·{" "}
                        {r.user_id ? (
                          <button onClick={() => onOpenUser(r.user_id!)} className="underline" style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", padding: 0 }}>
                            {r.email ?? r.user_id}
                          </button>
                        ) : (
                          <span>account deleted (image removed after a month)</span>
                        )}
                      </div>
                      <div style={{ color: C.textDim }}>
                        Term {x.term?.start ?? "?"} → {x.term?.end ?? "?"} ({x.term?.weeks ?? "?"} weeks) · {x.course?.credits ?? "?"} credits ·
                        counted by {x.course?.mode ?? "hour"} · level {x.level || "—"} · {x.major || "—"}
                      </div>
                      <div style={{ color: C.textDim }}>
                        Weekly: {(x.course?.sessions ?? []).map((s) => `${DAYS[s.day] ?? s.day} ${mins(s.minutes)}`).join(", ") || "—"}
                      </div>
                      <div>
                        Haven log ({(x.absences ?? []).length}):{" "}
                        {(x.absences ?? []).map((a, i) => (
                          <span key={i} style={{ color: a.excused ? C.textDim : C.text }}>
                            {i > 0 ? ", " : ""}
                            {a.date ?? DAYS[a.day]} {a.late ? `late ${a.late}m` : mins(a.minutes)}
                            {a.excused ? " (excused)" : ""}
                          </span>
                        ))}
                      </div>
                      {typeof r.rule_url === "string" && /^https?:\/\//i.test(r.rule_url) && (
                        <div>
                          Rule link: <a href={r.rule_url} target="_blank" rel="noreferrer" className="underline" dir="ltr">{r.rule_url}</a>
                        </div>
                      )}
                      {malformed && <div style={{ color: C.danger }}>Part of this contribution&apos;s details is unreadable; treat it as unusable evidence.</div>}
                      {typeof r.note === "string" && r.note && <div dir="auto" style={{ color: C.textDim }}>Note: {r.note}</div>}
                      <div className="mt-1">
                        <button
                          onClick={() => setStatus(r.id, r.status === "new" ? "reviewed" : "new")}
                          className="text-[12px] px-3 py-1.5 rounded-lg font-medium"
                          style={{ background: C.border, color: C.text, border: "none", cursor: "pointer" }}
                        >
                          {r.status === "new" ? "Mark reviewed" : "Mark not reviewed"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {more && (
            <button onClick={loadMore} disabled={loadingMore} className="mt-4 text-[12px] px-3 py-1.5 rounded-lg font-medium" style={{ background: C.border, color: C.text, border: "none", cursor: "pointer" }}>
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}
