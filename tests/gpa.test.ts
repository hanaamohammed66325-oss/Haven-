// GPA accuracy tests — every grading scheme, checked against the official
// tables it claims to follow. Run: npm test
//
// Sources for the expected values:
//   5.0 / 4.0   CUA unified regulation (KSU dar.ksu.edu.sa, SACM), KFUPM/Alfaisal catalogs
//   ± 4.0       UAEU Policy AE-04 "Grades and Grading" (undergraduate table),
//               University of Bahrain grade ranges, AUS/AUC/SQU point values
//   Qatar       qu.edu.qa grade-symbols page + the official SIS "GPA Calculator
//               Student Manual" worked example
//   Jordan      University of Jordan registration GPA workbook (new + old
//               systems), MEU undergrad rules table, Hashemite Univ. Art. 16
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Course, GradeComponent } from "@/types";
import {
  SAUDI5,
  SAUDI4,
  PERCENTAGE,
  PLUSMINUS4,
  QATAR4,
  JORDAN4,
  JORDAN4_NEW,
  JORDAN4_PLUS,
  SCHEMES,
  bandForPct,
  pointsForPct,
  passMark,
  matchUniversityByName,
  resolveScheme,
  schemeNeedsChoice,
  effectiveGpaGoal,
  detectScheme,
  gradeTableStatus,
  estimateCutoffs,
  customScheme,
  catalogScheme,
  matchCatalog,
  CATALOG_UNIVERSITIES,
  type GradeScheme,
} from "@/lib/gradeSchemes";
import { CATALOG_TABLES } from "@/lib/gradeCatalog";
import { getBadgeThreshold, type BadgeContext } from "@/lib/gamification";
import {
  courseCurrentPct,
  semesterGPA,
  semesterGpaDetail,
  projectedCumulativeFromParts,
  projectedCumulativeGpa,
  finalAdvice,
} from "@/lib/grades";

// ── fixtures ──────────────────────────────────────────────────────────────
let seq = 0;
const comp = (
  type: GradeComponent["type"],
  weight: number,
  total: number,
  score: number | null
): GradeComponent => ({
  id: `c${seq++}`,
  name: type,
  type,
  weight,
  unit: "percent",
  total,
  score,
  date: null,
});
const course = (creditHours: number, components: GradeComponent[]): Course => ({
  id: `k${seq++}`,
  name: "course",
  creditHours,
  sessions: [],
  missedLectures: 0,
  missedSessions: [],
  components,
});
/** A course whose whole 100% is graded at exactly `pct`. */
const finished = (creditHours: number, pct: number) =>
  course(creditHours, [comp("final", 100, 100, pct)]);

const close = (actual: number | null, expected: number, msg?: string) => {
  assert.ok(actual != null, msg ?? "expected a number, got null");
  assert.ok(Math.abs(actual - expected) < 1e-9, `${msg ?? ""} expected ${expected}, got ${actual}`);
};

/** [percentage, letter, points] rows checked at every band edge. */
type Row = [number, string, number];
const checkTable = (scheme: GradeScheme, rows: Row[]) => {
  for (const [pct, letter, points] of rows) {
    const b = bandForPct(scheme, pct);
    assert.equal(b.letter, letter, `${scheme.id} ${pct}% → letter`);
    assert.equal(b.points, points, `${scheme.id} ${pct}% → points`);
  }
};

