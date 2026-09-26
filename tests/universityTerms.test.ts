// Official term dates of universities outside Saudi, put on the student's
// semester automatically, and the students' answers about them. Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { OFFICIAL_TERMS, currentTerm, termDates, termPlan, termToApply, termToRelease, termId } from "@/lib/universityTerms";
import type { VerifiedFact } from "@/lib/universityFacts";
import { UNIVERSITY_HOLIDAYS } from "@/lib/countryHolidays";
import { termTallies, type TermVote } from "@/lib/holidayReports";

const typed = (name: string) => ({ universitySlug: "other", universityName: name });
const TODAY = "2026-09-25";
const mine = { startDate: "2026-08-23", endDate: "2027-01-07", weeks: 18, finalsWeeks: 2 };

describe("official term dates", () => {
  test("every university with its own holidays has its terms, in order", () => {
    assert.deepEqual(Object.keys(OFFICIAL_TERMS).sort(), Object.keys(UNIVERSITY_HOLIDAYS).sort());
    for (const [key, terms] of Object.entries(OFFICIAL_TERMS)) {
      for (const t of terms) assert.ok(t.start < t.finalsStart && t.finalsStart <= t.end, `${key} ${t.term}`);
      assert.ok(terms[0].end < terms[1].start, key);
    }
  });

  test("Abu Dhabi University's first term: 13 teaching weeks, 2 of finals", () => {
    const t = currentTerm("abu-dhabi-university", TODAY)!;
    assert.equal(t.term, "first");
    assert.deepEqual(termDates(t), { startDate: "2026-08-31", endDate: "2026-12-12", weeks: 13, finalsWeeks: 2 });
    // Once its finals are over, the next term is the one to use.
    assert.equal(currentTerm("abu-dhabi-university", "2026-12-13")!.term, "second");
    assert.equal(currentTerm("abu-dhabi-university", "2027-07-01"), null);
  });
});

describe("putting a university's term on the semester", () => {
  const plan = (academic: Parameters<typeof termPlan>[0], facts: VerifiedFact[] | null = null) => termPlan(academic, facts, TODAY);
  const fact = (term: "first" | "second", fact_key: string, date: string, status: "verified" | "suggested" = "verified"): VerifiedFact => ({
    status, academic_year: "2026-2027", term, fact_key, value: { date },
  });
  const jazan = [
    fact("first", "term_start", "2026-08-23"),
    fact("first", "finals_start", "2026-12-20"),
    fact("first", "term_end", "2027-01-07"),
    fact("second", "term_start", "2027-01-17"),
  ];

  test("a student at Abu Dhabi University gets its dates, and can take theirs back", () => {
    const r = termToApply(plan(typed("جامعة ابو ظبي")), mine, { placeholder: false })!;
    assert.equal(r.id, "abu-dhabi-university|2026-2027|first");
    assert.equal(r.dates.startDate, "2026-08-31");
    assert.deepEqual(r.prev, mine);
  });

  test("a Saudi university gets its official term from its facts, picked or typed", () => {
    for (const academic of [{ universitySlug: "jazan", universityName: "" }, typed("جامعة جازان")]) {
      const p = plan(academic, jazan)!;
      assert.equal(p.status, "official");
      assert.equal(p.id, "jazan|2026-2027|first");
      const r = termToApply(p, mine, { placeholder: false })!;
      assert.deepEqual(r.dates, { startDate: "2026-08-23", endDate: "2027-01-07", weeks: 17, finalsWeeks: 3 });
    }
  });

  test("moving from Sharjah to Jazan swaps Sharjah's dates for Jazan's, keeping the student's own from before", () => {
    const sharjah = termToApply(plan(typed("جامعة الشارقة")), mine, { placeholder: false })!;
    const state = { applied: sharjah.id, appliedDates: sharjah.appliedDates, prev: mine, placeholder: false };
    const r = termToApply(plan({ universitySlug: "jazan", universityName: "" }, jazan), sharjah.dates, state)!;
    assert.equal(r.dates.startDate, "2026-08-23");
    assert.deepEqual(r.prev, mine);
  });

  test("applied once: the student's own edits afterwards stay", () => {
    const id = "abu-dhabi-university|2026-2027|first";
    const edited = { startDate: "2026-09-01", endDate: "2026-12-12", weeks: 13, finalsWeeks: 2 };
    assert.equal(termToApply(plan(typed("جامعة أبوظبي")), edited, { applied: id, placeholder: false }), null);
  });

  test("moving to another university applies its dates, keeping the dates from before any change", () => {
    const adu = termToApply(plan(typed("جامعة أبوظبي")), mine, { placeholder: false })!;
    const r = termToApply(plan(typed("جامعة قطر")), adu.dates, { applied: adu.id, prev: mine, placeholder: false })!;
    assert.equal(r.id, "qatar-university|2026-2027|first");
    assert.equal(r.dates.startDate, "2026-08-23");
    assert.deepEqual(r.prev, mine);
  });

  test("a new term applies again", () => {
    const first = "abu-dhabi-university|2026-2027|first";
    const p = termPlan(typed("جامعة أبوظبي"), null, "2026-12-20");
    const r = termToApply(p, termDates(currentTerm("abu-dhabi-university", TODAY)!), { applied: first, placeholder: false })!;
    assert.equal(r.id, "abu-dhabi-university|2026-2027|second");
    assert.equal(r.dates.startDate, "2027-02-22");
  });

  test("nothing to take back from the sign-up placeholder", () => {
    assert.equal(termToApply(plan(typed("جامعة خليفة")), mine, { placeholder: true })!.prev, null);
  });

  test("a term on record in part, or only suggested, is for the student to complete — never applied", () => {
    const partial = plan({ universitySlug: "jazan", universityName: "" }, jazan.filter((f) => f.fact_key !== "finals_start"))!;
    assert.equal(partial.status, "incomplete");
    const suggested = plan({ universitySlug: "bahah", universityName: "" }, [fact("first", "finals_start", "2026-12-27", "suggested")])!;
    assert.equal(suggested.status, "incomplete");
    assert.equal(suggested.id, "bahah|2026-2027|first");
    assert.equal(termToApply(partial, mine, { placeholder: false }), null);
  });

  test("a university with no calendar on record asks for the student's own dates", () => {
    assert.deepEqual(plan({ universitySlug: "king-saud", universityName: "" }, []), { status: "unknown", key: "king-saud", id: "none|king-saud" });
    assert.equal(plan(typed("الجامعة الأردنية"))!.status, "unknown");
    assert.equal(plan(typed("الجامعة الأردنية"))!.key, null);
    assert.equal(plan(typed("")), null);
  });

  test("moving to such a university takes the other one's dates back off", () => {
    const sharjah = termToApply(plan(typed("جامعة الشارقة")), mine, { placeholder: false })!;
    const state = { applied: sharjah.id, appliedDates: sharjah.appliedDates, prev: mine, placeholder: false };
    assert.deepEqual(termToRelease(plan(typed("الجامعة الأردنية")), sharjah.dates, state), { restore: mine });
    // Changed by the student since: their dates stay, only the applied term is forgotten.
    const edited = { ...sharjah.dates, endDate: "2026-12-20" };
    assert.deepEqual(termToRelease(plan(typed("الجامعة الأردنية")), edited, state), { restore: null });
    assert.equal(termToRelease(plan(typed("جامعة الشارقة")), sharjah.dates, state), null);
  });

  test("the id names a term we hold", () => {
    assert.equal(termId("ptuk", OFFICIAL_TERMS.ptuk[1]), "ptuk|2026-2027|second");
  });
});

