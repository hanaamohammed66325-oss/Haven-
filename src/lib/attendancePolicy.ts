// Attendance (حرمان) policies — how a university counts absence, read from its
// OFFICIAL regulation (public.attendance_policies). The Saudi unified
// regulation (CUA 1444, Art. 14–15) leaves the percentage to each university
// council, so Haven never assumes one number. A rule prepared from the
// university's documents reaches students as a suggestion before an admin has
// approved it, and no percentage is shown until the student confirms it. Each
// confirmation is a vote (crowd_votes): 5 agreeing students approve it.

import { supabase } from "./supabase";
import { fmtPct } from "./format";

export type PolicyMethod = "hours" | "lectures" | "count" | "none" | "unspecified";
export type PolicyStatus = "verified" | "review" | "rejected";

export interface PolicySource {
  url: string;
  title?: string;
  quote?: string;
}

export interface AttendancePolicy {
  id: string;
  university_slug: string;
  university_name: string | null;
  country: string;
  scope: "university" | "college" | "program";
  scope_name: string | null;
  method: PolicyMethod;
  /** denial above this % of absence (excused included unless `excused_counts` is false) */
  max_absence: number | null;
  /** a separate, lower limit for absence WITHOUT an accepted excuse */
  max_unexcused: number | null;
  excused_counts: boolean;
  /** with an accepted excuse the college may lift the denial while attendance stays at or above this % */
  excuse_floor_attendance: number | null;
  /** theory / practical / clinical are each held to the limit on their own */
  separate_components: boolean | null;
  component_limits: Record<string, number> | null;
  warnings: number[];
  late_rule: string | null;
  /** rules the calculator can't apply yet (per-college limits, count rules…) */
  details: Record<string, unknown>;
  effective: string | null;
  sources: PolicySource[];
  note: string | null;
  status: PolicyStatus;
  last_verified: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
}

/** What a student told us about their university's (or one course's) rule. */
export interface PolicyAnswers {
  max_absence?: number | null;
  method?: PolicyMethod;
  excused_counts?: boolean;
  max_unexcused?: number | null;
  late_rule?: string | null;
  note?: string | null;
}

