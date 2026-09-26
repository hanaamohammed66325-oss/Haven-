import { hijriParts, addDays, toISODate } from "./dates";
import { holidaysForCalendar } from "./countryHolidays";
import type { CustomHoliday } from "@/types";

export interface HolidayDef {
  id: string;
  nameAr: string;
  nameEn: string;
  type: "gregorian" | "hijri-anchor" | "nth-weekday";
  gregorianMonth?: number; // 0-based (0=Jan)
  gregorianDay?: number;
  durationDays: number;
  // For hijri-anchor holidays: anchor is the Eid day itself; the break runs from
  // the Friday on/before (Eid − daysBefore) to the Saturday on/after (Eid + daysAfter).
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
  /** a moon-based date that may move a day or two with the official sighting */
  estimated?: boolean;
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
  // Eid breaks are whole Fri–Sat spans (they start after Thursday classes and
  // end the Saturday before the return Sunday), so a fixed day count around the
  // Eid day drifts onto real teaching days as the Hijri date slides ~11 days a
  // year. Instead: start = the Friday on/before (Eid − daysBefore), end = the
  // Saturday on/after (Eid + daysAfter). Verified against the official MoE
  // calendar:
  //   • Fitr 1448: Fri 26 Feb – Sat 13 Mar 2027 (Eid Tue 9 Mar). ✓
  //   • Fitr 1447: Fri 6 Mar – Sat 28 Mar 2026 (Eid Fri 20 Mar). ✓
  //   • Adha 1448: Fri 7 May – Sat 22 May 2027 (Eid Sun 16 May). ✓
  //   • Adha 1447: Fri 22 May 2026 ✓ – official end was Mon 1 Jun (an
  //     irregular, non-weekend return); this rule gives Sat 30 May.
  {
    id: "eid-fitr",
    nameAr: "إجازة عيد الفطر",
    nameEn: "Eid al-Fitr Break",
    type: "hijri-anchor",
    anchorHijriMonth: 10, // Shawwal 1 = Eid day
    anchorHijriDay: 1,
    daysBefore: 10,
    daysAfter: 4,
    durationDays: 16, // typical; the resolved span is computed per year
  },
  {
    id: "eid-adha",
    nameAr: "إجازة عيد الأضحى",
    nameEn: "Eid al-Adha Break",
    type: "hijri-anchor",
    anchorHijriMonth: 12, // Dhul Hijjah 10 = Eid day
    anchorHijriDay: 10,
    daysBefore: 5,
    daysAfter: 3,
    durationDays: 16, // typical; the resolved span is computed per year
  },
];

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
  /** whose holidays apply (lib/universityCountry holidayCalendar): "SA" uses
   *  the built-in rules above; a university or country of ours its official
   *  holidays for the year (lib/countryHolidays), or none when we have none —
   *  the student adds their university's own. */
  calendar?: string | null;
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
  const key = options?.calendar ?? "SA";
  const calendar = key === "SA" ? SAUDI_HOLIDAYS : [];
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
        // Snap to whole weekends: Friday on/before, Saturday on/after.
        const rawStart = addDays(eidDay, -(h.daysBefore ?? 0));
        const rawEnd = addDays(eidDay, h.daysAfter ?? 0);
        holidayStart = addDays(rawStart, -((rawStart.getDay() - 5 + 7) % 7));
        const snappedEnd = addDays(rawEnd, (6 - rawEnd.getDay() + 7) % 7);
        duration = Math.round((+snappedEnd - +holidayStart) / 86400000) + 1;
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

  // A university's or another country's official holidays: fixed ranges for
  // the year, clamped to the semester like the student's own.
  if (key !== "SA") {
    for (const h of holidaysForCalendar(key)) {
      if (dismissedSet.has(h.id)) continue;
      const r = clampRange(h.start, h.end, start, end);
      if (r) results.push({ id: h.id, nameAr: h.nameAr, nameEn: h.nameEn, ...r, ...(h.estimated ? { estimated: true } : {}) });
    }
  }

  // Student-added holidays: explicit ranges applied on top, honouring dismiss and
  // clamped to the semester so an out-of-term entry can't skew the totals.
  for (const c of options?.customHolidays ?? []) {
    if (!c || dismissedSet.has(c.id)) continue;
    const r = clampRange(c.startDate, c.endDate, start, end);
    if (r) results.push({ id: c.id, nameAr: c.name, nameEn: c.name, ...r });
  }

  return results.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** An ISO date range cut to the semester, or null when it's invalid or falls
 *  wholly outside it. */
