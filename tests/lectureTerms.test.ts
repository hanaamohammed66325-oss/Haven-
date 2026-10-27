// Which term a student's lecture reminders come from: the one whose dates cover
// their today, so a new term is reminded from its first day even before the app
// is opened, and never two terms at once. Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { lectureTermByUser, type TermInfo } from "../supabase/functions/scheduler-tick/lectureTerms";

const term = (id: string, start_date: string | null, end_date: string | null, is_active = false): TermInfo =>
  ({ id, start_date, end_date, is_active });
const terms = (...list: TermInfo[]) => new Map(list.map((t) => [t.id, t]));
const entry = (user_id: string, semester_id: string) => ({ user_id, semester_id });

describe("the term whose lectures are reminded", () => {
  test("the running term is chosen, and a term that has not begun or has ended is not", () => {
    const t = terms(term("old", "2026-08-23", "2027-01-07", true), term("next", "2027-01-17", "2027-06-26"));
    const rows = [entry("u1", "old"), entry("u1", "next")];
    assert.equal(lectureTermByUser(rows, t, () => "2026-10-27").get("u1"), "old");
    assert.equal(lectureTermByUser(rows, t, () => "2027-01-10").get("u1"), undefined); // the gap between them
  });

  test("the first day of a new term is reminded even though the app was not opened to flip the active flag", () => {
    const t = terms(term("old", "2026-08-23", "2027-01-07", true), term("next", "2027-01-17", "2027-06-26", false));
    const rows = [entry("u1", "old"), entry("u1", "next")];
    assert.equal(lectureTermByUser(rows, t, () => "2027-01-17").get("u1"), "next");
  });

  test("two overlapping terms never remind twice: the active one wins, else the one that began last", () => {
    const rows = [entry("u1", "a"), entry("u1", "b")];
    const flagged = terms(term("a", "2026-08-23", "2027-01-07", false), term("b", "2026-09-01", "2027-01-07", true));
    assert.equal(lectureTermByUser(rows, flagged, () => "2026-10-27").get("u1"), "b");
    const unflagged = terms(term("a", "2026-08-23", "2027-01-07"), term("b", "2026-09-01", "2027-01-07"));
    assert.equal(lectureTermByUser(rows, unflagged, () => "2026-10-27").get("u1"), "b");
    // Identical dates and no flag: still exactly one, the same one every minute.
    const same = terms(term("x", "2026-08-23", "2027-01-07"), term("y", "2026-08-23", "2027-01-07"));
    assert.equal(lectureTermByUser([entry("u1", "y"), entry("u1", "x")], same, () => "2026-10-27").get("u1"), "x");
  });

  test("each student is judged on their own date and nobody gets another's term", () => {
    const t = terms(term("t1", "2026-08-23", "2026-10-27"), term("t2", "2026-08-23", "2027-01-07"));
    const rows = [entry("riyadh", "t1"), entry("far-east", "t1"), entry("other", "t2")];
    const date = (u: string) => (u === "far-east" ? "2026-10-28" : "2026-10-27");
    const chosen = lectureTermByUser(rows, t, date);
    assert.equal(chosen.get("riyadh"), "t1");
    assert.equal(chosen.get("far-east"), undefined); // for them t1 ended yesterday
    assert.equal(chosen.get("other"), "t2");
  });

  test("a term with missing dates or one not found is skipped", () => {
    const t = terms(term("nodates", null, null, true));
    assert.equal(lectureTermByUser([entry("u1", "nodates"), entry("u1", "gone")], t, () => "2026-10-27").size, 0);
  });
});