// ── 1. letter + points tables (band edges) ────────────────────────────────
describe("grade tables", () => {
  test("Saudi 5.0 matches the unified regulation", () => {
    checkTable(SAUDI5, [
      [100, "A+", 5], [95, "A+", 5], [94.99, "A", 4.75], [90, "A", 4.75],
      [89.99, "B+", 4.5], [85, "B+", 4.5], [84.99, "B", 4], [80, "B", 4],
      [79.99, "C+", 3.5], [75, "C+", 3.5], [74.99, "C", 3], [70, "C", 3],
      [69.99, "D+", 2.5], [65, "D+", 2.5], [64.99, "D", 2], [60, "D", 2],
      [59.99, "F", 1], [0, "F", 1],
    ]);
  });

  test("Saudi 4.0 matches KFUPM / Alfaisal (F = 0)", () => {
    checkTable(SAUDI4, [
      [100, "A+", 4], [95, "A+", 4], [94.99, "A", 3.75], [90, "A", 3.75],
      [85, "B+", 3.5], [80, "B", 3], [75, "C+", 2.5], [70, "C", 2],
      [65, "D+", 1.5], [60, "D", 1], [59.99, "F", 0], [0, "F", 0],
    ]);
  });

  test("International ± 4.0 point values (AUC / AUS / UAEU / SQU)", () => {
    const pts = Object.fromEntries(PLUSMINUS4.bands.map((b) => [b.letter, b.points]));
    assert.deepEqual(pts, {
      A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7, "C+": 2.3,
      C: 2, "C-": 1.7, "D+": 1.3, D: 1, F: 0,
    });
  });

  test("International ± 4.0 cutoffs match the official Arab tables (UAEU AE-04)", () => {
    checkTable(PLUSMINUS4, [
      [100, "A", 4], [90, "A", 4], [89, "A-", 3.7], [87, "A-", 3.7],
      [86, "B+", 3.3], [84, "B+", 3.3], [83, "B", 3], [80, "B", 3],
      [79, "B-", 2.7], [77, "B-", 2.7], [76, "C+", 2.3], [74, "C+", 2.3],
      [73, "C", 2], [70, "C", 2], [69, "C-", 1.7], [67, "C-", 1.7],
      [66, "D+", 1.3], [64, "D+", 1.3], [63, "D", 1], [60, "D", 1],
      [59, "F", 0], [0, "F", 0],
    ]);
  });

  test("every scheme's bands are strictly descending and end at 0", () => {
    for (const s of SCHEMES) {
      for (let i = 1; i < s.bands.length; i++) {
        assert.ok(s.bands[i].min < s.bands[i - 1].min, `${s.id} band ${i} order`);
        assert.ok(s.bands[i].points <= s.bands[i - 1].points, `${s.id} band ${i} points`);
      }
      assert.equal(s.bands.at(-1)!.min, 0, `${s.id} last band must catch 0%`);
      assert.ok(s.bands[0].points <= s.max || s.percent, `${s.id} top points ≤ max`);
    }
  });

  test("the public /tools GPA calculator uses the same 5.0 and 4.0 points", () => {
    const src = readFileSync("src/components/tools/GpaCalculatorTool.tsx", "utf8");
    const rows = [...src.matchAll(/letter: "([A-F][+-]?)", p5: ([\d.]+), p4: ([\d.]+)/g)];
    assert.equal(rows.length, SAUDI5.bands.length, "tool has one row per band");
    for (const [, letter, p5, p4] of rows) {
      assert.equal(Number(p5), SAUDI5.bands.find((b) => b.letter === letter)!.points, `${letter} 5.0`);
      assert.equal(Number(p4), SAUDI4.bands.find((b) => b.letter === letter)!.points, `${letter} 4.0`);
    }
  });
});

// ── 2. course percentage ─────────────────────────────────────────────────
describe("course percentage", () => {
  test("nothing graded → null", () => {
    assert.equal(courseCurrentPct(course(3, [comp("final", 100, 100, null)])), null);
  });

  test("one 5/7 quiz worth 10% → 97.14 (ungraded work never drags it down)", () => {
    const c = course(3, [comp("quiz", 10, 7, 5), comp("final", 90, 100, null)]);
    close(courseCurrentPct(c), 100 - (2 / 7) * 10);
  });

  test("fully graded course equals the true final %", () => {
    // mid 24/30 (30%), homework 18/20 (20%), final 40/50 (50%) → 24 + 18 + 40 = 82
    const c = course(3, [
      comp("midterm", 30, 30, 24),
      comp("assignment", 20, 20, 18),
      comp("final", 50, 50, 40),
    ]);
    close(courseCurrentPct(c), 82);
    assert.equal(bandForPct(SAUDI5, 82).letter, "B");
  });

  test("items out of any total are scaled by their weight", () => {
    // 45/60 on an exam worth 40% → loses 10 → 90
    const c = course(3, [comp("midterm", 40, 60, 45), comp("final", 60, 100, null)]);
    close(courseCurrentPct(c), 90);
  });
});

