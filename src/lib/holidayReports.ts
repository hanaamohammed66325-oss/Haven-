// What students at universities outside Saudi Arabia told us about their
// holidays, grouped by university for the admin page (University facts →
// Holidays outside Saudi). Each student's holidays are worked out with the same
// code the app uses; what they removed from the suggestion and what they added
// are their report, and "confirm" (preferences.academic.holidayCheck) marks
// that they reviewed the list. 5 confirming with no change and fewer than 3
// changing it flags the calendar for the admin — nothing approves itself.

import { holidayCalendar, normalizeName, universityCountry } from "./universityCountry";
import {
  COUNTRY_HOLIDAYS,
  UNIVERSITY_HOLIDAYS,
  holidaysForCalendar,
  universityCalendar,
  type CountryHoliday,
} from "./countryHolidays";
import { matchCatalog } from "./gradeSchemes";
import { OFFICIAL_TERMS, termPeriod, type UniversityTerm } from "./universityTerms";

export interface HolidayReportRow {
  user_id: string;
  email: string | null;
  last_active_at: string | null;
  slug: string | null;
  name: string | null;
  check: unknown;
  dismissed: unknown;
  custom: unknown;
}

/** Whose holidays the student gets: their university's own calendar (in the
 *  code, or published from the admin page), their country's, or none we hold
 *  (a country without a list, or a name we can't place). */
export type CalendarKind = "university" | "published" | "country" | "none";

export interface AddedHoliday {
  name: string;
  start: string;
  end: string;
}

export interface StudentReport {
  row: HolidayReportRow;
  calendar: string;
  confirmed: boolean;
  removed: CountryHoliday[];
  added: AddedHoliday[];
}