export interface PolicyReport {
  id: string;
  user_id: string;
  university_slug: string | null;
  university_name: string | null;
  country: string | null;
  scope: "university" | "course";
  course_name: string | null;
  answers: PolicyAnswers;
  regulation_url: string | null;
  status: "pending" | "accepted" | "rejected" | "personal";
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const COMPONENT_AR: Record<string, string> = {
  clinical: "السريري",
  practical: "العملي",
  lab: "المعامل",
  lecture: "النظري",
  stage_total_including_excused: "التدريب الميداني (مع الأعذار)",
  TD_TP_min_attendance: "حضور الأعمال الموجهة والتطبيقية (حد أدنى)",
};

const METHOD_AR: Record<PolicyMethod, string> = {
  hours: "تُحسب النسبة من ساعات المادة",
  lectures: "تُحسب النسبة بعدد المحاضرات",
  count: "يُحسب بعدد الغيابات، مو بالنسبة",
  none: "ما فيه حرمان بسبب الغياب",
  unspecified: "اللائحة ما تحدد إذا الحساب بالساعات أو بالمحاضرات",
};

const pct = (n: number) => `${fmtPct(n)}%`;
const joinAr = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join("، ")} و${xs[xs.length - 1]}`);

/** A policy (or a student's answers) as short Arabic lines a student can read. */
export function describePolicyAr(p: Pick<AttendancePolicy, "method" | "max_absence" | "max_unexcused" | "excused_counts"> & Partial<AttendancePolicy>): string[] {
  const lines: string[] = [METHOD_AR[p.method] ?? METHOD_AR.unspecified];
  const max = p.max_absence ?? null;
  const unexc = p.max_unexcused ?? null;
  if (p.method !== "none" && p.method !== "count") {
    if (unexc != null && max != null && unexc !== max) {
      const verb = p.details?.limit_inclusive === true ? "وصل" : "تجاوز";
      lines.push(`الحرمان إذا ${verb} الغياب بدون عذر ${pct(unexc)}، أو ${verb} الغياب كله مع الأعذار ${pct(max)}`);
    } else if (!p.excused_counts && (unexc ?? max) != null) {
      lines.push(`الحرمان إذا تجاوز الغياب بدون عذر ${pct((unexc ?? max) as number)}، والغياب بعذر ما يُحسب منها`);
    } else if (max != null) {
      const reach = p.details?.limit_inclusive === true;
      lines.push(`الحرمان إذا ${reach ? "وصل" : "تجاوز"} الغياب ${pct(max)}${p.excused_counts ? "، والغياب بعذر يُحسب منها" : ""}`);
    } else if (unexc != null) {
      lines.push(`الحرمان إذا تجاوز الغياب بدون عذر ${pct(unexc)}`);
    }
  }
  if (p.excuse_floor_attendance != null) {
    lines.push(`مع العذر المقبول تقدر الكلية ترفع الحرمان إذا ما قل الحضور عن ${pct(p.excuse_floor_attendance)}`);
  }
  if (p.separate_components) lines.push("النظري والعملي (والسريري) كل واحد يُحسب لحاله");
  if (p.component_limits) {
    for (const [k, v] of Object.entries(p.component_limits)) lines.push(`${COMPONENT_AR[k] ?? k}: ${pct(v)}`);
  }
  if (p.warnings?.length) lines.push(`إنذارات عند ${joinAr(p.warnings.map(pct))}`);
  if (p.late_rule) lines.push(`التأخير: ${p.late_rule}`);
  return lines;
}

/** Old or conflicting sources are flagged so they're checked before approval. */
export function policyFlags(p: Pick<AttendancePolicy, "effective" | "note">): ("old" | "conflict" | "verify")[] {
  const f: ("old" | "conflict" | "verify")[] = [];
  const eff = (p.effective ?? "").toUpperCase();
  const note = (p.note ?? "").toUpperCase();
  if (eff.includes("UNKNOWN") || eff.includes("OLD") || note.includes("OLD-REGULATION")) f.push("old");
  if (note.includes("CONFLICT")) f.push("conflict");
  if (note.includes("VERIFY")) f.push("verify");
  return f;
}

/** Send a student's answer to the admin review queue. The answer already
 *  applies to the student in the app; this only asks for it to be reviewed
 *  (and, with an official regulation link, approved for the whole university). */
export async function submitPolicyReport(r: {
  universitySlug: string | null;
  universityName: string | null;
  scope: "university" | "course";
  courseName?: string | null;
  answers: PolicyAnswers;
  regulationUrl?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("attendance_policy_reports").insert({
    university_slug: r.universitySlug,
    university_name: r.universityName,
    scope: r.scope,
    course_name: r.courseName ?? null,
    answers: r.answers,
    regulation_url: r.regulationUrl || null,
  });
  if (error) throw error;
}

/** Where a rule came from, as the student is told:
 *  official = approved by an admin · document = read from the university's
 *  documents, not approved yet · students = agreed by the university's students. */
export type PolicyKind = "official" | "document" | "students";

/** A second rule for the university as its students describe it, shown
 *  beside the main one for the student to pick (details.alternative). */
export const isStudentAlternative = (p: Pick<AttendancePolicy, "details">): boolean => p.details?.alternative === true;

export function policyKind(p: Pick<AttendancePolicy, "status" | "details">): PolicyKind {
  if (p.details?.crowd === true || p.details?.auto_verified === true) return "students";
  return p.status === "verified" ? "official" : "document";
}

/** The rule itself (limits + how they're counted), so a confirmation is asked
 *  again only when the rule changes — not when the row is merely approved. */
export function policyRuleKey(p: Pick<AttendancePolicy, "method" | "max_absence" | "max_unexcused" | "excused_counts">): string {
  return p.excused_counts
    ? `${p.method}|${p.max_absence ?? ""}|${p.max_unexcused ?? ""}|1`
    : `${p.method}|${p.max_unexcused ?? p.max_absence ?? ""}||0`;
}

export const policyAckKey = (p: AttendancePolicy) => `${p.id}:${policyRuleKey(p)}`;

export interface RuleAnswer {
  method: string;
  max_absence: number | null;
  max_unexcused: number | null;
  excused_counts: boolean;
}

/** A student's answer about their university's rule or calendar, one per
 *  student and subject (a later answer replaces the earlier one). */
export async function submitVote(v: {
  subject: "attendance" | "calendar";
  universitySlug: string;
  period?: string;
  agrees: boolean;
  answer: RuleAnswer | { start: string; finals_start: string; end?: string; kept_own?: boolean };
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { error } = await supabase.from("crowd_votes").upsert(
    {
      user_id: auth.user.id,
      subject: v.subject,
      university_slug: v.universitySlug,
      period: v.period ?? "",
      agrees: v.agrees,
      answer: v.answer,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,subject,university_slug,period" }
  );
  if (error) throw error;
}

const cache = new Map<string, Promise<AttendancePolicy[]>>();

/** The university's university-wide rules: the main one first (the approved
 *  one, else the one waiting for approval, shown as a suggestion), then any
 *  rule its students describe (isStudentAlternative). Empty when none is on
 *  record; cached for the app session. Read through student_attendance_policy:
 *  only the rules themselves; where they were found stays with the admin. */
export function fetchUniversityPolicies(slug: string): Promise<AttendancePolicy[]> {
  let p = cache.get(slug);
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase.rpc("student_attendance_policy", { p_slug: slug });
      if (error) throw error;
      return (data ?? []) as AttendancePolicy[];
    })().catch(() => {
      cache.delete(slug);
      return [];
    });
    cache.set(slug, p);
  }
  return p;
}
