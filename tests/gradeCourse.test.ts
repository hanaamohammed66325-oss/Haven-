// gradeCourse refactor — proves the one shared course-grade function gives
// exactly what each screen computed on its own before (course points, the
// what-if simulator, the cumulative-GPA modal's rows, the grade badge).
//
// The `legacy*` functions below are the pre-refactor code, copied verbatim from
// lib/grades.ts (coursePoints), WhatIfCard, CumulativeGpaModal and GradeBadge.
// Every scheme Haven has (built-in, every catalogue table, custom tables) is
// run against many generated courses. Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Course, GradeComponent, OfficialGrade } from "@/types";
import {
  SCHEMES,
  DENIED,
  WITHDRAWN,
  bandForPct,
  catalogScheme,
  customScheme,
  isWithdrawn,
  pointsForOfficial,
  pointsForPct,
  type GradeScheme,
} from "@/lib/gradeSchemes";
import { CATALOG_TABLES } from "@/lib/gradeCatalog";
import {
  badgeGrade,
  courseCurrentPct,
  coursePoints,
  courseRows,
  gradeCourse,
  semesterGPA,
  simulatedSemester,
} from "@/lib/grades";

// ── the code before the refactor (verbatim) ────────────────────────────────

function legacyCoursePoints(course: Course, scheme: GradeScheme): number | null {
  if (isWithdrawn(course.official)) return null;
  const official = course.official ? pointsForOfficial(scheme, course.official) : null;
  if (official != null) return official;
  const p = courseCurrentPct(course);
  return p == null ? null : pointsForPct(scheme, p);
}

// WhatIfCard: the GPA memo's loop, and each row's shown letter.
function legacyWhatIf(courses: Course[], scheme: GradeScheme, sim: Record<string, number>) {
  let points = 0;
  let credits = 0;
  courses.forEach((c) => {
    if (isWithdrawn(c.official)) return;
    const fixed = c.official ? pointsForOfficial(scheme, c.official) : null;
    const p = sim[c.id] ?? 75;
    points += (fixed ?? pointsForPct(scheme, p)) * c.creditHours;
    credits += c.creditHours;
  });
  const rows = courses.map((c) => {
    const fixed = c.official ? pointsForOfficial(scheme, c.official) : null;
    if (fixed != null || isWithdrawn(c.official)) {
      const letter = fixed != null && scheme.percent ? bandForPct(scheme, fixed).letter : c.official!.letter;
      return { settled: true, fixed, letter };
    }
    const v = sim[c.id] ?? 75;
    return { settled: false, fixed: null, letter: bandForPct(scheme, v).letter };
  });
  return { points, credits, rows };
}

// CumulativeGpaModal: letterPoints + the "current courses" rows.
const legacyLetterPoints = (scheme: GradeScheme, letter: string) => {
  const b = scheme.bands.find((x) => x.letter === letter);
  return b ? (scheme.percent ? b.min : b.points) : 0;
};
function legacyModalRows(courses: Course[], scheme: GradeScheme, overrides: Record<string, string>) {
  return courses.map((c) => {
    if (isWithdrawn(c.official)) {
      return { id: c.id, name: c.name, credits: Number(c.creditHours) || 0, graded: false, letter: c.official!.letter!, points: null };
    }
    const pct = courseCurrentPct(c);
    const officialPts = c.official ? pointsForOfficial(scheme, c.official) : null;
    const officialLetter =
      officialPts == null ? null : scheme.percent ? bandForPct(scheme, officialPts).letter : c.official!.letter!;
    const graded = pct != null || officialPts != null;
    const projected = officialLetter ?? (pct != null ? bandForPct(scheme, pct).letter : null);
    const override = overrides[c.id];
    const letter = override ?? projected;
    const points =
      override != null
        ? legacyLetterPoints(scheme, override)
        : officialPts != null
        ? officialPts
        : pct != null
        ? pointsForPct(scheme, pct)
        : null;
    return { id: c.id, name: c.name, credits: Number(c.creditHours) || 0, graded, letter, points };
  });
}

