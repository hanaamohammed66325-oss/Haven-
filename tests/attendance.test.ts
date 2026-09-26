// Attendance math — which holidays come out of the total.
// Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Course, Semester } from "@/types";
import { attendanceInfo } from "@/lib/grades";
import { clipHolidays } from "@/lib/holidays";

// A Sunday 60-minute lecture; classes start Sun 23 Aug 2026, 15 counted weeks
// (to Sat 5 Dec), then 2 finals weeks and a little slack to 31 Dec.
const course: Course = {
  id: "c",
  name: "c",
  creditHours: 3,
  sessions: [{ id: "s", day: 0, minutes: 60 }],
  missedLectures: 0,
  missedSessions: [],
  components: [],
};
const sem = (customHolidays: Semester["customHolidays"] = []): Semester => ({
  name: "t",
  startDate: "2026-08-23",
  endDate: "2026-12-31",
  calendarType: "gregorian",
  gradingSystem: "saudi5",
  weeks: 15,
  finalsWeeks: 2,
  withdrawalLimit: 25,
  // keep the built-in national breaks out of these cases
  dismissedHolidays: ["national-day", "founding-day", "fall-break", "eid-fitr", "eid-adha"],
  customHolidays,
});
const total = (s: Semester) => attendanceInfo(course, s)!.totalMinutes;

describe("holidays only count inside the counted weeks", () => {
  test("a break in finals week doesn't shrink the total", () => {
    const finals = sem([{ id: "custom-1", name: "x", startDate: "2026-12-06", endDate: "2026-12-10" }]);
    assert.equal(total(finals), total(sem()));
  });

  test("a break inside the counted weeks does", () => {
    const inside = sem([{ id: "custom-1", name: "x", startDate: "2026-10-04", endDate: "2026-10-08" }]);
    assert.equal(total(inside), total(sem()) - 60);
  });

  test("clipHolidays trims a break straddling the first day and drops ones outside", () => {
    const h = { id: "eid", nameAr: "", nameEn: "", durationDays: 10 };
    const out = clipHolidays(
      [
        { ...h, startDate: "2026-08-18", endDate: "2026-08-27" },
        { ...h, id: "late", startDate: "2026-12-07", endDate: "2026-12-12" },
      ],
      "2026-08-23",
      "2026-12-05"
    );
    assert.deepEqual(out, [{ ...h, startDate: "2026-08-23", endDate: "2026-08-27", durationDays: 5 }]);
  });
});
