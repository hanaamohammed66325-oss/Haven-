// Courses graded on the cohort average — how a course's own cutoffs change its
// letter and points, and everything that reads them (GPA, what-if, the
// cumulative modal, final advice, the end-of-term check). Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { AcademicInfo, Course, CourseCurve, GradeComponent } from "@/types";
import {
  SAUDI4,
  SAUDI5,
  JORDAN4,
  JORDAN4_PLUS,
  PERCENTAGE,
  SCHEMES,
  applyCutoffs,
  catalogScheme,
  passMark,
  validCutoffMins,
  type GradeScheme,
} from "@/lib/gradeSchemes";
import { CATALOG_TABLES } from "@/lib/gradeCatalog";
import {
  badgeGrade,
  coursePoints,
  courseRows,
  finalAdvice,
  gpaIsApprox,
  gradeCourse,
  semesterGpaDetail,
  simulatedSemester,
} from "@/lib/grades";
import { estimatedLetter, explainGap, sharedCourse } from "@/lib/termCheck";
import { repeatAdjust } from "@/lib/repeats";
import {
  baseCutoffs,
  courseCutoffs,
  courseScheme,
  curveFits,
  cutoffProblem,
  makeCurve,
  shiftCutoffs,
  curveUniversity,
  passLetter,
  schemeFingerprint,
  withCurves,
} from "@/lib/curves";

const comp = (type: GradeComponent["type"], weight: number, total: number, score: number | null): GradeComponent => ({
  id: `${type}-${weight}-${score}`,
  name: type,
  type,
  weight,
  unit: "percent",
  total,
  score,
  date: null,
});

const course = (id: string, creditHours: number, pct: number | null, extra: Partial<Course> = {}): Course => ({
  id,
  name: id,
  creditHours,
  sessions: [],
  missedLectures: 0,
  missedSessions: [],
  components: [comp("final", 100, 100, pct)],
  ...extra,
});

const curveFor = (
  scheme: GradeScheme,
  cutoffs: Record<string, number>,
  complete = false,
  university = "kfupm"
): CourseCurve => ({
  method: "cutoffs",
  cutoffs,
  complete,
  basis: { university, fingerprint: schemeFingerprint(scheme), baseCutoffs: baseCutoffs(scheme) },
  at: "2026-10-05T10:00:00.000Z",
});

const curved = (c: Course, curve: CourseCurve): Course => ({ ...c, curve });