// GradeBadge: what it showed and coloured.
function legacyBadge(scheme: GradeScheme, pct: number | null, official?: OfficialGrade) {
  const officialPoints = official ? pointsForOfficial(scheme, official) : null;
  const special =
    !scheme.percent && (official?.letter === WITHDRAWN || official?.letter === DENIED) ? official.letter : null;
  const hasOfficial = officialPoints != null || special != null;
  const isDefault = pct == null && !hasOfficial;
  const displayPct = officialPoints != null && scheme.percent ? officialPoints : pct ?? 100;
  const estimated = bandForPct(scheme, displayPct);
  const grade =
    hasOfficial && !scheme.percent ? scheme.bands.find((b) => b.letter === official!.letter) ?? estimated : estimated;
  return {
    letter: special ?? grade.letter,
    colorPoints:
      special === WITHDRAWN ? null : special === DENIED ? scheme.bands[scheme.bands.length - 1].points : grade.points,
    official: hasOfficial,
    isDefault,
  };
}

// ── fixtures ───────────────────────────────────────────────────────────────

// Deterministic pseudo-random numbers, so a failure is reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const schemes: GradeScheme[] = [
  ...SCHEMES,
  ...CATALOG_TABLES.map((_, i) => catalogScheme(i)),
  customScheme({
    max: 4.3,
    bands: [
      { letter: "A+", points: 4.3, min: 97 },
      { letter: "A", points: 4, min: 93 },
      { letter: "B", points: 3, min: 80 },
      { letter: "C", points: 2, min: 70 },
      { letter: "F", points: 0, min: null },
    ],
  })!,
  customScheme({ max: 4, bands: [{ letter: "A", points: 4, min: null }, { letter: "B", points: 3, min: null }, { letter: "F", points: 0, min: null }] })!,
  customScheme({
    max: 100,
    percent: true,
    bands: [
      { letter: "Excellent", points: 0, min: 90 },
      { letter: "Good", points: 0, min: 75 },
      { letter: "Pass", points: 0, min: 50 },
      { letter: "Fail", points: 0, min: null },
    ],
  })!,
];

let seq = 0;
function makeCourses(scheme: GradeScheme, rand: () => number, n: number): Course[] {
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const out: Course[] = [];
  for (let k = 0; k < n; k++) {
    const components: GradeComponent[] = [];
    const count = Math.floor(rand() * 6); // 0..5: none, partial, full
    for (let i = 0; i < count; i++) {
      const total = pick([10, 20, 25, 50, 100]);
      const graded = rand() < 0.7;
      components.push({
        id: `c${seq++}`,
        name: "item",
        type: pick(["quiz", "midterm", "final", "assignment"] as GradeComponent["type"][]),
        weight: pick([5, 10, 15, 20, 25, 30, 40]),
        unit: "percent",
        total: rand() < 0.05 ? 0 : total,
        score: graded ? Math.round(rand() * total * 100) / 100 : null,
        date: null,
      });
    }
    const roll = rand();
    const official: OfficialGrade | undefined =
      roll < 0.45
        ? undefined
        : roll < 0.6
        ? { letter: pick(scheme.bands).letter }
        : roll < 0.67
        ? { letter: WITHDRAWN }
        : roll < 0.74
        ? { letter: DENIED }
        : roll < 0.8
        ? { letter: "Z?" } // a letter from a table the student has since changed
        : roll < 0.9
        ? { mark: Math.round(rand() * 10000) / 100 }
        : {};
    out.push({
      id: `k${seq++}`,
      name: `course ${k}`,
      creditHours: pick([0, 1, 2, 3, 3, 4]),
      sessions: [],
      missedLectures: 0,
      missedSessions: [],
      components,
      ...(official ? { official } : {}),
    });
  }
  return out;
}

const ROUNDS = 40;

// ── the proofs ─────────────────────────────────────────────────────────────