// ── 3. semester GPA, worked by hand ──────────────────────────────────────
// 3h A+ (97) · 4h B (82) · 2h C+ (77) · 3h F (50)  = 12 credit hours
const sample = () => [finished(3, 97), finished(4, 82), finished(2, 77), finished(3, 50)];

describe("semester GPA", () => {
  test("5.0: (3×5 + 4×4 + 2×3.5 + 3×1) / 12 = 3.4167", () => {
    close(semesterGPA(sample(), SAUDI5), 41 / 12);
  });

  test("4.0: (3×4 + 4×3 + 2×2.5 + 3×0) / 12 = 2.4167", () => {
    close(semesterGPA(sample(), SAUDI4), 29 / 12);
  });

  test("± 4.0: 97→A 4.0, 82→B 3.0, 77→B- 2.7, 50→F 0", () => {
    close(semesterGPA(sample(), PLUSMINUS4), (3 * 4 + 4 * 3 + 2 * 2.7 + 0) / 12);
  });

  test("percentage: credit-weighted average of the course %", () => {
    close(semesterGPA(sample(), PERCENTAGE), (3 * 97 + 4 * 82 + 2 * 77 + 3 * 50) / 12);
  });

  test("ungraded courses are left out (not counted as zero)", () => {
    const cs = [finished(3, 97), course(4, [comp("final", 100, 100, null)])];
    const d = semesterGpaDetail(cs, SAUDI5);
    assert.equal(d.credits, 3);
    close(d.gpa, 5);
  });

  test("no graded course → null, never NaN", () => {
    assert.equal(semesterGPA([], SAUDI5), null);
  });
});

// ── 4. cumulative GPA ────────────────────────────────────────────────────
describe("cumulative GPA", () => {
  test("blends the previous record by hours: (4.2×60 + 41) / 72", () => {
    close(projectedCumulativeGpa(sample(), 4.2, 60, SAUDI5), (4.2 * 60 + 41) / 72);
  });

  test("4.0 scheme uses 4.0 points for the new semester", () => {
    close(projectedCumulativeGpa(sample(), 3.1, 30, SAUDI4), (3.1 * 30 + 29) / 42);
  });

  test("a previous GPA above the scale is clamped to the scale max", () => {
    close(projectedCumulativeFromParts(0, 0, 4.6, 30, SAUDI4), 4);
  });

  test("no previous hours → the semester GPA itself", () => {
    close(projectedCumulativeGpa(sample(), 0, 0, SAUDI5), 41 / 12);
  });

  test("nothing at all → null", () => {
    assert.equal(projectedCumulativeFromParts(0, 0, 0, 0, SAUDI5), null);
  });
});

// ── 5. "what you need on the final" ──────────────────────────────────────
describe("final-exam advice", () => {
  // mid 24/30 + homework 18/20 = 42 earned; final is 50% out of 50 marks
  const pending = () =>
    course(3, [
      comp("midterm", 30, 30, 24),
      comp("assignment", 20, 20, 18),
      comp("final", 50, 50, null),
    ]);

  test("best reachable letter and the exact mark needed", () => {
    const a = finalAdvice(pending(), SAUDI5)!;
    assert.equal(a.ceiling?.letter, "A"); // A+ needs 53/50 — out of reach
    assert.equal(a.ceiling?.raw, 48); // 42 + 48 = 90 → A
    assert.equal(a.avoidFraw, 18); // 42 + 18 = 60
    assert.equal(a.passesAtZero, false);
  });

  // Brute force: for many courses, the mark returned must reach the letter and
  // one mark less must not. Guards against float noise over-asking by a mark.
  test("the needed mark is the minimum (brute force, every scheme)", () => {
    for (const scheme of [SAUDI5, SAUDI4, PLUSMINUS4]) {
      for (let mid = 0; mid <= 40; mid += 3) {
        for (const finalTotal of [40, 50, 60, 100]) {
          const c = course(3, [
            comp("midterm", 40, 40, mid),
            comp("assignment", 20, 20, 17),
            comp("final", 40, finalTotal, null),
          ]);
          const a = finalAdvice(c, scheme);
          if (!a?.ceiling) continue;
          const target = scheme.bands.find((b) => b.letter === a.ceiling!.letter)!.min;
          const pctWith = (raw: number) => mid + 17 + (raw / finalTotal) * 40;
          assert.ok(pctWith(a.ceiling.raw) >= target - 1e-9, `${scheme.id} raw reaches ${a.ceiling.letter}`);
          if (a.ceiling.raw > 0)
            assert.ok(pctWith(a.ceiling.raw - 1) < target, `${scheme.id} raw ${a.ceiling.raw} is minimal`);
        }
      }
    }
  });

  test("'avoid F' uses the scheme's own pass mark", () => {
    for (const scheme of [SAUDI5, SAUDI4, PLUSMINUS4]) {
      const pass = scheme.bands.at(-2)!.min; // lowest passing band
      const a = finalAdvice(pending(), scheme)!;
      const pctWith = 42 + (a.avoidFraw / 50) * 50;
      assert.ok(pctWith >= pass, `${scheme.id}: ${a.avoidFraw}/50 must pass (${pass}%)`);
      assert.equal(bandForPct(scheme, pctWith).letter !== "F", true, `${scheme.id} not F`);
    }
  });
});

