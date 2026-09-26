// Portal results that aren't letters: W (withdrawn) and DN (denied).
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Course } from "@/types";
import { SAUDI4, SAUDI5 } from "@/lib/gradeSchemes";
import { semesterGpaDetail } from "@/lib/grades";
import { pastTermGpa } from "@/lib/termCheck";

const course = (id: string, pct: number, official?: Course["official"]): Course => ({
  id,
  name: id,
  creditHours: 3,
  sessions: [],
  missedLectures: 0,
  missedSessions: [],
  components: [{ id: `${id}-f`, name: "final", type: "final", weight: 100, unit: "percent", total: 100, score: pct, date: null }],
  ...(official ? { official } : {}),
});

test("W leaves the GPA entirely — points and hours", () => {
  const d = semesterGpaDetail([course("a", 96), course("b", 70, { letter: "W" })], SAUDI5);
  assert.deepEqual(d, { gpa: 5, points: 15, credits: 3 });
});

test("DN counts as the failing grade: 1 on 5.0, 0 on 4.0", () => {
  assert.equal(semesterGpaDetail([course("a", 96), course("b", 90, { letter: "DN" })], SAUDI5).gpa, (15 + 3) / 6);
  assert.equal(semesterGpaDetail([course("a", 96), course("b", 90, { letter: "DN" })], SAUDI4).gpa, 12 / 6);
});

test("past terms: W skipped, DN failed", () => {
  const gpa = pastTermGpa(
    [
      { hours: 3, letter: "A+" },
      { hours: 3, letter: "W" },
      { hours: 2, letter: "DN" },
    ],
    SAUDI5
  );
  assert.equal(gpa, (15 + 2) / 5);
});
