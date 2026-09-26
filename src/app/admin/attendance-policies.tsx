"use client";

// Attendance policies — each university's OFFICIAL حرمان rule, for the admin to
// check against its source before any student sees it.
//   • Waiting for your approval: rules researched from official regulations
//     (status `review`), each with the quoted text and a link to the source,
//     and a box for another official link or photos of the regulation
//     (attendance_policy_requests + the private policy-sources bucket). It's
//     read in a working session with Claude (free, no API), who updates the
//     rule from it with the quoted text.
//   • Student reports: what students told us about their university's rule.
//     A student's own answer already applies to that student; it becomes the
//     university's rule only when accepted here WITH an official regulation link.
//   • Universities: every university in the app, plus references from other
//     Arab countries, with its rule or "missing", and a form to add or correct one.
// Reads/writes go straight to the tables under the is_admin_current() policies.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, useC, StatCard, SectionHeader, Loading, ErrorBanner } from "./_lib";
import { UNIVERSITIES } from "@/lib/tools/universities";
import {
  describePolicyAr,
  isStudentAlternative,
  policyFlags,
  type AttendancePolicy,
  policyRuleKey,
  type PolicyMethod,
  type PolicyReport,
  type PolicySource,
} from "@/lib/attendancePolicy";
import { UniversityFactsSection, calendarTallies, type CalendarVote, type FactRow } from "./university-facts";
import { HolidayCalendarsSection } from "./holiday-calendars";
import { TermDatesSection } from "./term-dates";

const COUNTRY: Record<string, string> = {
  SA: "السعودية", AE: "الإمارات", QA: "قطر", KW: "الكويت", BH: "البحرين", OM: "عُمان",
  JO: "الأردن", EG: "مصر", LB: "لبنان", IQ: "العراق", PS: "فلسطين", SD: "السودان",
  LY: "ليبيا", SY: "سوريا", DZ: "الجزائر", MA: "المغرب", TN: "تونس", YE: "اليمن",
};

const uniName = (slug: string, fallback?: string | null) =>
  UNIVERSITIES.find((u) => u.slug === slug)?.name ?? fallback ?? slug;

/** University facts page with its four parts: official calendars, holidays outside Saudi, term dates students set and attendance rules. */
export function UniversityFactsTabs() {
  const C = useC();
  const [tab, setTab] = useState<"calendars" | "abroad" | "terms" | "attendance">(() => {
    try {
      const saved = sessionStorage.getItem("haven_admin_facts_tab");
      return saved === "attendance" || saved === "abroad" || saved === "terms" ? saved : "calendars";
    } catch {
      return "calendars";
    }
  });
  const pick = (t: typeof tab) => {
    setTab(t);
    try { sessionStorage.setItem("haven_admin_facts_tab", t); } catch { /* ignore */ }
  };
  const tabBtn = (t: typeof tab, label: string) => (
    <button
      onClick={() => pick(t)}
      className="rounded-lg px-4 py-2 text-[13px] font-semibold"
      style={{ background: tab === t ? C.primary : C.border, color: tab === t ? "#fff" : C.textMuted, border: "none", cursor: "pointer" }}
    >
      {label}
    </button>
  );
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {tabBtn("calendars", "Official calendars")}
        {tabBtn("abroad", "Holidays outside Saudi")}
        {tabBtn("terms", "Term dates students set")}
        {tabBtn("attendance", "Attendance policies (حرمان)")}
      </div>
      {tab === "calendars" ? (
        <UniversityFactsSection />
      ) : tab === "abroad" ? (
        <HolidayCalendarsSection />
      ) : tab === "terms" ? (
        <TermDatesSection />
      ) : (
        <AttendancePoliciesSection />
      )}
    </div>
  );
}

