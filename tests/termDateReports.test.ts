// Term dates students set when their university has no calendar on record,
// grouped by university for the admin page. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupTermDateReports, type TermDateRow } from "@/lib/termDateReports";

const row = (name: string | null, dates: [string, string, number, number] | null, extra: Partial<TermDateRow> = {}): TermDateRow => ({
  user_id: Math.random().toString(36),
  last_active_at: null,
  slug: "other",
  name,
  answered: null,
  start_date: dates?.[0] ?? null,
  end_date: dates?.[1] ?? null,
  teaching_weeks: dates?.[2] ?? null,
  finals_weeks: dates?.[3] ?? null,
  ...extra,
});

test("students at a university with no calendar are grouped by its name, with the dates they set", () => {
  const own: [string, string, number, number] = ["2026-09-06", "2027-01-14", 16, 2];
  const groups = groupTermDateReports([
    row("الجامعة الأردنية", own, { answered: "none|الجامعه الاردنيه" }),
    row("الجامعه الاردنيه", own),
    row("الجامعة الأردنية", ["2026-09-01", "2026-12-15", 13, 2]), // sign-up default: 105 days, 13 + 2
    row("جامعة قطر", ["2026-08-23", "2026-12-17", 15, 2]), // its calendar is in the app
    row("جامعة الملك سعود", own, { slug: "king-saud", name: null }), // Saudi, with a calendar on record
    row("جامعة دمشق", null), // no semester yet
  ]);
  assert.equal(groups.length, 1);
  const [g] = groups;
  assert.equal(g.country, "JO");
  assert.equal(g.students.length, 3);
  assert.deepEqual(g.dates, [{ start: "2026-09-06", finals: "2026-12-27", end: "2027-01-14", n: 2, confirmed: 1 }]);
});

test("a Saudi university shows once its student answered the note", () => {
  const groups = groupTermDateReports([
    row(null, ["2026-08-30", "2027-01-07", 16, 2], { slug: "king-saud", answered: "none|king-saud" }),
  ]);
  assert.equal(groups[0].key, "king-saud");
  assert.equal(groups[0].label, "جامعة الملك سعود");
  assert.equal(groups[0].country, "SA");
});
