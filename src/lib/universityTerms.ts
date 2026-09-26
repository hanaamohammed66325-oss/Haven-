// The term dates each student's semester should carry, by university:
//   - a Saudi university: its calendar in the facts engine (lib/universityFacts);
//   - a university outside Saudi whose official 2026-2027 calendar we've read
//     (OFFICIAL_TERMS below — the same keys as UNIVERSITY_HOLIDAYS).
// A complete official term is put on the semester automatically, then a card
// asks whether it's right; a term on record only in part (or only suggested)
// is shown for the student to complete; a university with no calendar on
// record gets a clear note to add their own dates. Answers reach the admin
// (crowd_votes).
//
// Undergraduate dates. `finalsStart` = first day of the final exams; `end` =
// the last exam day (or the day the university says the term ends).
// Sources, each read from the university's own calendar:
//   Qatar University 2026/2027 academic calendar.
//   University of Sharjah 2026/2027 academic calendar.
//   American University in Dubai 2026-2027 (updated 14 July 2026).
//   Khalifa University academic calendar 2026-2027.
//   American University of Sharjah undergraduate 2026–2027 (updated 3 Sept 2026).
//   Ajman University 2026-2027 (Office of the Registrar).
//   Abu Dhabi University academic year 2026-2027.
//   American University of Beirut university calendar 2026-2027 (4 Sept 2026).
//   The American University in Cairo 2026-2027 (updated 5 Aug 2026).
//   Palestine Technical University – Kadoorie 2026-2027 (ptuk.edu.ps): the
//   practical finals week still teaches, so finals start with the written ones.

import { holidayCalendar, normalizeName } from "./universityCountry";
import { matchUniversityByName } from "./gradeSchemes";
import { universityBySlug } from "./tools/universities";
import type { FactHoliday, VerifiedFact } from "./universityFacts";
import type { Semester } from "@/types";

export type TermName = "first" | "second" | "summer";

export interface UniversityTerm {
  year: string;
  term: TermName;
  start: string;
  finalsStart: string;
  end: string;
}

const y = "2026-2027";
const terms = (first: [string, string, string], second: [string, string, string]): UniversityTerm[] => [
  { year: y, term: "first", start: first[0], finalsStart: first[1], end: first[2] },
  { year: y, term: "second", start: second[0], finalsStart: second[1], end: second[2] },
];

export const OFFICIAL_TERMS: Record<string, UniversityTerm[]> = {
  "qatar-university": terms(["2026-08-23", "2026-12-06", "2026-12-17"], ["2027-01-17", "2027-05-09", "2027-05-27"]),
  "university-of-sharjah": terms(["2026-08-24", "2026-12-05", "2026-12-15"], ["2027-01-11", "2027-05-01", "2027-05-11"]),
  "american-university-in-dubai": terms(["2026-09-01", "2026-12-14", "2026-12-18"], ["2027-01-11", "2027-04-26", "2027-04-30"]),
  "khalifa-university": terms(["2026-08-24", "2026-12-09", "2026-12-17"], ["2027-01-11", "2027-05-06", "2027-05-14"]),
  "american-university-of-sharjah": terms(["2026-08-24", "2026-11-28", "2026-12-10"], ["2027-01-11", "2027-05-02", "2027-05-12"]),
  "ajman-university": terms(["2026-08-31", "2026-12-11", "2026-12-19"], ["2027-01-11", "2027-05-01", "2027-05-09"]),
  "abu-dhabi-university": terms(["2026-08-31", "2026-11-30", "2026-12-12"], ["2027-02-22", "2027-06-05", "2027-06-16"]),
  "american-university-of-beirut": terms(["2026-08-31", "2026-12-09", "2026-12-18"], ["2027-01-13", "2027-05-04", "2027-05-13"]),
  "the-american-university-in-cairo": terms(["2026-09-06", "2026-12-14", "2026-12-20"], ["2027-01-31", "2027-05-30", "2027-06-05"]),
  ptuk: terms(["2026-09-13", "2026-12-20", "2027-01-16"], ["2027-01-24", "2027-05-09", "2027-06-13"]),
};

