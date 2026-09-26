// A university's rule as its students describe it, offered beside the main one.
// Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { describePolicyAr, isStudentAlternative, type AttendancePolicy } from "@/lib/attendancePolicy";

const policy = (over: Partial<AttendancePolicy>): AttendancePolicy =>
  ({
    id: "x",
    university_slug: "jazan",
    scope: "university",
    method: "lectures",
    max_absence: 20,
    max_unexcused: null,
    excused_counts: true,
    warnings: [],
    details: {},
    status: "review",
    ...over,
  }) as AttendancePolicy;

describe("the students' version of a rule", () => {
  const alt = policy({ max_absence: 50, max_unexcused: 25, details: { alternative: true, crowd: true, limit_inclusive: true } });

  test("is told apart from the main rule", () => {
    assert.equal(isStudentAlternative(alt), true);
    assert.equal(isStudentAlternative(policy({})), false);
  });

  test("says the limits are reached, not passed", () => {
    assert.ok(describePolicyAr(alt).includes("الحرمان إذا وصل الغياب بدون عذر 25%، أو وصل الغياب كله مع الأعذار 50%"));
    const plain = policy({ max_absence: 50, max_unexcused: 25 });
    assert.ok(describePolicyAr(plain).some((l) => l.startsWith("الحرمان إذا تجاوز الغياب بدون عذر 25%")));
  });
});