describe("a course's own cutoffs", () => {
  test("entered cutoffs decide the letter and points, boundaries included", () => {
    const c = curved(course("m", 3, 0), curveFor(SAUDI4, { "A+": 93, A: 88 }));
    const at = (pct: number) => gradeCourse({ ...c, components: [comp("final", 100, 100, pct)] }, SAUDI4);
    assert.deepEqual([at(93).letter, at(93).points], ["A+", 4.0]);
    assert.deepEqual([at(92.99).letter, at(92.99).points], ["A", 3.75]);
    assert.deepEqual([at(88).letter, at(88).points], ["A", 3.75]);
    // B+ wasn't entered: it keeps the university's 85.
    assert.deepEqual([at(87.99).letter, at(87.99).points], ["B+", 3.5]);
    assert.equal(at(84.99).letter, "B");
  });

  test("a fixed course is unaffected by another course's cutoffs", () => {
    const plain = course("p", 3, 88);
    const avg = curved(course("m", 3, 88), curveFor(SAUDI4, { A: 88 }));
    assert.equal(coursePoints(plain, SAUDI4), 3.5);
    assert.equal(coursePoints(avg, SAUDI4), 3.75);
    const both = semesterGpaDetail([plain, avg], SAUDI4);
    assert.equal(both.points, 3.5 * 3 + 3.75 * 3);
    assert.equal(coursePoints(plain, SAUDI4), coursePoints(course("p", 3, 88), SAUDI4));
  });

  test("changing a cutoff changes that course's letter and the semester GPA", () => {
    const other = course("o", 2, 91);
    const a = curved(course("m", 3, 86), curveFor(SAUDI4, { A: 86 }));
    const b = curved(course("m", 3, 86), curveFor(SAUDI4, { A: 87 }));
    assert.equal(gradeCourse(a, SAUDI4).letter, "A");
    assert.equal(gradeCourse(b, SAUDI4).letter, "B+");
    assert.notEqual(semesterGpaDetail([other, a], SAUDI4).gpa, semesterGpaDetail([other, b], SAUDI4).gpa);
    assert.equal(coursePoints(other, SAUDI4), 3.75);
  });

  test("clearing the entry gives back exactly the fixed result", () => {
    for (const scheme of SCHEMES) {
      for (const pct of [null, 0, 59.99, 60, 77, 86.5, 90, 100]) {
        const plain = course("m", 3, pct);
        const withEntry = curved(plain, curveFor(scheme, { [scheme.bands[1].letter]: scheme.bands[1].min - 1 }));
        const cleared: Course = { ...withEntry };
        delete cleared.curve;
        assert.deepEqual(gradeCourse(cleared, scheme), gradeCourse(plain, scheme));
      }
    }
  });

  test("the portal result still wins over the course's cutoffs", () => {
    const c = curved(course("m", 3, 88, { official: { letter: "B" } }), curveFor(SAUDI4, { A: 88 }));
    assert.deepEqual(gradeCourse(c, SAUDI4), { pct: 88, letter: "B", points: 3.0, source: "official" });
    const w = curved(course("m", 3, 88, { official: { letter: "W" } }), curveFor(SAUDI4, { A: 88 }));
    assert.equal(coursePoints(w, SAUDI4), null);
  });

  test("the same table applied twice changes nothing more", () => {
    const cases: [GradeScheme, Record<string, number>][] = [
      [SAUDI4, { A: 88, "D+": 63 }],
      [JORDAN4, { D: 52, "D-": 49 }],
      [SAUDI5, { "A+": 94 }],
    ];
    for (const [scheme, cut] of cases) {
      const c = curved(course("m", 3, 80), curveFor(scheme, cut));
      const once = courseScheme(c, scheme);
      assert.deepEqual(courseScheme(c, once), once);
    }
  });
});

describe("status: waiting, partial, entered", () => {
  test("no cutoffs yet → the university's table, waiting", () => {
    const c = curved(course("m", 3, 86), curveFor(SAUDI4, {}));
    const cut = courseCutoffs(c, SAUDI4)!;
    assert.equal(cut.status, "waiting");
    assert.equal(cut.scheme, SAUDI4);
    assert.deepEqual(gradeCourse(c, SAUDI4), gradeCourse(course("m", 3, 86), SAUDI4));
  });

  test("some cutoffs → partial; every one and ticked → entered", () => {
    const rows = { "A+": 94, A: 89, "B+": 84, B: 79, "C+": 74, C: 69, "D+": 64, D: 59 };
    assert.equal(courseCutoffs(curved(course("m", 3, 80), curveFor(SAUDI4, { A: 89 })), SAUDI4)!.status, "partial");
    assert.equal(courseCutoffs(curved(course("m", 3, 80), curveFor(SAUDI4, rows)), SAUDI4)!.status, "partial");
    const done = courseCutoffs(curved(course("m", 3, 80), curveFor(SAUDI4, rows, true)), SAUDI4)!;
    assert.equal(done.status, "entered");
    assert.deepEqual(
      done.scheme.bands.map((b) => b.min),
      [94, 89, 84, 79, 74, 69, 64, 59, 0]
    );
  });

  test("ticked complete but a row missing → still partial", () => {
    const c = curved(course("m", 3, 80), curveFor(SAUDI4, { A: 89, B: 79 }, true));
    assert.equal(courseCutoffs(c, SAUDI4)!.status, "partial");
  });

  test("a complete table drops the university's 'estimated cutoffs' mark; a partial one keeps it", () => {
    const all = Object.fromEntries(JORDAN4.bands.slice(0, -1).map((b) => [b.letter, b.min - 1]));
    const done = courseCutoffs(curved(course("m", 3, 80), curveFor(JORDAN4, all, true)), JORDAN4)!;
    assert.equal(done.scheme.approxCutoffs, undefined);
    const part = courseCutoffs(curved(course("m", 3, 80), curveFor(JORDAN4, { A: 89 })), JORDAN4)!;
    assert.equal(part.scheme.approxCutoffs, true);
  });

  test("a fixed course has no status", () => {
    assert.equal(courseCutoffs(course("m", 3, 80), SAUDI4), null);
  });
});

