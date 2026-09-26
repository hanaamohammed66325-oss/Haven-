// Calendars published from the admin page, and students' holiday reports
// grouped for it. Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { holidayCalendar, universityCalendarKey } from "@/lib/universityCountry";
import { holidaysForCalendar, registerPublishedCalendar } from "@/lib/countryHolidays";
import { calendarFromRow, mayHavePublishedCalendar, type CalendarRow } from "@/lib/publishedCalendars";
import { calendarKeyFromName, draftCalendar, groupHolidayReports, type HolidayReportRow } from "@/lib/holidayReports";
import { resolveHolidaysForSemester } from "@/lib/holidays";

const typed = (name: string) => ({ universitySlug: "other", universityName: name });

const row = (over: Partial<CalendarRow> = {}): CalendarRow => ({
  key: "university-of-jordan",
  country: "JO",
  name_ar: "الجامعة الأردنية",
  name_en: "The University of Jordan",
  academic_year: "2026-2027",
  holidays: [
    { name_ar: "إجازة منتصف الفصل", name_en: "Mid-term break", start: "2026-10-25", end: "2026-10-29" },
    { name_ar: "عيد الفطر", name_en: "Eid al-Fitr", start: "2027-03-09", end: "2027-03-12", estimated: true },
  ],
  status: "suggested",
  source: "students",
  ...over,
});

describe("a calendar published from the admin page", () => {
  test("a row becomes the app's calendar, with stable ids and bad lines dropped", () => {
    const c = calendarFromRow(
      row({
        holidays: [
          { name_ar: "أ", name_en: "A", start: "2026-10-25", end: "2026-10-29" },
          { name_ar: "ب", name_en: "B", start: "2026-10-25", end: "2026-10-25" },
          { name_ar: "", name_en: "", start: "2026-11-01", end: "2026-11-01" },
          { name_ar: "ج", start: "2026-12-05", end: "2026-12-01" },
          "junk",
        ],
      })
    );
    assert.ok(c);
    assert.deepEqual(c.holidays.map((h) => h.id), ["university-of-jordan-2026-10-25", "university-of-jordan-2026-10-25-2"]);
    assert.equal(c.source, "students");
  });

  test("a withdrawn calendar, or one with no usable holiday, is nothing", () => {
    assert.equal(calendarFromRow(row({ status: "rejected" })), null);
    assert.equal(calendarFromRow(row({ holidays: [] })), null);
  });

  test("once registered, the student's typed name gets it instead of the country's list", () => {
    const name = "الجامعة الاردنية";
    assert.equal(holidayCalendar(typed(name)), "JO");
    assert.equal(mayHavePublishedCalendar(typed(name)), true);
    registerPublishedCalendar("university-of-jordan", calendarFromRow({ ...row(), names: ["الجامعه الاردنيه"] }));
    assert.equal(universityCalendarKey(name), "university-of-jordan");
    assert.equal(holidayCalendar(typed(name)), "university-of-jordan");
    const ids = resolveHolidaysForSemester("2026-08-30", "2026-12-31", { calendar: "university-of-jordan" }).map((h) => h.id);
    assert.deepEqual(ids, ["university-of-jordan-2026-10-25"]);
    // Withdrawn: back to the country's holidays.
    registerPublishedCalendar("university-of-jordan", null);
    assert.equal(holidayCalendar(typed(name)), "JO");
  });

  test("a calendar in the code, or a Saudi university, never asks for one", () => {
    assert.equal(mayHavePublishedCalendar(typed("جامعة قطر")), false);
    assert.equal(mayHavePublishedCalendar({ universitySlug: "ksu", universityName: "جامعة الملك سعود" }), false);
    assert.equal(mayHavePublishedCalendar(typed("")), false);
  });
});

describe("students' holiday reports, by university", () => {
  const report = (id: string, name: string, over: Partial<HolidayReportRow> = {}): HolidayReportRow => ({
    user_id: id,
    email: null,
    last_active_at: null,
    slug: "other",
    name,
    check: null,
    dismissed: [],
    custom: [],
    ...over,
  });
  const confirmed = (name: string) => ({ calendar: holidayCalendar(typed(name)) });

  test("Saudi students are left out; spellings of one university group together", () => {
    const groups = groupHolidayReports([
      report("1", "جامعة قطر"),
      report("2", "Qatar University"),
      report("3", "جامعة الملك سعود", { slug: "ksu" }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].key, "qatar-university");
    assert.equal(groups[0].kind, "university");
    assert.equal(groups[0].students.length, 2);
  });

  test("5 confirming unchanged flags it; 3 changing it marks a disagreement", () => {
    const name = "جامعة قطر";
    const agree = [1, 2, 3, 4, 5].map((i) => report(`a${i}`, name, { check: confirmed(name) }));
    assert.equal(groupHolidayReports(agree)[0].flag, "ready");

    const changed = [1, 2, 3].map((i) =>
      report(`d${i}`, name, { check: confirmed(name), dismissed: ["qa-sport-day-2027"] })
    );
    const g = groupHolidayReports([...agree, ...changed])[0];
    assert.equal(g.agree, 5);
    assert.equal(g.differ, 3);
    assert.equal(g.flag, "disputed");
    assert.deepEqual(g.removed.map((r) => [r.holiday.id, r.count]), [["qa-sport-day-2027", 3]]);
  });

  test("a confirmation for another calendar (they changed university) doesn't count", () => {
    const g = groupHolidayReports([report("1", "جامعة قطر", { check: { calendar: "AE" } })])[0];
    assert.equal(g.agree + g.differ, 0);
  });

  test("the holidays students added are gathered, and a draft calendar offers them", () => {
    const name = "جامعة الاسراء الخاصة عمان الاردن";
    const added = (n: string) => [{ id: `custom-${n}`, name: "إجازة منتصف الفصل", startDate: "2026-11-01", endDate: "2026-11-05" }];
    const g = groupHolidayReports([
      report("1", name, { custom: added("1"), dismissed: ["jo-christmas-2026"] }),
      report("2", name, { custom: added("2"), dismissed: ["jo-christmas-2026"] }),
      report("3", name, { custom: [{ id: "uni-2026-09-23", name: "من جامعة سابقة", startDate: "2026-09-23", endDate: "2026-09-26" }] }),
    ])[0];
    assert.equal(g.kind, "country");
    assert.equal(g.calendar, "JO");
    assert.deepEqual(g.added, [{ start: "2026-11-01", end: "2026-11-05", names: ["إجازة منتصف الفصل"], count: 2 }]);

    const draft = draftCalendar(g);
    const mid = draft.find((d) => d.start === "2026-11-01");
    assert.equal(mid?.include, true);
    assert.equal(draft.find((d) => d.start === "2026-12-25")?.include, false);
    assert.equal(draft.find((d) => d.start === "2027-01-01")?.include, true);
    assert.equal(draft.length, holidaysForCalendar("JO").length + 1);
  });

  test("a key from an English name", () => {
    assert.equal(calendarKeyFromName("Al-Isra University (Amman)"), "al-isra-university-amman");
    assert.equal(calendarKeyFromName("  Université Mohammed V  "), "universite-mohammed-v");
  });
});
