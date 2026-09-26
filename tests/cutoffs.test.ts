// Grade cutoffs learned from students' results, and applying approved ones.
// Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyCutoffs, detectScheme, setLearnedCutoffs, bandForPct, JORDAN4, type GradeScheme } from "@/lib/gradeSchemes";
import { learnCutoffs, validCutoffs } from "@/lib/cutoffLearning";

describe("learning cutoffs", () => {
  const scheme = JORDAN4;
  test("the cutoff sits between the lower grades and this one", () => {
    const rows = learnCutoffs(scheme, [
      { letter: "A", pct: 91.5 },
      { letter: "A", pct: 88.2 },
      { letter: "A-", pct: 86.9 },
      { letter: "B+", pct: 80 },
    ]);
    const a = rows.find((r) => r.letter === "A")!;
    assert.equal(a.n, 2);
    assert.equal(a.min, 88.2);
    assert.equal(a.suggested, 88); // whole number, still above 86.9
    assert.equal(a.conflict, false);
    const aMinus = rows.find((r) => r.letter === "A-")!;
    assert.equal(aMinus.suggested, 86); // lowest A- or higher is 86.9, highest lower is 80
  });

  test("a whole number that would swallow a lower result isn't suggested", () => {
    const rows = learnCutoffs(scheme, [
      { letter: "A", pct: 88.6 },
      { letter: "A-", pct: 88.1 },
    ]);
    assert.equal(rows.find((r) => r.letter === "A")!.suggested, 88.6);
  });

  test("contradicting results give no suggestion", () => {
    const rows = learnCutoffs(scheme, [
      { letter: "A", pct: 85 },
      { letter: "A-", pct: 87 },
    ]);
    const a = rows.find((r) => r.letter === "A")!;
    assert.equal(a.conflict, true);
    assert.equal(a.suggested, null);
  });

  test("letters the scheme doesn't have are ignored", () => {
    const rows = learnCutoffs(scheme, [{ letter: "Z", pct: 99 }]);
    assert.ok(rows.every((r) => r.n === 0 && r.suggested == null));
  });

  test("valid cutoffs strictly descend", () => {
    assert.ok(validCutoffs([90, 85, 80]));
    assert.ok(!validCutoffs([90, 90, 80]));
    assert.ok(!validCutoffs([90, null, 80]));
  });
});

describe("approved cutoffs", () => {
  const all = (s: GradeScheme) => Object.fromEntries(s.bands.slice(0, -1).map((b, i) => [b.letter, 95 - i * 3]));

  test("replace the estimate and drop the 'approximate' flag", () => {
    const s = applyCutoffs(JORDAN4, all(JORDAN4))!;
    assert.equal(s.approxCutoffs, false);
    assert.equal(s.learnedCutoffs, true);
    assert.equal(s.bands[0].min, 95);
    assert.equal(s.bands[s.bands.length - 1].min, 0);
  });

  test("a missing letter keeps the estimate", () => {
    const c = all(JORDAN4);
    delete c[JORDAN4.bands[1].letter];
    assert.equal(applyCutoffs(JORDAN4, c), null);
  });

  test("applied to that university's students only", () => {
    const meu = { universitySlug: "other", universityName: "جامعة الشرق الأوسط", major: "", level: "" };
    const before = detectScheme(meu).scheme;
    assert.equal(before.approxCutoffs, true);
    const slug = detectScheme(meu).catalog!.slug;
    setLearnedCutoffs({ [slug]: all(before) });
    try {
      const after = detectScheme(meu).scheme;
      assert.equal(after.learnedCutoffs, true);
      assert.equal(bandForPct(after, 95).letter, before.bands[0].letter);
      // Stable object across calls (no re-render churn).
      assert.equal(detectScheme(meu).scheme, after);
      const other = detectScheme({ ...meu, universityName: "الجامعة الهاشمية" }).scheme;
      assert.ok(!other.learnedCutoffs);
    } finally {
      setLearnedCutoffs({});
    }
  });
});