describe("cutoffs that can't be applied", () => {
  test("overlapping the university's own rows → not applied, flagged", () => {
    const c = curved(course("m", 3, 90.5), curveFor(SAUDI4, { "B+": 91 }));
    const cut = courseCutoffs(c, SAUDI4)!;
    assert.deepEqual([cut.status, cut.conflict, cut.scheme === SAUDI4], ["waiting", true, true]);
    assert.equal(gradeCourse(c, SAUDI4).letter, "A");
  });

  test("not descending, out of range or a zero pass cutoff → not applied", () => {
    const cuts: Record<string, number>[] = [{ A: 96 }, { A: 120 }, { D: 0 }, { "C+": 70 }, { A: Number.NaN }];
    for (const cut of cuts) {
      const got = courseCutoffs(curved(course("m", 3, 80), curveFor(SAUDI4, cut)), SAUDI4)!;
      assert.equal(got.conflict, true, JSON.stringify(cut));
      assert.equal(got.scheme, SAUDI4);
    }
  });

  test("entered for another grade table (scale, letters or points changed) → stale, not applied", () => {
    const c = curved(course("m", 3, 88), curveFor(SAUDI4, { A: 88 }));
    for (const other of [SAUDI5, JORDAN4, { ...SAUDI4, bands: SAUDI4.bands.map((b) => (b.letter === "B" ? { ...b, points: 3.25 } : b)) }]) {
      const cut = courseCutoffs(c, other)!;
      assert.deepEqual([cut.status, cut.stale], ["waiting", true]);
      assert.deepEqual(gradeCourse(c, other), gradeCourse(course("m", 3, 88), other));
    }
  });

  test("entered at another university → attached as stale, not applied", () => {
    const entry = curveFor(SAUDI4, { A: 88 }, false, "kfupm");
    const [here] = withCurves([course("m", 3, 88)], { m: entry }, "kfupm");
    const [moved] = withCurves([course("m", 3, 88)], { m: entry }, "king-saud");
    assert.equal(gradeCourse(here, SAUDI4).letter, "A");
    assert.equal(moved.curve!.stale, true);
    assert.equal(gradeCourse(moved, SAUDI4).letter, "B+");
    assert.equal(entry.stale, undefined, "the saved entry itself is not changed");
  });

  test("a stale entry kept in storage is not applied either", () => {
    const c = curved(course("m", 3, 88), { ...curveFor(SAUDI4, { A: 88 }), stale: true });
    assert.equal(gradeCourse(c, SAUDI4).letter, "B+");
  });

  test("percentage schemes ignore the entry (the mark itself counts)", () => {
    const c = curved(course("m", 3, 88), curveFor(PERCENTAGE, { A: 80 }));
    assert.equal(courseCutoffs(c, PERCENTAGE), null);
    assert.deepEqual(gradeCourse(c, PERCENTAGE), gradeCourse(course("m", 3, 88), PERCENTAGE));
  });

  test("a table with a repeated letter can't take course cutoffs", () => {
    const dup: GradeScheme = { ...SAUDI4, bands: [{ min: 90, letter: "A", points: 4 }, { min: 80, letter: "A", points: 3 }, { min: 0, letter: "F", points: 0 }] };
    assert.equal(curveFits(dup), false);
    assert.equal(courseCutoffs(curved(course("m", 3, 85), curveFor(dup, { A: 85 })), dup), null);
  });
});

