import { hijriParts, addDays, toISODate } from "./dates";

export interface HolidayDef {
  id: string;
  nameAr: string;
  nameEn: string;
  type: "gregorian" | "hijri-anchor";
  gregorianMonth?: number; // 0-based (0=Jan)
  gregorianDay?: number;
  durationDays: number;
  // For hijri-anchor holidays: anchor is the Eid day itself,
  // daysBefore/daysAfter define the university break around it.
  anchorHijriMonth?: number;
  anchorHijriDay?: number;
  daysBefore?: number;
  daysAfter?: number;
}

export interface ResolvedHoliday {
  id: string;
  nameAr: string;
  nameEn: string;
  startDate: string;
  endDate: string;
  durationDays: number;
}

// Saudi holidays that affect university schedules.
// Eid breaks anchor on the actual Eid day; daysBefore/daysAfter define
// the university break window around it. Gregorian holidays use fixed dates.
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
    type: "gregorian",
    gregorianMonth: 10, // November
    gregorianDay: 20,
    durationDays: 9,
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

export function resolveHolidaysForSemester(
  semesterStart: string,
  semesterEnd: string,
  dismissed?: string[]
): ResolvedHoliday[] {
  const start = new Date(semesterStart);
  const end = new Date(semesterEnd);
  if (isNaN(+start) || isNaN(+end) || end <= start) return [];

  const dismissedSet = new Set(dismissed ?? []);
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const results: ResolvedHoliday[] = [];

  for (let year = startYear; year <= endYear; year++) {
    for (const h of SAUDI_HOLIDAYS) {
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