export interface UniversityGroup {
  key: string;
  label: string;
  country: string | null;
  calendar: string;
  kind: CalendarKind;
  catalogSlug: string | null;
  /** the typed names (normalised) behind this group */
  names: string[];
  students: StudentReport[];
  /** confirmed without changing anything */
  agree: number;
  /** confirmed after removing or adding holidays */
  differ: number;
  flag: "ready" | "disputed" | null;
  removed: { holiday: CountryHoliday; count: number }[];
  added: { start: string; end: string; names: string[]; count: number }[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UNI_PREFIX = "uni-"; // holidays copied from a Saudi university's facts

function readAdded(raw: unknown): AddedHoliday[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((h) => {
    const o = h && typeof h === "object" ? (h as Record<string, unknown>) : null;
    if (!o || typeof o.startDate !== "string" || typeof o.endDate !== "string") return [];
    if (!DATE.test(o.startDate) || !DATE.test(o.endDate) || o.endDate < o.startDate) return [];
    if (typeof o.id === "string" && o.id.startsWith(UNI_PREFIX)) return [];
    return [{ name: typeof o.name === "string" ? o.name.trim().slice(0, 80) : "", start: o.startDate, end: o.endDate }];
  });
}

function calendarKind(calendar: string, country: string | null): CalendarKind {
  if (UNIVERSITY_HOLIDAYS[calendar]) return "university";
  if (universityCalendar(calendar)) return "published";
  if (country && calendar === country && COUNTRY_HOLIDAYS[calendar]?.length) return "country";
  return "none";
}

export const isChanged = (s: StudentReport) => s.removed.length > 0 || s.added.length > 0;

/** Every non-Saudi student with a typed university, grouped by university:
 *  flagged ones first, then by how many students each has. */
export function groupHolidayReports(rows: HolidayReportRow[]): UniversityGroup[] {
  const groups = new Map<string, UniversityGroup & { typed: Map<string, number> }>();
  for (const row of rows) {
    const name = row.name?.trim() ?? "";
    if (!name) continue;
    const academic = { universitySlug: row.slug, universityName: name };
    const country = universityCountry(academic);
    if (country === "SA") continue;
    const calendar = holidayCalendar(academic);
    const kind = calendarKind(calendar, country);
    const catalog = matchCatalog(name);
    const typedKey = normalizeName(name);
    const key = kind === "university" || kind === "published" ? calendar : catalog?.slug ?? `typed:${typedKey}`;

    const check = row.check && typeof row.check === "object" ? (row.check as Record<string, unknown>) : null;
    const dismissed = new Set(Array.isArray(row.dismissed) ? row.dismissed.filter((x): x is string => typeof x === "string") : []);
    const report: StudentReport = {
      row,
      calendar,
      confirmed: check?.calendar === calendar,
      removed: holidaysForCalendar(calendar).filter((h) => dismissed.has(h.id)),
      added: readAdded(row.custom),
    };

    let g = groups.get(key);
    if (!g) {
      const own = universityCalendar(calendar);
      g = {
        key,
        label: own?.nameAr ?? catalog?.ar ?? name,
        country: own?.country ?? country,
        calendar,
        kind,
        catalogSlug: catalog?.slug ?? null,
        names: [],
        students: [],
        agree: 0,
        differ: 0,
        flag: null,
        removed: [],
        added: [],
        typed: new Map(),
      };
      groups.set(key, g);
    }
    g.students.push(report);
    g.typed.set(typedKey, (g.typed.get(typedKey) ?? 0) + 1);
  }

  const out: UniversityGroup[] = [];
  for (const { typed, ...g } of groups.values()) {
    g.names = [...typed.keys()].filter(Boolean);
    // With no calendar of its own, the name most students typed.
    if (g.kind !== "university" && g.kind !== "published" && !g.catalogSlug) {
      const top = [...typed.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const typedName = g.students.find((s) => normalizeName(s.row.name ?? "") === top)?.row.name?.trim();
      if (typedName) g.label = typedName;
    }
    const confirmed = g.students.filter((s) => s.confirmed);
    g.agree = confirmed.filter((s) => !isChanged(s)).length;
    g.differ = confirmed.length - g.agree;
    g.flag = g.differ >= 3 ? "disputed" : g.agree >= 5 ? "ready" : null;

    const removed = new Map<string, { holiday: CountryHoliday; count: number }>();
    const added = new Map<string, { start: string; end: string; names: string[]; count: number }>();
    for (const s of g.students) {
      for (const h of s.removed) {
        const r = removed.get(h.id) ?? { holiday: h, count: 0 };
        r.count++;
        removed.set(h.id, r);
      }
      for (const h of s.added) {
        const k = `${h.start}|${h.end}`;
        const a = added.get(k) ?? { start: h.start, end: h.end, names: [], count: 0 };
        a.count++;
        if (h.name && !a.names.includes(h.name)) a.names.push(h.name);
        added.set(k, a);
      }
    }
    g.removed = [...removed.values()].sort((a, b) => b.count - a.count);
    g.added = [...added.values()].sort((a, b) => b.count - a.count || a.start.localeCompare(b.start));
    out.push(g);
  }
  const rank = (g: UniversityGroup) => (g.flag ? 1 : 0);
  return out.sort((a, b) => rank(b) - rank(a) || b.students.length - a.students.length || a.label.localeCompare(b.label));
}

export interface DraftHoliday {
  nameAr: string;
  nameEn: string;
  start: string;
  end: string;
  estimated?: boolean;
  /** how many students removed it (a suggested one) or added it (theirs) */
  count: number;
  from: "calendar" | "students";
  include: boolean;
}

/** A starting point for publishing a group's calendar: the holidays it gets
 *  now, left out when most of its students who changed anything removed them,
 *  plus the ones 2 or more students added. The admin reviews every line. */
export function draftCalendar(g: UniversityGroup): DraftHoliday[] {
  const changed = g.students.filter(isChanged).length;
  const removedCount = new Map(g.removed.map((r) => [r.holiday.id, r.count]));
  const current: DraftHoliday[] = holidaysForCalendar(g.calendar).map((h) => {
    const count = removedCount.get(h.id) ?? 0;
    return {
      nameAr: h.nameAr,
      nameEn: h.nameEn,
      start: h.start,
      end: h.end,
      ...(h.estimated ? { estimated: true } : {}),
      count,
      from: "calendar",
      include: !(count >= 2 && count * 2 > changed),
    };
  });
  const theirs: DraftHoliday[] = g.added.map((a) => ({
    nameAr: a.names[0] ?? "",
    nameEn: a.names[0] ?? "",
    start: a.start,
    end: a.end,
    count: a.count,
    from: "students",
    include: a.count >= 2,
  }));
  return [...current, ...theirs].sort((a, b) => a.start.localeCompare(b.start));
}

/** A key for a university outside the catalogue, from its English name. */
export function calendarKeyFromName(nameEn: string): string {
  return nameEn
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

// ── Students' answers about a university's term dates ─────────────────────
// After its official term dates were put on their semester (lib/universityTerms),
// a student confirms or corrects them (TermCheckCard → crowd_votes, subject
// "calendar"). Counted against the official dates; 3 differing flags the term
// so the admin re-checks the university's calendar.

export interface TermVote {
  university_slug: string;
  period: string;
  answer: { start?: string; finals_start?: string; end?: string; kept_own?: boolean };
}

export interface TermTally {
  term: UniversityTerm;
  agree: number;
  differ: number;
  /** of those differing, how many took back their own earlier dates */
  keptOwn: number;
  /** the differing dates students gave, most common first */
  answers: { start: string; finals: string; end: string; n: number }[];
  disputed: boolean;
}

export function termTallies(key: string, votes: TermVote[]): TermTally[] {
  return (OFFICIAL_TERMS[key] ?? []).flatMap((term) => {
    const vs = votes.filter((v) => v.university_slug === key && v.period === termPeriod(term));
    if (!vs.length) return [];
    const same = (v: TermVote) =>
      !v.answer.kept_own && v.answer.start === term.start && v.answer.finals_start === term.finalsStart && (v.answer.end ?? term.end) === term.end;
    const differing = vs.filter((v) => !same(v));
    const counts = new Map<string, number>();
    for (const v of differing) {
      const k = `${v.answer.start ?? ""}|${v.answer.finals_start ?? ""}|${v.answer.end ?? ""}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const answers = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => {
        const [start, finals, end] = k.split("|");
        return { start, finals, end, n };
      });
    return [
      {
        term,
        agree: vs.length - differing.length,
        differ: differing.length,
        keptOwn: differing.filter((v) => v.answer.kept_own).length,
        answers,
        disputed: differing.length >= 3,
      },
    ];
  });
}