describe("the university's cutoffs move after the entry", () => {
  test("partial: entered rows stay, the others follow, flagged", () => {
    const c = curved(course("m", 3, 79.5), curveFor(SAUDI4, { A: 88 }));
    const moved: GradeScheme = { ...SAUDI4, bands: SAUDI4.bands.map((b) => (b.letter === "B" ? { ...b, min: 79 } : b)) };
    const cut = courseCutoffs(c, moved)!;
    assert.deepEqual([cut.status, cut.baseMoved, cut.stale], ["partial", true, false]);
    assert.equal(cut.scheme.bands.find((b) => b.letter === "A")!.min, 88);
    assert.equal(cut.scheme.bands.find((b) => b.letter === "B")!.min, 79);
    assert.equal(gradeCourse(c, moved).letter, "B");
    assert.equal(courseCutoffs(c, SAUDI4)!.baseMoved, false);
  });

  test("complete Jordan-style table keeps its failing D- row when the base changes", () => {
    const all = { A: 89, "A-": 85, "B+": 81, B: 77, "B-": 73, "C+": 69, C: 65, "C-": 61, "D+": 57, D: 53, "D-": 48 };
    const c = curved(course("m", 3, 49), curveFor(JORDAN4, all, true));
    const moved: GradeScheme = { ...JORDAN4, bands: JORDAN4.bands.map((b) => (b.letter === "D-" ? { ...b, min: 51 } : b)) };
    for (const base of [JORDAN4, moved]) {
      const cut = courseCutoffs(c, base)!;
      assert.deepEqual([cut.status, cut.baseMoved], ["entered", false]);
      assert.equal(cut.scheme.bands.find((b) => b.letter === "D-")!.min, 48);
      assert.deepEqual(gradeCourse(c, base), { pct: 49, letter: "D-", points: 0.75, source: "estimate" });
    }
  });
});

describe("pass mark and final-exam advice", () => {
  // midterm 30/50 graded (50%), the final (50%) still to come.
  const withFinal = (extra: Partial<Course> = {}) =>
    course("m", 3, null, { components: [comp("midterm", 50, 50, 30), comp("final", 50, 100, null)], ...extra });

  test("the pass mark follows the course's lowest passing cutoff", () => {
    const c = withFinal({ curve: curveFor(SAUDI4, { D: 54 }) });
    assert.equal(passMark(courseScheme(c, SAUDI4)), 54);
    assert.equal(finalAdvice(withFinal(), SAUDI4)!.avoidFraw, 60);
    assert.equal(finalAdvice(c, SAUDI4)!.avoidFraw, 48);
  });

  test("an explicit pass mark (Jordan 54) moves with its letter, not to D-", () => {
    assert.equal(passLetter(JORDAN4), "D");
    const c = withFinal({ curve: curveFor(JORDAN4, { D: 52 }) });
    const own = courseScheme(c, JORDAN4);
    assert.equal(own.passMin, 52);
    assert.equal(passMark(own), 52);
    assert.equal(finalAdvice(withFinal(), JORDAN4)!.avoidFraw, 48);
    assert.equal(finalAdvice(c, JORDAN4)!.avoidFraw, 44);
    // D- is still never offered as a goal.
    assert.notEqual(finalAdvice(c, JORDAN4)!.ceiling?.letter, "D-");
  });

  test("a pass mark the student didn't change stays", () => {
    const c = withFinal({ curve: curveFor(JORDAN4, { A: 88 }) });
    assert.equal(courseScheme(c, JORDAN4).passMin, 54);
  });

  // Checked against whole-number arithmetic, so float noise can't hide: before
  // the fix, a pass mark of 55 asked for 51 marks where 50 is enough.
  test("the mark needed to pass is exact for every cutoff from 50 to 64.5", () => {
    const mids: [number, number, number][] = [[50, 50, 30], [40, 40, 25], [60, 30, 10], [30, 30, 26], [45, 15, 14], [20, 7, 3]];
    let checked = 0;
    for (let t2 = 100; t2 <= 129; t2++) {
      const T = t2 / 2;
      for (const [mw, mt, ms] of mids) {
        for (const ft of [30, 40, 50, 60, 100]) {
          const fw = 100 - mw;
          const c = withFinal({
            components: [comp("midterm", mw, mt, ms), comp("final", fw, ft, null)],
            curve: curveFor(SAUDI4, { D: T }),
          });
          const a = finalAdvice(c, SAUDI4)!;
          // marks = ceil((cutoff − ms·mw/mt) · ft / fw), as whole numbers over 2·mt·fw
          const exact = (cut2: number) => {
            const num = (cut2 * mt - 2 * ms * mw) * ft;
            const den = 2 * mt * fw;
            return num <= 0 ? 0 : Math.floor((num + den - 1) / den);
          };
          assert.equal(a.avoidFraw, exact(t2), `pass ${T}, midterm ${ms}/${mt} of ${mw}%, final /${ft}`);
          if (a.ceiling) {
            const min = courseScheme(c, SAUDI4).bands.find((b) => b.letter === a.ceiling!.letter)!.min;
            assert.equal(a.ceiling.raw, exact(Math.round(min * 2)), `${a.ceiling.letter}, pass ${T}`);
          }
          assert.equal(a.passesAtZero, 2 * ms * mw >= t2 * mt, `passes at zero, pass ${T}`);
          checked++;
        }
      }
    }
    assert.ok(checked > 800);
  });

  test("the ceiling letter follows the course cutoffs", () => {
    // need(B) on the university table: (80 − 30) / 50 = 1.0 → B; with B+ at 80 → B+.
    assert.equal(finalAdvice(withFinal(), SAUDI4)!.ceiling!.letter, "B");
    const c = withFinal({ curve: curveFor(SAUDI4, { "B+": 80, B: 78 }) });
    assert.equal(finalAdvice(c, SAUDI4)!.ceiling!.letter, "B+");
  });
});