// ── 6. cross-checked against an official calculator ───────────────────────
// Same inputs typed into the University of Tabuk official calculator
// (gate.ut.edu.sa/gpa, 2026-09-24); its outputs are the expected values.
describe("matches the University of Tabuk official calculator", () => {
  const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

  test("5.0 semester: 12 h, 41 points → 3.42", () => {
    assert.equal(semesterGpaDetail(sample(), SAUDI5).points, 41);
    assert.equal(r2(semesterGPA(sample(), SAUDI5)), 3.42);
  });
  test("4.0 semester: 12 h, 29 points → 2.42", () => {
    assert.equal(semesterGpaDetail(sample(), SAUDI4).points, 29);
    assert.equal(r2(semesterGPA(sample(), SAUDI4)), 2.42);
  });
  test("5.0 cumulative: 60 h / 252 points before → 72 h / 293 → 4.07", () => {
    assert.equal(r2(projectedCumulativeGpa(sample(), 252 / 60, 60, SAUDI5)), 4.07);
  });
  test("4.0 cumulative: 30 h / 93 points before → 42 h / 122 → 2.90", () => {
    assert.equal(r2(projectedCumulativeGpa(sample(), 93 / 30, 30, SAUDI4)), 2.9);
  });
  test("mark → letter at every edge, no rounding up of .5", () => {
    const official: [number, string][] = [
      [100, "A+"], [95, "A+"], [94.99, "A"], [94.5, "A"], [94, "A"], [90, "A"],
      [89.5, "B+"], [89, "B+"], [85, "B+"], [84, "B"], [80, "B"], [79, "C+"],
      [75, "C+"], [74, "C"], [70, "C"], [69.5, "D+"], [69, "D+"], [65, "D+"],
      [64.5, "D"], [64, "D"], [60, "D"], [59.5, "F"], [59, "F"], [0, "F"],
    ];
    for (const [pct, letter] of official) assert.equal(bandForPct(SAUDI5, pct).letter, letter, `${pct}%`);
  });
});

// Qassim University's official calculator (qu.edu.sa/en/mainservices/gpa/),
// run 2026-09-24 with the same four courses. Its code: 5.0 points = 4.0 points
// + 1 for every band, cutoffs 95/90/85/80/75/70/65/60, no rounding up.
describe("matches the Qassim University official calculator", () => {
  const r3 = (n: number | null) => Math.round(n! * 1000) / 1000;
  test("5.0: term 41 / 12 = 3.417, cumulative 293 / 72 = 4.069", () => {
    close(semesterGpaDetail(sample(), SAUDI5).points, 41);
    assert.equal(r3(semesterGPA(sample(), SAUDI5)), 3.417);
    assert.equal(r3(projectedCumulativeGpa(sample(), 252 / 60, 60, SAUDI5)), 4.069);
  });
  test("4.0: term 29 / 12 = 2.417, cumulative 122 / 42 = 2.905", () => {
    close(semesterGpaDetail(sample(), SAUDI4).points, 29);
    assert.equal(r3(semesterGPA(sample(), SAUDI4)), 2.417);
    assert.equal(r3(projectedCumulativeGpa(sample(), 93 / 30, 30, SAUDI4)), 2.905);
  });
  test("5.0 points are 4.0 points + 1 in every band", () => {
    SAUDI5.bands.forEach((b, i) => {
      assert.equal(b.min, SAUDI4.bands[i].min);
      assert.equal(b.points, SAUDI4.bands[i].points + 1);
    });
  });
});

