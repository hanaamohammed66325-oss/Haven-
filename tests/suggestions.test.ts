// Suggested data students confirm: calendars from an unofficial source, and
// absence rules waiting for approval.
// Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { defaultsFromFacts, type VerifiedFact } from "@/lib/universityFacts";
import { policyKind, policyRuleKey, type AttendancePolicy } from "@/lib/attendancePolicy";
import { ruleMode } from "@/lib/grades";
import type { AttendanceRule, Semester } from "@/types";

const fact = (key: string, date: string, over: Partial<VerifiedFact> = {}): VerifiedFact => ({
  status: "verified",
  verified_via: "admin",
  academic_year: "2026-2027",
  term: "first",
  fact_key: key,
  value: { date },
  ...over,
});
const TODAY = "2026-09-25";

describe("calendar defaults", () => {
  test("an official calendar is official", () => {
    const d = defaultsFromFacts([fact("term_start", "2026-08-23"), fact("finals_start", "2026-12-20"), fact("finals_end", "2027-01-07")], "x", TODAY);
    assert.equal(d.kind, "official");
    assert.equal(d.startDate, "2026-08-23");
    assert.equal(d.endDate, "2027-01-07");
    assert.equal(d.weeks, 17);
  });

  test("a suggested calendar with only its finals is offered, without a start", () => {
    const s = { status: "suggested" as const, verified_via: null };
    const d = defaultsFromFacts([fact("finals_start", "2026-12-20", s), fact("finals_end", "2027-01-05", s)], "x", TODAY);
    assert.equal(d.kind, "suggested");
    assert.equal(d.startDate, null);
    assert.equal(d.endDate, "2027-01-05");
    assert.equal(d.finalsStart, "2026-12-20");
    assert.equal(d.weeks, null);
  });

  test("finals start alone isn't taken as the end of the term", () => {
    const d = defaultsFromFacts([fact("finals_start", "2026-12-20", { status: "suggested" })], "x", TODAY);
    assert.equal(d.kind, "suggested");
    assert.equal(d.endDate, null);
  });

  test("dates students confirmed are marked as theirs", () => {
    const c = { verified_via: "crowd" as const };
    const d = defaultsFromFacts([fact("term_start", "2026-08-23", c), fact("finals_start", "2026-12-20", c)], "x", TODAY);
    assert.equal(d.kind, "students");
  });

  test("an approved term without a start date is still not offered", () => {
    const d = defaultsFromFacts([fact("finals_start", "2026-12-20"), fact("finals_end", "2027-01-05")], "x", TODAY);
    assert.equal(d.term, null);
    assert.equal(d.kind, null);
  });
});

const policy = (over: Partial<AttendancePolicy> = {}) =>
  ({
    status: "review",
    details: {},
    method: "lectures",
    max_absence: 25,
    max_unexcused: null,
    excused_counts: true,
    ...over,
  }) as AttendancePolicy;

describe("absence rule suggestions", () => {
  test("where a rule came from", () => {
    assert.equal(policyKind(policy({ status: "verified" })), "official");
    assert.equal(policyKind(policy()), "document");
    assert.equal(policyKind(policy({ status: "verified", details: { auto_verified: true } })), "students");
    assert.equal(policyKind(policy({ status: "verified", details: { crowd: true } })), "students");
  });

  test("the rule key ignores approval, only the rule counts", () => {
    assert.equal(policyRuleKey(policy()), policyRuleKey(policy({ status: "verified" })));
    assert.notEqual(policyRuleKey(policy()), policyRuleKey(policy({ max_absence: 20 })));
    assert.notEqual(policyRuleKey(policy()), policyRuleKey(policy({ method: "hours" })));
  });

  test("excused absence not counted: the limit is compared whichever field holds it", () => {
    assert.equal(
      policyRuleKey(policy({ excused_counts: false, max_absence: 25, max_unexcused: null })),
      policyRuleKey(policy({ excused_counts: false, max_absence: null, max_unexcused: 25 }))
    );
  });
});

describe("the rule sets how courses count", () => {
  const sem = (attendanceRule: Partial<AttendanceRule> | undefined) =>
    ({ attendanceRule: attendanceRule && { source: "university", method: "unspecified", ...attendanceRule } }) as Semester;

  test("a rule in force sets by-lecture or by-hour", () => {
    assert.equal(ruleMode(sem({ method: "lectures" })), "lecture");
    assert.equal(ruleMode(sem({ method: "hours", source: "personal" })), "hour");
  });

  test("an unconfirmed or silent rule sets nothing", () => {
    assert.equal(ruleMode(sem({ method: "lectures", source: "none", pending: true })), null);
    assert.equal(ruleMode(sem({ method: "unspecified" })), null);
    assert.equal(ruleMode(sem(undefined)), null);
  });
});
