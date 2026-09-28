"use client";

// Student choices — what each student chose or answered about the things that
// decide their numbers: GPA system, absence rule, term dates, holidays, the
// portal check, notifications. Read through admin_student_decisions (admin
// only). Every student is sorted into one category per topic with the SAME
// helpers the app uses (detectScheme / gradeTableStatus / holidayCalendar /
// the university's absence rules), so a category here is what the student sees.
//
//   • InsightsChoices — the counts per category for every student, and the
//     "needs follow-up" list, each opening the students behind it;
//   • StudentSummaryCard — one student's categories, details and the timeline
//     of their answers, on their page.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, useC, fmtDateTime, timeAgo, Loading, ErrorBanner, type Palette } from "./_lib";
import { useDrill, type DrillUser } from "./_drill";
import { detectScheme, gradeTableStatus } from "@/lib/gradeSchemes";
import { holidayCalendar } from "@/lib/universityCountry";
import { fetchUniversityPolicies, isStudentAlternative, policyAckKey, type AttendancePolicy } from "@/lib/attendancePolicy";
import type { AcademicInfo, PersonalAttendanceRule, SetupConfirmed } from "@/types";

// ── Data ─────────────────────────────────────────────────────────────────────

interface Vote {
  subject: "attendance" | "calendar";
  university: string;
  period: string;
  agrees: boolean;
  keptOwn: boolean;
  at: string;
}

export interface DecisionRow {
  user_id: string;
  email: string | null;
  joined: string;
  last_active_at: string | null;
  academic: (Partial<AcademicInfo> & { customScheme?: { max: number; percent?: boolean; bands: number } | null }) | null;
  attendanceRule: PersonalAttendanceRule | null;
  attendancePolicyAck: string | null;
  attendanceEnabled: boolean | null;
  ownLimits: number;
  setupConfirmed: SetupConfirmed | null;
  holidaysRemoved: number;
  holidaysAdded: number;
  cumulativeGpa: number | null;
  cumulativeHours: number | null;
  gpaMode: string | null;
  gpaGoal: number | null;
  termCheck: { answer?: "match" | "mismatch"; reason?: string; consent?: boolean; cum?: string; snoozed?: boolean } | null;
  pastTerms: { count: number; match: number; mismatch: number } | null;
  repeats: number;
  notifPrefs: Record<string, { enabled?: boolean } | number> | null;
  pushDevices: number;
  language: string | null;
  theme: string | null;
  gamification: { xp?: number; streak?: number; longest?: number; badges?: number; checkIns?: number } | null;
  votes: Vote[];
  policyReports: { scope: string; course: string | null; status: string; at: string }[];
  decisions: { event: string; at: string; meta: Record<string, unknown> }[];
  term: {
    start_date: string | null; end_date: string | null; teaching_weeks: number; finals_weeks: number;
    courses: number; planner: number; timetable: number; grades: number; absences: number;
  } | null;
  /** the student's university's absence rules, as their app fetches them */
  policies?: AttendancePolicy[];
}

/** Every student's answers (null) or one student's, with their university's
 *  absence rules attached, fetched the way the student's app fetches them. */
export async function loadDecisions(user: string | null): Promise<DecisionRow[]> {
  const { data, error } = await supabase.rpc("admin_student_decisions", { p_user: user });
  if (error) throw error;
  const rows = (data as DecisionRow[]) ?? [];
  const slugOf = (r: DecisionRow) => {
    const s = r.academic?.universitySlug;
    return s && s !== "other" ? s : null;
  };
  const slugs = [...new Set(rows.map(slugOf).filter((s): s is string => !!s))];
  const policies = new Map(await Promise.all(slugs.map(async (s) => [s, await fetchUniversityPolicies(s)] as const)));
  return rows.map((r) => ({ ...r, policies: policies.get(slugOf(r) ?? "") ?? [] }));
}

// ── Categories ───────────────────────────────────────────────────────────────

/** ok = nothing to do · info = worth knowing · action = the admin should look */
type Tone = "ok" | "info" | "action" | "none";

interface Category {
  label: string;
  tone: Tone;
  /** what it means / what to do, shown under the label */
  hint?: string;
}

interface Topic {
  key: TopicKey;
  title: string;
  categories: Record<string, Category>;
}

type TopicKey = "university" | "gpaSystem" | "absenceRule" | "termDates" | "holidays" | "portalCheck" | "notifications";