// ── 7. which scheme a student gets ───────────────────────────────────────
describe("scheme resolution", () => {
  const acad = (o: object) => ({ universitySlug: null, universityName: "", major: "", level: "", ...o });

  test("Saudi 5.0 university → 5.0", () => {
    assert.equal(resolveScheme(acad({ universitySlug: "king-saud" })).id, "saudi5");
  });
  test("KFUPM → 4.0", () => {
    assert.equal(resolveScheme(acad({ universitySlug: "kfupm" })).id, "saudi4");
  });
  test("hand-typed KFUPM / Alfaisal → 4.0", () => {
    assert.equal(resolveScheme(acad({ universitySlug: "other", universityName: "KFUPM" })).id, "saudi4");
    assert.equal(resolveScheme(acad({ universitySlug: "other", universityName: "جامعة الفيصل" })).id, "saudi4");
  });
  test("a manual choice always wins", () => {
    const a = acad({ universitySlug: "king-saud", gpaSchemeId: "plusminus4" });
    assert.equal(resolveScheme(a).id, "plusminus4");
  });
  test("percentage points are the % itself", () => {
    assert.equal(pointsForPct(PERCENTAGE, 83.5), 83.5);
  });
  test("verified Arab universities typed by name get their own system", () => {
    const typed = (n: string) => resolveScheme(acad({ universitySlug: "other", universityName: n })).id;
    assert.equal(typed("جامعة قطر"), "qatar4");
    assert.equal(typed("Qatar University"), "qatar4");
    assert.equal(typed("جامعة الشرق الأوسط"), "jordan4");
    assert.equal(typed("جامعة الشرق الاوسط عمان"), "jordan4");
    assert.equal(typed("الجامعة الأردنية"), "jordan4new");
    assert.equal(typed("الجامعة الهاشمية"), "jordan4plus");
    assert.equal(typed("جامعة الإمارات"), "plusminus4");
  });
  test("الجامعة الأردنية no longer fuzzy-matches the Saudi Electronic University", () => {
    assert.equal(matchUniversityByName("الجامعة الأردنية"), undefined);
    assert.equal(typed5("الجامعة الأردنية"), "jordan4new");
  });
  test("an unrecognised typed university asks the student to pick, a known one doesn't", () => {
    assert.equal(schemeNeedsChoice(acad({ universitySlug: "other", universityName: "جامعة زحل" })), true);
    assert.equal(
      schemeNeedsChoice(acad({ universitySlug: "other", universityName: "جامعة زحل", gpaSchemeId: "percentage" })),
      false
    );
    assert.equal(schemeNeedsChoice(acad({ universitySlug: "other", universityName: "جامعة قطر" })), false);
    assert.equal(schemeNeedsChoice(acad({ universitySlug: "king-saud", universityName: "جامعة الملك سعود" })), false);
    assert.equal(schemeNeedsChoice(acad({})), false); // nothing entered yet → no nag
  });
});
const typed5 = (n: string) =>
  resolveScheme({ universitySlug: "other", universityName: n, major: "", level: "" }).id;

