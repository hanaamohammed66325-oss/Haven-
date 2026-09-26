// Calendars the admin published for universities outside Saudi Arabia
// (public.university_calendars): fetched for the student's own university and
// registered next to the ones in the code (lib/countryHolidays), so every
// screen that works out holidays picks them up the same way.

import { supabase } from "./supabase";
import {
  UNIVERSITY_HOLIDAYS,
  registerPublishedCalendar,
  type CountryHoliday,
  type PublishedCalendar,
} from "./countryHolidays";
import { calendarLookup, holidayCalendar, universityCountry } from "./universityCountry";

export interface CalendarRow {
  key: string;
  country: string;
  name_ar: string;
  name_en: string;
  academic_year: string;
  holidays: unknown;
  status: string;
  source: string;
  names?: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A row as the app's calendar, with bad holidays dropped. Each holiday's id
 *  comes from the calendar and its first day, so a student's "remove this
 *  holiday" still points at it after the admin edits another one. */
export function calendarFromRow(row: CalendarRow): PublishedCalendar | null {
  if (row.status !== "suggested" && row.status !== "verified") return null;
  const list = Array.isArray(row.holidays) ? row.holidays : [];
  const seen = new Map<string, number>();
  const holidays: CountryHoliday[] = list.flatMap((raw) => {
    const h = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (!h || typeof h.start !== "string" || typeof h.end !== "string" || !DATE.test(h.start) || !DATE.test(h.end) || h.end < h.start) return [];
    const nameAr = typeof h.name_ar === "string" ? h.name_ar.slice(0, 80) : "";
    const nameEn = typeof h.name_en === "string" ? h.name_en.slice(0, 80) : "";
    if (!nameAr && !nameEn) return [];
    const base = `${row.key}-${h.start}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return [{
      id: n ? `${base}-${n + 1}` : base,
      nameAr: nameAr || nameEn,
      nameEn: nameEn || nameAr,
      start: h.start,
      end: h.end,
      ...(h.estimated === true ? { estimated: true } : {}),
    }];
  });
  if (!holidays.length) return null;
  return {
    country: row.country,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    holidays,
    names: row.names ?? [],
    status: row.status === "verified" ? "verified" : "suggested",
    source: row.source === "official" ? "official" : "students",
  };
}

type Academic = { universitySlug?: string | null; universityName?: string | null } | null | undefined;

/** Whether a published calendar could apply: a typed university that isn't
 *  Saudi and whose own calendar isn't in the code. */
export function mayHavePublishedCalendar(academic: Academic): boolean {
  if (!academic?.universityName?.trim() || universityCountry(academic) === "SA") return false;
  return !UNIVERSITY_HOLIDAYS[holidayCalendar(academic)];
}

/** Fetch and register the published calendar for the student's university.
 *  Resolves to its key, or null when there's none (or it can't be reached). */
export async function loadPublishedCalendar(universityName: string): Promise<string | null> {
  const { slug, name } = calendarLookup(universityName);
  if (!slug && !name) return null;
  try {
    const { data, error } = await supabase.rpc("student_university_calendar", { p_slug: slug, p_name: name });
    if (error || !Array.isArray(data) || !data.length) return null;
    const row = data[0] as CalendarRow;
    const calendar = calendarFromRow({ ...row, names: name ? [name] : [] });
    if (!calendar) return null;
    registerPublishedCalendar(row.key, calendar);
    return row.key;
  } catch {
    return null;
  }
}