export function AttendancePoliciesSection() {
  const C = useC();
  const [policies, setPolicies] = useState<AttendancePolicy[] | null>(null);
  const [reports, setReports] = useState<PolicyReport[]>([]);
  const [links, setLinks] = useState<PolicyLinkRequest[]>([]);
  const [votes, setVotes] = useState<CrowdVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"review" | "verified" | "rejected">("review");
  const [region, setRegion] = useState<"all" | "sa" | "arab">("all");
  const [query, setQuery] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [p, r, l, v] = await Promise.all([
      supabase.from("attendance_policies").select("*").order("university_slug"),
      supabase.from("attendance_policy_reports").select("*").order("created_at", { ascending: false }),
      supabase.from("attendance_policy_requests").select("*").neq("status", "done").order("created_at", { ascending: true }),
      supabase.from("crowd_votes").select("university_slug, agrees, answer").eq("subject", "attendance"),
    ]);
    if (p.error) setError(p.error.message);
    else setPolicies(p.data as AttendancePolicy[]);
    setReports(r.error ? [] : (r.data as PolicyReport[]));
    // The links list is extra: if its table can't be read, the page still works.
    setLinks(l.error ? [] : (l.data as PolicyLinkRequest[]));
    setVotes(v.error ? [] : (v.data as CrowdVote[]));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const bySlug = useMemo(() => {
    const m = new Map<string, AttendancePolicy[]>();
    for (const p of policies ?? []) m.set(p.university_slug, [...(m.get(p.university_slug) ?? []), p]);
    return m;
  }, [policies]);

  const decide = async (id: string, status: "verified" | "review" | "rejected") => {
    const { data: auth } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const { error: e } = await supabase
      .from("attendance_policies")
      .update({
        status,
        last_verified: status === "verified" ? now : null,
        verified_by: status === "verified" ? auth.user?.id ?? null : null,
        updated_at: now,
      })
      .eq("id", id);
    if (e) setError(e.message);
    else void load();
  };

  const linksOf = (slug: string) => links.filter((l) => l.university_slug === slug);
  const uniPolicy = (slug: string) => mainPolicy(bySlug.get(slug) ?? []);
  const votesOf = (slug: string) => votes.filter((v) => v.university_slug === slug);
  const tallyOf = (slug: string) => tally(votesOf(slug), uniPolicy(slug));
  // The main rule's tally, or — for a rule from students — how many chose it.
  const cardTally = (p: AttendancePolicy, main: Tally | null) =>
    p.scope !== "university" ? null : isStudentAlternative(p) ? tally(votesOf(p.university_slug), p) : main;
  const toReview = [...new Set(votes.map((v) => v.university_slug))].filter((slug) => tallyOf(slug)?.review);

  if (loading && !policies) return <Loading text="Loading attendance policies…" />;

  const all = policies ?? [];
  const inRegion = (p: { country: string }) => region === "all" || (region === "sa" ? p.country === "SA" : p.country !== "SA");
  const q = query.trim().toLowerCase();
  const matches = (p: AttendancePolicy) =>
    !q || p.university_slug.includes(q) || uniName(p.university_slug, p.university_name).includes(query.trim()) ||
    (UNIVERSITIES.find((u) => u.slug === p.university_slug)?.nameEn.toLowerCase().includes(q) ?? false);
  const shown = all.filter((p) => p.status === view && inRegion(p) && matches(p))
    .sort((a, b) => Number(a.country !== "SA") - Number(b.country !== "SA") || uniName(a.university_slug, a.university_name).localeCompare(uniName(b.university_slug, b.university_name), "ar"));

  const approvedSaudi = UNIVERSITIES.filter((u) => (bySlug.get(u.slug) ?? []).some((p) => p.status === "verified" && p.scope === "university")).length;
  const pendingReports = reports.filter((r) => r.status === "pending");
  const count = (s: AttendancePolicy["status"]) => all.filter((p) => p.status === s && inRegion(p)).length;

  const btn = (primary = false): React.CSSProperties => ({
    background: primary ? C.primary : C.border,
    color: primary ? "#fff" : C.textMuted,
    border: "none",
    cursor: "pointer",
  });

  return (
    <div>
      <SectionHeader
        title="Attendance policies"
        action={
          <button onClick={() => void load()} className="rounded-lg px-3 py-1.5 text-[12px]" style={btn()}>
            {loading ? "…" : "↻ Refresh"}
          </button>
        }
      />
      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Approved (app universities)" value={approvedSaudi} sub={`of ${UNIVERSITIES.length} universities & colleges`} />
        <StatCard label="Waiting for approval" value={all.filter((p) => p.status === "review").length} sub="researched from official sources" />
        <StatCard label="Student reports" value={pendingReports.length} sub="waiting for review" />
        <StatCard label="Other Arab countries" value={all.filter((p) => p.country !== "SA").length} sub={`${new Set(all.filter((p) => p.country !== "SA").map((p) => p.country)).size} countries`} />
      </div>

      {toReview.length > 0 && (
        <div className="rounded-xl px-4 py-3 mb-4 text-[13px]" style={{ background: C.tint(C.danger, "18"), color: C.text }}>
          <div className="font-semibold mb-1" style={{ color: C.danger }}>
            {toReview.length} {toReview.length > 1 ? "universities" : "university"}: 3 or more students say the rule is different — review
          </div>
          <div className="flex flex-wrap gap-2">
            {toReview.map((slug) => {
              const tl = tallyOf(slug)!;
              return (
                <button key={slug} onClick={() => setOpenSlug(slug)} className="rounded-lg px-2.5 py-1 text-[12px]" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text, cursor: "pointer" }}>
                  <span dir="auto">{uniName(slug, null)}</span> · {tl.agree} agree · {tl.differ} different
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[12px] mb-4" style={{ color: C.textDim }}>
        Open each source, check the numbers against the quoted text, then approve. Students see approved and waiting rules as a suggestion, and get no percentage until they confirm it. 5 students confirming a rule (with fewer than 3 saying it&apos;s different) approves it automatically; a university with no rule gets the one 5 students gave identically.
      </p>

      {/* Policies by status */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(["review", "verified", "rejected"] as const).map((s) => (
          <button key={s} onClick={() => setView(s)} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={btn(view === s)}>
            {s === "review" ? `Waiting (${count("review")})` : s === "verified" ? `Approved (${count("verified")})` : `Rejected (${count("rejected")})`}
          </button>
        ))}
        <span className="flex-1" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="rounded-lg px-3 py-1.5 text-[13px]" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text, width: 180 }} />
        <select value={region} onChange={(e) => setRegion(e.target.value as typeof region)} className="rounded-lg px-3 py-1.5 text-[13px]" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
          <option value="all">All countries</option>
          <option value="sa">Saudi Arabia</option>
          <option value="arab">Other Arab countries</option>
        </select>
      </div>
      <div className="rounded-xl border mb-8" style={{ borderColor: C.border, background: C.panel }}>
        {shown.length === 0 ? (
          <p className="p-6 text-center text-[13px]" style={{ color: C.textFaint }}>Nothing here.</p>
        ) : (
          shown.map((p, i) => (
            <div key={p.id} style={{ borderBottom: i === shown.length - 1 ? "none" : `1px solid ${C.border}` }}>
              <PolicyCard policy={p} links={linksOf(p.university_slug)} tally={cardTally(p, tallyOf(p.university_slug))} onDecide={decide} onSaved={load} onError={setError} />
            </div>
          ))
        )}
      </div>

      {/* Student reports */}
      <h3 className="text-[14px] font-semibold mb-1" style={{ color: C.text }}>Student reports</h3>
      <p className="text-[12px] mb-3" style={{ color: C.textDim }}>
        Each student&apos;s answer already applies to them. &ldquo;Accept for the university&rdquo; is only possible with an official regulation link; it becomes the university&apos;s approved rule.
      </p>
      <div className="rounded-xl border mb-8" style={{ borderColor: C.border, background: C.panel }}>
        {reports.length === 0 ? (
          <p className="p-6 text-center text-[13px]" style={{ color: C.textFaint }}>No student reports yet.</p>
        ) : (
          reports.map((r, i) => (
            <div key={r.id} style={{ borderBottom: i === reports.length - 1 ? "none" : `1px solid ${C.border}` }}>
              <ReportRow report={r} existing={r.university_slug ? bySlug.get(r.university_slug) ?? [] : []} onDone={load} onError={setError} />
            </div>
          ))
        )}
      </div>

      {/* Every university */}
      <h3 className="text-[14px] font-semibold mb-3" style={{ color: C.text }}>Universities & colleges in the app</h3>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border, background: C.panel }}>
        {[...UNIVERSITIES]
          .sort((a, b) => rank(bySlug.get(a.slug)) - rank(bySlug.get(b.slug)))
          .map((u, i, arr) => {
            const ps = (bySlug.get(u.slug) ?? []).filter((p) => p.scope === "university");
            const approved = ps.some((p) => p.status === "verified");
            const waiting = ps.some((p) => p.status === "review");
            const reps = reports.filter((r) => r.university_slug === u.slug && r.status === "pending").length;
            const srcs = linksOf(u.slug).filter((l) => l.status === "pending").length;
            const tl = tallyOf(u.slug);
            const open = openSlug === u.slug;
            return (
              <div key={u.slug} style={{ borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.border}` }}>
                <button onClick={() => setOpenSlug(open ? null : u.slug)} className="admin-hover-row w-full text-start flex items-center gap-3 px-5 py-3" style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: approved ? C.success : waiting ? C.warning : C.danger }} />
                  <div className="min-w-0 flex-1">
                    <div dir="auto" className="text-[13px] font-medium truncate" style={{ color: C.text }}>{u.name}</div>
                    <div className="text-[11px]" style={{ color: C.textDim }}>
                      {u.nameEn} · {approved ? "Approved rule" : waiting ? "Waiting for approval" : "Missing — students see no %"}
                      {reps ? ` · ${reps} student report${reps > 1 ? "s" : ""}` : ""}
                      {srcs ? ` · ${srcs} source${srcs > 1 ? "s" : ""} waiting to be read` : ""}
                      {tl ? ` · students: ${tl.agree} agree, ${tl.differ} different` : ""}
                    </div>
                  </div>
                  {tl?.review && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0" style={{ background: C.tint(C.danger, "22"), color: C.danger }}>Review</span>}
                  <span className="text-[12px] shrink-0" style={{ color: C.textFaint }}>{open ? "▾" : "▸"}</span>
                </button>
                {open && (
                  <div className="px-5 pb-5">
                    {ps.map((p) => (
                      <div key={p.id} className="rounded-lg mb-3" style={{ border: `1px solid ${C.border}` }}>
                        <PolicyCard policy={p} links={linksOf(p.university_slug)} tally={cardTally(p, tl)} onDecide={decide} onSaved={load} onError={setError} />
                      </div>
                    ))}
                    {ps.length === 0 && (
                      <>
                        <PolicyLinkBox slug={u.slug} name={u.name} country="SA" links={linksOf(u.slug)} onSaved={load} onError={setError} />
                        <div className="text-[11px] mt-4 mb-2" style={{ color: C.textDim }}>Or enter the rule yourself:</div>
                        <PolicyForm slug={u.slug} country="SA" onSaved={load} onError={setError} />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

interface PolicyLinkRequest {
  id: string;
  university_slug: string | null;
  university_name: string | null;
  country: string;
  url: string | null;
  /** photos / PDF of the regulation in the private policy-sources bucket */
  image_paths: string[] | null;
  note: string | null;
  status: "pending" | "done" | "failed";
  result_note: string | null;
  created_at: string;
}

const PHOTO_BUCKET = "policy-sources";
const MAX_FILE_MB = 10;

/** Temporary links (1 hour) to private photos, by path. */
function useSignedUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join("|");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(key.split("|"), 3600)
      .then(({ data }) => {
        if (!alive || !data) return;
        const m: Record<string, string> = {};
        for (const d of data) if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
        setUrls(m);
      });
    return () => {
      alive = false;
    };
  }, [key]);
  return urls;
}

/** A source from attendance_policies.sources: a web link, or `photo:<path>`
 *  for an uploaded photo (opened through a temporary link). */
function SourceLink({ url, title }: { url: string; title?: string }) {
  const C = useC();
  const path = url.startsWith("photo:") ? url.slice(6) : null;
  const signed = useSignedUrls(path ? [path] : []);
  const href = path ? signed[path] : url;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" dir="auto" style={{ color: C.primary }}>
      {title || (path ? "Uploaded photo" : url)}
    </a>
  );
}

const isPdf = (path: string) => path.toLowerCase().endsWith(".pdf");

/** On a rule waiting for approval, or a university with none yet: an official
 *  link, or photos / a PDF of the regulation when it isn't online. It waits until it's read in a working
 *  session with Claude, who updates this rule from it (with the quoted text)
 *  for you to approve. */
function PolicyLinkBox({
  slug,
  name,
  country,
  scopeName,
  links,
  onSaved,
  onError,
}: {
  slug: string;
  name: string;
  country: string;
  /** the college / program the rule is for, when not the whole university */
  scopeName?: string | null;
  links: PolicyLinkRequest[];
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const C = useC();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const input: React.CSSProperties = { background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "6px 10px", fontSize: 13 };
  const signed = useSignedUrls(links.flatMap((l) => l.image_paths ?? []));

  const pick = (list: FileList | null) => {
    setMsg("");
    const chosen = Array.from(list ?? []);
    const big = chosen.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (big) return setMsg(`${big.name} is over ${MAX_FILE_MB} MB.`);
    setFiles(chosen);
  };

  const submit = async () => {
    setMsg("");
    const link = url.trim();
    if (link && !/^https?:\/\/\S+$/.test(link)) return setMsg("The link must start with https://");
    if (!link && !files.length) return setMsg("Paste a link or choose photos first.");
    setSaving(true);
    // Upload the photos first; the request only lists files that made it.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const paths: string[] = [];
    for (const [i, f] of files.entries()) {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${slug}/${stamp}-${i + 1}.${ext}`;
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
      if (error) {
        if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths);
        setSaving(false);
        return onError(`Upload failed (${f.name}): ${error.message}`);
      }
      paths.push(path);
    }
    const { error } = await supabase.from("attendance_policy_requests").insert({
      university_slug: slug,
      university_name: name,
      country,
      url: link || null,
      image_paths: paths.length ? paths : null,
      note: [scopeName ?? "", note.trim()].filter(Boolean).join(" — ") || null,
    });
    setSaving(false);
    if (error) {
      if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths);
      return onError(error.message);
    }
    setUrl("");
    setNote("");
    setFiles([]);
    setFileKey((k) => k + 1);
    setMsg("Saved. Ask Claude to read the waiting links.");
    onSaved();
  };

  const remove = async (l: PolicyLinkRequest) => {
    const { error } = await supabase.from("attendance_policy_requests").delete().eq("id", l.id);
    if (error) return onError(error.message);
    if (l.image_paths?.length) await supabase.storage.from(PHOTO_BUCKET).remove(l.image_paths);
    onSaved();
  };

  return (
    <div className="mt-3 rounded-lg p-3" style={{ background: C.panel2 ?? C.panel, border: `1px solid ${C.border}` }}>
      <div className="text-[12px] font-semibold mb-2" style={{ color: C.text }}>Add a source for Claude to read</div>
      <div className="flex flex-wrap gap-2 items-center">
        <input dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (regulation page or PDF)" style={{ ...input, flex: "2 1 240px" }} />
        <input dir="auto" value={note} onChange={(e) => setNote(e.target.value)} placeholder="وش أدور عليه؟ (اختياري)" style={{ ...input, flex: "1 1 180px" }} />
      </div>
      <div className="flex flex-wrap gap-2 items-center mt-2">
        <label className="rounded-lg px-3 py-1.5 text-[12px] cursor-pointer" style={{ background: C.border, color: C.text }}>
          {files.length ? `${files.length} file${files.length > 1 ? "s" : ""} chosen` : "Upload photos / PDF"}
          <input key={fileKey} type="file" accept="image/*,application/pdf" multiple onChange={(e) => pick(e.target.files)} className="hidden" />
        </label>
        <span className="text-[11px] flex-1" style={{ color: C.textFaint }}>
          When the regulation isn&apos;t online: photos of its pages (up to {MAX_FILE_MB} MB each). Only admins can see them.
        </span>
        <button onClick={() => void submit()} disabled={saving} className="rounded-lg px-4 py-2 text-[12px] font-semibold" style={{ background: C.primary, color: "#fff", border: "none", cursor: "pointer", opacity: saving ? 0.5 : 1 }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {files.length > 0 && (
        <div dir="auto" className="text-[11px] mt-1" style={{ color: C.textDim }}>{files.map((f) => f.name).join(" · ")}</div>
      )}
      {msg && <div className="text-[12px] mt-2" style={{ color: C.textMuted }}>{msg}</div>}
      {links.map((l) => (
        <div key={l.id} className="flex items-start gap-2 mt-3 text-[12px]">
          <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: l.status === "failed" ? C.danger : C.warning }} />
          <div className="min-w-0 flex-1">
            {l.url && <a href={l.url} target="_blank" rel="noopener noreferrer" dir="ltr" className="block truncate" style={{ color: C.primary }}>{l.url}</a>}
            {(l.image_paths ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2 my-1">
                {(l.image_paths ?? []).map((path) =>
                  signed[path] ? (
                    <a key={path} href={signed[path]} target="_blank" rel="noopener noreferrer" title={path}>
                      {isPdf(path) ? (
                        <span className="inline-block rounded px-2 py-1" style={{ background: C.border, color: C.text }}>PDF</span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- private signed URL, not an optimisable asset
                        <img src={signed[path]} alt="" className="h-16 w-16 rounded object-cover" style={{ border: `1px solid ${C.border}` }} />
                      )}
                    </a>
                  ) : (
                    <span key={path} className="inline-block h-16 w-16 rounded" style={{ background: C.border }} />
                  )
                )}
              </div>
            )}
            {l.note && <div dir="auto" style={{ color: C.textDim }}>{l.note}</div>}
            <div style={{ color: l.status === "failed" ? C.danger : C.textFaint }}>
              {l.status === "failed" ? `Couldn't read it${l.result_note ? `: ${l.result_note}` : ""}` : `Waiting to be read · ${new Date(l.created_at).toLocaleDateString("en-GB")}`}
            </div>
          </div>
          <button onClick={() => void remove(l)} className="shrink-0" style={{ background: "transparent", border: "none", color: C.textMuted, cursor: "pointer" }}>Remove</button>
        </div>
      ))}
    </div>
  );
}

/** Missing first, then waiting, then approved. */
/** A student's answer about their university's rule (crowd_votes). */
interface CrowdVote {
  university_slug: string;
  agrees: boolean;
  answer: { method?: string; max_absence?: number | null; max_unexcused?: number | null; excused_counts?: boolean };
}

/** The same comparison the database makes (attendance_rule_key). */
const voteKey = (a: CrowdVote["answer"]) =>
  policyRuleKey({
    method: (a.method ?? "unspecified") as AttendancePolicy["method"],
    max_absence: a.max_absence ?? null,
    max_unexcused: a.max_unexcused ?? null,
    excused_counts: a.excused_counts !== false,
  });

/** The rule students' answers are counted against: the university-wide one
 *  read from its documents (approved first), never one its students describe
 *  (scope_name set) — as the crowd_votes_apply trigger does. */
function mainPolicy(ps: AttendancePolicy[]): AttendancePolicy | undefined {
  const main = ps.filter((p) => p.scope === "university" && !p.scope_name && p.status !== "rejected");
  return main.find((p) => p.status === "verified") ?? main[0];
}

/** How a university's students answered: agreeing with its rule, or — with no
 *  rule — with the most common answer. 5 agreeing (fewer than 3 not) approves
 *  it automatically; 3 or more not agreeing needs a review. */
interface Tally {
  agree: number;
  differ: number;
  review: boolean;
}

function tally(votes: CrowdVote[], policy: AttendancePolicy | undefined): Tally | null {
  if (!votes.length) return null;
  let key = policy ? policyRuleKey(policy) : null;
  if (!key) {
    const counts = new Map<string, number>();
    for (const v of votes) counts.set(voteKey(v.answer), (counts.get(voteKey(v.answer)) ?? 0) + 1);
    key = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  const agree = votes.filter((v) => voteKey(v.answer) === key).length;
  const differ = votes.length - agree;
  return { agree, differ, review: differ >= 3 };
}

/** Universities where 3 or more students disagree with the absence rule or the
 *  suggested calendar — shown as a banner on every admin visit. */
export async function loadCrowdReview(): Promise<string[]> {
  const [p, v, f] = await Promise.all([
    supabase.from("attendance_policies").select("*").eq("scope", "university").neq("status", "rejected"),
    supabase.from("crowd_votes").select("subject, university_slug, period, agrees, answer"),
    supabase.from("university_facts").select("*").neq("status", "rejected").in("fact_key", ["term_start", "finals_start"]),
  ]);
  if (p.error || v.error || f.error) return [];
  const policies = p.data as AttendancePolicy[];
  const votes = v.data as (CrowdVote & CalendarVote & { subject: string })[];
  const facts = f.data as FactRow[];
  const out = new Set<string>();
  for (const slug of new Set(votes.map((x) => x.university_slug))) {
    const att = tally(votes.filter((x) => x.subject === "attendance" && x.university_slug === slug), mainPolicy(policies.filter((x) => x.university_slug === slug)));
    const cal = calendarTallies(votes.filter((x) => x.subject === "calendar" && x.university_slug === slug), facts.filter((x) => x.university_slug === slug));
    if (att?.review || cal.some((c) => c.review)) out.add(slug);
  }
  return [...out];
}

function rank(ps: AttendancePolicy[] | undefined): number {
  const u = (ps ?? []).filter((p) => p.scope === "university");
  if (u.some((p) => p.status === "verified")) return 2;
  if (u.some((p) => p.status === "review")) return 1;
  return 0;
}

function PolicyCard({
  policy: p,
  links,
  tally: tl,
  onDecide,
  onSaved,
  onError,
}: {
  policy: AttendancePolicy;
  links: PolicyLinkRequest[];
  tally?: Tally | null;
  onDecide: (id: string, s: "verified" | "review" | "rejected") => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const C = useC();
  const [editing, setEditing] = useState(false);
  const flags = policyFlags(p);
  const btn = (primary = false): React.CSSProperties => ({ background: primary ? C.primary : C.border, color: primary ? "#fff" : C.textMuted, border: "none", cursor: "pointer" });
  const flagChip = (label: string, color: string) => (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: C.tint(color, "22"), color }}>{label}</span>
  );
  const det = p.details ?? {};
  const college = (det.college_rules ?? []) as { college: string; rule: string; source?: PolicySource }[];
  const program = (det.program_rules ?? []) as { program: string; rule?: string; max_absence?: number; max_unexcused?: number; source?: PolicySource }[];
  const other = Object.entries(det).filter(([k]) => k !== "college_rules" && k !== "program_rules");

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span dir="auto" className="text-[14px] font-semibold" style={{ color: C.text }}>{uniName(p.university_slug, p.university_name)}</span>
          <span className="text-[11px]" style={{ color: C.textDim }}>{COUNTRY[p.country] ?? p.country}</span>
          {p.scope !== "university" && flagChip(p.scope_name ?? p.scope, C.indigo)}
          {p.status === "verified" && flagChip(p.details?.auto_verified === true ? "Approved by students" : "Approved", C.success)}
          {p.status === "review" && p.details?.reopened_by != null && flagChip("Was approved by students — back here after 3 disagreed", C.warning)}
          {p.details?.crowd === true && flagChip("Rule from students", C.indigo)}
          {isStudentAlternative(p) && flagChip("Students' version — shown beside the main rule for each student to pick", C.indigo)}
          {tl && isStudentAlternative(p) && flagChip(`Chosen by ${tl.agree} student${tl.agree === 1 ? "" : "s"}`, C.textDim)}
          {tl && !isStudentAlternative(p) && flagChip(`Students: ${tl.agree} agree · ${tl.differ} different`, tl.review ? C.danger : C.textDim)}
          {tl?.review && !isStudentAlternative(p) && flagChip("3+ say it's different — review", C.danger)}
          {flags.includes("old") && flagChip("Old document — confirm it's still in force", C.warning)}
          {flags.includes("conflict") && flagChip("Sources disagree", C.danger)}
          {flags.includes("verify") && flagChip("Check wording", C.warning)}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing((v) => !v)} className="rounded-lg px-3 py-1.5 text-[12px]" style={btn()}>{editing ? "Close" : "Edit"}</button>
          {p.status !== "rejected" && <button onClick={() => onDecide(p.id, "rejected")} className="rounded-lg px-3 py-1.5 text-[12px]" style={btn()}>Reject</button>}
          {p.status !== "review" && <button onClick={() => onDecide(p.id, "review")} className="rounded-lg px-3 py-1.5 text-[12px]" style={btn()}>Back to waiting</button>}
          {p.status !== "verified" && <button onClick={() => onDecide(p.id, "verified")} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={btn(true)}>Approve</button>}
        </div>
      </div>

      <ul dir="rtl" className="text-[13px] leading-relaxed mb-2 list-disc ps-5" style={{ color: C.text }}>
        {describePolicyAr(p).map((l) => <li key={l}>{l}</li>)}
      </ul>

      {(college.length > 0 || program.length > 0 || other.length > 0) && (
        <div className="text-[12px] mb-2 flex flex-col gap-1" style={{ color: C.textMuted }}>
          {college.map((c) => (
            <div key={c.college}>
              <b dir="auto">{c.college}:</b> {c.rule}
              {c.source && <> · <SourceLink url={c.source.url} title="source" /></>}
              {c.source?.quote && <div dir="auto" className="mt-0.5" style={{ color: C.textDim }}>&ldquo;{c.source.quote}&rdquo;</div>}
            </div>
          ))}
          {program.map((c) => (
            <div key={c.program}>
              <b dir="auto">{c.program}:</b> {c.rule ?? [c.max_unexcused != null && `${c.max_unexcused}% unexcused`, c.max_absence != null && `${c.max_absence}% total`].filter(Boolean).join(" / ")}
              {c.source && <> · <SourceLink url={c.source.url} title="source" /></>}
            </div>
          ))}
          {other.map(([k, v]) => (
            <div key={k}><b>{k}:</b> <span dir="auto">{typeof v === "string" ? v : JSON.stringify(v)}</span></div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 mt-2">
        {p.sources.map((s) => (
          <div key={s.url} className="text-[12px]">
            <SourceLink url={s.url} title={s.title} />
            {s.quote && (
              <blockquote dir="auto" className="mt-1 ps-3 text-[12.5px] leading-relaxed" style={{ borderInlineStart: `3px solid ${C.border2}`, color: C.textMuted }}>
                {s.quote}
              </blockquote>
            )}
          </div>
        ))}
        {p.sources.length === 0 && <div className="text-[12px]" style={{ color: C.warningText }}>No official source attached.</div>}
      </div>
      <div className="text-[11px] mt-2" style={{ color: C.textDim }}>
        {p.effective ? `Regulation: ${p.effective}` : "Regulation date not stated"}
        {p.last_verified ? ` · Approved ${new Date(p.last_verified).toLocaleDateString()}` : ""}
      </div>
      {p.note && <div className="text-[12px] mt-1" style={{ color: C.warningText }}>{p.note}</div>}

      {p.status === "review" && (
        <PolicyLinkBox
          slug={p.university_slug}
          name={p.university_name ?? uniName(p.university_slug)}
          country={p.country}
          scopeName={p.scope !== "university" ? p.scope_name ?? p.scope : null}
          links={links}
          onSaved={onSaved}
          onError={onError}
        />
      )}

      {editing && (
        <div className="mt-3">
          <PolicyForm slug={p.university_slug} country={p.country} existing={p} onSaved={() => { setEditing(false); onSaved(); }} onError={onError} />
        </div>
      )}
    </div>
  );
}

const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** Add a university's rule by hand, or correct an existing one. A new rule
 *  needs its official source link. */
function PolicyForm({
  slug,
  country,
  existing,
  onSaved,
  onError,
}: {
  slug: string;
  country: string;
  existing?: AttendancePolicy;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const C = useC();
  const [method, setMethod] = useState<PolicyMethod>(existing?.method ?? "lectures");
  const [max, setMax] = useState(existing?.max_absence != null ? String(existing.max_absence) : "");
  const [unexc, setUnexc] = useState(existing?.max_unexcused != null ? String(existing.max_unexcused) : "");
  const [excusedCounts, setExcusedCounts] = useState(existing?.excused_counts ?? true);
  const [floor, setFloor] = useState(existing?.excuse_floor_attendance != null ? String(existing.excuse_floor_attendance) : "");
  const [separate, setSeparate] = useState(!!existing?.separate_components);
  const [warnings, setWarnings] = useState((existing?.warnings ?? []).join(", "));
  const [late, setLate] = useState(existing?.late_rule ?? "");
  const [effective, setEffective] = useState(existing?.effective ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [quote, setQuote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const input: React.CSSProperties = { background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "6px 10px", fontSize: 13 };
  const lab = (t: string) => <span className="block text-[11px] mb-1" style={{ color: C.textDim }}>{t}</span>;

  const save = async (approve: boolean) => {
    setMsg("");
    const nums = { max: numOrNull(max), unexc: numOrNull(unexc), floor: numOrNull(floor) };
    for (const [k, v] of Object.entries(nums)) if (v != null && !(v > 0 && v <= 100)) return setMsg(`${k === "max" ? "Limit" : k === "unexc" ? "Unexcused limit" : "Excuse floor"} must be between 1 and 100.`);
    const warn = warnings.split(/[,،\s]+/).filter(Boolean).map(Number);
    if (warn.some((w) => !(w > 0 && w <= 100))) return setMsg("Warnings are percentages separated by commas, e.g. 10, 15.");
    const newSource = url.trim();
    if (newSource && !/^https?:\/\//.test(newSource)) return setMsg("The source link must start with https://");
    const sources: PolicySource[] = [...(existing?.sources ?? [])];
    if (newSource) sources.push({ url: newSource, ...(title.trim() ? { title: title.trim() } : {}), ...(quote.trim() ? { quote: quote.trim() } : {}) });
    if (!sources.length) return setMsg("Add the official source link.");
    const { data: auth } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const row = {
      university_slug: slug,
      country,
      method,
      max_absence: nums.max,
      max_unexcused: nums.unexc,
      excused_counts: excusedCounts,
      excuse_floor_attendance: nums.floor,
      separate_components: separate,
      warnings: warn,
      late_rule: late.trim() || null,
      effective: effective.trim() || null,
      note: note.trim() || null,
      sources,
      updated_at: now,
      ...(approve ? { status: "verified", last_verified: now, verified_by: auth.user?.id ?? null } : {}),
    };
    setSaving(true);
    const { error } = existing
      ? await supabase.from("attendance_policies").update(row).eq("id", existing.id)
      : await supabase.from("attendance_policies").insert({ ...row, status: approve ? "verified" : "review" });
    setSaving(false);
    if (error) return onError(error.message);
    setMsg("Saved.");
    onSaved();
  };

  return (
    <div className="rounded-lg p-4" style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
      <div className="text-[12px] font-semibold mb-3" style={{ color: C.text }}>{existing ? "Correct this rule" : "Enter from the official regulation"}</div>
      <div className="flex flex-wrap gap-3 mb-3">
        <label>{lab("Counted by")}
          <select value={method} onChange={(e) => setMethod(e.target.value as PolicyMethod)} style={input}>
            <option value="lectures">Lectures (sessions)</option>
            <option value="hours">Contact hours</option>
            <option value="count">Number of absences</option>
            <option value="none">No denial</option>
            <option value="unspecified">Not stated</option>
          </select>
        </label>
        <label>{lab("Denial limit % (total)")}<input type="number" min={1} max={100} step="any" value={max} onChange={(e) => setMax(e.target.value)} style={{ ...input, width: 90 }} /></label>
        <label>{lab("Unexcused limit %")}<input type="number" min={1} max={100} step="any" value={unexc} onChange={(e) => setUnexc(e.target.value)} style={{ ...input, width: 90 }} /></label>
        <label>{lab("Min attendance with excuse %")}<input type="number" min={1} max={100} step="any" value={floor} onChange={(e) => setFloor(e.target.value)} style={{ ...input, width: 110 }} /></label>
        <label>{lab("Warnings % (comma separated)")}<input value={warnings} onChange={(e) => setWarnings(e.target.value)} placeholder="10, 15" style={{ ...input, width: 140 }} /></label>
      </div>
      <div className="flex flex-wrap gap-5 mb-3 text-[13px]" style={{ color: C.text }}>
        <label className="flex items-center gap-2"><input type="checkbox" checked={excusedCounts} onChange={(e) => setExcusedCounts(e.target.checked)} /> Excused absences count toward the limit</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} /> Theory / practical counted separately</label>
      </div>
      <div className="flex flex-wrap gap-3 mb-3">
        <label className="flex-1 min-w-[220px]">{lab("Lateness rule (Arabic, shown to students)")}<input dir="auto" value={late} onChange={(e) => setLate(e.target.value)} placeholder="كل 3 تأخيرات = غياب" style={{ ...input, width: "100%" }} /></label>
        <label className="flex-1 min-w-[180px]">{lab("Regulation date / edition")}<input dir="auto" value={effective} onChange={(e) => setEffective(e.target.value)} placeholder="1444هـ" style={{ ...input, width: "100%" }} /></label>
      </div>
      <label className="block mb-3">{lab("Note (admin only)")}<input dir="auto" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...input, width: "100%" }} /></label>
      <div className="flex flex-wrap gap-3 mb-3">
        <label className="flex-1 min-w-[240px]">{lab(existing ? "Add another source link" : "Official source link (required)")}<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" style={{ ...input, width: "100%" }} /></label>
        <label className="flex-1 min-w-[200px]">{lab("Source title")}<input dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="لائحة الدراسة والاختبارات" style={{ ...input, width: "100%" }} /></label>
      </div>
      <label className="block mb-3">{lab("Quoted text from the source")}<textarea dir="auto" value={quote} onChange={(e) => setQuote(e.target.value)} rows={2} style={{ ...input, width: "100%" }} /></label>
      <div className="flex flex-wrap gap-3 items-center">
        <button onClick={() => void save(false)} disabled={saving} className="rounded-lg px-4 py-2 text-[12px] font-semibold" style={{ background: C.border, color: C.text, border: "none", cursor: "pointer", opacity: saving ? 0.5 : 1 }}>
          {existing ? "Save" : "Save for review"}
        </button>
        <button onClick={() => void save(true)} disabled={saving} className="rounded-lg px-4 py-2 text-[12px] font-semibold" style={{ background: C.primary, color: "#fff", border: "none", cursor: "pointer", opacity: saving ? 0.5 : 1 }}>
          {saving ? "Saving…" : "Save & approve"}
        </button>
        {msg && <span className="text-[12px]" style={{ color: C.textMuted }}>{msg}</span>}
      </div>
    </div>
  );
}

function ReportRow({ report: r, existing, onDone, onError }: { report: PolicyReport; existing: AttendancePolicy[]; onDone: () => void; onError: (m: string) => void }) {
  const C = useC();
  const [busy, setBusy] = useState(false);
  const a = r.answers ?? {};
  const btn = (primary = false): React.CSSProperties => ({ background: primary ? C.primary : C.border, color: primary ? "#fff" : C.textMuted, border: "none", cursor: "pointer" });
  const name = r.university_slug ? uniName(r.university_slug, r.university_name) : r.university_name ?? "Unknown university";

  const setStatus = async (status: PolicyReport["status"]) => {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("attendance_policy_reports")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: auth.user?.id ?? null })
      .eq("id", r.id);
    if (error) throw error;
  };

  /** Make this the university's approved rule — only with an official link. */
  const accept = async () => {
    if (!r.regulation_url) return;
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const slug = r.university_slug ?? `other-${r.id.slice(0, 8)}`;
      const row = {
        university_slug: slug,
        university_name: r.university_slug ? null : r.university_name,
        country: r.country ?? "SA",
        method: a.method ?? "unspecified",
        max_absence: a.max_absence ?? null,
        max_unexcused: a.max_unexcused ?? null,
        excused_counts: a.excused_counts ?? true,
        late_rule: a.late_rule ?? null,
        sources: [{ url: r.regulation_url, title: "Official regulation shared by a student" }],
        note: a.note ?? null,
        status: "verified",
        last_verified: now,
        verified_by: auth.user?.id ?? null,
        updated_at: now,
      };
      const current = existing.find((p) => p.scope === "university");
      const { error } = current
        ? await supabase.from("attendance_policies").update(row).eq("id", current.id)
        : await supabase.from("attendance_policies").insert(row);
      if (error) throw error;
      await setStatus("accepted");
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const mark = async (s: PolicyReport["status"]) => {
    setBusy(true);
    try {
      await setStatus(s);
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = { pending: "Waiting", accepted: "Accepted for the university", rejected: "Rejected", personal: "Kept for the student only" }[r.status];

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div className="flex flex-wrap items-center gap-2">
          <span dir="auto" className="text-[14px] font-semibold" style={{ color: C.text }}>{name}</span>
          {r.country && r.country !== "SA" && <span className="text-[11px]" style={{ color: C.textDim }}>{COUNTRY[r.country] ?? r.country}</span>}
          <span className="text-[11px]" style={{ color: C.textDim }}>
            {r.scope === "course" ? `One course${r.course_name ? `: ${r.course_name}` : ""}` : "Whole university"} · {new Date(r.created_at).toLocaleDateString()} · {statusLabel}
          </span>
        </div>
        {r.status === "pending" && (
          <div className="flex gap-2">
            <button onClick={() => void mark("rejected")} disabled={busy} className="rounded-lg px-3 py-1.5 text-[12px]" style={btn()}>Reject</button>
            <button onClick={() => void mark("personal")} disabled={busy} className="rounded-lg px-3 py-1.5 text-[12px]" style={btn()}>Keep for student only</button>
            <button
              onClick={() => void accept()}
              disabled={busy || !r.regulation_url || r.scope === "course"}
              title={!r.regulation_url ? "Needs an official regulation link" : r.scope === "course" ? "A single course's rule can't become the university's" : ""}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold"
              style={{ ...btn(true), opacity: !r.regulation_url || r.scope === "course" ? 0.4 : 1, cursor: !r.regulation_url || r.scope === "course" ? "not-allowed" : "pointer" }}
            >
              Accept for the university
            </button>
          </div>
        )}
      </div>
      <ul dir="rtl" className="text-[13px] leading-relaxed list-disc ps-5" style={{ color: C.text }}>
        {describePolicyAr({ method: a.method ?? "unspecified", max_absence: a.max_absence ?? null, max_unexcused: a.max_unexcused ?? null, excused_counts: a.excused_counts ?? true, late_rule: a.late_rule ?? null }).map((l) => <li key={l}>{l}</li>)}
      </ul>
      {a.note && <div dir="auto" className="text-[12px] mt-1" style={{ color: C.textMuted }}>{a.note}</div>}
      <div className="text-[12px] mt-1">
        {r.regulation_url ? (
          <a href={r.regulation_url} target="_blank" rel="noopener noreferrer" style={{ color: C.primary }}>Regulation link from the student</a>
        ) : (
          <span style={{ color: C.textDim }}>No regulation link — can&apos;t become the university&apos;s rule.</span>
        )}
      </div>
    </div>
  );
}