// ── 8. Arab systems outside Saudi ───────────────────────────────────────
describe("Qatar University", () => {
  test("official table: half-point steps, A from 90", () => {
    checkTable(QATAR4, [
      [100, "A", 4], [90, "A", 4], [89.99, "B+", 3.5], [85, "B+", 3.5], [84.99, "B", 3],
      [80, "B", 3], [79.99, "C+", 2.5], [75, "C+", 2.5], [70, "C", 2], [65, "D+", 1.5],
      [60, "D", 1], [59.99, "F", 0], [0, "F", 0],
    ]);
  });
  test("official SIS manual example: A 2h, B+ 3h, C 3h, D+ 3h = 29 / 11", () => {
    const d = semesterGpaDetail(
      [finished(2, 95), finished(3, 87), finished(3, 72), finished(3, 66)],
      QATAR4
    );
    close(d.points, 29, "course points 8 + 10.5 + 6 + 4.5");
    close(d.credits, 11);
    // The manual shows 2.63 (it truncates); we round to 2.64 — within the
    // ±0.04 display tolerance noted beside the GPA.
    assert.ok(Math.abs(d.gpa! - 2.63) <= 0.01);
  });
  test("official SIS manual example: cumulative 65 h / 260 points → 76 h / 289 → 3.80", () => {
    const cum = projectedCumulativeGpa(
      [finished(2, 95), finished(3, 87), finished(3, 72), finished(3, 66)],
      4,
      65,
      QATAR4
    );
    close(cum, 289 / 76);
    assert.equal(Math.round(cum! * 100) / 100, 3.8);
  });
});

describe("Jordan", () => {
  const pts = (s: GradeScheme) => Object.fromEntries(s.bands.map((b) => [b.letter, b.points]));
  test("MEU / University of Jordan old system points", () => {
    assert.deepEqual(pts(JORDAN4), {
      A: 4, "A-": 3.75, "B+": 3.5, B: 3, "B-": 2.75, "C+": 2.5, C: 2, "C-": 1.75,
      "D+": 1.5, D: 1, "D-": 0.75, F: 0,
    });
  });
  test("University of Jordan new system points (official workbook)", () => {
    assert.deepEqual(pts(JORDAN4_NEW), {
      A: 4, "A-": 3.75, "B+": 3.5, B: 3, "B-": 2.75, "C+": 2.5, C: 2, "C-": 1.75,
      "D+": 1.5, D: 1.25, "D-": 1, F: 0.5,
    });
  });
  test("Hashemite A+ system points (Art. 16)", () => {
    assert.deepEqual(pts(JORDAN4_PLUS), {
      "A+": 4, A: 3.75, "A-": 3.5, "B+": 3.25, B: 3, "B-": 2.75, "C+": 2.5, C: 2.25,
      "C-": 2, "D+": 1.75, D: 1.5, F: 0,
    });
  });
  test("D is the lowest pass; D- and F fail even when they carry points", () => {
    for (const s of [JORDAN4, JORDAN4_NEW, JORDAN4_PLUS]) {
      assert.equal(bandForPct(s, passMark(s)).letter, "D", s.id);
      assert.notEqual(bandForPct(s, passMark(s) - 0.01).letter, "D", s.id);
    }
  });
  test("workbook formula: Σ(points × hours) / Σhours, no rounding", () => {
    // A- 3h, B+ 3h, B 3h, C+ 3h → (3.75 + 3.5 + 3 + 2.5) × 3 / 12 = 3.1875.
    // The old international table gave 3.075 here — 0.11 low.
    const courses = [finished(3, 88), finished(3, 84), finished(3, 80), finished(3, 72)];
    close(semesterGPA(courses, JORDAN4), 3.1875);
    close(semesterGPA(courses, JORDAN4_NEW), 3.1875);
  });
  test("a failed course with points still counts in the GPA (UJ new F = 0.5)", () => {
    close(semesterGPA([finished(3, 95), finished(3, 10)], JORDAN4_NEW), (4 * 3 + 0.5 * 3) / 6);
  });
});