const TOPICS: Topic[] = [
  {
    key: "university",
    title: "University",
    categories: {
      listed: { label: "Picked from the list", tone: "ok" },
      typed: { label: "Typed a university not on the list", tone: "info", hint: "a university to add" },
      none: { label: "No university yet", tone: "none" },
    },
  },
  {
    key: "gpaSystem",
    title: "GPA system",
    categories: {
      official: { label: "Official system (known university)", tone: "ok" },
      confirmed: { label: "Confirmed the table we showed", tone: "ok" },
      own_table: { label: "Said it's wrong and entered their table", tone: "action", hint: "review their table (GPA page)" },
      said_no: { label: "Said it's wrong, didn't enter theirs", tone: "action", hint: "find their university's official table" },
      manual: { label: "Picked a system by hand", tone: "info" },
      not_answered: { label: "Not answered yet", tone: "info", hint: "their GPA uses our table until they answer" },
      unknown: { label: "University not recognised, no system picked", tone: "action", hint: "add the university's system" },
      no_university: { label: "No university yet", tone: "none" },
    },
  },
  {
    key: "absenceRule",
    title: "Absence rule",
    categories: {
      confirmed: { label: "Confirmed the university's rule", tone: "ok" },
      confirmed_students: { label: "Picked the rule students describe", tone: "info" },
      own: { label: "Gave their own rule", tone: "info", hint: "compare with the university's rule" },
      said_no: { label: "Said no, didn't give their rule", tone: "action", hint: "they see no absence %" },
      pending: { label: "Rule shown, not confirmed yet", tone: "info", hint: "they see no absence % until they answer" },
      rule_changed: { label: "Confirmed an older version of the rule", tone: "info", hint: "asked again since the rule changed" },
      no_rule: { label: "No rule on record for their university", tone: "action", hint: "they see no absence % — research the rule" },
      off: { label: "Turned absence tracking off", tone: "info" },
      no_university: { label: "No university yet", tone: "none" },
    },
  },
  {
    key: "termDates",
    title: "Term dates",
    categories: {
      confirmed: { label: "Confirmed the official dates", tone: "ok" },
      corrected: { label: "Corrected the official dates", tone: "action", hint: "check the university calendar" },
      restored: { label: "Went back to their own dates", tone: "action", hint: "check the university calendar" },
      kept_own: { label: "Kept their own dates without correcting", tone: "info" },
      own_no_calendar: { label: "Set their own (no calendar on record)", tone: "info", hint: "a calendar to add (Term dates page)" },
      setup_confirmed: { label: "Confirmed their setup", tone: "ok" },
      not_answered: { label: "Not answered yet", tone: "none" },
    },
  },
  {
    key: "holidays",
    title: "Holidays",
    categories: {
      confirmed: { label: "Confirmed as shown", tone: "ok" },
      confirmed_edited: { label: "Edited, then confirmed", tone: "action", hint: "compare their edits with the calendar" },
      edited: { label: "Edited, not confirmed", tone: "action", hint: "compare their edits with the calendar" },
      not_answered: { label: "Not answered yet", tone: "info" },
      saudi: { label: "Saudi — official calendar as it is", tone: "none" },
      saudi_edited: { label: "Saudi — changed the official list", tone: "info", hint: "see which holidays they changed" },
    },
  },
  {
    key: "portalCheck",
    title: "GPA vs the portal",
    categories: {
      match: { label: "Matched the portal", tone: "ok" },
      mismatch: { label: "Didn't match the portal", tone: "action", hint: "review on the GPA page" },
      not_yet: { label: "Not checked yet", tone: "none" },
    },
  },
  {
    key: "notifications",
    title: "Notifications",
    categories: {
      on: { label: "Notifications on (device linked)", tone: "ok" },
      some_off: { label: "Device linked, some reminders off", tone: "info" },
      no_device: { label: "No device linked", tone: "info", hint: "gets no reminders" },
    },
  },
];

type Classified = Record<TopicKey, { key: string; detail?: string }>;

const hasEvent = (r: DecisionRow, event: string) => r.decisions.some((d) => d.event === event);

