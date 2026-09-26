// End-of-term check tests — official results, working back from the portal GPA,
// and when the window opens. Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Course, Semester, TermCheck } from "@/types";
import { SAUDI5, SAUDI4, PERCENTAGE, customScheme } from "@/lib/gradeSchemes";
import { semesterGPA, coursePoints } from "@/lib/grades";
import {
  explainGap,
  gpaTolerance,
  pastTermCumulative,
  readPastTerms,
  readTermCheck,
  sameGpa,
  termCheckDue,
  withOfficial,
} from "@/lib/termCheck";

let seq = 0;
const finished = (name: string, creditHours: number, pct: number): Course => ({
  id: `k${seq++}`,
  name,
  creditHours,
  sessions: [],
  missedLectures: 0,
  missedSessions: [],
  components: [{ id: `c${seq++}`, name: "final", type: "final", weight: 100, unit: "percent", total: 100, score: pct, date: null }],
});

// The example from the mockup: ours 4.75, portal 4.61.
const prog = finished("برمجة 1", 3, 91); // A
const math = finished("رياضيات متقطعة", 3, 85.4); // B+, just over the B+ cutoff
const db = finished("قواعد بيانات", 3, 96); // A+
const isl = finished("ثقافة إسلامية", 2, 92); // A
const term = [prog, math, db, isl];

const semester = (endDate: string): Semester => ({
  name: "T",
  startDate: "2026-01-01",
  endDate,
  calendarType: "gregorian",
  gradingSystem: "saudi5",
  weeks: 13,
  finalsWeeks: 2,
  withdrawalLimit: 25,
});

describe("official results", () => {
  test("an official letter replaces the estimate in the GPA", () => {
    assert.equal(semesterGPA(term, SAUDI5)!.toFixed(2), "4.75");
    const check: TermCheck = { term: "t", grades: { [math.id]: { letter: "B" } }, at: "" };
    const withIt = withOfficial(term, check);
    assert.equal(withIt.find((c) => c.id === math.id)!.official!.letter, "B");
    assert.equal(semesterGPA(withIt, SAUDI5)!.toFixed(2), "4.61");
  });

  test("a letter the scheme doesn't have falls back to the estimate", () => {
    const c = { ...math, official: { letter: "Z" } };
    assert.equal(coursePoints(c, SAUDI5), 4.5);
  });

  test("percentage schemes use the official mark", () => {
    const c = { ...math, official: { mark: 88 } };
    assert.equal(coursePoints(c, PERCENTAGE), 88);
  });

  test("an official result counts even for a course with no grades entered", () => {
    const empty: Course = { ...math, id: "empty", components: [], official: { letter: "A" } };
    assert.equal(coursePoints(empty, SAUDI5), 4.75);
  });
});

describe("working back from the portal GPA", () => {
  test("the course nearest a cutoff comes first", () => {
    const g = explainGap(term, SAUDI5, 4.61);
    assert.ok(g.length >= 2);
    assert.equal(g[0].courseId, math.id);
    assert.equal(g[0].letter, "B");
    assert.equal(g[0].gpa.toFixed(2), "4.61");
    // Every guess really explains the gap.
    for (const x of g) assert.ok(sameGpa(x.gpa, 4.61, SAUDI5));
  });

  test("nothing when no single course explains the gap", () => {
    assert.deepEqual(explainGap(term, SAUDI5, 2.1), []);
  });

  test("nothing for percentage schemes", () => {
    assert.deepEqual(explainGap(term, PERCENTAGE, 80), []);
  });

  test("works on a 4.0 scale too", () => {
    // 4.0: A 3.75, B+ 3.5, B 3, A+ 4 → ours 3.75; B+→B in math = −1.5 pts / 11 h.
    const ours = semesterGPA(term, SAUDI4)!;
    const g = explainGap(term, SAUDI4, ours - 1.5 / 11);
    assert.equal(g[0].courseId, math.id);
    assert.equal(g[0].letter, "B");
  });
});

describe("tolerance", () => {
  test("0.04 on 4/5 scales, scaled for bigger ones, 0.1 for percentages", () => {
    assert.equal(gpaTolerance(SAUDI5), 0.04);
    assert.equal(gpaTolerance(SAUDI4), 0.04);
    assert.equal(gpaTolerance(PERCENTAGE), 0.1);
    const twenty = customScheme({ max: 20, bands: [{ letter: "A", points: 20, min: 90 }, { letter: "F", points: 0, min: null }] })!;
    assert.ok(Math.abs(gpaTolerance(twenty) - 0.16) < 1e-9);
    assert.ok(sameGpa(4.75, 4.71, SAUDI5));
    assert.ok(!sameGpa(4.75, 4.70, SAUDI5));
  });
});

describe("stored answers", () => {
  test("answers from another term are dropped", () => {
    assert.equal(readTermCheck({ term: "old", grades: {}, at: "" }, "new"), null);
  });

  test("bad grades are dropped, good ones kept", () => {
    const r = readTermCheck(
      { term: "t", answer: "mismatch", portalGpa: 4.2, consent: true, reason: "nope", grades: { a: { letter: "B+" }, b: { mark: 140 }, c: 5, d: { mark: 77 } }, at: "x" },
      "t"
    )!;
    assert.deepEqual(r.grades, { a: { letter: "B+" }, d: { mark: 77 } });
    assert.equal(r.answer, "mismatch");
    assert.equal(r.consent, true);
    assert.equal(r.reason, undefined);
  });
});

