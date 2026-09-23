import { hijriParts, addDays, toISODate } from "./dates";
import type { CustomHoliday } from "@/types";

export interface HolidayDef {
  id: string;
  nameAr: string;
  nameEn: string;
  type: "gregorian" | "hijri-anchor" | "nth-weekday";
  gregorianMonth?: number; // 0-based (0=Jan)
  gregorianDay?: number;
  durationDays: number;
  // For hijri-anchor holidays: anchor is the Eid day itself,
  // daysBefore/daysAfter define the university break around it.
  anchorHijriMonth?: number;
  anchorHijriDay?: number;
  daysBefore?: number;
  daysAfter?: number;
  // For nth-weekday holidays (a floating academic break that must track a
  // weekday, not a fixed date): the break starts on the `occurrence`-th
  // `weekday` of `gregorianMonth`. weekday: 0=Sun … 6=Sat.
  weekday?: number;
  occurrence?: number;
}

export interface ResolvedHoliday {
  id: string;
  nameAr: string;
  nameEn: string;
  startDate: string;
  endDate: string;
  durationDays: number;
}

// The Saudi national baseline calendar — the holidays that are OFFICIAL and
// UNIVERSAL across every Saudi university, so they are safe to apply to everyone:
//   • national-day / founding-day — kingdom-wide public holidays (fixed dates).
//   • eid-fitr / eid-adha — religious, anchored on the actual Eid day (hijri).
//   • fall-break — the common mid-first-term break; weekday-anchored so it tracks
//     the calendar instead of drifting. A university without one (or with it on
//     other dates) is handled by the student dismissing/adding via the UI, which
//     is the honest fix for per-university variance we can't verify for all ~45.
// Eid breaks anchor on the actual Eid day; daysBefore/daysAfter define the break
// window around it. Gregorian holidays use fixed dates.
export const SAUDI_HOLIDAYS: HolidayDef[] = [
  {
    id: "national-day",
    nameAr: "اليوم الوطني",
    nameEn: "National Day",
    type: "gregorian",
    gregorianMonth: 8, // September
    gregorianDay: 23,
    durationDays: 2,
  },
  {
    id: "founding-day",
    nameAr: "يوم التأسيس",
    nameEn: "Founding Day",
    type: "gregorian",
    gregorianMonth: 1, // February
    gregorianDay: 22,
    durationDays: 2,
  },
  {
    id: "fall-break",
    nameAr: "إجازة الخريف",
    nameEn: "Fall Break",
    // Mid-first-semester "fall" break. This is a FLOATING academic break, not a
    // fixed Gregorian date: its dates drift ~1 day every year to stay a Fri–Sat
    // span bracketing one Sun–Thu teaching week. A hardcoded date is wrong the
    // next year — so it is anchored to a weekday: the 3rd Friday of November for
    // 9 days. Verified against the official MoE calendar:
    //   • 1447: 21–29 Nov 2025 (return Sun 30) — 3rd Fri = 21 Nov. ✓
    //   • 1448: 20–28 Nov 2026 (return Sun 29) — 3rd Fri = 20 Nov. ✓
    // The span always ENDS on the Saturday before the return Sunday, so the resume
    // day is never deducted (it would UNDER-report absence — the dangerous
    // direction for a حرمان warning). Normal Sun–Thu courses lose exactly one
    // session per meeting day. Per-university calendars can refine this later.
    type: "nth-weekday",
    gregorianMonth: 10, // November
    weekday: 5, // Friday
    occurrence: 3, // 3rd Friday
    durationDays: 9, // Fri–Sat, wrapping the Sun–Thu teaching week
  },
  {
    id: "eid-fitr",
    nameAr: "إجازة عيد الفطر",
    nameEn: "Eid al-Fitr Break",
    type: "hijri-anchor",
    anchorHijriMonth: 10, // Shawwal 1 = Eid day
    anchorHijriDay: 1,
    daysBefore: 12,
    daysAfter: 5,
    durationDays: 18, // 12 + 1 (eid day) + 5
  },
  {
    id: "eid-adha",
    nameAr: "إجازة عيد الأضحى",
    nameEn: "Eid al-Adha Break",
    type: "hijri-anchor",
    anchorHijriMonth: 12, // Dhul Hijjah 10 = Eid day
    anchorHijriDay: 10,
    daysBefore: 9,
    daysAfter: 6,
    durationDays: 16, // 9 + 1 (eid day) + 6
  },
];

