"use client";

// University facts — where each university's OFFICIAL calendar (term dates,
// finals, حرمان limit, breaks) is entered and approved. Only the admin approves
// a calendar; until then students see it as a suggestion.
//   • Waiting for approval: facts prepared from official sources (status
//     `review`) — shown to students as suggestions; check them against the
//     source, then approve or reject.
//   • Links waiting to be read: official calendar links the admin pasted with
//     "Prepare from this link" (university_fact_requests). They're read in a
//     working session with Claude (free, no API) and their dates land in the
//     approval queue above.
//   • Universities: every Saudi university/college, missing ones first, each
//     with its facts and a form to enter or correct them by hand.
//   • Suggested calendars (status `suggested`, from an unofficial source) are
//     shown to students as suggestions; mid-term, students confirm or correct
//     their dates (crowd_votes). Suggested and waiting calendars alike: 5
//     agreeing (fewer than 3 not) flags the term here as ready for approval —
//     nothing is approved automatically; 3 or more not agreeing are flagged
//     for review, with the dates they gave.
// Reads/writes go straight to the tables under the is_admin_current() policies.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, useC, StatCard, SectionHeader, Loading, ErrorBanner } from "./_lib";
import { UNIVERSITIES, type University } from "@/lib/tools/universities";

type Term = "first" | "second" | "summer";

export interface FactRow {
  id: string;
  university_slug: string;
  academic_year: string;
  term: Term;
  fact_key: string;
  value: Record<string, unknown>;
  status: "verified" | "review" | "suggested" | "rejected";
  verified_via?: "admin" | "crowd" | null;
  sources: { url: string; title?: string; quote?: string }[];
  note: string | null;
  updated_at: string;
}

interface LinkRequest {
  id: string;
  university_slug: string;
  url: string;
  title: string | null;
  status: "pending" | "done" | "failed";
  note: string | null;
  created_at: string;
}

/** The Saudi academic year a date falls in, e.g. Sept 2026 → "2026-2027". A new
 *  year's calendar is published over the summer, so June onwards looks ahead. */