const DAY_MS = 864e5;
const days = (a: string, b: string) => Math.round((+new Date(b) - +new Date(a)) / DAY_MS);

/** A term as far as it's on record: complete for the calendars above, maybe
 *  partial (or only suggested) in the facts engine. */
export interface KnownTerm {
  year: string;
  term: TermName;
  start?: string;
  finalsStart?: string;
  end?: string;
  /** not approved yet (lib/universityFacts) */
  suggested?: boolean;
  /** the university's official breaks in this term (facts engine) */
  holidays?: FactHoliday[];
}

const lastDay = (t: KnownTerm) => t.end ?? t.finalsStart ?? t.start ?? "";

/** The term running on `today`, or the next one to start; null when none is left. */
export function pickTerm<T extends KnownTerm>(list: T[], today: string): T | null {
  return (
    list
      .filter((t) => lastDay(t) >= today)
      .sort((a, b) => (a.start ?? lastDay(a)).localeCompare(b.start ?? lastDay(b)))[0] ?? null
  );
}

export const currentTerm = (key: string, today: string): UniversityTerm | null => pickTerm(OFFICIAL_TERMS[key] ?? [], today);

export const termId = (key: string, t: KnownTerm) => `${key}|${t.year}|${t.term}`;

/** The vote period for crowd_votes ("2026-2027|first"). */
export const termPeriod = (t: KnownTerm) => `${t.year}|${t.term}`;

export type TermDates = Pick<Semester, "startDate" | "endDate" | "weeks" | "finalsWeeks">;

/** The semester fields a term sets: its dates, the teaching weeks up to the
 *  first exam day, and the exam weeks. */
export function termDates(t: Pick<UniversityTerm, "start" | "finalsStart" | "end">): TermDates {
  return {
    startDate: t.start,
    endDate: t.end,
    weeks: Math.max(1, Math.round(days(t.start, t.finalsStart) / 7)),
    finalsWeeks: Math.max(1, Math.ceil((days(t.finalsStart, t.end) + 1) / 7)),
  };
}

const isComplete = (t: KnownTerm): t is KnownTerm & UniversityTerm =>
  !t.suggested && !!t.start && !!t.finalsStart && !!t.end && t.start < t.finalsStart && t.finalsStart <= t.end;

/** A Saudi university's terms from its facts (approved and suggested). */
export function termsFromFacts(facts: VerifiedFact[]): KnownTerm[] {
  const byTerm = new Map<string, VerifiedFact[]>();
  for (const f of facts) {
    const k = `${f.academic_year}|${f.term}`;
    byTerm.set(k, [...(byTerm.get(k) ?? []), f]);
  }
  return [...byTerm.entries()].flatMap(([k, list]) => {
    const [year, term] = k.split("|") as [string, TermName];
    const date = (key: string) => list.find((f) => f.fact_key === key)?.value.date;
    const t: KnownTerm = {
      year,
      term,
      start: date("term_start"),
      finalsStart: date("finals_start"),
      end: date("term_end") ?? date("finals_end"),
      suggested: list.some((f) => f.status === "suggested"),
      holidays: list
        .filter((f) => f.fact_key.startsWith("holiday:") && f.value.start && f.value.end)
        .map((f) => ({
          nameAr: f.value.name_ar ?? f.value.name_en ?? "",
          nameEn: f.value.name_en ?? f.value.name_ar ?? "",
          startDate: f.value.start!,
          endDate: f.value.end!,
        }))
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    };
    return t.start || t.finalsStart || t.end ? [t] : [];
  });
}

type Academic = { universitySlug?: string | null; universityName?: string | null } | null | undefined;

/** Whose calendar holds the student's term dates: a Saudi university (its
 *  slug, picked or matched from the typed name) or one outside Saudi whose
 *  calendar is above; null for any other university. */
export function termCalendarKey(academic: Academic): { key: string; saudi: boolean } | null {
  const slug = academic?.universitySlug;
  if (slug && slug !== "other" && universityBySlug(slug)) return { key: slug, saudi: true };
  const place = holidayCalendar(academic);
  if (OFFICIAL_TERMS[place]) return { key: place, saudi: false };
  const typed = academic?.universityName?.trim();
  const saudi = place === "SA" && typed ? matchUniversityByName(typed) : undefined;
  return saudi ? { key: saudi.slug, saudi: true } : null;
}