// ── 9. goal + badge follow the student's scale ───────────────────────────
describe("scale-aware goal and badge", () => {
  test("the stored 4.5 default becomes 90% of a 4.0 / percentage max", () => {
    assert.equal(effectiveGpaGoal(4.5, SAUDI5), 4.5);
    assert.equal(effectiveGpaGoal(4.5, SAUDI4), 3.6);
    assert.equal(effectiveGpaGoal(4.5, PERCENTAGE), 90);
    assert.equal(effectiveGpaGoal(3.8, QATAR4), 3.8); // a real 4.0 goal is kept
    assert.equal(effectiveGpaGoal(85, PERCENTAGE), 85);
    assert.equal(effectiveGpaGoal(0, SAUDI5), 4.5);
  });
  test("outstanding-GPA thresholds scale to the scheme", () => {
    const ctx = (gpaMax: number) => ({ gpaMax }) as unknown as BadgeContext;
    assert.deepEqual([1, 2, 3, 4].map((t) => getBadgeThreshold("outstanding-gpa", t, ctx(5))), [4, 4, 4.5, 4.75]);
    assert.deepEqual([1, 2, 3, 4].map((t) => getBadgeThreshold("outstanding-gpa", t, ctx(4))), [3.2, 3.2, 3.6, 3.8]);
    assert.deepEqual([1, 2, 3, 4].map((t) => getBadgeThreshold("outstanding-gpa", t, ctx(100))), [80, 80, 90, 95]);
  });
});

// The university catalogue (lib/gradeCatalog — an unverified snapshot of
// ar.qurtoba.net): a typed name is matched to its table, the student is asked
// to confirm it, and our officially verified tables always win.
describe("university catalogue", () => {
  const acad = (o: object) => ({ universitySlug: "other", universityName: "", major: "", level: "", ...o });
  const detect = (name: string, extra: object = {}) => detectScheme(acad({ universityName: name, ...extra }));

  test("every catalogue table becomes a usable scheme", () => {
    CATALOG_TABLES.forEach((_, i) => {
      const s = catalogScheme(i);
      assert.ok(s.bands.length >= 2, `table ${i}`);
      assert.equal(s.bands[s.bands.length - 1].min, 0, `table ${i} ends at 0%`);
      s.bands.forEach((b, j) => j && assert.ok(b.min < s.bands[j - 1].min, `table ${i} cutoffs descend`));
      assert.ok(s.max > 0 && passMark(s) > 0, `table ${i}`);
    });
  });
  test("a catalogue table identical to a verified one reuses it", () => {
    const qatarLike = CATALOG_TABLES.findIndex((t) => "l" in t && t.l.join() === "A,B+,B,C+,C,D+,D,F" && t.p[0] === 4);
    assert.equal(catalogScheme(qatarLike).id, "qatar4");
  });
  test("a non-Saudi catalogue university is detected and needs confirming", () => {
    const d = detect("جامعة القاهرة");
    assert.equal(d.source, "catalog");
    assert.equal(d.catalog?.slug, "cairo-university");
    assert.equal(gradeTableStatus(acad({ universityName: "جامعة القاهرة" })), "confirm");
    assert.equal(detect("American University of Sharjah").catalog?.slug, "american-university-of-sharjah");
    assert.equal(detect("الجامعة الأمريكية الشارقة").catalog?.slug, "american-university-of-sharjah");
  });
  test("the student's answer is remembered per university", () => {
    const yes = { gradeCheck: { key: "cairo-university", answer: "yes", at: "" } };
    const no = { gradeCheck: { key: "cairo-university", answer: "no", at: "" } };
    assert.equal(gradeTableStatus(acad({ universityName: "جامعة القاهرة", ...yes })), "ok");
    assert.equal(gradeTableStatus(acad({ universityName: "جامعة القاهرة", ...no })), "rejected");
    // An answer about another university doesn't count.
    assert.equal(gradeTableStatus(acad({ universityName: "جامعة عين شمس", ...yes })), "confirm");
  });
  test("our verified tables beat the catalogue's", () => {
    // The catalogue lists the University of Jordan as "جامعة الأردن" with an
    // outdated table; the official post-2024 one is used, with no question.
    assert.equal(detect("جامعة الأردن").scheme.id, "jordan4new");
    assert.equal(detect("جامعة الأردن").source, "typed");
    assert.equal(detect("جامعة الشرق الأوسط").scheme.id, "jordan4");
    assert.equal(gradeTableStatus(acad({ universityName: "جامعة الكويت" })), "ok");
  });
  test("Saudi names still use our official Saudi list", () => {
    assert.equal(detect("جامعة الملك عبدالعزيز").source, "typed");
    assert.equal(detect("جامعة الملك فهد للبترول والمعادن").scheme.max, 4);
    assert.equal(matchCatalog("جامعة الفيصل")?.slug, "alfaisal-university");
    assert.notEqual(matchCatalog("جامعة الملك فيصل")?.slug, "alfaisal-university");
  });
  test("percentage-average universities average the marks", () => {
    const d = detect("جامعة اليرموك");
    assert.equal(d.scheme.percent, true);
    assert.equal(d.scheme.max, 100);
    assert.equal(passMark(d.scheme), 60);
  });
  test("an unknown name stays unknown", () => {
    assert.equal(matchCatalog("جامعة زحل"), undefined);
    // A one-word name ("جامعة الأهلية") doesn't absorb an extra word.
    assert.equal(matchCatalog("جامعة النجوم الأهلية"), undefined);
    assert.equal(matchCatalog("جامعة الأهلية")?.slug, "ahlia-university");
    // …nor does one shared generic word pull it onto a Saudi college.
    assert.equal(gradeTableStatus(acad({ universityName: "جامعة النجوم الأهلية" })), "unknown");
    assert.equal(matchUniversityByName("جامعة طيبة المدينة")?.slug, "taibah");
    assert.equal(gradeTableStatus(acad({ universityName: "جامعة زحل" })), "unknown");
    assert.ok(CATALOG_UNIVERSITIES.length > 400);
  });
});