// Per-university academic-break overrides, keyed by the slug in
// lib/tools/universities. This is the "holidays derived from your university, not
// one fixed list" hook: a university's entry REPLACES the academic breaks (e.g.
// fall-break, Eid window length) while the national + religious holidays always
// stay. DATA HONESTY: only add an entry from a university's own officially
// published calendar — a guessed date would corrupt the حرمان math. Universities
// without an entry inherit the universal SAUDI_HOLIDAYS baseline, and every
// student can fine-tune with the add/dismiss controls. Kept intentionally empty
// until verified per-university calendars are in hand; the plumbing is ready.
export const UNIVERSITY_HOLIDAY_OVERRIDES: Record<string, HolidayDef[]> = {};

/** The holiday calendar for a university slug: its verified override list when we
 *  have one, otherwise the universal Saudi baseline. Always national+religious
 *  safe; academic breaks are the part that can differ. */
export function calendarForUniversity(slug?: string | null): HolidayDef[] {
  if (slug && UNIVERSITY_HOLIDAY_OVERRIDES[slug]) {
    return UNIVERSITY_HOLIDAY_OVERRIDES[slug];
  }
  return SAUDI_HOLIDAYS;
}

function findGregorianForHijri(
  hijriMonth: number,
  hijriDay: number,
  nearYear: number
): Date | null {
  const scanStart = new Date(nearYear, 0, 1);
  const scanEnd = new Date(nearYear + 1, 11, 31);
  let d = scanStart;

  while (d <= scanEnd) {
    const h = hijriParts(d);
    if (h.month === hijriMonth && h.day === hijriDay) {
      return d;
    }
    if (h.month !== hijriMonth) {
      const monthDiff = Math.abs(h.month - hijriMonth);
      const wrapDiff = Math.min(monthDiff, 12 - monthDiff);
      d = addDays(d, wrapDiff > 2 ? 7 : 1);
    } else {
      d = addDays(d, 1);
    }
  }
  return null;
}

/** The date of the `occurrence`-th `weekday` of a month (e.g. the 3rd Friday of
 *  November), or null if the month has fewer than that many. weekday: 0=Sun…6=Sat.
 *  Used for floating academic breaks that track a weekday, not a fixed date. */
function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  occurrence: number
): Date | null {
  const first = new Date(year, month, 1);
  const shift = (weekday - first.getDay() + 7) % 7;
  const day = 1 + shift + (occurrence - 1) * 7;
  const d = new Date(year, month, day);
  return d.getMonth() === month ? d : null;
}

export interface ResolveHolidayOptions {
  /** holiday ids the student turned off (built-in OR custom). */
  dismissed?: string[];
  /** the student's university slug — selects that university's calendar. */
  universitySlug?: string | null;
  /** holidays the student added by hand, applied on top of the built-ins. */
  customHolidays?: CustomHoliday[];
}

