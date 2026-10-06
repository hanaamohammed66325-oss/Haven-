// Absence alerts go out once per level, following the student's own rule.
// Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { AttendanceRule, Course, MissedEntry, Semester } from "@/types";
import { absenceLevel } from "@/lib/absenceAlerts";

// One 60-minute lecture a week, counted by lecture over 20 weeks = 20 lectures,
// so each absence is exactly 5%. No breaks, so the counts stay round.
const miss = (n: number, excused = false): MissedEntry[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${excused ? "e" : "u"}${i}`, day: 0, minutes: 60, excused }));
const course = (missedSessions: MissedEntry[], over: Partial<Course> = {}): Course => ({
  id: "c1",
  name: "c",
  creditHours: 3,
  attendanceMode: "lecture",
  sessions: [{ id: "s", day: 0, minutes: 60 }],
  missedLectures: 0,
  missedSessions,
  components: [],
  ...over,
});
const rule = (over: Partial<AttendanceRule> = {}): AttendanceRule => ({
  source: "university",
  maxAbsence: 25,
  maxUnexcused: null,
  excusedCounts: true,
  warnings: [],
  method: "lectures",
  ...over,
});
const sem = (attendanceRule?: AttendanceRule): Semester => ({
  name: "t",
  startDate: "2026-08-23",
  endDate: "2027-01-31",
  calendarType: "gregorian",
  gradingSystem: "saudi5",
  weeks: 20,
  finalsWeeks: 2,
  withdrawalLimit: 25,
  dismissedHolidays: ["national-day", "founding-day", "fall-break", "eid-fitr", "eid-adha"],
  customHolidays: [],
  attendanceRule,
});
const key = (n: number, r?: AttendanceRule, over?: Partial<Course>) => absenceLevel(course(miss(n), over), sem(r))?.key ?? null;

describe("no official warning levels: 40%, 60%, 80% of the limit, then denial", () => {
  test("a 25% limit alerts at 10%, 15%, 20%, then over 25%", () => {
    assert.equal(key(1, rule()), null); // 5%
    assert.equal(key(2, rule()), "att-c1-l25-p40"); // 10%
    assert.equal(key(3, rule()), "att-c1-l25-p60"); // 15%
    assert.equal(key(4, rule()), "att-c1-l25-p80"); // 20%
    assert.equal(key(5, rule()), "att-c1-l25-p80"); // 25%: on the limit, not over it
    assert.equal(key(6, rule()), "att-c1-l25-denied"); // 30%
  });

  test("the levels follow the student's limit, not a fixed 25%", () => {
    const r = rule({ maxAbsence: 50 });
    assert.equal(key(3, r), null); // 15% < 20%
    assert.equal(key(4, r), "att-c1-l50-p40"); // 20% = 40% of 50
    assert.equal(key(6, r), "att-c1-l50-p60"); // 30%
    assert.equal(key(8, r), "att-c1-l50-p80"); // 40%
  });

  test("a limit the student set as their own is used", () => {
    assert.equal(key(2, rule(), { attendanceLimit: 50, ownLimit: true }), null); // 10% of 50 = 20%
  });

  test("where reaching the limit is denial, the limit itself denies", () => {
    assert.equal(key(5, rule({ inclusive: true })), "att-c1-l25i-denied");
  });

  test("only the highest level reached: one alert, not one per level", () => {
    const lv = absenceLevel(course(miss(4)), sem(rule()));
    assert.equal(lv?.key, "att-c1-l25-p80");
    assert.equal(lv?.absence, 20);
    assert.equal(lv?.limit, 25);
    assert.equal(lv?.denied, false);
  });

  test("a changed limit starts fresh levels (the limit is in the key)", () => {
    // 10% absence is p40 of both 25% and 20%, but they're different levels.
    assert.equal(key(2, rule({ maxAbsence: 25 })), "att-c1-l25-p40");
    assert.equal(key(2, rule({ maxAbsence: 20 })), "att-c1-l20-p40");
    assert.equal(key(2, rule(), { attendanceLimit: 22.5, ownLimit: true }), "att-c1-l22.5-p40");
  });

  test("every key fits the server's check", () => {
    const keys = [
      key(2, rule()),
      key(6, rule({ inclusive: true })),
      key(2, rule({ warnings: [7.5] })),
      key(2, rule(), { id: "0b8f7a7e-2b6f-4b7a-9d55-3c1f0e8a9b21", attendanceLimit: 22.5, ownLimit: true }),
    ];
    for (const k of keys) assert.match(k ?? "", /^att-[A-Za-z0-9._-]{1,150}$/);
  });

  test("keys are per course", () => {
    assert.equal(key(2, rule(), { id: "other" }), "att-other-l25-p40");
  });
});

describe("official warning levels", () => {
  test("alerts at each official level, then denial", () => {
    const r = rule({ warnings: [10, 20, 15] });
    assert.equal(key(1, r), null); // 5%
    assert.equal(key(2, r), "att-c1-l25-w10");
    assert.equal(key(3, r), "att-c1-l25-w15");
    assert.equal(key(4, r), "att-c1-l25-w20");
    assert.equal(key(5, r), "att-c1-l25-w20"); // on the limit
    assert.equal(key(6, r), "att-c1-l25-denied");
  });
});

describe("unexcused limits", () => {
  test("a limit on unexcused absence only: excused absences don't raise a level", () => {
    const r = rule({ excusedCounts: false, maxAbsence: 25 });
    assert.equal(absenceLevel(course(miss(4, true)), sem(r)), null);
    const lv = absenceLevel(course([...miss(4, true), ...miss(2)]), sem(r));
    assert.equal(lv?.key, "att-c1-l25u-p40");
    assert.equal(lv?.unexcused, true);
  });

  test("a second, lower unexcused cap is followed when it's closer", () => {
    // 25% total / 10% unexcused: 2 unexcused absences = 10% = the whole second cap.
    const r = rule({ maxUnexcused: 10 });
    const lv = absenceLevel(course(miss(1)), sem(r)); // 5% of 10% = 50%
    assert.equal(lv?.key, "att-c1-l25x10-xp40");
    assert.equal(lv?.unexcused, true);
    assert.equal(lv?.limit, 10);
  });
});

describe("the denial identity carries every cap that can deny", () => {
  test("a changed second (unexcused) cap is a new denial; the same rule keeps its key", () => {
    // 4 unexcused absences = 20%: over 15% and over 10%, under the 25% total.
    const deny = (unexcusedCap: number) => absenceLevel(course(miss(4)), sem(rule({ maxUnexcused: unexcusedCap })));
    assert.equal(deny(15)?.denied, true);
    assert.equal(deny(15)?.key, "att-c1-l25x15-denied");
    assert.equal(deny(10)?.key, "att-c1-l25x10-denied");
    assert.equal(deny(15)?.key, deny(15)?.key); // same rule, same key on every run
  });

  test("the rule's own values, not display rounding", () => {
    const k = absenceLevel(course(miss(6)), sem(rule({ maxAbsence: 25.004 })))?.key;
    assert.equal(k, "att-c1-l25.004-denied");
  });

  test("the absence figure isn't in the key: more absence at the same level, same key", () => {
    const r = rule({ maxAbsence: 50 });
    assert.equal(key(6, r), key(7, r)); // 30% and 35%: both p60 of 50
  });
});

describe("nothing to alert on", () => {
  test("an unknown rule shows no percentage, so no alert", () => {
    assert.equal(key(10, rule({ source: "none", maxAbsence: null })), null);
  });

  test("no absences", () => {
    assert.equal(key(0, rule()), null);
  });
});