function clampRange(
  startISO: string,
  endISO: string,
  semStart: Date,
  semEnd: Date
): { startDate: string; endDate: string; durationDays: number } | null {
  const cs = new Date(`${startISO}T00:00:00`);
  const ce = new Date(`${endISO}T00:00:00`);
  if (isNaN(+cs) || isNaN(+ce) || ce < cs) return null;
  if (ce < semStart || cs > semEnd) return null;
  const clampStart = cs < semStart ? semStart : cs;
  const clampEnd = ce > semEnd ? semEnd : ce;
  return {
    startDate: toISODate(clampStart),
    endDate: toISODate(clampEnd),
    durationDays: Math.round((+clampEnd - +clampStart) / 86400000) + 1,
  };
}

/**
 * Only the part of each holiday that falls inside [startISO, endISO] — the
 * weeks the attendance total actually counts (first day of classes to the start
 * of finals). A break that starts before classes (an Eid window straddling the
 * first week) or lands in finals/after the counted weeks would otherwise remove
 * lectures that were never in the total, understating the total and so
 * overstating absence. Holidays wholly outside are dropped.
 */
export function clipHolidays(holidays: ResolvedHoliday[], startISO: string, endISO: string): ResolvedHoliday[] {
  const out: ResolvedHoliday[] = [];
  for (const h of holidays) {
    const s = h.startDate < startISO ? startISO : h.startDate;
    const e = h.endDate > endISO ? endISO : h.endDate;
    if (e < s) continue;
    const durationDays = Math.round((+new Date(`${e}T00:00:00`) - +new Date(`${s}T00:00:00`)) / 86400000) + 1;
    out.push({ ...h, startDate: s, endDate: e, durationDays });
  }
  return out;
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
  for (const d of uniqueHolidayDays(holidays)) {
    total += minutesByDay.get(d.getDay()) ?? 0;
  }
  return total;
}

// Every holiday day once, even where holidays overlap (e.g. Founding Day inside
// the Eid al-Fitr break, or a custom holiday over a built-in one) — otherwise the
// shared days are subtracted twice and absence is overstated.
function uniqueHolidayDays(holidays: ResolvedHoliday[]): Date[] {
  const seen = new Set<string>();
  const days: Date[] = [];
  for (const h of holidays) {
    for (const iso of holidayDates(h)) {
      if (seen.has(iso)) continue;
      seen.add(iso);
      days.push(new Date(`${iso}T00:00:00`));
    }
  }
  return days;
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
  for (const d of uniqueHolidayDays(holidays)) {
    total += countByDay.get(d.getDay()) ?? 0;
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

/** Every day of the term that is one of the student's holidays (their
 *  university's or country's calendar, minus what they removed, plus what they
 *  added), sorted — the days no lecture reminder goes out. */
export function classOffDays(
  sem: { startDate?: string; endDate?: string; dismissedHolidays?: string[]; customHolidays?: CustomHoliday[] },
  calendar: string
): string[] {
  if (!sem.startDate || !sem.endDate) return [];
  const days = new Set<string>();
  for (const h of resolveHolidaysForSemester(sem.startDate, sem.endDate, {
    dismissed: sem.dismissedHolidays,
    calendar,
    customHolidays: sem.customHolidays,
  })) {
    for (const d of holidayDates(h)) days.add(d);
  }
  return [...days].sort().slice(0, 366);
}