function classify(r: DecisionRow): Classified {
  const academic = (r.academic ?? {}) as AcademicInfo;
  const slug = academic.universitySlug;
  const name = academic.universityName?.trim();
  const hasUni = !!(slug && slug !== "other") || !!name;

  // University
  const university = !hasUni ? { key: "none" } : slug && slug !== "other" ? { key: "listed", detail: name } : { key: "typed", detail: name };

  // GPA system — exactly what the student's app decides.
  let gpaSystem: Classified["gpaSystem"];
  const own = r.academic?.customScheme;
  if (academic.gpaSchemeId === "custom" && own) {
    gpaSystem = { key: "own_table", detail: `out of ${own.max}${own.percent ? " (percentage)" : ""} · ${own.bands} grades` };
  } else if (!hasUni && !academic.gpaSchemeId) gpaSystem = { key: "no_university" };
  else {
    // The row carries only a summary of a table the student entered, so it's
    // left out here (their own table was handled above).
    const acad = { ...academic, customScheme: undefined };
    const d = detectScheme(acad);
    const status = gradeTableStatus(acad);
    const out = `${d.scheme.id} (out of ${d.scheme.max})`;
    const cat = d.catalog ? `${d.catalog.en} · ${out}` : out;
    if (d.source === "manual") gpaSystem = { key: "manual", detail: out };
    else if (status === "confirm") gpaSystem = { key: "not_answered", detail: cat };
    else if (status === "rejected") gpaSystem = { key: "said_no", detail: cat };
    else if (status === "unknown") gpaSystem = { key: "unknown", detail: name };
    else if (d.source === "catalog") gpaSystem = { key: "confirmed", detail: cat };
    else gpaSystem = { key: "official", detail: out };
  }

  // Absence rule — the same order the app resolves it in.
  let absenceRule: Classified["absenceRule"];
  const policies = r.policies ?? [];
  const acked = policies.find((p) => r.attendancePolicyAck === policyAckKey(p));
  const limit = (a: number | null | undefined, b: number | null | undefined) => (b ?? a) != null ? `${b ?? a}%` : undefined;
  if (r.attendanceEnabled === false) absenceRule = { key: "off" };
  else if (r.attendanceRule) absenceRule = { key: "own", detail: limit(r.attendanceRule.maxAbsence, r.attendanceRule.maxUnexcused) };
  else if (acked) absenceRule = { key: isStudentAlternative(acked) ? "confirmed_students" : "confirmed", detail: limit(acked.max_absence, acked.max_unexcused) };
  else if (!hasUni) absenceRule = { key: "no_university" };
  else if (hasEvent(r, "attendance_rule_no")) absenceRule = { key: "said_no" };
  else if (policies.length) absenceRule = { key: r.attendancePolicyAck ? "rule_changed" : "pending", detail: limit(policies[0].max_absence, policies[0].max_unexcused) };
  else absenceRule = { key: "no_rule", detail: name };

  // Term dates
  const answered = r.setupConfirmed?.termAnswered;
  const calVote = r.votes.find((v) => v.subject === "calendar");
  let termDates: Classified["termDates"];
  if (answered?.startsWith("none|")) termDates = { key: "own_no_calendar" };
  else if (answered && calVote) termDates = { key: calVote.agrees ? "confirmed" : calVote.keptOwn ? "restored" : "corrected", detail: calVote.period.replace("|", " · ") };
  else if (answered) termDates = { key: "kept_own" };
  else if (r.setupConfirmed?.semester) termDates = { key: "setup_confirmed" };
  else termDates = { key: "not_answered" };
  if (r.term?.start_date) termDates.detail = [termDates.detail, `${r.term.start_date} → ${r.term.end_date}`].filter(Boolean).join(" · ");

  // Holidays — confirmed outside Saudi Arabia only.
  const cal = holidayCalendar(academic);
  const edited = r.holidaysRemoved + r.holidaysAdded > 0;
  const editDetail = edited ? `${r.holidaysRemoved} removed · ${r.holidaysAdded} added` : undefined;
  const confirmedCal = academic.holidayCheck?.calendar === cal;
  // Saudi students aren't asked to confirm: their calendar is the official one.
  const holidays =
    cal === "SA"
      ? { key: edited ? "saudi_edited" : "saudi", detail: editDetail }
      : confirmedCal
        ? { key: edited ? "confirmed_edited" : "confirmed", detail: [cal, editDetail].filter(Boolean).join(" · ") }
        : edited
          ? { key: "edited", detail: [cal, editDetail].join(" · ") }
          : { key: "not_answered", detail: cal };

  // GPA vs the portal (this term, then past terms)
  const mism = (r.termCheck?.answer === "mismatch" ? 1 : 0) + (r.pastTerms?.mismatch ?? 0) + (r.termCheck?.cum === "mismatch" ? 1 : 0);
  const match = (r.termCheck?.answer === "match" ? 1 : 0) + (r.pastTerms?.match ?? 0);
  const portalCheck = mism ? { key: "mismatch", detail: `${mism} mismatch · ${match} match` } : match ? { key: "match", detail: `${match} checked` } : { key: "not_yet" };

  // Notifications
  const prefs = r.notifPrefs ?? {};
  const off = ["exams", "tasks", "attendance", "lectures"].filter((k) => (prefs[k] as { enabled?: boolean } | undefined)?.enabled === false);
  const notifications = !r.pushDevices ? { key: "no_device" } : off.length ? { key: "some_off", detail: `off: ${off.join(", ")}` } : { key: "on" };

  return { university, gpaSystem, absenceRule, termDates, holidays, portalCheck, notifications };
}

