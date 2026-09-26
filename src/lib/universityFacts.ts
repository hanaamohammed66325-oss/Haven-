// Reads a university's calendar facts (public.university_facts) and turns them
// into the semester defaults the setup window offers. Facts are either
// VERIFIED (approved by the admin) or SUGGESTED (on record but not approved yet:
// prepared from the official calendar, or from an unofficial source). A
// suggested calendar is offered as such and its students confirm or correct it
// (components/TermCheckCard); the admin approves it once 5 of them have. Nothing here guesses — a value missing
// from both is left for the student to enter.

import { supabase } from "./supabase";
import { SAUDI_HOLIDAYS } from "./holidays";
import { universityBySlug } from "./tools/universities";
import type { CustomHoliday } from "@/types";

export type Term = "first" | "second" | "summer";

export interface VerifiedFact {
  status?: "verified" | "suggested";
  verified_via?: "admin" | "crowd" | null;
  academic_year: string;
  term: Term;
  fact_key: string;
  value: { date?: string; pct?: number; name_ar?: string; name_en?: string; start?: string; end?: string };
}

export interface FactHoliday {
  nameAr: string;
  nameEn: string;
  startDate: string;
  endDate: string;
}

/** Everything the setup window can prefill, and where each value came from. */
export interface UniversityDefaults {
  /** the term these dates belong to, or null when none is on record yet */
  term: { year: string; term: Term } | null;
  /** official = the university's calendar · students = dates its students
   *  confirmed · suggested = an unofficial source, to be checked */
  kind: "official" | "students" | "suggested" | null;
  /** first day of finals, when known (to work out the teaching weeks) */
  finalsStart: string | null;
  startDate: string | null;
  endDate: string | null;
  /** calendar weeks from the first day of classes to the first exam day */
  weeks: number | null;
  finalsWeeks: number | null;
  denialPct: number;
  /** "official" = a verified fact; "typical" = the usual value for that university */
  denialSource: "official" | "typical" | "none";
  holidays: FactHoliday[];
}

const DAY_MS = 864e5;
const cache = new Map<string, Promise<VerifiedFact[]>>();

/** The student's university's verified and suggested facts (cached for the app
 *  session), read through student_university_facts: the values only. */
export function fetchUniversityFacts(slug: string): Promise<VerifiedFact[]> {
  let p = cache.get(slug);
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase.rpc("student_university_facts", { p_slug: slug });
      if (error) throw error;
      return (data ?? []) as VerifiedFact[];
    })().catch(() => {
      cache.delete(slug); // retry on the next ask instead of caching the failure
      return [];
    });
    cache.set(slug, p);
  }
  return p;
}

const days = (a: string, b: string) => Math.round((+new Date(b) - +new Date(a)) / DAY_MS);

/** Turn verified facts into semester defaults for the term that's running now
 *  (or the next one to start), falling back to the university's usual حرمان
 *  threshold when no official one is on record. */
