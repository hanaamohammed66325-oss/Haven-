// The term dates students set when their university has no calendar on record
// (the note in components/TermCheckCard), grouped by university for the admin
// page (University facts → Term dates students set). Read through
// admin_term_date_reports(): each student's university and active semester.

import { termCalendarKey } from "./universityTerms";
import { normalizeName, universityCountry } from "./universityCountry";
import { universityBySlug } from "./tools/universities";

export interface TermDateRow {
  user_id: string;
  last_active_at: string | null;
  slug: string | null;
  name: string | null;
  /** preferences.setupConfirmed.termAnswered */
  answered: string | null;
  start_date: string | null;
  end_date: string | null;
  teaching_weeks: number | null;
  finals_weeks: number | null;
}

export interface StudentTermDates {
  row: TermDateRow;
  start: string;
  /** first day of finals: the start plus the teaching weeks */
  finals: string;
  end: string;
  /** answered the note: added their dates, or said theirs are right */
  confirmed: boolean;
  /** still the sign-up placeholder (13 + 2 weeks from the sign-up day) */
  placeholder: boolean;
}

export interface TermDateGroup {
  key: string;
  label: string;
  country: string | null;
  students: StudentTermDates[];
  /** the dates students gave, most common first (placeholders left out) */
  dates: { start: string; finals: string; end: string; n: number; confirmed: number }[];
}

const DAY_MS = 864e5;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const plusDays = (iso: string, n: number) => new Date(+new Date(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Students without a calendar on record, grouped by university: the most
 *  students first. A Saudi university counts only once its student answered
 *  the note (it has no calendar in the facts engine then). */
export function groupTermDateReports(rows: TermDateRow[]): TermDateGroup[] {
  const groups = new Map<string, TermDateGroup>();
  for (const row of rows) {
    const academic = { universitySlug: row.slug, universityName: row.name };
    const cal = termCalendarKey(academic);
    const noted = !!row.answered?.startsWith("none|");
    if (cal && (!cal.saudi || !noted)) continue;
    if (!row.start_date || !row.end_date || !DATE.test(row.start_date) || !DATE.test(row.end_date)) continue;

    const weeks = Math.max(1, Math.round(Number(row.teaching_weeks) || 0));
    const span = Math.round((+new Date(row.end_date) - +new Date(row.start_date)) / DAY_MS);
    const student: StudentTermDates = {
      row,
      start: row.start_date,
      finals: plusDays(row.start_date, weeks * 7),
      end: row.end_date,
      confirmed: noted,
      placeholder: weeks === 13 && Number(row.finals_weeks) === 2 && span === 105,
    };

    const known = cal ? universityBySlug(cal.key) : undefined;
    const key = cal?.key ?? `typed:${normalizeName(row.name ?? "")}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, label: known?.name ?? row.name?.trim() ?? key, country: known ? "SA" : universityCountry(academic), students: [], dates: [] };
      groups.set(key, g);
    }
    g.students.push(student);
  }

  for (const g of groups.values()) {
    const counts = new Map<string, { start: string; finals: string; end: string; n: number; confirmed: number }>();
    for (const s of g.students) {
      if (s.placeholder) continue;
      const k = `${s.start}|${s.finals}|${s.end}`;
      const c = counts.get(k) ?? { start: s.start, finals: s.finals, end: s.end, n: 0, confirmed: 0 };
      c.n += 1;
      if (s.confirmed) c.confirmed += 1;
      counts.set(k, c);
    }
    g.dates = [...counts.values()].sort((a, b) => b.n - a.n || b.confirmed - a.confirmed);
  }
  return [...groups.values()].sort((a, b) => b.students.length - a.students.length || a.label.localeCompare(b.label));
}
