// Repeated courses — how the earlier attempt affects the cumulative GPA.
// Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { AcademicInfo, Course } from "@/types";
import { SAUDI5, PERCENTAGE, isSaudiUniversity } from "@/lib/gradeSchemes";
import { projectedCumulativeGpa, projectedCumulativeFromParts } from "@/lib/grades";
import { readRepeats, repeatAdjust, withRepeats } from "@/lib/repeats";

const course = (id: string, creditHours: number, pct: number): Course => ({
  id,
  name: id,
  creditHours,
  sessions: [],
  missedLectures: 0,
  missedSessions: [],
  components: [{ id: `${id}-f`, name: "final", type: "final", weight: 100, unit: "percent", total: 100, score: pct, date: null }],
});

const saudi: AcademicInfo = { universitySlug: "king-saud", universityName: "جامعة الملك سعود", major: "", level: "" };
const abroad = (repeatPolicy?: AcademicInfo["repeatPolicy"]): AcademicInfo => ({
  universitySlug: "other",
  universityName: "جامعة الكويت",
  major: "",
  level: "",
  ...(repeatPolicy ? { repeatPolicy } : {}),
});

// A 3-hour course taken before, now at 91% (A = 4.75); another at 96% (A+ = 5).
const other = course("other", 3, 96);
const redo = (repeat: Course["repeat"]) => ({ ...course("redo", 3, 91), repeat });
// Record so far: 30 hours at 3.00 = 90 points, including the earlier attempt.

describe("which universities are Saudi", () => {
  test("a listed Saudi university, a typed foreign one, and unknown", () => {
    assert.equal(isSaudiUniversity(saudi), true);
    assert.equal(isSaudiUniversity(abroad()), false);
    assert.equal(isSaudiUniversity({ ...abroad(), universityName: "جامعة النجوم الأهلية" }), null);
    assert.equal(isSaudiUniversity({ ...abroad(), universityName: "جامعة قطر" }), false);
  });
});

describe("Saudi universities follow the study regulations", () => {
  test("a failed course: both attempts count", () => {
    const g = projectedCumulativeGpa([redo({ kind: "failed", letter: "F" }), other], 3, 30, SAUDI5, saudi)!;
    assert.equal(g.toFixed(4), ((90 + 14.25 + 15) / 36).toFixed(4));
  });

  test("a course repeated to raise the GPA: the higher grade replaces the old one", () => {
    // old D (2) → new A (4.75): (90 − 6 + 14.25 + 15) / 33
    const g = projectedCumulativeGpa([redo({ kind: "raise", letter: "D" }), other], 3, 30, SAUDI5, saudi)!;
    assert.equal(g.toFixed(4), ((84 + 14.25 + 15) / 33).toFixed(4));
  });

  test("…and can't rise above the graduation minimum", () => {
    const low = { ...saudi, gradMinGpa: 2 };
    // Record 1.80 over 30 h; with the repeat it would pass 2.00.
    const g = projectedCumulativeGpa([redo({ kind: "raise", letter: "D" }), other], 1.8, 30, SAUDI5, low)!;
    assert.equal(g, 2);
  });

  test("the ceiling never lowers a GPA that's already above it", () => {
    const low = { ...saudi, gradMinGpa: 2 };
    const g = projectedCumulativeGpa([redo({ kind: "raise", letter: "D" }), other], 3, 30, SAUDI5, low)!;
    assert.equal(g, 3);
  });

  test("the policy question doesn't apply to Saudi students", () => {
    const g = projectedCumulativeGpa([redo({ kind: "failed", letter: "F" }), other], 3, 30, SAUDI5, { ...saudi, repeatPolicy: "latest" });
    assert.equal(g, projectedCumulativeGpa([redo({ kind: "failed" }), other], 3, 30, SAUDI5, saudi));
  });
});

describe("universities outside Saudi Arabia: the student's answer", () => {
  test("latest: the old attempt comes out", () => {
    const g = projectedCumulativeGpa([redo({ letter: "F" }), other], 3, 30, SAUDI5, abroad("latest"))!;
    assert.equal(g.toFixed(4), ((87 + 14.25 + 15) / 33).toFixed(4));
  });

  test("higher: the old grade wins when the new one is lower", () => {
    // old A+ (5) beats new A (4.75): the record keeps 5, the new attempt drops out.
    const g = projectedCumulativeGpa([redo({ letter: "A+" }), other], 3, 30, SAUDI5, abroad("higher"))!;
    // (90 − 4.75×3 + 14.25 + 15) / 33 = (90 + 15) / 33
    assert.equal(g.toFixed(4), ((90 + 15) / 33).toFixed(4));
  });

  test("higher: the new grade wins when it's higher", () => {
    assert.equal(
      projectedCumulativeGpa([redo({ letter: "F" }), other], 3, 30, SAUDI5, abroad("higher")),
      projectedCumulativeGpa([redo({ letter: "F" }), other], 3, 30, SAUDI5, abroad("latest"))
    );
  });

  test("both, or no answer yet: nothing comes out", () => {
    const both = projectedCumulativeGpa([redo({ letter: "F" }), other], 3, 30, SAUDI5, abroad("both"));
    assert.equal(both, projectedCumulativeGpa([redo({ letter: "F" }), other], 3, 30, SAUDI5, abroad()));
    assert.equal(both!.toFixed(4), ((90 + 14.25 + 15) / 36).toFixed(4));
  });

  test("other (described in words): counted as both until it's added", () => {
    assert.equal(
      projectedCumulativeGpa([redo({ letter: "F" }), other], 3, 30, SAUDI5, { ...abroad("other"), repeatPolicyNote: "المتوسط" }),
      projectedCumulativeGpa([redo({ letter: "F" }), other], 3, 30, SAUDI5, abroad("both"))
    );
  });

  test("an earlier grade that wasn't given can't be removed", () => {
    assert.deepEqual(repeatAdjust([redo({})], SAUDI5, abroad("latest")), { points: 0, hours: 0, cap: null });
  });

  test("percentage schemes use the old mark", () => {
    const r = repeatAdjust([{ ...course("p", 3, 80), repeat: { mark: 50 } }], PERCENTAGE, abroad("latest"));
    assert.deepEqual(r, { points: 150, hours: 3, cap: null });
  });
});

test("ignored when the entered record is too small to hold it", () => {
  assert.equal(
    projectedCumulativeFromParts(15, 3, 4, 2, SAUDI5, { points: 3, hours: 3, cap: null }),
    projectedCumulativeFromParts(15, 3, 4, 2, SAUDI5)
  );
});

describe("stored repeats", () => {
  test("another semester's repeats are dropped", () => {
    assert.deepEqual(readRepeats({ term: "old", courses: { a: { letter: "F" } } }, "new"), {});
  });

  test("bad entries are cleaned, the reason is kept", () => {
    const r = readRepeats(
      { term: "t", courses: { a: { letter: "F", kind: "raise" }, b: { mark: 400 }, c: { kind: "nope" }, d: 7 } },
      "t"
    );
    assert.deepEqual(r, { a: { kind: "raise", letter: "F" }, b: {}, c: {} });
  });

  test("attached to the course", () => {
    const [x] = withRepeats([course("a", 3, 90)], { a: { letter: "D" } });
    assert.deepEqual(x.repeat, { letter: "D" });
  });
});