describe("every screen reads the course's own cutoffs", () => {
  const avg = curved(course("m", 3, 88), curveFor(SAUDI4, { A: 88 }));

  test("what-if slider", () => {
    assert.deepEqual(simulatedSemester([avg], SAUDI4, () => 88), { points: 3.75 * 3, credits: 3 });
    assert.deepEqual(simulatedSemester([course("m", 3, 88)], SAUDI4, () => 88), { points: 3.5 * 3, credits: 3 });
  });

  test("cumulative modal rows", () => {
    assert.equal(courseRows([avg], SAUDI4, {})[0].letter, "A");
    // a letter picked by hand still wins
    assert.equal(courseRows([avg], SAUDI4, { m: "C" })[0].points, 2.0);
  });

  test("grade badge (callers pass the course's table)", () => {
    assert.equal(badgeGrade(courseScheme(avg, SAUDI4), 88).letter, "A");
  });

  test("end-of-term estimate and the gap guess", () => {
    const c = curved(course("m", 3, 87), curveFor(SAUDI4, { A: 86 }));
    assert.equal(estimatedLetter(c, SAUDI4), "A");
    assert.equal(estimatedLetter(course("m", 3, 87), SAUDI4), "B+");
    assert.deepEqual(explainGap([c], SAUDI4, 3.5), [{ courseId: "m", letter: "B+", gpa: 3.5, distance: 1 }]);
  });

  test("repeated course, higher grade counts: uses the course's points", () => {
    const academic: AcademicInfo = { universitySlug: null, universityName: "", major: "", level: "", repeatPolicy: "higher" };
    const repeat = { letter: "A+" };
    const plain = course("m", 3, 88, { repeat });
    assert.equal(repeatAdjust([curved(plain, curveFor(SAUDI4, { A: 88 }))], SAUDI4, academic).points, 3.75 * 3);
    assert.equal(repeatAdjust([plain], SAUDI4, academic).points, 3.5 * 3);
  });
});

describe("the GPA is approximate", () => {
  const waiting = curveFor(SAUDI4, {});
  const partial = curveFor(SAUDI4, { A: 88 });
  const done = curveFor(SAUDI4, { "A+": 94, A: 89, "B+": 84, B: 79, "C+": 74, C: 69, "D+": 64, D: 59 }, true);

  test("a graded course still waiting for, or missing, cutoffs makes it approximate", () => {
    assert.equal(gpaIsApprox([curved(course("m", 3, 88), waiting)], SAUDI4), true);
    assert.equal(gpaIsApprox([curved(course("m", 3, 88), partial)], SAUDI4), true);
  });

  test("an entered table, a fixed course or a percentage scheme don't", () => {
    assert.equal(gpaIsApprox([curved(course("m", 3, 88), done)], SAUDI4), false);
    assert.equal(gpaIsApprox([course("m", 3, 88)], SAUDI4), false);
    assert.equal(gpaIsApprox([curved(course("m", 3, 88), curveFor(PERCENTAGE, {}))], PERCENTAGE), false);
  });

  test("only courses that add to the GPA count: not ungraded, portal results, W or 0 hours", () => {
    for (const c of [
      course("m", 3, null),
      course("m", 3, 88, { official: { letter: "B" } }),
      course("m", 3, 88, { official: { letter: "W" } }),
      course("m", 0, 88),
    ]) {
      assert.equal(gpaIsApprox([curved(c, waiting)], SAUDI4), false, JSON.stringify(c.official ?? c.creditHours));
    }
  });
});

