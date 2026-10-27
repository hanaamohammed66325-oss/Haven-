import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  canPinSemester, currentSemesterForDate, duplicateSemesterCandidates, hiddenDuplicateSemesters, nextSemesterDates,
  nextSemesterProgress, prepareSemesterProgress, semesterDatesProblem, semesterEndPromptDue,
  semesterForAward, semesterWeeks,
} from "@/lib/semesterProgress";
import { termPlan } from "@/lib/universityTerms";
import type { Semester } from "@/types";

describe("semester transition", () => {
  test("future creation keeps the dated current term until it begins", () => {
    const terms = [
      { id: "first", startDate: "2026-08-23", endDate: "2027-01-07", isActive: false },
      { id: "second", startDate: "2027-01-17", endDate: "2027-06-17", isActive: true },
    ];
    assert.equal(currentSemesterForDate(terms, "2026-10-27")?.id, "first");
    assert.equal(currentSemesterForDate(terms, "2027-01-10")?.id, "first");
    assert.equal(currentSemesterForDate(terms, "2027-01-17")?.id, "second");
    // Choosing the term that has not begun does not take the current term from the
    // running one (its reminders would stop): see canPinSemester and the cases below.
    assert.equal(currentSemesterForDate(terms, "2026-10-27", "second")?.id, "first");
  });
  test("imports the old active term once without leaking it into a marked new term", () => {
    const legacy = { gamification: { xp: 80 }, plannerAutoEdits: { x: { done: true } } };
    const old = prepareSemesterProgress({}, undefined, legacy, "2026-01-01", "2026-04-16");
    assert.deepEqual(old.progress.gamification, { xp: 80 });
    assert.equal(old.progress.semesterVersion, 1);
    assert.ok(old.savePatch);

    const next = prepareSemesterProgress({ semesterVersion: 1, cumulativeStartGpa: 4.2 }, undefined, legacy,
      "2026-04-17", "2026-08-01");
    assert.equal(next.progress.gamification, undefined);
    assert.equal(next.progress.plannerAutoEdits, undefined);
    assert.equal(next.savePatch, null);
  });

  test("keeps week marks when dates are later edited", () => {
    const oldKey = "2026-01-01:2026-04-16:2026-01-15";
    const prepared = prepareSemesterProgress({ semesterVersion: 1, plannerCompletedWeeks: { [oldKey]: "#112233" } },
      null, {}, "2026-01-01", "2026-04-16");
    assert.deepEqual((prepared.progress.plannerCompletedWeeks as Record<string, string>)["week:2"], "#112233");
    assert.ok(prepared.savePatch);
    const reloaded = prepareSemesterProgress(prepared.progress, null, {}, "2026-01-02", "2026-04-17");
    assert.equal((reloaded.progress.plannerCompletedWeeks as Record<string, string>)["week:2"], "#112233");
  });

  test("carries only a confirmed ending cumulative result", () => {
    const unconfirmed = nextSemesterProgress({ cumulativeEndGpa: 4.8 }, 3.9, 44, { universitySlug: "x" }, "hijri");
    assert.equal(unconfirmed.cumulativeStartGpa, 3.9);
    assert.equal(unconfirmed.cumulativeStartHours, 44);
    assert.equal(unconfirmed.gamification, undefined);
    const confirmed = nextSemesterProgress({
      cumulativeEndGpa: 4.1, cumulativeEndHours: 59, cumulativeConfirmedAt: "2026-05-01T00:00:00Z",
    }, 3.9, 44, {}, "gregorian");
    assert.equal(confirmed.cumulativeStartGpa, 4.1);
    assert.equal(confirmed.cumulativeStartHours, 59);
  });

  test("offers the transition after the end date and never again after Later", () => {
    const semester = { endDate: "2026-10-26" } as Semester;
    assert.equal(semesterEndPromptDue(semester, new Date("2026-10-26T23:59:00"), false, true), false);
    assert.equal(semesterEndPromptDue(semester, new Date("2026-10-27T00:00:01"), false, true), true);
    assert.equal(semesterEndPromptDue(semester, new Date("2026-10-27T00:00:01"), true, true), false);
    assert.equal(semesterEndPromptDue(semester, new Date("2026-10-27T00:00:01"), false, false), false);
  });

  test("assigns delayed group awards only to one matching semester", () => {
    const terms = [
      { id: "old", startDate: "2026-01-01", endDate: "2026-04-30" },
      { id: "new", startDate: "2026-05-01", endDate: "2026-08-31" },
    ];
    assert.equal(semesterForAward(+new Date(2026, 3, 15, 12), terms), "old");
    assert.equal(semesterForAward(+new Date(2026, 4, 15, 12), terms), "new");
    assert.equal(semesterForAward(+new Date(2025, 11, 15, 12), terms), null);
    assert.equal(semesterForAward(+new Date(2026, 3, 15, 12), [...terms, terms[0]]), null);
    const withGap = [{ ...terms[0], endDate: "2026-04-15" }, { ...terms[1], startDate: "2026-05-15" }];
    assert.equal(semesterForAward(+new Date(2026, 3, 25, 12), withGap), "old");
    assert.equal(semesterForAward(+new Date(2026, 4, 15, 12), withGap), "new");
  });

  test("a new term starts after the running one; only an ended term starts today", () => {
    const today = new Date(2026, 9, 27);
    assert.equal(nextSemesterDates("2026-12-31", today).startDate, "2027-01-01");
    assert.equal(nextSemesterDates("2026-10-27", today).startDate, "2026-10-28");
    assert.equal(nextSemesterDates("2026-09-30", today).startDate, "2026-10-27");
    assert.equal(nextSemesterDates("not a date", today).startDate, "2026-10-27");
  });

  test("a term created while the university's term is running gets the next university term", () => {
    // Before: unconfirmed dates started the new term today, inside the running
    // term, and the running term's dates and breaks were then written onto it.
    const uni = { universitySlug: "other", universityName: "جامعة أبوظبي" };
    const dates = nextSemesterDates("2026-12-12", new Date(2026, 9, 27));
    assert.equal(dates.startDate, "2026-12-13");
    const plan = termPlan(uni, null, "2026-10-27", dates);
    assert.equal(plan?.id, "abu-dhabi-university|2026-2027|second");
  });
});