describe("students' answers about the term dates", () => {
  const vote = (answer: TermVote["answer"], key = "abu-dhabi-university"): TermVote => ({ university_slug: key, period: "2026-2027|first", answer });
  const right = { start: "2026-08-31", finals_start: "2026-11-30", end: "2026-12-12" };

  test("confirmed, corrected and kept-own answers are counted apart", () => {
    const [t] = termTallies("abu-dhabi-university", [
      vote(right),
      vote(right),
      vote({ ...right, start: "2026-09-01" }),
      vote({ start: "2026-08-23", finals_start: "2026-12-27", end: "2027-01-07", kept_own: true }),
      vote(right, "qatar-university"),
    ]);
    assert.equal(t.agree, 2);
    assert.equal(t.differ, 2);
    assert.equal(t.keptOwn, 1);
    assert.equal(t.disputed, false);
    assert.equal(t.answers.length, 2);
  });

  test("3 differing flags the term", () => {
    const wrong = { ...right, finals_start: "2026-12-01" };
    const [t] = termTallies("abu-dhabi-university", [vote(wrong), vote(wrong), vote(wrong)]);
    assert.equal(t.disputed, true);
    assert.deepEqual(t.answers, [{ start: "2026-08-31", finals: "2026-12-01", end: "2026-12-12", n: 3 }]);
  });
});

describe("the days no lecture reminder goes out", () => {
  test("Qatar National Day is one of them for a Qatar University student, unless they removed it", async () => {
    const { classOffDays } = await import("@/lib/holidays");
    const sem = { startDate: "2026-08-23", endDate: "2027-01-07" };
    assert.ok(classOffDays(sem, "qatar-university").includes("2026-12-18"));
    assert.ok(classOffDays(sem, "qatar-university").includes("2026-10-27"));
    assert.ok(!classOffDays({ ...sem, dismissedHolidays: ["qa-national-day-2026"] }, "qatar-university").includes("2026-12-18"));
    // Outside the term: not counted.
    assert.ok(!classOffDays({ startDate: "2026-08-23", endDate: "2026-12-17" }, "qatar-university").includes("2026-12-18"));
  });
});
