"use client";

// Holidays outside Saudi — what students at universities outside Saudi Arabia
// told us about their holidays (lib/holidayReports), and the calendars
// published from here (public.university_calendars).
//   • Universities: every non-Saudi university students typed, most students
//     first — the research queue. Each shows whose holidays its students get
//     (the university's own calendar, its country's, or none we hold), how many
//     confirmed them as they are or changed them, and what they removed/added.
//     5 confirming with fewer than 3 changing flags it; nothing approves itself.
//   • Publish as suggestion: turns a university's reports into its calendar,
//     line by line, so its students get it without an app update — still as a
//     suggestion they confirm.
//   • Published calendars: approve, send back, or withdraw.
//   • Term dates: a university whose official term dates are in the app
//     (lib/universityTerms) gets them on its students' semester automatically;
//     each student confirms or corrects them (crowd_votes). 3 differing flags
//     the term so its calendar is checked again.
// Reads/writes go through admin_holiday_reports(), the admin-only table, and
// crowd_votes (admins read every row).

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, useC, useS, StatCard, SectionHeader, Loading, ErrorBanner, fmtDate } from "./_lib";
import { useDrill, type DrillUser } from "./_drill";
import { COUNTRY_NAMES, registerPublishedCalendar } from "@/lib/countryHolidays";
import { calendarFromRow, type CalendarRow } from "@/lib/publishedCalendars";
import {
  calendarKeyFromName,
  draftCalendar,
  groupHolidayReports,
  isChanged,
  termTallies,
  type DraftHoliday,
  type HolidayReportRow,
  type TermVote,
  type UniversityGroup,
} from "@/lib/holidayReports";
import { OFFICIAL_TERMS } from "@/lib/universityTerms";

interface PublishedRow extends CalendarRow {
  names: string[];
  note: string | null;
  updated_at: string;
  reviewed_at: string | null;
}

const ACADEMIC_YEAR = "2026-2027";
const KEY_RE = /^[a-z0-9][a-z0-9-]{2,59}$/;

const KIND_LABEL: Record<UniversityGroup["kind"], string> = {
  university: "Its own calendar (in the app)",
  published: "Its own calendar (published here)",
  country: "Its country's holidays",
  none: "No calendar — adds their own",
};

const countryName = (code: string | null) => (code ? COUNTRY_NAMES[code]?.ar ?? code : "Unplaced (gets the Saudi holidays)");
const range = (a: string, b: string) => (a === b ? a : `${a} → ${b}`);

