// The universities' own 2026-2027 calendars from the October 2026 audit
// (lib/countryHolidays AUDITED_HOLIDAYS): each one reaches its students from the
// typed name, and every holiday is a real range inside the academic year.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { UNIVERSITY_HOLIDAYS, holidaysForCalendar } from "@/lib/countryHolidays";
import { holidayCalendar } from "@/lib/universityCountry";

const AUDITED = [
  "ahlia-university", "gulf-university", "kingdom-university", "royal-university-for-women", "university-of-technology-bahrain",
  "university-of-doha-for-science-and-technology", "hamad-bin-khalifa-university",
  "georgetown-university-school-of-foreign-service-in-qatar", "northwestern-university-in-qatar",
  "carnegie-mellon-university-in-qatar", "lusail-university", "virginia-commonwealth-university-in-qatar",
  "american-university-of-kuwait", "american-international-university-aiu",
  "american-university-of-ras-al-khaimah", "gulf-medical-university",
  "mohammed-bin-rashid-university-of-medicine-and-health-sciences", "new-york-university-abu-dhabi",
  "university-of-dubai", "university-of-fujairah",
  "sultan-qaboos-university", "dhofar-university", "muscat-university",
  "german-jordanian-university-gju", "princess-sumaya-university-for-technology-psut", "mutah-university",
  "nahda-university",
  "beirut-arab-university", "holy-spirit-university-of-kaslik", "lebanese-american-university", "antonine-university",
  "middle-east-university-lebanon", "haigazian-university", "global-university-lebanon",
];

const typed = (universityName: string) => ({ universitySlug: "other", universityName });

describe("each audited calendar reaches its students", () => {
  for (const key of AUDITED) {
    test(key, () => {
      const cal = UNIVERSITY_HOLIDAYS[key];
      assert.ok(cal, "missing");
      for (const name of [cal.nameAr, cal.nameEn]) assert.equal(holidayCalendar(typed(name)), key, name);
    });
  }
  test("typed with the country, as the picker writes it", () => {
    assert.equal(holidayCalendar(typed("جامعة هايكازيان")), "haigazian-university");
    assert.equal(holidayCalendar(typed("Global University - Lebanon")), "global-university-lebanon");
    assert.equal(holidayCalendar(typed("جامعة الشرق الأوسط - لبنان")), "middle-east-university-lebanon");
  });
});

describe("every holiday is a valid 2026-2027 range", () => {
  for (const key of AUDITED) {
    test(key, () => {
      const list = holidaysForCalendar(key);
      assert.ok(list.length >= 3);
      const ids = new Set<string>();
      for (const x of list) {
        assert.match(x.start, /^\d{4}-\d{2}-\d{2}$/);
        assert.match(x.end, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(x.start <= x.end, `${x.id} ends before it starts`);
        assert.ok(x.start >= "2026-08-01" && x.end <= "2027-08-31", `${x.id} outside the year`);
        assert.ok(!ids.has(x.id), `duplicate ${x.id}`);
        ids.add(x.id);
      }
    });
  }
});

test("Sultan Qaboos: National Day on 20 November (Hanaa's decision)", () => {
  const nd = holidaysForCalendar("sultan-qaboos-university").filter((x) => /national/i.test(x.nameEn));
  assert.deepEqual(nd.map((x) => x.start), ["2026-11-20"]);
});