describe("estimated cutoffs and the student's own table", () => {
  test("common letters get the usual Arab cutoffs", () => {
    assert.deepEqual(estimateCutoffs(["A", "B+", "B", "C+", "C", "D+", "D", "F"]).mins, [90, 85, 80, 75, 70, 65, 60, 0]);
    assert.deepEqual(estimateCutoffs(["A", "A-", "B+", "B", "F"]).mins, [90, 87, 84, 80, 0]);
    assert.deepEqual(estimateCutoffs(["A0", "B0", "C0", "D0", "F"]).mins, [90, 80, 70, 60, 0]);
  });
  test("numeric grades are their own cutoff; unusual letters are spaced 90→60", () => {
    assert.deepEqual(estimateCutoffs([">=90", "89", "88", "F"]), { mins: [90, 89, 88, 0], exact: true });
    assert.deepEqual(estimateCutoffs(["AA", "BA", "BB", "CB", "FF"]).mins, [90, 80, 70, 60, 0]);
  });
  test("a table out of 20 works, with the student's own cutoffs", () => {
    const s = customScheme({
      max: 20,
      bands: [
        { letter: "Excellent", points: 18, min: 90 },
        { letter: "Good", points: 14, min: 70 },
        { letter: "Pass", points: 10, min: 50 },
        { letter: "Fail", points: 0, min: null },
      ],
    })!;
    assert.equal(s.max, 20);
    assert.equal(s.approxCutoffs, false);
    assert.equal(bandForPct(s, 75).letter, "Good");
    assert.equal(passMark(s), 50);
    const { gpa } = semesterGpaDetail([finished(3, 95), finished(3, 55)], s);
    assert.equal(gpa, 14);
  });
  test("left-blank cutoffs are estimated; broken tables are refused", () => {
    const s = customScheme({ max: 4, bands: [{ letter: "A", points: 4, min: null }, { letter: "F", points: 0, min: null }] })!;
    assert.equal(s.approxCutoffs, true);
    assert.equal(customScheme({ max: 4, bands: [{ letter: "A", points: 5, min: null }] }), undefined);
    assert.equal(customScheme({ max: 0, bands: [] }), undefined);
  });
  test("a custom table drives the GPA once chosen", () => {
    const own = { max: 20, bands: [{ letter: "A", points: 20, min: 50 }, { letter: "F", points: 0, min: null }] };
    const a = { universitySlug: "other", universityName: "جامعة زحل", major: "", level: "", gpaSchemeId: "custom" as const, customScheme: own };
    assert.equal(detectScheme(a).source, "custom");
    assert.equal(resolveScheme(a).max, 20);
    assert.equal(gradeTableStatus(a), "ok");
  });
});