describe("empty leftover copies of a term", () => {
  const term = (id: string, startDate: string, endDate: string, isActive: boolean, progress: Record<string, unknown> = {}) =>
    ({ id, startDate, endDate, isActive, progress });
  const active = term("active", "2026-08-23", "2027-01-07", true, { semesterVersion: 1 });
  const copy = term("copy", "2026-08-23", "2027-01-07", false);
  const other = term("other", "2027-01-17", "2027-06-17", false);

  test("only an inactive, progress-free term with another term's exact dates can be a copy", () => {
    assert.deepEqual(duplicateSemesterCandidates([active, copy, other]), ["copy"]);
    assert.deepEqual(duplicateSemesterCandidates([active, term("kept", "2026-08-23", "2027-01-07", false, { gamification: {} })]), []);
    assert.deepEqual(duplicateSemesterCandidates([active, copy], "copy"), []);
    assert.deepEqual(duplicateSemesterCandidates([copy, other]), []);
  });

  test("a copy is hidden only when it holds no rows; a copy with data stays", () => {
    assert.deepEqual([...hiddenDuplicateSemesters([active, copy, other], new Set(["copy"]))], ["copy"]);
    assert.deepEqual([...hiddenDuplicateSemesters([active, copy, other], new Set())], []);
    assert.deepEqual([...hiddenDuplicateSemesters([active, copy, other], new Set(["copy"]), "copy")], []);
  });

  test("two empty copies with no other term of those dates keep one visible", () => {
    const a = term("a", "2026-08-23", "2027-01-07", false);
    const b = term("b", "2026-08-23", "2027-01-07", false);
    assert.equal(hiddenDuplicateSemesters([a, b], new Set(["a", "b"])).size, 1);
    assert.equal(hiddenDuplicateSemesters([a, b, active], new Set(["a", "b"])).size, 2);
  });
});