function toneColor(C: Palette, tone: Tone): { fg: string; bg: string } {
  if (tone === "ok") return { fg: C.successText, bg: C.successBg };
  if (tone === "action") return { fg: C.warningText, bg: C.tint(C.warning, "22") };
  if (tone === "info") return { fg: C.indigo, bg: C.indigoBg };
  return { fg: C.textMuted, bg: C.border };
}

// ── Timeline labels ──────────────────────────────────────────────────────────

const EVENT_LABEL: Record<string, string> = {
  university_set: "Set their university",
  gpa_system_set: "Changed their GPA system",
  grade_table_confirmed: "Confirmed the GPA table",
  grade_table_rejected: "Said the GPA table is wrong",
  grade_table_submitted: "Entered their own GPA table",
  attendance_rule_confirmed: "Confirmed the absence rule",
  attendance_rule_own: "Gave their own absence rule",
  attendance_rule_no: "Said no to the absence rule",
  attendance_tracking: "Absence tracking",
  term_dates_confirmed: "Confirmed the official term dates",
  term_dates_corrected: "Corrected the term dates",
  term_dates_kept_own: "Kept their own term dates",
  term_dates_restored: "Went back to their own term dates",
  term_dates_set_own: "Set their own term dates",
  holidays_confirmed: "Confirmed their holidays",
  holiday_removed: "Removed a holiday",
  holiday_restored: "Put back a holiday",
  holiday_added: "Added a holiday",
  holiday_deleted: "Deleted a holiday they added",
  setup_confirmed: "Confirmed their setup",
  course_repeat: "Marked a repeated course",
  term_gpa_match: "Term GPA matched the portal",
  term_gpa_mismatch: "Term GPA didn't match the portal",
  term_grades_saved: "Entered their official grades",
  term_mismatch_reason: "Gave a reason for the mismatch",
  term_consent_withdrawn: "Withdrew consent to share grades",
  term_cum_checked: "Checked their cumulative GPA",
  term_cum_reason: "Gave a reason for the cumulative mismatch",
  past_term_checked: "Checked a past term",
  past_term_reason: "Gave a reason for a past term",
  repeat_policy_other: "Described their repeat policy",
};

function eventDetail(e: DecisionRow["decisions"][number]): string {
  const m = e.meta ?? {};
  const bits: string[] = [];
  const s = (k: string) => (typeof m[k] === "string" || typeof m[k] === "number" || typeof m[k] === "boolean" ? String(m[k]) : "");
  if (e.event === "attendance_tracking") bits.push(m.on ? "turned on" : "turned off");
  if (e.event === "course_repeat") bits.push(m.on ? "marked" : "unmarked");
  for (const k of ["name", "course", "university", "slug", "scheme", "calendar", "id", "result", "reason", "method"]) if (s(k)) bits.push(s(k));
  if (s("limit")) bits.push(`${s("limit")}%`);
  if (s("start")) bits.push(`${s("start")} → ${s("end")}`);
  if (m.alternative) bits.push("students' version");
  if (m.portal != null && m.ours != null) bits.push(`portal ${s("portal")} · ours ${s("ours")}`);
  return bits.join(" · ");
}

// ── Insights: every student ──────────────────────────────────────────────────