export function currentAcademicYear(now = new Date()): string {
  const y = now.getFullYear();
  return now.getMonth() >= 5 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/** Which universities still lack an approved term start this academic year,
 *  and how many prepared facts wait for approval. Null when the table can't
 *  be read (e.g. not created yet). */
export async function loadFactsCoverage(): Promise<{ missing: University[]; review: number } | null> {
  const year = currentAcademicYear();
  const [verified, review] = await Promise.all([
    supabase.from("university_facts").select("university_slug").eq("academic_year", year).eq("fact_key", "term_start").eq("status", "verified"),
    supabase.from("university_facts").select("id", { count: "exact", head: true }).eq("status", "review"),
  ]);
  if (verified.error || review.error) return null;
  const done = new Set((verified.data ?? []).map((r: { university_slug: string }) => r.university_slug));
  return { missing: UNIVERSITIES.filter((u) => !done.has(u.slug)), review: review.count ?? 0 };
}

/** Calendar terms 5 or more students confirmed that wait for the admin's
 *  approval — counted for the banner on every admin visit. */
export async function loadCalendarsReady(): Promise<number> {
  const [v, f] = await Promise.all([
    supabase.from("crowd_votes").select("university_slug, period, answer").eq("subject", "calendar"),
    supabase.from("university_facts").select("*").neq("status", "rejected"),
  ]);
  if (v.error || f.error) return 0;
  const votes = v.data as CalendarVote[];
  const facts = f.data as FactRow[];
  return [...new Set(votes.map((x) => x.university_slug))].reduce(
    (n, slug) =>
      n +
      calendarTallies(votes.filter((x) => x.university_slug === slug), facts.filter((x) => x.university_slug === slug)).filter((t) => t.ready)
        .length,
    0,
  );
}

const TERM_LABEL: Record<Term, string> = { first: "First term", second: "Second term", summer: "Summer" };

/** A student's answer about their university's term dates (crowd_votes);
 *  `kept_own` = they went back to their own dates instead of the calendar's. */
export interface CalendarVote {
  university_slug: string;
  period: string;
  answer: { start?: string; finals_start?: string; end?: string; kept_own?: boolean };
}

interface CalendarTally {
  period: string;
  agree: number;
  differ: number;
  review: boolean;
  /** 5 or more agree (fewer than 3 not) and the term isn't approved yet */
  ready: boolean;
  /** the dates students gave, most common first */
  answers: { start: string; finals: string; n: number }[];
}

/** Students' answers per term, against the dates on record (approved, suggested
 *  or waiting). */
export function calendarTallies(votes: CalendarVote[], rows: FactRow[]): CalendarTally[] {
  const periods = [...new Set(votes.map((v) => v.period))];
  return periods.map((period) => {
    const [yr, term] = period.split("|");
    const date = (key: string) =>
      rows.find((f) => f.academic_year === yr && f.term === term && f.fact_key === key && f.status !== "rejected")
        ?.value.date as string | undefined;
    const pending = rows.some((f) => f.academic_year === yr && f.term === term && (f.status === "suggested" || f.status === "review"));
    const ts = date("term_start");
    const fs = date("finals_start");
    // Going back to one's own dates says nothing about the calendar's.
    const vs = votes.filter((v) => v.period === period && !v.answer.kept_own);
    const agree = vs.filter((v) => (!ts || v.answer.start === ts) && (!fs || v.answer.finals_start === fs)).length;
    const counts = new Map<string, number>();
    for (const v of vs) {
      const k = `${v.answer.start ?? ""}|${v.answer.finals_start ?? ""}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const answers = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => ({ start: k.split("|")[0], finals: k.split("|")[1], n }));
    const differ = vs.length - agree;
    return { period, agree, differ, review: differ >= 3, ready: pending && agree >= 5 && differ < 3, answers };
  });
}
const KEY_ORDER = ["term_start", "term_end", "finals_start", "finals_end", "denial_pct"];

function describe(f: { fact_key: string; value: Record<string, unknown> }): string {
  const v = f.value;
  if (f.fact_key === "denial_pct") return `${v.pct}%`;
  if (f.fact_key.startsWith("holiday:")) return `${v.name_ar ?? v.name_en} · ${v.start} → ${v.end}`;
  return String(v.date ?? JSON.stringify(v));
}

function keyLabel(k: string): string {
  if (k.startsWith("holiday:")) return "Break";
  return { term_start: "Term start", term_end: "Term end", finals_start: "Finals start", finals_end: "Finals end", denial_pct: "حرمان limit" }[k] ?? k;
}

const sortFacts = (a: FactRow, b: FactRow) =>
  a.academic_year.localeCompare(b.academic_year) ||
  a.term.localeCompare(b.term) ||
  (KEY_ORDER.indexOf(a.fact_key) + 1 || 99) - (KEY_ORDER.indexOf(b.fact_key) + 1 || 99) ||
  a.fact_key.localeCompare(b.fact_key);

export function UniversityFactsSection() {
  const C = useC();
  const [facts, setFacts] = useState<FactRow[] | null>(null);
  const [links, setLinks] = useState<LinkRequest[]>([]);
  const [votes, setVotes] = useState<CalendarVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState<"all" | "public" | "private">("all");
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const year = currentAcademicYear();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [f, l, v] = await Promise.all([
      supabase.from("university_facts").select("*").order("updated_at", { ascending: false }),
      supabase.from("university_fact_requests").select("*").neq("status", "done").order("created_at", { ascending: true }),
      supabase.from("crowd_votes").select("university_slug, period, answer").eq("subject", "calendar"),
    ]);
    if (f.error) setError(f.error.message);
    else setFacts(f.data as FactRow[]);
    // The links list is extra: if its table can't be read, the page still works.
    setLinks(l.error ? [] : (l.data as LinkRequest[]));
    setVotes(v.error ? [] : (v.data as CalendarVote[]));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const review = useMemo(() => (facts ?? []).filter((f) => f.status === "review").sort((a, b) => a.university_slug.localeCompare(b.university_slug) || sortFacts(a, b)), [facts]);
  const bySlug = useMemo(() => {
    const m = new Map<string, FactRow[]>();
    for (const f of facts ?? []) m.set(f.university_slug, [...(m.get(f.university_slug) ?? []), f]);
    return m;
  }, [facts]);
  const talliesOf = useCallback(
    (slug: string) => calendarTallies(votes.filter((v) => v.university_slug === slug), bySlug.get(slug) ?? []),
    [votes, bySlug],
  );
  const toReview = useMemo(
    () => [...new Set(votes.map((v) => v.university_slug))].filter((slug) => talliesOf(slug).some((t) => t.review)),
    [votes, talliesOf],
  );
  const ready = useMemo(
    () =>
      [...new Set(votes.map((v) => v.university_slug))].flatMap((slug) =>
        talliesOf(slug).filter((t) => t.ready).map((t) => ({ slug, period: t.period, agree: t.agree })),
      ),
    [votes, talliesOf],
  );
  const suggestedUnis = useMemo(
    () => new Set((facts ?? []).filter((f) => f.status === "suggested").map((f) => f.university_slug)),
    [facts],
  );
  const hasCalendar = useCallback(
    (slug: string) => (bySlug.get(slug) ?? []).some((f) => f.status === "verified" && f.fact_key === "term_start" && f.academic_year === year),
    [bySlug, year],
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return UNIVERSITIES.filter((u) => sector === "all" || u.sector === sector)
      .filter((u) => !q || u.name.includes(query.trim()) || u.nameEn.toLowerCase().includes(q) || u.slug.includes(q))
      .sort((a, b) => Number(hasCalendar(a.slug)) - Number(hasCalendar(b.slug)));
  }, [query, sector, hasCalendar]);

  const decide = async (ids: string[], status: "verified" | "rejected") => {
    const { data: auth } = await supabase.auth.getUser();
    const { error: e } = await supabase
      .from("university_facts")
      .update({
        status,
        verified_via: status === "verified" ? "admin" : null,
        reviewed_by: auth.user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (e) setError(e.message);
    else void load();
  };

  /** Approve one term the students confirmed: its suggested (unofficial) rows
   *  are approved as "confirmed by students", its official ones as official. */
  const approveTerm = async (slug: string, period: string) => {
    const [yr, term] = period.split("|");
    const rows = (bySlug.get(slug) ?? []).filter(
      (f) => f.academic_year === yr && f.term === term && (f.status === "suggested" || f.status === "review"),
    );
    const { data: auth } = await supabase.auth.getUser();
    const stamp = { status: "verified", reviewed_by: auth.user?.id ?? null, reviewed_at: new Date().toISOString() };
    const results = await Promise.all(
      (["suggested", "review"] as const).map((st) => {
        const ids = rows.filter((f) => f.status === st).map((f) => f.id);
        return ids.length
          ? supabase.from("university_facts").update({ ...stamp, verified_via: st === "suggested" ? "crowd" : "admin" }).in("id", ids)
          : Promise.resolve({ error: null });
      }),
    );
    const e = results.find((r) => r.error)?.error;
    if (e) setError(e.message);
    else void load();
  };

  const remove = async (id: string) => {
    const { error: e } = await supabase.from("university_facts").delete().eq("id", id);
    if (e) setError(e.message);
    else void load();
  };

  const removeLink = async (id: string) => {
    const { error: e } = await supabase.from("university_fact_requests").delete().eq("id", id);
    if (e) setError(e.message);
    else void load();
  };

  if (loading && !facts) return <Loading text="Loading university facts…" />;

  const covered = UNIVERSITIES.filter((u) => hasCalendar(u.slug)).length;
  const btn = (primary = false): React.CSSProperties => ({
    background: primary ? C.primary : C.border,
    color: primary ? "#fff" : C.textMuted,
    border: "none",
    cursor: "pointer",
  });

  // Group the review queue by university so a whole calendar can be approved at once.
  const reviewGroups = [...review.reduce((m, f) => m.set(f.university_slug, [...(m.get(f.university_slug) ?? []), f]), new Map<string, FactRow[]>())];

  return (
    <div>
      <SectionHeader
        title="University facts"
        action={
          <button onClick={() => void load()} className="rounded-lg px-3 py-1.5 text-[12px]" style={btn()}>
            {loading ? "…" : "↻ Refresh"}
          </button>
        }
      />
      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label={`Approved calendars ${year}`} value={covered} sub={`of ${UNIVERSITIES.length} universities & colleges`} />
        <StatCard label="Missing" value={UNIVERSITIES.length - covered} />
        <StatCard label="Waiting for approval" value={review.length} sub="prepared facts" />
        <StatCard label="Links to read" value={links.filter((l) => l.status === "pending").length} sub="pasted calendar links" />
      </div>

      {toReview.length > 0 && (
        <div className="rounded-xl px-4 py-3 mb-6 text-[13px]" style={{ background: C.tint(C.danger, "18"), color: C.text }}>
          <div className="font-semibold mb-1" style={{ color: C.danger }}>
            {toReview.length} {toReview.length > 1 ? "universities" : "university"}: 3 or more students gave different dates — review
          </div>
          <div className="flex flex-wrap gap-2">
            {toReview.map((slug) => (
              <button key={slug} onClick={() => setOpenSlug(slug)} className="rounded-lg px-2.5 py-1 text-[12px]" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text, cursor: "pointer" }}>
                <span dir="auto">{UNIVERSITIES.find((u) => u.slug === slug)?.name ?? slug}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {ready.length > 0 && (
        <div className="rounded-xl px-4 py-3 mb-6 text-[13px]" style={{ background: C.tint(C.success, "18"), color: C.text }}>
          <div className="font-semibold mb-1" style={{ color: C.successText }}>
            {ready.length} {ready.length > 1 ? "calendars" : "calendar"}: 5 or more students confirmed the dates — waiting for your approval
          </div>
          <div className="flex flex-wrap gap-2">
            {ready.map((r) => (
              <button key={`${r.slug}|${r.period}`} onClick={() => setOpenSlug(r.slug)} className="rounded-lg px-2.5 py-1 text-[12px]" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text, cursor: "pointer" }}>
                <span dir="auto">{UNIVERSITIES.find((u) => u.slug === r.slug)?.name ?? r.slug}</span> · {TERM_LABEL[r.period.split("|")[1] as Term]} · {r.agree}
              </button>
            ))}
          </div>
        </div>
      )}
      {suggestedUnis.size > 0 && (
        <p className="text-[12px] mb-6" style={{ color: C.textDim }}>
          {suggestedUnis.size} {suggestedUnis.size > 1 ? "universities have" : "university has"} a suggested calendar (unofficial source). Students see it as a suggestion and confirm their dates mid-term; once 5 agree it waits here for your approval.
        </p>
      )}

      {/* Waiting for approval */}
      <h3 className="text-[14px] font-semibold mb-1" style={{ color: C.text }}>Waiting for your approval</h3>
      <p className="text-[12px] mb-3" style={{ color: C.textDim }}>
        Open the source, check each value against it, then approve. Until then students see these dates as a suggestion and confirm them mid-term.
      </p>
      <div className="rounded-xl border mb-8" style={{ borderColor: C.border, background: C.panel }}>
        {reviewGroups.length === 0 ? (
          <p className="p-6 text-center text-[13px]" style={{ color: C.textFaint }}>Nothing waiting.</p>
        ) : (
          reviewGroups.map(([slug, rows], gi) => {
            const uni = UNIVERSITIES.find((u) => u.slug === slug);
            const srcs = [...new Map(rows.flatMap((r) => r.sources).map((s) => [s.url, s])).values()];
            return (
              <div key={slug} className="px-5 py-4" style={{ borderBottom: gi === reviewGroups.length - 1 ? "none" : `1px solid ${C.border}` }}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span dir="auto" className="text-[14px] font-semibold" style={{ color: C.text }}>{uni?.name ?? slug}</span>
                    {talliesOf(slug).map((t) => (
                      <span key={t.period} className="text-[11px]" style={{ color: t.review ? C.danger : t.ready ? C.successText : C.textDim }}>
                        {TERM_LABEL[t.period.split("|")[1] as Term]}: {t.agree} students agree, {t.differ} different
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => void decide(rows.map((r) => r.id), "rejected")} className="rounded-lg px-3 py-1.5 text-[12px]" style={btn()}>Reject all</button>
                    <button onClick={() => void decide(rows.map((r) => r.id), "verified")} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={btn(true)}>Approve all</button>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {rows.map((f) => (
                    <div key={f.id} className="flex flex-wrap items-center gap-3 text-[13px]">
                      <span className="w-40 shrink-0" style={{ color: C.textDim }}>{f.academic_year} · {TERM_LABEL[f.term]}</span>
                      <span className="w-28 shrink-0" style={{ color: C.textMuted }}>{keyLabel(f.fact_key)}</span>
                      <span dir="auto" className="flex-1 min-w-0" style={{ color: C.text }}>{describe(f)}</span>
                      <button onClick={() => void decide([f.id], "rejected")} className="text-[11px]" style={{ ...btn(), background: "transparent" }}>Reject</button>
                      <button onClick={() => void decide([f.id], "verified")} className="text-[11px]" style={{ ...btn(), background: "transparent", color: C.primary }}>Approve</button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {srcs.map((s) => (
                    <div key={s.url} className="text-[12px]" style={{ color: C.textDim }}>
                      Source:{" "}
                      {s.url.startsWith("http") ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: C.primary }}>{s.title || s.url}</a>
                      ) : (
                        s.title || s.url
                      )}
                    </div>
                  ))}
                  {rows[0].note && <div className="text-[12px]" style={{ color: C.warningText }}>{rows[0].note}</div>}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Links waiting to be read */}
      {links.length > 0 && (
        <>
          <h3 className="text-[14px] font-semibold mb-1" style={{ color: C.text }}>Links waiting to be read</h3>
          <p className="text-[12px] mb-3" style={{ color: C.textDim }}>
            Open a session with Claude and say &ldquo;جهّز روابط التقويم&rdquo;. Each calendar is read and its dates appear under &ldquo;Waiting for your approval&rdquo;.
          </p>
          <div className="rounded-xl border mb-8" style={{ borderColor: C.border, background: C.panel }}>
            {links.map((l, i) => {
              const uni = UNIVERSITIES.find((u) => u.slug === l.university_slug);
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]" style={{ borderBottom: i === links.length - 1 ? "none" : `1px solid ${C.border}` }}>
                  <span dir="auto" className="w-48 shrink-0 font-medium" style={{ color: C.text }}>{uni?.name ?? l.university_slug}</span>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" dir="auto" className="flex-1 min-w-0 truncate" style={{ color: C.primary }}>{l.title || l.url}</a>
                  <span className="text-[11px]" style={{ color: l.status === "failed" ? C.warningText : C.textDim }}>
                    {l.status === "failed" ? `Couldn't read${l.note ? `: ${l.note}` : ""}` : `Waiting · ${new Date(l.created_at).toLocaleDateString()}`}
                  </span>
                  <button onClick={() => void removeLink(l.id)} className="text-[11px]" style={{ ...btn(), background: "transparent" }}>Delete</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Universities */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h3 className="text-[14px] font-semibold flex-1" style={{ color: C.text }}>Universities & colleges</h3>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="rounded-lg px-3 py-1.5 text-[13px]"
          style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text, width: 200 }}
        />
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value as typeof sector)}
          className="rounded-lg px-3 py-1.5 text-[13px]"
          style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}
        >
          <option value="all">All</option>
          <option value="public">Public (حكومية)</option>
          <option value="private">Private (أهلية)</option>
        </select>
      </div>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border, background: C.panel }}>
        {list.map((u, i) => {
          const rows = (bySlug.get(u.slug) ?? []).filter((f) => f.status !== "rejected").sort(sortFacts);
          const ok = hasCalendar(u.slug);
          const pending = rows.filter((f) => f.status === "review").length;
          const linkWaiting = links.some((l) => l.university_slug === u.slug && l.status === "pending");
          const suggested = rows.some((f) => f.status === "suggested");
          const tallies = talliesOf(u.slug);
          const needsReview = tallies.some((t) => t.review);
          const open = openSlug === u.slug;
          return (
            <div key={u.slug} style={{ borderBottom: i === list.length - 1 ? "none" : `1px solid ${C.border}` }}>
              <button
                onClick={() => setOpenSlug(open ? null : u.slug)}
                className="admin-hover-row w-full text-start flex items-center gap-3 px-5 py-3"
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ok ? C.success : pending || linkWaiting || suggested ? C.warning : C.danger }} />
                <div className="min-w-0 flex-1">
                  <div dir="auto" className="text-[13px] font-medium truncate" style={{ color: C.text }}>{u.name}</div>
                  <div className="text-[11px]" style={{ color: C.textDim }}>
                    {u.nameEn} · {u.sector === "private" ? "Private" : "Public"}{u.kind === "college" ? " college" : ""} ·{" "}
                    {ok ? "Approved calendar" : pending ? `${pending} waiting for approval` : suggested ? "Suggested (unofficial) — students confirm mid-term" : linkWaiting ? "Link waiting to be read" : "Missing"}
                    {tallies.map((t) => ` · ${TERM_LABEL[t.period.split("|")[1] as Term]}: ${t.agree} agree, ${t.differ} different`).join("")}
                  </div>
                </div>
                {tallies.some((t) => t.ready) && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0" style={{ background: C.tint(C.success, "22"), color: C.successText }}>Ready to approve</span>}
                {needsReview && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0" style={{ background: C.tint(C.danger, "22"), color: C.danger }}>Review</span>}
                <span className="text-[12px] shrink-0" style={{ color: C.textFaint }}>{open ? "▾" : "▸"}</span>
              </button>
              {open && (
                <div className="px-5 pb-5">
                  {rows.length > 0 && (
                    <div className="mb-4 flex flex-col gap-1">
                      {rows.map((f) => (
                        <div key={f.id} className="flex flex-wrap items-center gap-3 text-[13px]">
                          <span className="w-40 shrink-0" style={{ color: C.textDim }}>{f.academic_year} · {TERM_LABEL[f.term]}</span>
                          <span className="w-28 shrink-0" style={{ color: C.textMuted }}>{keyLabel(f.fact_key)}</span>
                          <span dir="auto" className="flex-1 min-w-0" style={{ color: C.text }}>{describe(f)}</span>
                          <span className="text-[11px]" style={{ color: f.status === "verified" ? C.successText : C.warningText }}>
                            {f.status === "verified" ? (f.verified_via === "crowd" ? "approved by students" : "approved") : f.status === "suggested" ? "suggested" : "waiting"}
                          </span>
                          <button onClick={() => void remove(f.id)} className="text-[11px]" style={{ ...btn(), background: "transparent" }}>Delete</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {tallies.map((t) => (
                    <div key={t.period} className="mb-4 text-[12px]" style={{ color: C.textMuted }}>
                      <div className="flex flex-wrap items-center gap-3 mb-1">
                        <span className="font-semibold" style={{ color: t.review ? C.danger : t.ready ? C.successText : C.text }}>
                          Students — {t.period.replace("|", " · ")}: {t.agree} agree, {t.differ} different
                        </span>
                        {t.ready && (
                          <button onClick={() => void approveTerm(u.slug, t.period)} className="rounded-lg px-3 py-1 text-[12px] font-semibold" style={btn(true)}>
                            Approve this term
                          </button>
                        )}
                      </div>
                      {t.answers.map((a) => (
                        <div key={`${a.start}|${a.finals}`}>
                          classes start {a.start || "—"} · finals start {a.finals || "—"} · {a.n} student{a.n > 1 ? "s" : ""}
                        </div>
                      ))}
                    </div>
                  ))}
                  <EntryForm slug={u.slug} year={year} onSaved={load} onError={setError} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface HolidayDraft { name: string; start: string; end: string }

/** Enter one term of a university's official calendar by hand. Saved values are
 *  approved straight away (the admin IS the reviewer) and replace any earlier
 *  value for the same fact. */
function EntryForm({ slug, year, onSaved, onError }: { slug: string; year: string; onSaved: () => void; onError: (m: string) => void }) {
  const C = useC();
  const [yr, setYr] = useState(year);
  const [term, setTerm] = useState<Term>("first");
  const [dates, setDates] = useState({ term_start: "", term_end: "", finals_start: "", finals_end: "" });
  const [pct, setPct] = useState("");
  const [holidays, setHolidays] = useState<HolidayDraft[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const input: React.CSSProperties = { background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "6px 10px", fontSize: 13 };
  const lab = (t: string) => <span className="block text-[11px] mb-1" style={{ color: C.textDim }}>{t}</span>;

  const save = async () => {
    setMsg("");
    if (!/^https?:\/\//.test(url.trim())) return setMsg("Add the official source link (https://…).");
    if (!/^\d{4}-\d{4}$/.test(yr)) return setMsg("Academic year looks like 2026-2027.");
    const now = new Date().toISOString();
    const { data: auth } = await supabase.auth.getUser();
    const source = [{ url: url.trim(), title: title.trim() || undefined }];
    const base = { university_slug: slug, academic_year: yr, term, status: "verified", verified_via: "admin", sources: source, note: null, updated_at: now, reviewed_by: auth.user?.id ?? null, reviewed_at: now };
    const rows: Record<string, unknown>[] = [];
    for (const [k, v] of Object.entries(dates)) if (v) rows.push({ ...base, fact_key: k, value: { date: v } });
    if (pct) {
      const n = Number(pct);
      if (!(n > 0 && n <= 100)) return setMsg("حرمان limit must be between 1 and 100.");
      rows.push({ ...base, fact_key: "denial_pct", value: { pct: n } });
    }
    for (const h of holidays) {
      if (!h.name.trim() && !h.start && !h.end) continue;
      if (!h.name.trim() || !h.start || !h.end || h.end < h.start) return setMsg("Each break needs a name, a start and an end (end on or after start).");
      rows.push({ ...base, fact_key: `holiday:${h.start}`, value: { name_ar: h.name.trim(), name_en: h.name.trim(), start: h.start, end: h.end } });
    }
    if (!rows.length) return setMsg("Nothing to save yet.");
    setSaving(true);
    const { error } = await supabase.from("university_facts").upsert(rows, { onConflict: "university_slug,academic_year,term,fact_key" });
    setSaving(false);
    if (error) return onError(error.message);
    setDates({ term_start: "", term_end: "", finals_start: "", finals_end: "" });
    setPct("");
    setHolidays([]);
    setMsg(`Saved ${rows.length} facts.`);
    onSaved();
  };

  /** Hand the link over instead of typing the dates: it waits in "Links
   *  waiting to be read" until it's read, then its dates come back for approval. */
  const prepare = async () => {
    setMsg("");
    if (!/^https?:\/\//.test(url.trim())) return setMsg("Paste the official calendar link (https://…) first.");
    setSaving(true);
    const { error } = await supabase
      .from("university_fact_requests")
      .insert({ university_slug: slug, url: url.trim(), title: title.trim() || null });
    setSaving(false);
    if (error) return onError(error.message);
    setUrl("");
    setTitle("");
    setMsg("Link saved. Its dates will appear under “Waiting for your approval” once it's read.");
    onSaved();
  };

  return (
    <div className="rounded-lg p-4" style={{ background: C.panel2 ?? C.panel, border: `1px solid ${C.border}` }}>
      <div className="text-[12px] font-semibold mb-3" style={{ color: C.text }}>Enter from the official calendar</div>
      <div className="flex flex-wrap gap-3 mb-3">
        <label>{lab("Academic year")}<input value={yr} onChange={(e) => setYr(e.target.value)} style={{ ...input, width: 110 }} /></label>
        <label>{lab("Term")}
          <select value={term} onChange={(e) => setTerm(e.target.value as Term)} style={input}>
            <option value="first">First term</option>
            <option value="second">Second term</option>
            <option value="summer">Summer</option>
          </select>
        </label>
        {(Object.keys(dates) as (keyof typeof dates)[]).map((k) => (
          <label key={k}>{lab(keyLabel(k))}<input type="date" value={dates[k]} onChange={(e) => setDates({ ...dates, [k]: e.target.value })} style={input} /></label>
        ))}
        <label>{lab("حرمان limit %")}<input type="number" min={1} max={100} value={pct} onChange={(e) => setPct(e.target.value)} style={{ ...input, width: 80 }} /></label>
      </div>
      <div className="mb-3">
        {lab("Breaks inside this term")}
        {holidays.map((h, i) => (
          <div key={i} className="flex flex-wrap gap-2 mb-2">
            <input dir="auto" placeholder="Name (e.g. إجازة اليوم الوطني)" value={h.name} onChange={(e) => setHolidays(holidays.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} style={{ ...input, width: 240 }} />
            <input type="date" value={h.start} onChange={(e) => setHolidays(holidays.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} style={input} />
            <input type="date" value={h.end} onChange={(e) => setHolidays(holidays.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} style={input} />
            <button onClick={() => setHolidays(holidays.filter((_, j) => j !== i))} className="text-[12px]" style={{ background: "transparent", border: "none", color: C.textMuted, cursor: "pointer" }}>✕</button>
          </div>
        ))}
        <button onClick={() => setHolidays([...holidays, { name: "", start: "", end: "" }])} className="rounded-lg px-3 py-1 text-[12px]" style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}>+ Add break</button>
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[240px]">{lab("Official source link (required)")}<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" style={{ ...input, width: "100%" }} /></label>
        <label className="flex-1 min-w-[200px]">{lab("Source title")}<input dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="التقويم الأكاديمي 1448هـ" style={{ ...input, width: "100%" }} /></label>
        <button onClick={() => void prepare()} disabled={saving} title="Fill the dates from this link for you to approve" className="rounded-lg px-4 py-2 text-[12px] font-semibold" style={{ background: C.border, color: C.text, border: "none", cursor: "pointer", opacity: saving ? 0.5 : 1 }}>
          Prepare from this link
        </button>
        <button onClick={() => void save()} disabled={saving} className="rounded-lg px-4 py-2 text-[12px] font-semibold" style={{ background: C.primary, color: "#fff", border: "none", cursor: "pointer", opacity: saving ? 0.5 : 1 }}>
          {saving ? "Saving…" : "Save & approve"}
        </button>
      </div>
      <p className="text-[11px] mt-2" style={{ color: C.textFaint }}>
        Only have the link? Paste it and press &ldquo;Prepare from this link&rdquo; — the dates are read from it and come back for your approval.
      </p>
      {msg && <p className="text-[12px] mt-2" style={{ color: C.textMuted }}>{msg}</p>}
    </div>
  );
}
