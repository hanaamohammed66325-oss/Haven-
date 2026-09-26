// Which country a university is in, and the holidays that follow from it.
// Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { countryFromName, holidayCalendar, universityCalendarKey, universityCountry } from "@/lib/universityCountry";
import { resolveHolidaysForSemester } from "@/lib/holidays";
import { COUNTRY_HOLIDAYS, UNIVERSITY_HOLIDAYS } from "@/lib/countryHolidays";
import { releaseUniversityHolidays } from "@/lib/universityFacts";

const typed = (name: string) => ({ universitySlug: "other", universityName: name });

describe("the country is told from the university's name", () => {
  test("a university from our list is Saudi", () => {
    assert.equal(universityCountry({ universitySlug: "king-saud", universityName: "" }), "SA");
  });

  test("the names our students typed", () => {
    assert.equal(countryFromName("جامعة الشارقة"), "AE");
    assert.equal(countryFromName("جامعة قطر"), "QA");
    assert.equal(countryFromName("جامعة الشرق الأوسط"), "JO");
  });

  test("Arabic spelling variants and English names", () => {
    assert.equal(countryFromName("جامعه الكويت"), "KW");
    assert.equal(countryFromName("University of Bahrain"), "BH");
    assert.equal(countryFromName("Sultan Qaboos University"), "OM");
    assert.equal(countryFromName("جامعة عين شمس"), "EG");
    assert.equal(countryFromName("American University of Beirut"), "LB");
    assert.equal(countryFromName("American University of Sharjah"), "AE");
  });

  test("a specific name wins over a word it shares with another country", () => {
    assert.equal(countryFromName("جامعة حمد بن خليفة"), "QA");
    assert.equal(countryFromName("جامعة خليفة"), "AE");
    assert.equal(countryFromName("جامعة الأزهر بغزة"), "PS");
    assert.equal(countryFromName("جامعة الأزهر"), "EG");
    assert.equal(countryFromName("الجامعة الأمريكية في الشرق الأوسط"), "KW");
    assert.equal(countryFromName("جامعة عمان الأهلية"), "JO");
    assert.equal(countryFromName("جامعة مصراتة"), "LY");
  });

  test("an ambiguous or unknown name isn't placed, and keeps the Saudi holidays", () => {
    assert.equal(countryFromName("جامعة عمان"), null);
    assert.equal(countryFromName("كلية الريادة"), null);
    assert.equal(holidayCalendar(typed("كلية الريادة")), "SA");
    assert.equal(holidayCalendar(null), "SA");
  });
});