describe("cutoff-learning evidence leaves average courses out", () => {
  test("their % is never shared; a fixed course's still is", () => {
    const avg = curved(course("m", 3, 87.456), curveFor(SAUDI4, { A: 86 }));
    assert.deepEqual(sharedCourse(avg, SAUDI4, { letter: "A" }), {
      name: "m",
      hours: 3,
      average: true,
      pct: null,
      estimated: "A",
      official: "A",
    });
    assert.deepEqual(sharedCourse(course("p", 3, 87.456), SAUDI4, { letter: "B+" }), {
      name: "p",
      hours: 3,
      pct: 87.46,
      estimated: "B+",
      official: "B+",
    });
  });

  test("even a course still waiting for its cutoffs, or with a stale entry", () => {
    for (const curve of [curveFor(SAUDI4, {}), { ...curveFor(SAUDI4, { A: 86 }), stale: true }]) {
      assert.equal(sharedCourse(curved(course("m", 3, 87), curve), SAUDI4).pct, null);
    }
  });
});

describe("the university an entry records", () => {
  test("slug, typed name, or nothing", () => {
    const a = (universitySlug: string | null, universityName: string): AcademicInfo => ({ universitySlug, universityName, major: "", level: "" });
    assert.equal(curveUniversity(a("kfupm", "جامعة الملك فهد")), "kfupm");
    assert.equal(curveUniversity(a("other", "  My   Uni ")), "typed:my uni");
    assert.equal(curveUniversity(a(null, "My Uni")), "typed:my uni");
    assert.equal(curveUniversity(a(null, " ")), "");
    assert.equal(curveUniversity(null), "");
  });

  test("passing letter of every built-in table", () => {
    assert.deepEqual(
      [SAUDI5, SAUDI4, JORDAN4, JORDAN4_PLUS].map(passLetter),
      ["D", "D", "D", "D"]
    );
  });
});