describe("when the window opens", () => {
  const now = new Date("2026-06-10T12:00:00");
  test("after the term ends, with grades, unanswered", () => {
    assert.ok(termCheckDue({ semester: semester("2026-06-01"), courses: term, termCheck: null }, now));
  });
  test("not before the term ends", () => {
    assert.ok(!termCheckDue({ semester: semester("2026-06-20"), courses: term, termCheck: null }, now));
  });
  test("not without any grades", () => {
    const empty = term.map((c) => ({ ...c, components: [] }));
    assert.ok(!termCheckDue({ semester: semester("2026-06-01"), courses: empty, termCheck: null }, now));
  });
  test("not once answered", () => {
    const tc: TermCheck = { term: "t", answer: "match", grades: {}, at: "" };
    assert.ok(!termCheckDue({ semester: semester("2026-06-01"), courses: term, termCheck: tc }, now));
  });
  test("\"not out yet\" waits until the snooze date", () => {
    const tc: TermCheck = { term: "t", grades: {}, snoozeUntil: "2026-06-15T00:00:00", at: "" };
    assert.ok(!termCheckDue({ semester: semester("2026-06-01"), courses: term, termCheck: tc }, now));
    assert.ok(termCheckDue({ semester: semester("2026-06-01"), courses: term, termCheck: tc }, new Date("2026-06-16")));
  });
});

describe("past terms", () => {
  test("GPA from transcript letters and hours", async () => {
    const { pastTermGpa } = await import("@/lib/termCheck");
    // 3h A+ (5) + 3h B (4) + 2h C (3) = 15+12+6 = 33 / 8
    const g = pastTermGpa(
      [
        { hours: 3, letter: "A+" },
        { hours: 3, letter: "B" },
        { hours: 2, letter: "C" },
      ],
      SAUDI5
    );
    assert.equal(g, 33 / 8);
    assert.equal(pastTermGpa([{ hours: 3, mark: 80 }, { hours: 1, mark: 100 }], PERCENTAGE), 85);
    assert.equal(pastTermGpa([{ hours: 3, letter: "Z" }], SAUDI5), null);
  });

  test("stored past terms are validated", async () => {
    const { readPastTerms } = await import("@/lib/termCheck");
    const list = readPastTerms([
      { id: "a", name: "L3", scheme: "saudi5", courses: [{ hours: 3, letter: "A" }, { hours: -1, letter: "B" }], portalGpa: 4.75, ours: 4.75, result: "match", at: "" },
      { id: "b", courses: [], portalGpa: 4 },
      "junk",
    ]);
    assert.equal(list.length, 1);
    assert.equal(list[0].courses.length, 1);
    assert.equal(list[0].result, "match");
  });
});

describe("the cumulative GPA against the portal", () => {
  test("a past term: the cumulative before it, over its hours, plus the term's courses", () => {
    // 4.00 over 30 h, then 3 h of A (4.75) and 3 h of B+ (4.5): (120 + 27.75) / 36.
    const cum = pastTermCumulative([{ hours: 3, letter: "A" }, { hours: 3, letter: "B+" }], SAUDI5, 4, 30)!;
    assert.ok(Math.abs(cum - 147.75 / 36) < 1e-9);
    assert.equal(sameGpa(cum, 4.1, SAUDI5), true);
    assert.equal(sameGpa(cum, 4.3, SAUDI5), false);
  });

  test("a withdrawn course stays out of it", () => {
    const cum = pastTermCumulative([{ hours: 3, letter: "A" }, { hours: 3, letter: "W" }], SAUDI5, 4, 30)!;
    assert.ok(Math.abs(cum - (120 + 14.25) / 33) < 1e-9);
  });

  test("the first term: the cumulative is the term's own GPA", () => {
    assert.equal(pastTermCumulative([{ hours: 3, letter: "A" }], SAUDI5, 0, 0), 4.75);
  });

  test("a stored check is read back, and a broken one dropped", () => {
    const tc = readTermCheck(
      { term: "t", grades: {}, at: "", cum: { before: 4.5, hours: 60, portal: 4.4, ours: 4.539, result: "mismatch", reason: "repeat" } },
      "t"
    )!;
    assert.deepEqual(tc.cum, { before: 4.5, hours: 60, portal: 4.4, ours: 4.539, result: "mismatch", reason: "repeat" });
    assert.equal(readTermCheck({ term: "t", grades: {}, at: "", cum: { before: "x" } }, "t")!.cum, undefined);
    const [p] = readPastTerms([
      { id: "a", courses: [{ hours: 3, letter: "A" }], portalGpa: 4.75, ours: 4.75, result: "match", cum: { before: 4, hours: 30, portal: 4.1, ours: 4.1, result: "match" } },
    ]);
    assert.equal(p.cum?.result, "match");
  });
});