export function resolveHolidaysForSemester(
  semesterStart: string,
  semesterEnd: string,
  options?: ResolveHolidayOptions
): ResolvedHoliday[] {
  const start = new Date(semesterStart);
  const end = new Date(semesterEnd);
  if (isNaN(+start) || isNaN(+end) || end <= start) return [];

  const dismissedSet = new Set(options?.dismissed ?? []);
  const calendar = calendarForUniversity(options?.universitySlug);
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const results: ResolvedHoliday[] = [];

  for (let year = startYear; year <= endYear; year++) {
    for (const h of calendar) {
      if (dismissedSet.has(h.id)) continue;

      let holidayStart: Date | null;
      let duration = h.durationDays;

      if (h.type === "gregorian" && h.gregorianMonth != null && h.gregorianDay != null) {
        holidayStart = new Date(year, h.gregorianMonth, h.gregorianDay);
        // 2-day Gregorian holidays shift to connect with Fri-Sat weekend.
        if (h.durationDays === 2) {
          const dow = holidayStart.getDay();
          if (dow === 1 || dow === 4) {
            holidayStart = addDays(holidayStart, -1);
          }
        }
      } else if (h.type === "hijri-anchor" && h.anchorHijriMonth && h.anchorHijriDay) {
        const eidDay = findGregorianForHijri(h.anchorHijriMonth, h.anchorHijriDay, year);
        if (!eidDay) continue;
        holidayStart = addDays(eidDay, -(h.daysBefore ?? 0));
        duration = (h.daysBefore ?? 0) + 1 + (h.daysAfter ?? 0);
      } else if (
        h.type === "nth-weekday" &&
        h.gregorianMonth != null &&
        h.weekday != null &&
        h.occurrence != null
      ) {
        holidayStart = nthWeekdayOfMonth(year, h.gregorianMonth, h.weekday, h.occurrence);
      } else {
        continue;
      }

      if (!holidayStart) continue;

      const holidayEnd = addDays(holidayStart, duration - 1);
      const hStartISO = toISODate(holidayStart);
      const hEndISO = toISODate(holidayEnd);

      if (holidayEnd >= start && holidayStart <= end) {
        if (!results.some((r) => r.id === h.id && r.startDate === hStartISO)) {
          results.push({
            id: h.id,
            nameAr: h.nameAr,
            nameEn: h.nameEn,
            startDate: hStartISO,
            endDate: hEndISO,
            durationDays: duration,
          });
        }
      }
    }
  }

  // Student-added holidays: explicit ranges applied on top, honouring dismiss and
  // clamped to the semester so an out-of-term entry can't skew the totals.
  for (const c of options?.customHolidays ?? []) {
    if (!c || dismissedSet.has(c.id)) continue;
    const cs = new Date(`${c.startDate}T00:00:00`);
    const ce = new Date(`${c.endDate}T00:00:00`);
    if (isNaN(+cs) || isNaN(+ce) || ce < cs) continue;
    if (ce < start || cs > end) continue;
    const clampStart = cs < start ? start : cs;
    const clampEnd = ce > end ? end : ce;
    const duration =
      Math.round((+clampEnd - +clampStart) / 86400000) + 1;
    results.push({
      id: c.id,
      nameAr: c.name,
      nameEn: c.name,
      startDate: toISODate(clampStart),
      endDate: toISODate(clampEnd),
      durationDays: duration,
    });
  }

  return results.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function holidayMinutes(
  sessions: { day: number; minutes: number }[],
  holidays: ResolvedHoliday[]
): number {
  if (!sessions.length || !holidays.length) return 0;

  const minutesByDay = new Map<number, number>();
  for (const s of sessions) {
    minutesByDay.set(s.day, (minutesByDay.get(s.day) ?? 0) + s.minutes);
  }

  let total = 0;
  for (const h of holidays) {
    let d = new Date(`${h.startDate}T00:00:00`);
    const hEnd = new Date(`${h.endDate}T00:00:00`);
    while (d <= hEnd) {
      total += minutesByDay.get(d.getDay()) ?? 0;
      d = addDays(d, 1);
    }
  }
  return total;
}

// Count, not duration: how many weekly LECTURES fall on holiday days — the
// by-lecture counterpart to holidayMinutes, so the total-lecture denominator
// drops a canceled lecture exactly as the by-hour total drops its minutes.
export function holidayLectureCount(
  sessions: { day: number }[],
  holidays: ResolvedHoliday[]
): number {
  if (!sessions.length || !holidays.length) return 0;

  const countByDay = new Map<number, number>();
  for (const s of sessions) {
    countByDay.set(s.day, (countByDay.get(s.day) ?? 0) + 1);
  }

  let total = 0;
  for (const h of holidays) {
    let d = new Date(`${h.startDate}T00:00:00`);
    const hEnd = new Date(`${h.endDate}T00:00:00`);
    while (d <= hEnd) {
      total += countByDay.get(d.getDay()) ?? 0;
      d = addDays(d, 1);
    }
  }
  return total;
}

export function holidayDates(holiday: ResolvedHoliday): string[] {
  const dates: string[] = [];
  let d = new Date(`${holiday.startDate}T00:00:00`);
  const hEnd = new Date(`${holiday.endDate}T00:00:00`);
  while (d <= hEnd) {
    dates.push(toISODate(d));
    d = addDays(d, 1);
  }
  return dates;
}
