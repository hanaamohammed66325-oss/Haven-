// Which absence rule a course is held to, and the two-limit math.
// Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { AttendanceRule, Course, MissedEntry, Semester } from "@/types";
import { attendanceInfo, courseRule, hasOwnLimit } from "@/lib/grades";

// One 60-minute lecture a week, counted by lecture over 15 weeks = 15 lectures
// (each 6.67%). No breaks, so the counts stay round.
const miss = (n: number, excused = false): MissedEntry[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${excused ? "e" : "u"}${i}`, day: 0, minutes: 60, excused }));
const course = (over: Partial<Course> = {}): Course => ({
  id: "c",
  name: "c",
  creditHours: 3,
  attendanceMode: "lecture",
  sessions: [{ id: "s", day: 0, minutes: 60 }],
  missedLectures: 0,
  missedSessions: [],
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
const sem = (attendanceRule?: AttendanceRule, withdrawalLimit = 25): Semester => ({
  name: "t",
  startDate: "2026-08-23",
  endDate: "2026-12-31",
  calendarType: "gregorian",
  gradingSystem: "saudi5",
  weeks: 15,
  finalsWeeks: 2,
  withdrawalLimit,
  dismissedHolidays: ["national-day", "founding-day", "fall-break", "eid-fitr", "eid-adha"],
  customHolidays: [],
  attendanceRule,
});
const info = (c: Course, s: Semester) => attendanceInfo(c, s)!;

describe("the saved 25% default doesn't override the university's rule", () => {
  test("a course saved with the old default follows an unknown rule: no percentage", () => {
    const a = info(course({ attendanceLimit: 25, missedSessions: miss(5) }), sem(rule({ source: "none", maxAbsence: null })));
    assert.equal(a.limitKnown, false);
    assert.equal(a.ruleSource, "none");
    assert.equal(a.status, "ok");
    assert.equal(a.lecturesRemaining, 0);
    assert.equal(a.missedLectures, 5);
  });

  test("the old default follows the verified rule, not 25", () => {
    assert.deepEqual(courseRule(course({ attendanceLimit: 25 }), sem(rule({ maxAbsence: 20 }))).total, 20);
  });

  test("a limit equal to the old term limit isn't the student's either", () => {
    assert.equal(hasOwnLimit(course({ attendanceLimit: 20 }), sem(rule(), 20)), false);
  });

  test("a limit the student marked as their own wins, even 25", () => {
    const r = courseRule(course({ attendanceLimit: 25, ownLimit: true }), sem(rule({ maxAbsence: 20 })));
    assert.equal(r.source, "course");
    assert.equal(r.total, 25);
  });

  test("an older hand-set limit (not the default) still counts as the student's", () => {
    assert.equal(courseRule(course({ attendanceLimit: 30 }), sem(rule({ maxAbsence: 20 }))).total, 30);
  });

  test("0 means no limit of its own", () => {
    assert.equal(hasOwnLimit(course({ attendanceLimit: 0, ownLimit: true }), sem(rule())), false);
  });

  test("with no rule attached (demo, admin tools) the old behaviour stays", () => {
    assert.equal(courseRule(course({ attendanceLimit: 25 }), sem(undefined, 20)).total, 25);
    assert.deepEqual(courseRule(course(), sem(undefined, 20)), { total: 20, unexcused: null, warnings: [], source: "legacy" });
  });
});

describe("rules we can't turn into a percentage", () => {
  for (const method of ["count", "none"] as const) {
    test(`method "${method}" shows no percentage`, () => {
      assert.equal(courseRule(course(), sem(rule({ method }))).source, "none");
    });
  }
  test("a rule with no limits at all is unknown", () => {
    assert.equal(courseRule(course(), sem(rule({ maxAbsence: null }))).source, "none");
  });
});

describe("a total limit with a lower unexcused limit (25% / 15%)", () => {
  const s = sem(rule({ maxAbsence: 25, maxUnexcused: 15 }));

  test("3 unexcused lectures (20%) pass 15%: denied", () => {
    const a = info(course({ missedSessions: miss(3) }), s);
    assert.equal(a.unexcusedLimit, 15);
    assert.equal(a.status, "danger");
  });

  test("3 excused lectures (20%) stay under 25%: not denied", () => {
    const a = info(course({ missedSessions: miss(3, true) }), s);
    assert.notEqual(a.status, "danger");
    assert.equal(a.unexcusedAbsence, 0);
  });

  test("remaining lectures honour the tighter limit", () => {
    // 25% allows 3 of 15, 15% unexcused allows 2.
    assert.equal(info(course(), s).lecturesRemaining, 2);
  });
});

describe("where excused absence doesn't count", () => {
  test("only unexcused absence is compared with the limit", () => {
    const a = info(course({ missedSessions: [...miss(5, true), ...miss(1)] }), sem(rule({ excusedCounts: false })));
    assert.equal(a.limitIsUnexcused, true);
    assert.equal(a.limit, 25);
    assert.ok(Math.abs(a.absence - 100 / 15) < 1e-9);
    assert.equal(a.status, "ok");
  });

  test("a separate unexcused limit takes over the main one", () => {
    const r = courseRule(course(), sem(rule({ excusedCounts: false, maxAbsence: 25, maxUnexcused: 15 })));
    assert.deepEqual([r.total, r.unexcused], [null, 15]);
  });
});

describe("official warnings", () => {
  const s = sem(rule({ warnings: [10, 15] }));

  test("the next warning is the first one above the current absence", () => {
    assert.equal(info(course({ missedSessions: miss(1) }), s).nextWarning, 10);
    assert.equal(info(course({ missedSessions: miss(2) }), s).nextWarning, 15);
    assert.equal(info(course({ missedSessions: miss(3) }), s).nextWarning, null);
  });

  test("reaching the first warning flags the course", () => {
    assert.equal(info(course({ missedSessions: miss(2) }), s).status, "warn");
  });
});

describe("denied on reaching the limit (\"20% or more\", e.g. Al Yamamah)", () => {
  const s = sem(rule({ maxAbsence: 20, inclusive: true }));

  test("3 of 15 lectures (exactly 20%) is a denial, not the last allowed", () => {
    const a = info(course({ missedSessions: miss(3) }), s);
    assert.equal(a.status, "danger");
    assert.equal(a.atLimit, false);
  });

  test("only 2 lectures can be missed", () => {
    assert.equal(info(course(), s).lecturesRemaining, 2);
    assert.equal(info(course({ missedSessions: miss(2) }), s).lecturesRemaining, 0);
  });

  test("without the flag, exactly 20% is still allowed", () => {
    const a = info(course({ missedSessions: miss(3) }), sem(rule({ maxAbsence: 20 })));
    assert.notEqual(a.status, "danger");
    assert.equal(a.atLimit, true);
  });
});

describe("Jazan, as its students describe it: 25% without an excuse, 50% in all (both reached)", () => {
  // 20 weekly lectures, each 5%.
  const s = { ...sem(rule({ maxAbsence: 50, maxUnexcused: 25, inclusive: true })), weeks: 20 };

  test("5 lectures without an excuse (25%) is a denial", () => {
    assert.equal(info(course({ missedSessions: miss(5) }), s).status, "danger");
    assert.notEqual(info(course({ missedSessions: miss(4) }), s).status, "danger");
  });

  test("with excused absences, all absence reaching 50% is a denial", () => {
    assert.notEqual(info(course({ missedSessions: [...miss(4), ...miss(5, true)] }), s).status, "danger");
    assert.equal(info(course({ missedSessions: [...miss(4), ...miss(6, true)] }), s).status, "danger");
  });
});