describe("the chosen current term", () => {
  const first = { id: "first", startDate: "2026-08-23", endDate: "2027-01-07", isActive: true };
  const second = { id: "second", startDate: "2027-01-17", endDate: "2027-06-26", isActive: false };
  const fourth = { id: "fourth", startDate: "2027-08-23", endDate: "2028-01-07", isActive: false };
  const terms = [first, second, fourth];

  test("a term can be chosen while it runs, or when no term runs", () => {
    assert.equal(canPinSemester(first, terms, "2026-10-27"), true);
    // Another term runs: a term that has not begun or has ended cannot be chosen.
    assert.equal(canPinSemester(second, terms, "2026-10-27"), false);
    assert.equal(canPinSemester(first, terms, "2027-02-01"), false);
    // The gap between two terms: nothing runs, so either can be chosen.
    assert.equal(canPinSemester(second, terms, "2027-01-10"), true);
    assert.equal(canPinSemester(first, terms, "2027-01-10"), true);
  });

  test("a choice holds until its term has ended and the next one runs, then the dates decide", () => {
    assert.equal(currentSemesterForDate(terms, "2026-10-27", "first")?.id, "first");
    assert.equal(currentSemesterForDate(terms, "2027-01-10", "first")?.id, "first");
    assert.equal(currentSemesterForDate(terms, "2027-01-17", "first")?.id, "second");
    assert.equal(currentSemesterForDate(terms, "2027-03-01", "first")?.id, "second");
  });

  test("a choice of a term that has not begun does not hold while another runs", () => {
    assert.equal(currentSemesterForDate(terms, "2026-10-27", "fourth")?.id, "first");
    // With nothing running, the choice stands.
    assert.equal(currentSemesterForDate(terms, "2027-07-01", "fourth")?.id, "fourth");
    assert.equal(currentSemesterForDate(terms, "2026-10-27", "missing")?.id, "first");
  });
});

describe("dates typed for a new term", () => {
  const first = { name: "الفصل الأول", startDate: "2026-08-23", endDate: "2027-01-07", isActive: true };
  const old = { name: "فصل سابق", startDate: "2026-01-01", endDate: "2026-06-01", isActive: false };

  test("the second term typed by the student is accepted, a clash with another term is not", () => {
    assert.equal(semesterDatesProblem("2027-01-17", "2027-06-26", [first, old]), null);
    // The day after the first term ends is allowed; its last day is not.
    assert.equal(semesterDatesProblem("2027-01-08", "2027-06-26", [first]), null);
    assert.deepEqual(semesterDatesProblem("2027-01-07", "2027-06-26", [first]), { kind: "overlap", name: "الفصل الأول" });
    // Containing, contained and straddling terms all clash.
    assert.equal(semesterDatesProblem("2026-01-01", "2027-12-31", [first])?.kind, "overlap");
    assert.equal(semesterDatesProblem("2026-10-01", "2026-10-02", [first])?.kind, "overlap");
    assert.equal(semesterDatesProblem("2026-05-20", "2026-09-01", [first, old])?.kind, "overlap");
  });

  test("names the current term when several clash; terms without dates never clash", () => {
    assert.deepEqual(semesterDatesProblem("2026-05-20", "2026-09-01", [old, first]), { kind: "overlap", name: "الفصل الأول" });
    assert.equal(semesterDatesProblem("2027-02-01", "2027-03-01", [{ name: "x", startDate: null, endDate: null, isActive: false }]), null);
  });

  test("missing, malformed or reversed dates are refused", () => {
    assert.equal(semesterDatesProblem("", "2027-06-26", [])?.kind, "required");
    assert.equal(semesterDatesProblem("2027-01-17", "", [])?.kind, "required");
    assert.equal(semesterDatesProblem("17/01/2027", "2027-06-26", [])?.kind, "required");
    assert.equal(semesterDatesProblem("2027-06-26", "2027-01-17", [])?.kind, "order");
    assert.equal(semesterDatesProblem("2027-01-17", "2027-01-17", []), null);
  });

  test("weeks follow the dates: two finals weeks, at least one teaching week, never above the limits", () => {
    assert.deepEqual(semesterWeeks("2027-01-17", "2027-06-26"), { weeks: 21, finalsWeeks: 2 });
    // 112 days, exactly 16 weeks.
    assert.deepEqual(semesterWeeks("2026-08-23", "2026-12-12"), { weeks: 14, finalsWeeks: 2 });
    assert.deepEqual(semesterWeeks("2027-01-17", "2027-01-17"), { weeks: 1, finalsWeeks: 0 });
    assert.deepEqual(semesterWeeks("2027-01-17", "2027-01-24"), { weeks: 1, finalsWeeks: 1 });
    assert.equal(semesterWeeks("2026-01-01", "2030-01-01").weeks, 52);
  });
});