// The admin-approved university cutoffs share the new validator: their output
// must be exactly what it was. `legacyApplyCutoffs` is the code before the split.
function legacyApplyCutoffs(scheme: GradeScheme, cutoffs: Record<string, number>): GradeScheme | null {
  const last = scheme.bands.length - 1;
  const mins = scheme.bands.map((b, i) => (i === last ? 0 : cutoffs[b.letter]));
  const ok = mins.every(
    (m, i) => typeof m === "number" && m >= 0 && m <= 100 && (i === 0 || i === last || m < mins[i - 1])
  );
  if (!ok || !(mins[last - 1] > 0)) return null;
  return {
    ...scheme,
    bands: scheme.bands.map((b, i) => ({ ...b, min: mins[i] })),
    approxCutoffs: false,
    learnedCutoffs: true,
  };
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("learned university cutoffs are unchanged", () => {
  test("applyCutoffs gives exactly the old result on every table", () => {
    const rand = rng(20261005);
    const schemes = [...SCHEMES, ...CATALOG_TABLES.map((_, i) => catalogScheme(i))];
    let checked = 0;
    for (const scheme of schemes) {
      for (let k = 0; k < 30; k++) {
        const cut: Record<string, number> = {};
        let top = 100;
        for (const b of scheme.bands.slice(0, -1)) {
          const r = rand();
          if (r < 0.05) continue; // a letter missing
          if (r < 0.1) cut[b.letter] = top + 1; // not descending
          else if (r < 0.12) cut[b.letter] = 0; // zero
          else if (r < 0.14) cut[b.letter] = 101; // out of range
          else {
            top = Math.max(0.5, top - 1 - Math.floor(rand() * 8));
            cut[b.letter] = top;
          }
        }
        assert.deepEqual(applyCutoffs(scheme, cut), legacyApplyCutoffs(scheme, cut));
        checked++;
      }
    }
    assert.ok(checked > 100);
  });
});

describe("the cutoffs editor", () => {
  test("a row problem is found exactly when the table can't be applied", () => {
    const rand = rng(77);
    for (let k = 0; k < 3000; k++) {
      const n = 2 + Math.floor(rand() * 10);
      let top = 100 + Math.floor(rand() * 3);
      const mins = Array.from({ length: n }, () => {
        const r = rand();
        top = r < 0.08 ? top + 1 : r < 0.12 ? -1 : r < 0.16 ? Number.NaN : top - Math.floor(rand() * 9);
        return top;
      });
      assert.equal(cutoffProblem(mins) == null, validCutoffMins([...mins, 0]), JSON.stringify(mins));
    }
  });

  test("the problem names the row and why", () => {
    assert.deepEqual(cutoffProblem([95, 96, 80]), { index: 1, kind: "order" });
    assert.deepEqual(cutoffProblem([95, 101, 80]), { index: 1, kind: "range" });
    assert.deepEqual(cutoffProblem([95, 90, 0]), { index: 2, kind: "pass" });
    assert.equal(cutoffProblem([95, 90, 60]), null);
  });

  test("moving every cutoff keeps the gaps, decimals included", () => {
    assert.deepEqual(shiftCutoffs([95, 90.5, 60], -1), { mins: [94, 89.5, 59] });
    assert.deepEqual(shiftCutoffs([87.1, 60.2], 1), { mins: [88.1, 61.2] });
  });

  test("a move that would leave 0–100 is refused whole, nothing clamped", () => {
    assert.deepEqual(shiftCutoffs([100, 90, 60], 1), { blocked: 0 });
    assert.deepEqual(shiftCutoffs([95, 90, 1], -1), { blocked: 2 });
    assert.deepEqual(shiftCutoffs([95, 90, 0.5], -1), { blocked: 2 });
  });

  test("saving keeps only the rows set, or every row once complete", () => {
    const rows = SAUDI4.bands.slice(0, -1).map((b) => ({ letter: b.letter, min: b.min - 1, entered: b.letter === "A" }));
    const academic: AcademicInfo = { universitySlug: "kfupm", universityName: "", major: "", level: "" };
    const part = makeCurve(SAUDI4, academic, rows, false, "t");
    assert.deepEqual(part.cutoffs, { A: 89 });
    const done = makeCurve(SAUDI4, academic, rows, true, "t");
    assert.equal(Object.keys(done.cutoffs).length, SAUDI4.bands.length - 1);
    assert.deepEqual(done.basis, { university: "kfupm", fingerprint: schemeFingerprint(SAUDI4), baseCutoffs: baseCutoffs(SAUDI4) });
    assert.equal(courseCutoffs(curved(course("m", 3, 80), done), SAUDI4)!.status, "entered");
  });

  test("a complete Jordan table saves its failing D- row too", () => {
    const rows = JORDAN4.bands.slice(0, -1).map((b) => ({ letter: b.letter, min: b.min, entered: false }));
    const done = makeCurve(JORDAN4, null, rows, true, "t");
    assert.equal(done.cutoffs["D-"], 50);
    assert.equal("F" in done.cutoffs, false);
  });

  test("choosing «متوسط» with nothing entered waits on the university's table", () => {
    const c = curved(course("m", 3, 88), makeCurve(SAUDI4, null, [], false, "t"));
    assert.equal(courseCutoffs(c, SAUDI4)!.status, "waiting");
    assert.equal(gpaIsApprox([c], SAUDI4), true);
  });
});

describe("what-if: approximate with the sliders", () => {
  test("an ungraded course waiting for cutoffs counts once a slider gives it a %", () => {
    const c = curved(course("m", 3, null), curveFor(SAUDI4, {}));
    assert.equal(gpaIsApprox([c], SAUDI4), false);
    assert.equal(gpaIsApprox([c], SAUDI4, () => 75), true);
  });

  test("a portal result or W still doesn't count, even with a slider", () => {
    for (const official of [{ letter: "B" }, { letter: "W" }]) {
      const c = curved(course("m", 3, null, { official }), curveFor(SAUDI4, {}));
      assert.equal(gpaIsApprox([c], SAUDI4, () => 75), false);
    }
  });
});