export function InsightsChoices() {
  const C = useC();
  const drill = useDrill();
  const [rows, setRows] = useState<DecisionRow[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await loadDecisions(null));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const classified = useMemo(() => (rows ?? []).map((r) => ({ r, c: classify(r) })), [rows]);

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!rows) return <Loading text="Loading student choices…" />;

  const open = (title: string, list: { r: DecisionRow; c: Classified }[], topic?: TopicKey) => {
    const users: DrillUser[] = list.map(({ r, c }) => ({
      user_id: r.user_id,
      email: r.email,
      last_active_at: r.last_active_at,
      detail: [...new Set([r.academic?.universityName?.trim(), topic ? c[topic].detail : null])].filter(Boolean).join(" · ") || null,
      badge: null,
    }));
    drill({ title, users });
  };

  // Needs follow-up: every "action" category, most students first.
  const actions = TOPICS.flatMap((t) =>
    Object.entries(t.categories)
      .filter(([, cat]) => cat.tone === "action")
      .map(([key, cat]) => ({ topic: t, key, cat, list: classified.filter((x) => x.c[t.key].key === key) }))
  )
    .filter((a) => a.list.length)
    .sort((a, b) => b.list.length - a.list.length);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[15px] font-semibold mb-1" style={{ color: C.text }}>Needs follow-up</h2>
        <p className="text-[12px] mb-3" style={{ color: C.textFaint }}>
          Students whose answers point at something for us to check or add. Click a row to see them.
        </p>
        <div className="rounded-xl border" style={{ borderColor: C.border, background: C.panel }}>
          {actions.length === 0 ? (
            <p className="px-5 py-6 text-[13px]" style={{ color: C.textFaint }}>Nothing to follow up.</p>
          ) : (
            actions.map((a, i) => (
              <button
                key={`${a.topic.key}:${a.key}`}
                type="button"
                onClick={() => open(`${a.topic.title} — ${a.cat.label}`, a.list, a.topic.key)}
                className="w-full text-start flex items-center gap-3 px-5 py-3"
                style={{ borderBottom: i === actions.length - 1 ? "none" : `1px solid ${C.border}`, background: "transparent", cursor: "pointer" }}
              >
                <span className="text-[18px] font-bold tabular-nums w-10" style={{ color: C.warning }}>{a.list.length}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium" style={{ color: C.text }}>
                    {a.topic.title}: {a.cat.label}
                  </span>
                  {a.cat.hint && <span className="block text-[11px]" style={{ color: C.textDim }}>{a.cat.hint}</span>}
                </span>
                <span className="text-[11px]" style={{ color: C.textDim }}>→</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div>
        <h2 className="text-[15px] font-semibold mb-1" style={{ color: C.text }}>Student choices</h2>
        <p className="text-[12px] mb-3" style={{ color: C.textFaint }}>
          How {rows.length} students answered each question that decides their numbers. Click a row to see the students.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TOPICS.map((t) => {
            const counts = Object.entries(t.categories)
              .map(([key, cat]) => ({ key, cat, list: classified.filter((x) => x.c[t.key].key === key) }))
              .filter((x) => x.list.length);
            const max = Math.max(1, ...counts.map((x) => x.list.length));
            return (
              <div key={t.key} className="rounded-xl border p-5" style={{ borderColor: C.border, background: C.panel }}>
                <h3 className="text-[13px] font-semibold mb-3" style={{ color: C.textMuted }}>{t.title}</h3>
                <div className="flex flex-col gap-1">
                  {counts.map(({ key, cat, list }) => {
                    const tone = toneColor(C, cat.tone);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => open(`${t.title} — ${cat.label}`, list, t.key)}
                        className="w-full text-start rounded-lg px-2 py-1.5 hover:opacity-80"
                        style={{ background: "transparent", border: "none", cursor: "pointer" }}
                      >
                        <div className="flex items-center justify-between gap-3 text-[12px]">
                          <span style={{ color: C.text }}>{cat.label}</span>
                          <span className="tabular-nums font-semibold" style={{ color: tone.fg }}>{list.length}</span>
                        </div>
                        <div className="mt-1 rounded-full overflow-hidden" style={{ background: C.border, height: 6 }}>
                          <div className="h-full rounded-full" style={{ width: `${(list.length / max) * 100}%`, background: tone.fg }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── One student ──────────────────────────────────────────────────────────────

export function StudentSummaryCard({ userId }: { userId: string }) {
  const C = useC();
  const [row, setRow] = useState<DecisionRow | null>(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadDecisions(userId).then(
      (r) => { if (!cancelled) setRow(r[0] ?? null); },
      (e: Error) => { if (!cancelled) setError(e.message); }
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const box = (children: React.ReactNode) => (
    <div className="rounded-xl border p-5 mb-4" style={{ borderColor: C.border, background: C.panel }}>
      <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: C.textDim }}>Student summary</h2>
      {children}
    </div>
  );
  if (error) return box(<p className="text-[13px]" style={{ color: C.danger }}>{error}</p>);
  if (!row) return box(<p className="text-[13px]" style={{ color: C.textFaint }}>Loading…</p>);

  const c = classify(row);
  const a = row.academic ?? {};
  const g = row.gamification;
  const t = row.term;
  const timeline = showAll ? row.decisions : row.decisions.slice(0, 12);
  const kv = (label: string, value: React.ReactNode) => (
    <div>
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.textFaint }}>{label}</div>
      <div className="text-[13px]" style={{ color: C.text, fontWeight: 500 }}>{value}</div>
    </div>
  );
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v ? v : "—");

  return box(
    <>
      {/* One line per topic: where this student stands */}
      <div className="flex flex-col gap-2 mb-5">
        {TOPICS.map((topic) => {
          const cls = c[topic.key];
          const cat = topic.categories[cls.key];
          const tone = toneColor(C, cat.tone);
          return (
            <div key={topic.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2" style={{ background: C.panel2 }}>
              <span className="text-[12px] w-40 shrink-0" style={{ color: C.textDim }}>{topic.title}</span>
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>
                {cat.label}
              </span>
              {cls.detail && <span dir="auto" className="text-[12px]" style={{ color: C.textMuted }}>{cls.detail}</span>}
              {cat.tone === "action" && cat.hint && <span className="text-[11px] ms-auto" style={{ color: C.warningText }}>{cat.hint}</span>}
            </div>
          );
        })}
      </div>

      {/* The rest of what they set */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {kv("University", <span dir="auto">{a.universityName || "—"}</span>)}
        {kv("Major · level", <span dir="auto">{[a.major, a.level && (/^\d{1,2}$/.test(a.level) ? `Level ${a.level}` : a.level)].filter(Boolean).join(" · ") || "—"}</span>)}
        {kv("Cumulative GPA", `${num(row.cumulativeGpa)}${row.cumulativeHours != null ? ` · ${row.cumulativeHours} h` : ""}`)}
        {kv("GPA shown / goal", `${row.gpaMode ?? "semester"} · goal ${num(row.gpaGoal)}`)}
        {kv("Repeated courses", row.repeats)}
        {kv("Courses with their own limit", row.ownLimits)}
        {kv("This term", t ? `${t.courses} courses · ${t.grades} grades · ${t.absences} absences` : "—")}
        {kv("Planner · timetable", t ? `${t.planner} · ${t.timetable}` : "—")}
        {kv("Past terms checked", row.pastTerms?.count ?? 0)}
        {kv("This term vs portal", row.termCheck?.answer ?? (row.termCheck?.snoozed ? "results not out yet" : "—"))}
        {kv("Language · theme", `${row.language ?? "default"} · ${row.theme ?? "default"}`)}
        {kv("XP · streak (best)", g ? `${num(g.xp)} · ${num(g.streak)} (${num(g.longest)})` : "—")}
        {kv("Badges · check-ins", g ? `${num(g.badges)} · ${num(g.checkIns)}` : "—")}
        {kv("Push devices", row.pushDevices)}
        {kv("Absence reports sent", row.policyReports.length ? row.policyReports.map((p) => `${p.scope}${p.course ? ` (${p.course})` : ""}: ${p.status}`).join(", ") : "—")}
        {kv("Joined · last active", `${fmtDateTime(row.joined)} · ${timeAgo(row.last_active_at)}`)}
      </div>

      {/* When they answered what */}
      <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.textDim }}>Their answers, newest first</div>
      {row.decisions.length === 0 ? (
        <p className="text-[13px]" style={{ color: C.textFaint }}>No answers recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {timeline.map((e, i) => (
            <div key={`${e.event}-${e.at}-${i}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: C.panel2 }}>
              <span className="text-[13px] min-w-0" style={{ color: C.text }}>
                {EVENT_LABEL[e.event] ?? e.event.replace(/_/g, " ")}
                {eventDetail(e) && <span dir="auto" className="ms-2 text-[12px]" style={{ color: C.textDim }}>{eventDetail(e)}</span>}
              </span>
              <span className="text-[11px] shrink-0" style={{ color: C.textDim }}>{fmtDateTime(e.at)}</span>
            </div>
          ))}
          {row.decisions.length > 12 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="self-start text-[12px] mt-1 underline" style={{ color: C.textMuted, background: "none", border: "none", cursor: "pointer" }}>
              {showAll ? "Show fewer" : `Show all ${row.decisions.length}`}
            </button>
          )}
        </div>
      )}
      <p className="text-[11px] mt-3" style={{ color: C.textFaint }}>
        Changes to the university, GPA system, absence rule, term dates and holidays are listed here from the update that records them;
        for anything earlier, the lines above show where the student stands now.
      </p>
    </>
  );
}