describe("gradeCourse gives exactly the pre-refactor results", () => {
  test("course points and semester GPA, every scheme", () => {
    schemes.forEach((scheme, si) => {
      const rand = rng(1000 + si);
      for (let r = 0; r < ROUNDS; r++) {
        const courses = makeCourses(scheme, rand, 6);
        let n = 0;
        let d = 0;
        for (const c of courses) {
          const want = legacyCoursePoints(c, scheme);
          assert.equal(coursePoints(c, scheme), want, `${scheme.id} ${c.id}`);
          assert.equal(gradeCourse(c, scheme).points, want, `${scheme.id} ${c.id}`);
          if (want != null) {
            n += want * c.creditHours;
            d += c.creditHours;
          }
        }
        assert.equal(semesterGPA(courses, scheme), d ? n / d : null, scheme.id);
      }
    });
  });

  test("what-if simulator: totals and every row's letter, incl. the default 75", () => {
    schemes.forEach((scheme, si) => {
      const rand = rng(2000 + si);
      for (let r = 0; r < ROUNDS; r++) {
        const courses = makeCourses(scheme, rand, 6);
        const sim: Record<string, number> = {};
        for (const c of courses) if (rand() < 0.7) sim[c.id] = Math.floor(rand() * 101);
        const want = legacyWhatIf(courses, scheme, sim);
        assert.deepEqual(simulatedSemester(courses, scheme, (c) => sim[c.id] ?? 75), {
          points: want.points,
          credits: want.credits,
        });
        courses.forEach((c, i) => {
          const g = gradeCourse(c, scheme, { pct: sim[c.id] ?? 75 });
          const settled = g.source === "official" || g.source === "withdrawn";
          assert.equal(settled, want.rows[i].settled, `${scheme.id} ${c.id}`);
          assert.equal(g.letter, want.rows[i].letter, `${scheme.id} ${c.id}`);
          if (settled) assert.equal(g.source === "official" ? g.points : null, want.rows[i].fixed);
        });
      }
    });
  });

  test("cumulative modal rows, with and without picked letters", () => {
    schemes.forEach((scheme, si) => {
      const rand = rng(3000 + si);
      for (let r = 0; r < ROUNDS; r++) {
        const courses = makeCourses(scheme, rand, 6);
        const overrides: Record<string, string> = {};
        for (const c of courses) if (rand() < 0.5) overrides[c.id] = scheme.bands[Math.floor(rand() * scheme.bands.length)].letter;
        assert.deepEqual(courseRows(courses, scheme, overrides), legacyModalRows(courses, scheme, overrides), scheme.id);
        assert.deepEqual(courseRows(courses, scheme, {}), legacyModalRows(courses, scheme, {}), scheme.id);
      }
    });
  });

  test("grade badge: letter, colour, portal caption, faded default", () => {
    schemes.forEach((scheme, si) => {
      const rand = rng(4000 + si);
      for (let r = 0; r < ROUNDS; r++) {
        for (const c of makeCourses(scheme, rand, 6)) {
          const pct = courseCurrentPct(c);
          assert.deepEqual(badgeGrade(scheme, pct, c.official), legacyBadge(scheme, pct, c.official), `${scheme.id} ${c.id}`);
        }
      }
    });
  });
});

describe("gradeCourse priorities (each screen keeps its own)", () => {
  const scheme = SCHEMES.find((s) => s.id === "saudi5")!;
  const base: Course = {
    id: "p1",
    name: "p",
    creditHours: 3,
    sessions: [],
    missedLectures: 0,
    missedSessions: [],
    components: [{ id: "x", name: "final", type: "final", weight: 100, unit: "percent", total: 100, score: 72, date: null }],
  };

  test("default: the portal result wins over the course %", () => {
    const g = gradeCourse({ ...base, official: { letter: "A" } }, scheme);
    assert.equal(g.source, "official");
    assert.equal(g.letter, "A");
  });
  test("what-if: the portal result still wins over the slider %", () => {
    const g = gradeCourse({ ...base, official: { letter: "A" } }, scheme, { pct: 10 });
    assert.equal(g.source, "official");
    assert.equal(g.letter, "A");
  });
  test("cumulative modal: a picked letter wins even over the portal result", () => {
    const g = gradeCourse({ ...base, official: { letter: "A" } }, scheme, { letter: "C" });
    assert.equal(g.source, "override");
    assert.equal(g.letter, "C");
  });
  test("withdrawn stays out, even with a picked letter", () => {
    const g = gradeCourse({ ...base, official: { letter: WITHDRAWN } }, scheme, { letter: "A+" });
    assert.equal(g.source, "withdrawn");
    assert.equal(g.points, null);
  });
  test("nothing graded: no letter and no points", () => {
    const g = gradeCourse({ ...base, components: [] }, scheme);
    assert.deepEqual(g, { pct: null, letter: null, points: null, source: "none" });
  });
});