/** What to do about the student's term dates now:
 *  official   — a complete official term: put it on the semester, then ask;
 *  incomplete — a term on record in part, or only suggested: the student completes it;
 *  unknown    — no calendar on record for their university: they add their own dates.
 *  Null when no university is set. */
export type TermPlan =
  | { status: "official"; key: string; id: string; term: KnownTerm & UniversityTerm }
  | { status: "incomplete"; key: string; id: string; term: KnownTerm }
  | { status: "unknown"; key: string | null; id: string };

/** `facts` = the Saudi university's facts (unused for the calendars above). */
export function termPlan(academic: Academic, facts: VerifiedFact[] | null, today: string): TermPlan | null {
  const cal = termCalendarKey(academic);
  if (cal) {
    const t = pickTerm<KnownTerm>(cal.saudi ? termsFromFacts(facts ?? []) : OFFICIAL_TERMS[cal.key], today);
    if (!t) return { status: "unknown", key: cal.key, id: `none|${cal.key}` };
    const id = termId(cal.key, t);
    return isComplete(t) ? { status: "official", key: cal.key, id, term: t } : { status: "incomplete", key: cal.key, id, term: t };
  }
  const name = normalizeName(academic?.universityName ?? "");
  return name ? { status: "unknown", key: null, id: `none|${name}`.slice(0, 120) } : null;
}

/** Start and end of a term of the calendars above by its id — for state saved
 *  before the applied dates were kept alongside it. */
function codeTermDates(id: string | undefined): { start: string; end: string } | null {
  const [key, year, name] = (id ?? "").split("|");
  const t = (OFFICIAL_TERMS[key] ?? []).find((x) => x.year === year && x.term === name);
  return t ? { start: t.start, end: t.end } : null;
}

export interface AppliedState {
  /** the term id last applied */
  applied?: string;
  /** that term's start and end */
  appliedDates?: { start: string; end: string };
  /** the semester's dates from before the first automatic change */
  prev?: TermDates;
  placeholder: boolean;
}

const untouched = (sem: TermDates, state: AppliedState) => {
  const before = state.appliedDates ?? codeTermDates(state.applied);
  return !!before && sem.startDate === before.start && sem.endDate === before.end;
};

/**
 * The official term to put on the student's semester now, or null. Applied
 * once per university and term (`applied` = the id last applied): moving to
 * another university — or a new term starting — applies again, while the
 * student's own edits after that are left alone. `prev` is what the semester
 * held before, so the student can take it back; when the dates on it came
 * from an earlier automatic change, the ones from before that are kept.
 */
export function termToApply(
  plan: TermPlan | null,
  semester: TermDates,
  state: AppliedState,
): { id: string; dates: TermDates; appliedDates: { start: string; end: string }; prev: TermDates | null } | null {
  if (plan?.status !== "official" || state.applied === plan.id) return null;
  const prev =
    state.applied && untouched(semester, state)
      ? (state.prev ?? null)
      : state.placeholder
        ? null
        : { startDate: semester.startDate, endDate: semester.endDate, weeks: semester.weeks, finalsWeeks: semester.finalsWeeks };
  return { id: plan.id, dates: termDates(plan.term), appliedDates: { start: plan.term.start, end: plan.term.end }, prev };
}

/**
 * The student moved from a university whose term was applied to one without a
 * complete official term: the other university's dates mustn't stay as if they
 * were theirs. Untouched since, the dates from before the change come back
 * (when there were any); either way the applied term is forgotten, so the note
 * asking for their own dates shows. Null = nothing to do.
 */
export function termToRelease(plan: TermPlan | null, semester: TermDates, state: AppliedState): { restore: TermDates | null } | null {
  if (!state.applied || plan?.status === "official") return null;
  const movedAway = !plan || plan.key !== state.applied.split("|")[0];
  return { restore: movedAway && untouched(semester, state) ? (state.prev ?? null) : null };
}