export function defaultsFromFacts(
  facts: VerifiedFact[],
  slug: string | null,
  today = new Date().toISOString().slice(0, 10)
): UniversityDefaults {
  const byTerm = new Map<string, VerifiedFact[]>();
  for (const f of facts) {
    const k = `${f.academic_year}|${f.term}`;
    byTerm.set(k, [...(byTerm.get(k) ?? []), f]);
  }
  const get = (list: VerifiedFact[], key: string) => list.find((f) => f.fact_key === key);

  // Terms still running or upcoming, earliest first: both ends known, or — for
  // a suggested calendar — at least its finals.
  const terms = [...byTerm.entries()]
    .map(([k, list]) => ({
      k,
      list,
      start: get(list, "term_start")?.value.date,
      end: get(list, "term_end")?.value.date ?? get(list, "finals_end")?.value.date ?? get(list, "finals_start")?.value.date,
      suggested: list.some((f) => f.status === "suggested"),
    }))
    .filter((t): t is typeof t & { end: string } => !!t.end && (!!t.start || t.suggested) && t.end >= today)
    .sort((a, b) => (a.start ?? a.end).localeCompare(b.start ?? b.end));
  const cur = terms[0];

  const officialDenial = facts.find((f) => f.fact_key === "denial_pct" && f.status !== "suggested")?.value.pct;
  const typicalDenial = slug ? universityBySlug(slug)?.denialPct : undefined;
  const denialPct = officialDenial ?? typicalDenial ?? 25;
  const denialSource = officialDenial ? "official" : typicalDenial ? "typical" : "none";

  if (!cur) {
    return {
      term: null, kind: null, startDate: null, endDate: null, weeks: null, finalsWeeks: null, finalsStart: null,
      denialPct, denialSource, holidays: [],
    };
  }

  const [year, term] = cur.k.split("|") as [string, Term];
  const finalsStart = get(cur.list, "finals_start")?.value.date;
  const finalsEnd = get(cur.list, "finals_end")?.value.date;
  const weeks = finalsStart && cur.start ? Math.max(1, Math.round(days(cur.start, finalsStart) / 7)) : null;
  const finalsWeeks =
    finalsStart && finalsEnd ? Math.max(1, Math.ceil((days(finalsStart, finalsEnd) + 1) / 7)) : null;
  const holidays = cur.list
    .filter((f) => f.fact_key.startsWith("holiday:") && f.value.start && f.value.end)
    .map((f) => ({
      nameAr: f.value.name_ar ?? f.value.name_en ?? "",
      nameEn: f.value.name_en ?? f.value.name_ar ?? "",
      startDate: f.value.start!,
      endDate: f.value.end!,
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return {
    term: { year, term },
    kind: cur.suggested ? "suggested" : cur.list.some((f) => f.verified_via === "crowd") ? "students" : "official",
    finalsStart: finalsStart ?? null,
    startDate: cur.start ?? null,
    endDate: get(cur.list, "term_end")?.value.date ?? finalsEnd ?? null,
    weeks,
    finalsWeeks,
    denialPct,
    denialSource,
    holidays,
  };
}

export const UNI_HOLIDAY_PREFIX = "uni-";

/** Undoes applyOfficialHolidays when the student moves to another university:
 *  the old university's breaks are removed and the built-in holidays it turned
 *  off come back, so only the new university's country applies. Holidays the
 *  student added by hand stay. Null when there's nothing to undo. */
export function releaseUniversityHolidays(current: {
  dismissedHolidays?: string[];
  customHolidays?: CustomHoliday[];
}): { dismissedHolidays: string[]; customHolidays: CustomHoliday[] } | null {
  const custom = current.customHolidays ?? [];
  const own = custom.filter((h) => !h.id.startsWith(UNI_HOLIDAY_PREFIX));
  if (own.length === custom.length) return null;
  const builtIn = new Set(SAUDI_HOLIDAYS.map((h) => h.id));
  return {
    dismissedHolidays: (current.dismissedHolidays ?? []).filter((id) => !builtIn.has(id)),
    customHolidays: own,
  };
}

/** The holiday settings that make the attendance maths use the university's
 *  own official breaks: they're added as the student's holidays, and the
 *  generic built-in ones are turned off so nothing is deducted twice. With no
 *  official holidays the student's current setup is left untouched. */
export function applyOfficialHolidays(
  holidays: FactHoliday[],
  current: { dismissedHolidays?: string[]; customHolidays?: CustomHoliday[] },
  lang: "ar" | "en"
): { dismissedHolidays: string[]; customHolidays: CustomHoliday[] } | null {
  if (!holidays.length) return null;
  const own = (current.customHolidays ?? []).filter((h) => !h.id.startsWith(UNI_HOLIDAY_PREFIX));
  const official: CustomHoliday[] = holidays.map((h) => ({
    id: `${UNI_HOLIDAY_PREFIX}${h.startDate}`,
    name: lang === "en" ? h.nameEn : h.nameAr,
    startDate: h.startDate,
    endDate: h.endDate,
  }));
  const dismissed = new Set(current.dismissedHolidays ?? []);
  for (const h of SAUDI_HOLIDAYS) dismissed.add(h.id);
  return { dismissedHolidays: [...dismissed], customHolidays: [...own, ...official] };
}