export function HolidayCalendarsSection() {
  const C = useC();
  const S = useS();
  const drill = useDrill();
  const [rows, setRows] = useState<HolidayReportRow[] | null>(null);
  const [published, setPublished] = useState<PublishedRow[]>([]);
  const [termVotes, setTermVotes] = useState<TermVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [cal, rep, votes] = await Promise.all([
      supabase.from("university_calendars").select("*").order("updated_at", { ascending: false }),
      supabase.rpc("admin_holiday_reports"),
      supabase
        .from("crowd_votes")
        .select("university_slug, period, answer")
        .eq("subject", "calendar")
        .in("university_slug", Object.keys(OFFICIAL_TERMS)),
    ]);
    // The term answers are extra: if they can't be read, the page still works.
    setTermVotes(votes.error ? [] : ((votes.data ?? []) as TermVote[]));
    const e = cal.error ?? rep.error;
    if (e) {
      setError(
        /function|schema cache|relation|does not exist/i.test(e.message)
          ? `${e.message} — the holiday calendars migration (20261004_university_calendars.sql) isn't in the database yet.`
          : e.message
      );
    } else {
      const list = (cal.data ?? []) as PublishedRow[];
      // Register them first, so each student's holidays are worked out the way
      // their app does.
      for (const r of list) registerPublishedCalendar(r.key, calendarFromRow(r));
      setPublished(list);
      setRows((rep.data ?? []) as HolidayReportRow[]);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => groupHolidayReports(rows ?? []), [rows]);
  const byKey = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups]);

  const students = (title: string, list: UniversityGroup["students"]) => {
    const users: DrillUser[] = list.map((s) => ({
      user_id: s.row.user_id,
      email: s.row.email,
      last_active_at: s.row.last_active_at,
      detail: s.confirmed ? (isChanged(s) ? "Confirmed after changing it" : "Confirmed as it is") : isChanged(s) ? "Changed it, not confirmed" : "Not confirmed",
      badge: null,
    }));
    drill({ title, users });
  };

  const setStatus = async (key: string, status: "verified" | "suggested" | "rejected") => {
    const { data: auth } = await supabase.auth.getUser();
    const { error: e } = await supabase
      .from("university_calendars")
      .update({ status, updated_at: new Date().toISOString(), reviewed_at: new Date().toISOString(), reviewed_by: auth.user?.id ?? null })
      .eq("key", key);
    if (e) setError(e.message);
    else void load();
  };

  const chip = (label: string, color: string) => (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap" style={{ background: C.tint(color, "22"), color }}>
      {label}
    </span>
  );

  if (loading && !rows) return <Loading text="Loading holiday reports…" />;

  const total = groups.reduce((n, g) => n + g.students.length, 0);
  const own = groups.filter((g) => g.kind === "university" || g.kind === "published").length;

  return (
    <div>
      <SectionHeader
        title="Holidays outside Saudi"
        action={
          <button onClick={() => void load()} style={S.btnSec}>
            {loading ? "…" : "↻ Refresh"}
          </button>
        }
      />
      {error && <ErrorBanner message={error} onRetry={load} />}

      {rows && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label="Students outside Saudi" value={total} />
            <StatCard label="Universities" value={groups.length} />
            <StatCard label="With their own calendar" value={own} />
            <StatCard label="Ready for approval" value={groups.filter((g) => g.flag === "ready").length} accent={C.success} />
            <StatCard label="Students disagree" value={groups.filter((g) => g.flag === "disputed").length} accent={C.warning} />
          </div>

          <p className="text-[12px] leading-relaxed" style={{ color: C.textDim }}>
            Every calendar reaches students as a suggestion. A student reviews it in Settings → Holidays (removing or adding) and confirms.
            5 confirming it unchanged, with fewer than 3 changing it, flags it here; you approve by hand. A university with no calendar of its
            own gets its country&apos;s holidays — the list below is the research queue, most students first.
          </p>

          {/* ── Published calendars ─────────────────────────────────────── */}
          <div>
            <h3 className="text-[13px] font-semibold mb-2" style={{ color: C.text }}>Published calendars</h3>
            <div className="rounded-xl border overflow-x-auto" style={{ borderColor: C.border, background: C.panel }}>
              {published.length === 0 ? (
                <p className="p-6 text-center text-[13px]" style={{ color: C.textFaint }}>
                  Nothing published yet. Calendars read from official sources live in the app (lib/countryHolidays).
                </p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr>
                      {["University", "Country", "Source", "Holidays", "Students", "Status", ""].map((h) => (
                        <th key={h} style={S.tableHead}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {published.map((p) => {
                      const g = byKey.get(p.key);
                      const n = Array.isArray(p.holidays) ? p.holidays.length : 0;
                      return (
                        <tr key={p.key}>
                          <td style={S.tableCell}>
                            <div>{p.name_ar}</div>
                            <div className="text-[11px]" style={{ color: C.textDim }}>{p.name_en} · {p.key}</div>
                          </td>
                          <td style={S.tableCell}>{countryName(p.country)}</td>
                          <td style={S.tableCell}>{p.source === "official" ? "Official calendar" : "Its students"}</td>
                          <td style={S.tableCell}>{n}</td>
                          <td style={S.tableCell}>
                            {g ? `${g.agree} confirmed · ${g.differ} changed · ${g.students.length} total` : "—"}
                          </td>
                          <td style={S.tableCell}>
                            {p.status === "verified"
                              ? chip("Approved", C.success)
                              : p.status === "rejected"
                                ? chip("Withdrawn", C.danger)
                                : chip("Suggestion", C.warning)}
                            <div className="text-[11px] mt-1" style={{ color: C.textDim }}>{fmtDate(p.reviewed_at ?? p.updated_at)}</div>
                          </td>
                          <td style={S.tableCell}>
                            <div className="flex gap-1.5 justify-end flex-wrap">
                              {p.status !== "verified" && (
                                <button style={{ ...S.btnGhost, color: C.success }} onClick={() => void setStatus(p.key, "verified")}>Approve</button>
                              )}
                              {p.status !== "suggested" && (
                                <button style={S.btnGhost} onClick={() => void setStatus(p.key, "suggested")}>Back to suggestion</button>
                              )}
                              {p.status !== "rejected" && (
                                <button style={{ ...S.btnGhost, color: C.danger }} onClick={() => void setStatus(p.key, "rejected")}>Withdraw</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Universities ───────────────────────────────────────────── */}
          <div>
            <h3 className="text-[13px] font-semibold mb-2" style={{ color: C.text }}>Universities</h3>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border, background: C.panel }}>
              {groups.length === 0 ? (
                <p className="p-6 text-center text-[13px]" style={{ color: C.textFaint }}>
                  No student at a university outside Saudi Arabia yet.
                </p>
              ) : (
                groups.map((g, i) => {
                  const expanded = open === g.key;
                  return (
                    <div key={g.key} style={{ borderTop: i ? `1px solid ${C.border}` : undefined }}>
                      <button
                        onClick={() => setOpen(expanded ? null : g.key)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-start flex-wrap"
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: C.text }}
                      >
                        <span className="text-[13px] font-semibold flex-1 min-w-[180px]">{g.label}</span>
                        <span className="text-[12px]" style={{ color: C.textDim }}>{countryName(g.country)}</span>
                        {chip(KIND_LABEL[g.kind], g.kind === "none" ? C.danger : g.kind === "country" ? C.indigo : C.primary)}
                        <span className="text-[12px] tabular-nums" style={{ color: C.textMuted }}>
                          {g.students.length} students · {g.agree} confirmed · {g.differ} changed
                        </span>
                        {g.flag === "ready" && chip("Ready for approval", C.success)}
                        {g.flag === "disputed" && chip("Students disagree", C.warning)}
                        {g.kind === "university" &&
                          termTallies(g.calendar, termVotes).some((t) => t.disputed) &&
                          chip("Term dates disputed", C.warning)}
                        <span style={{ color: C.textDim }}>{expanded ? "▾" : "▸"}</span>
                      </button>
                      {expanded && (
                        <GroupDetail group={g} termVotes={termVotes} onStudents={() => students(g.label, g.students)} onSaved={load} />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupDetail({
  group: g,
  termVotes,
  onStudents,
  onSaved,
}: {
  group: UniversityGroup;
  termVotes: TermVote[];
  onStudents: () => void;
  onSaved: () => void;
}) {
  const C = useC();
  const S = useS();
  const [publishing, setPublishing] = useState(false);
  const terms = g.kind === "university" ? OFFICIAL_TERMS[g.calendar] ?? [] : [];
  const tallies = g.kind === "university" ? termTallies(g.calendar, termVotes) : [];

  return (
    <div className="px-4 pb-4 flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap text-[12px]" style={{ color: C.textDim }}>
        <span>Typed as: {g.names.join(" · ") || "—"}</span>
        {g.catalogSlug && <span>· catalogue: {g.catalogSlug}</span>}
        <button style={S.btnGhost} onClick={onStudents}>View students</button>
      </div>

      {terms.length > 0 && (
        <div>
          <div style={S.label}>Term dates (official, applied automatically)</div>
          {terms.map((term) => {
            const tally = tallies.find((x) => x.term === term);
            return (
              <div key={term.term} className="text-[13px] py-1" style={{ color: C.text }}>
                {term.term === "first" ? "First term" : "Second term"}: {term.start} · finals {term.finalsStart} · ends {term.end}
                <span style={{ color: C.textDim }}>
                  {" "}— {tally ? `${tally.agree} confirmed · ${tally.differ} changed${tally.keptOwn ? ` (${tally.keptOwn} kept their own)` : ""}` : "no answers yet"}
                </span>
                {tally?.answers.map((a) => (
                  <div key={`${a.start}|${a.finals}|${a.end}`} className="text-[12px] ps-4" style={{ color: tally.disputed ? C.warning : C.textDim }}>
                    Gave {a.start || "—"} · finals {a.finals || "—"} · ends {a.end || "—"} — {a.n}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div style={S.label}>Removed from the suggestion</div>
          {g.removed.length === 0 ? (
            <p className="text-[12px]" style={{ color: C.textFaint }}>Nothing.</p>
          ) : (
            g.removed.map((r) => (
              <div key={r.holiday.id} className="text-[13px] py-1" style={{ color: C.text }}>
                {r.holiday.nameAr} <span style={{ color: C.textDim }}>({range(r.holiday.start, r.holiday.end)})</span> — {r.count}
              </div>
            ))
          )}
        </div>
        <div>
          <div style={S.label}>Added by students</div>
          {g.added.length === 0 ? (
            <p className="text-[12px]" style={{ color: C.textFaint }}>Nothing.</p>
          ) : (
            g.added.map((a) => (
              <div key={`${a.start}|${a.end}`} className="text-[13px] py-1" style={{ color: C.text }}>
                {a.names.join(" / ") || "(no name)"} <span style={{ color: C.textDim }}>({range(a.start, a.end)})</span> — {a.count}
              </div>
            ))
          )}
        </div>
      </div>

      {g.kind !== "university" &&
        (publishing ? (
          <PublishForm group={g} onDone={() => { setPublishing(false); onSaved(); }} onCancel={() => setPublishing(false)} />
        ) : (
          <div>
            <button style={S.btnSec} onClick={() => setPublishing(true)}>
              {g.kind === "published" ? "Update the published calendar" : "Publish as suggestion"}
            </button>
          </div>
        ))}
    </div>
  );
}

function PublishForm({ group: g, onDone, onCancel }: { group: UniversityGroup; onDone: () => void; onCancel: () => void }) {
  const C = useC();
  const S = useS();
  const [nameAr, setNameAr] = useState(g.label);
  const [nameEn, setNameEn] = useState("");
  const [key, setKey] = useState(g.kind === "published" ? g.calendar : g.catalogSlug ?? "");
  const [country, setCountry] = useState(g.country ?? "");
  const [lines, setLines] = useState<DraftHoliday[]>(() => draftCalendar(g));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const edit = (i: number, patch: Partial<DraftHoliday>) => setLines((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    const k = key.trim();
    const chosen = lines.filter((l) => l.include);
    if (!KEY_RE.test(k)) return setErr("Key: lowercase letters, digits and dashes (3–60), e.g. the university's English name.");
    if (!/^[A-Z]{2}$/.test(country) || country === "SA") return setErr("Country: a two-letter code other than SA (e.g. AE).");
    if (!nameAr.trim() || !nameEn.trim()) return setErr("Both names are needed.");
    if (!chosen.length) return setErr("Pick at least one holiday.");
    if (chosen.some((l) => !l.nameAr.trim() || !l.nameEn.trim())) return setErr("Every chosen holiday needs an Arabic and an English name.");
    setSaving(true);
    setErr("");
    const { error } = await supabase.from("university_calendars").upsert(
      {
        key: k,
        names: g.names,
        country,
        name_ar: nameAr.trim(),
        name_en: nameEn.trim(),
        academic_year: ACADEMIC_YEAR,
        holidays: chosen.map((l) => ({
          name_ar: l.nameAr.trim(),
          name_en: l.nameEn.trim(),
          start: l.start,
          end: l.end,
          ...(l.estimated ? { estimated: true } : {}),
        })),
        status: "suggested",
        source: "students",
        note: `From ${g.students.length} students' reports (${g.agree} confirmed as it was, ${g.differ} changed it).`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    setSaving(false);
    if (error) setErr(error.message);
    else onDone();
  };

  const input = { ...S.input, padding: "6px 10px", fontSize: 13 };

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ borderColor: C.border2 }}>
      <div className="grid md:grid-cols-4 gap-3">
        <label><span style={S.label}>Name (Arabic)</span><input style={input} value={nameAr} onChange={(e) => setNameAr(e.target.value)} /></label>
        <label>
          <span style={S.label}>Name (English)</span>
          <input
            style={input}
            value={nameEn}
            onChange={(e) => {
              setNameEn(e.target.value);
              if (!g.catalogSlug && g.kind !== "published") setKey(calendarKeyFromName(e.target.value));
            }}
          />
        </label>
        <label><span style={S.label}>Key</span><input style={input} dir="ltr" value={key} onChange={(e) => setKey(e.target.value)} /></label>
        <label><span style={S.label}>Country</span><input style={input} dir="ltr" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} /></label>
      </div>

      <div className="text-[12px]" style={{ color: C.textDim }}>
        Ticked lines become its calendar for {ACADEMIC_YEAR}, replacing its country&apos;s list. Suggested holidays most of its changing
        students removed start unticked; ones 2+ students added start ticked. Students see it as a suggestion.
      </div>

      <div className="flex flex-col gap-1.5">
        {lines.map((l, i) => (
          <div key={`${l.from}-${l.start}-${l.end}-${i}`} className="flex items-center gap-2 flex-wrap">
            <input type="checkbox" checked={l.include} onChange={(e) => edit(i, { include: e.target.checked })} />
            <span className="text-[12px] tabular-nums w-[190px]" dir="ltr" style={{ color: C.textMuted }}>{range(l.start, l.end)}</span>
            <input style={{ ...input, width: 200 }} value={l.nameAr} placeholder="Arabic name" onChange={(e) => edit(i, { nameAr: e.target.value })} />
            <input style={{ ...input, width: 200 }} dir="ltr" value={l.nameEn} placeholder="English name" onChange={(e) => edit(i, { nameEn: e.target.value })} />
            <span className="text-[11px]" style={{ color: C.textDim }}>
              {l.from === "calendar" ? `suggested now${l.count ? ` · removed by ${l.count}` : ""}` : `added by ${l.count}`}
            </span>
          </div>
        ))}
      </div>

      {err && <p className="text-[12px]" style={{ color: C.danger }}>{err}</p>}
      <div className="flex gap-2">
        <button style={S.btnPrimary} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Publish as suggestion"}</button>
        <button style={S.btnSec} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