describe("holidays by country", () => {
  const term = ["2027-01-17", "2027-05-27"] as const; // Qatar University, spring 2027

  test("a Qatari university gets Qatar's holidays, not the Saudi ones", () => {
    const hs = resolveHolidaysForSemester(...term, { calendar: "QA" });
    const ids = hs.map((h) => h.id);
    assert.deepEqual(ids, ["qa-sport-day-2027", "qa-eid-fitr-2027", "qa-eid-adha-2027"]);
    assert.ok(!ids.some((id) => id === "founding-day" || id === "eid-fitr"));
    const fitr = hs.find((h) => h.id === "qa-eid-fitr-2027")!;
    assert.equal(fitr.startDate, "2027-03-07");
    assert.equal(fitr.durationDays, 7);
    assert.equal(fitr.estimated, true);
  });

  test("a country holiday can be dismissed, and is cut to the semester", () => {
    const hs = resolveHolidaysForSemester("2027-01-17", "2027-03-08", { calendar: "QA", dismissed: ["qa-sport-day-2027"] });
    assert.deepEqual(hs.map((h) => [h.id, h.startDate, h.endDate]), [["qa-eid-fitr-2027", "2027-03-07", "2027-03-08"]]);
  });

  test("a country we have no holidays for gets none — only the student's own", () => {
    const own = [{ id: "custom-1", name: "إجازة", startDate: "2027-02-01", endDate: "2027-02-03" }];
    const hs = resolveHolidaysForSemester(...term, { calendar: "YE", customHolidays: own });
    assert.deepEqual(hs.map((h) => h.id), ["custom-1"]);
  });

  test("the countries added from their official lists reach their students", () => {
    const ids = (name: string) =>
      resolveHolidaysForSemester(...term, { calendar: holidayCalendar({ universitySlug: "other", universityName: name }) }).map((h) => h.id);
    assert.ok(ids("جامعة بغداد").includes("iq-nowruz-2027"));
    assert.ok(ids("جامعة دمشق").includes("sy-revolution-2027"));
    assert.ok(ids("جامعة بنغازي").includes("ly-revolution-2027"));
    assert.ok(ids("Istanbul University").includes("tr-sovereignty-2027"));
    assert.ok(ids("University of Dublin").includes("ie-patrick-2027"));
  });

  test("Saudi universities keep the built-in calendar", () => {
    const ids = resolveHolidaysForSemester(...term, { calendar: "SA" }).map((h) => h.id);
    assert.ok(ids.includes("founding-day"));
    assert.ok(ids.includes("eid-fitr"));
  });

  test("every list is valid: unique ids, start on or before end", () => {
    const lists = [...Object.values(COUNTRY_HOLIDAYS), ...Object.values(UNIVERSITY_HOLIDAYS).map((u) => u.holidays)];
    for (const list of lists) {
      const seen = new Set<string>();
      for (const h of list) {
        assert.ok(!seen.has(h.id), h.id);
        seen.add(h.id);
        assert.match(h.start, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(h.start <= h.end, h.id);
      }
    }
    // A university's own ids never collide with another country's.
    const countryIds = new Map<string, string>();
    for (const [c, list] of Object.entries(COUNTRY_HOLIDAYS)) for (const h of list) countryIds.set(h.id, c);
    for (const u of Object.values(UNIVERSITY_HOLIDAYS)) {
      for (const h of u.holidays) {
        const owner = countryIds.get(h.id);
        assert.ok(!owner || owner === u.country, h.id);
      }
    }
  });
});

describe("moving to another university", () => {
  test("the old university's breaks go, and the built-in holidays come back", () => {
    const current = {
      customHolidays: [
        { id: "uni-2026-09-23", name: "إجازة اليوم الوطني", startDate: "2026-09-23", endDate: "2026-09-26" },
        { id: "custom-1", name: "رحلة", startDate: "2026-10-01", endDate: "2026-10-02" },
      ],
      dismissedHolidays: ["national-day", "eid-fitr", "qa-sport-day-2027"],
    };
    assert.deepEqual(releaseUniversityHolidays(current), {
      customHolidays: [current.customHolidays[1]],
      dismissedHolidays: ["qa-sport-day-2027"],
    });
  });

  test("nothing changes when no university calendar was applied", () => {
    assert.equal(releaseUniversityHolidays({ customHolidays: [], dismissedHolidays: ["national-day"] }), null);
  });
});

describe("a university whose own calendar we hold", () => {
  test("its name, in Arabic or English, finds its calendar", () => {
    assert.equal(universityCalendarKey("جامعة قطر"), "qatar-university");
    assert.equal(universityCalendarKey("Qatar University"), "qatar-university");
    assert.equal(universityCalendarKey("جامعة الشارقة"), "university-of-sharjah");
    assert.equal(universityCalendarKey("الجامعة الأمريكية في بيروت"), "american-university-of-beirut");
    assert.equal(universityCalendarKey("جامعة فلسطين التقنية خضوري"), "ptuk");
    assert.equal(universityCalendarKey("جامعة خليفة"), "khalifa-university");
    assert.equal(universityCalendarKey("American University of Sharjah"), "american-university-of-sharjah");
    assert.equal(universityCalendarKey("جامعة عجمان"), "ajman-university");
    assert.equal(universityCalendarKey("جامعة أبوظبي"), "abu-dhabi-university");
  });

  test("however the student spaced the name", () => {
    for (const name of ["جامعة ابو ظبي", "جامعه ابوظبي", "جامعة أبو  ظبي", "Abu Dhabi University", "Abudhabi University"]) {
      assert.equal(universityCalendarKey(name), "abu-dhabi-university", name);
      assert.equal(holidayCalendar(typed(name)), "abu-dhabi-university", name);
    }
    // A city spelled either way still gives the country.
    assert.equal(countryFromName("كلية في ابوظبي"), "AE");
    assert.equal(countryFromName("كلية في ابو ظبي"), "AE");
    // A Saudi name too: "عبد العزيز" = "عبدالعزيز".
    assert.equal(holidayCalendar(typed("جامعة الملك عبد العزيز")), "SA");
  });

  test("a sister university in the same country doesn't get it", () => {
    assert.equal(universityCalendarKey("جامعة حمد بن خليفة"), null);
    assert.equal(holidayCalendar(typed("جامعة حمد بن خليفة")), "QA");
    assert.equal(holidayCalendar(typed("جامعة الإمارات")), "AE");
  });

  test("Qatar University gets its mid-fall break on top of Qatar's holidays", () => {
    assert.equal(holidayCalendar(typed("جامعة قطر")), "qatar-university");
    const ids = resolveHolidaysForSemester("2026-08-23", "2026-12-17", { calendar: "qatar-university" }).map((h) => h.id);
    assert.deepEqual(ids, ["qu-mid-fall-2026"]);
    const all = resolveHolidaysForSemester("2026-08-23", "2026-12-18", { calendar: "qatar-university" }).map((h) => h.id);
    assert.deepEqual(all, ["qu-mid-fall-2026", "qa-national-day-2026"]);
  });

  test("a Saudi university keeps the Saudi calendar", () => {
    assert.equal(holidayCalendar({ universitySlug: "king-saud", universityName: "" }), "SA");
    assert.equal(holidayCalendar(typed("جامعة الملك سعود")), "SA");
  });

  test("the catalogue places a university the name lists don't", () => {
    assert.equal(countryFromName("جامعة ايرلانجا"), "ID");
    assert.equal(countryFromName("Airlangga University"), "ID");
  });
});
