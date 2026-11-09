import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { manualSemesterTotals, nonNegativeFinite, validPriorGpa } from "@/lib/gpaInputs";
import { customScheme, SAUDI4, SAUDI5, PERCENTAGE } from "@/lib/gradeSchemes";
import { projectedCumulativeFromParts } from "@/lib/grades";
import { nextSemesterProgress } from "@/lib/semesterProgress";
import { savedGpaComparison } from "@/lib/gpaComparison";
import { gpaReviewId, captureGpaSystem, gpaSystemChanged, priorGpaReview, priorGpaReviewKey } from "@/lib/gpaSystem";
import { gpaGaps } from "@/lib/gpaReadiness";

// Exercise the real store and public-calculator callbacks without opening an account.
function callback(file: string, name: string, bindings: Record<string, unknown>): (...args: number[]) => any {
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === name) expression = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  assert(expression && ts.isCallExpression(expression));
  const js = ts.transpileModule(`const extracted = ${expression.arguments[0].getText(sf)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return extracted;`)(...Object.values(bindings));
}

test("fractional prior and confirmed hours survive the actual store callbacks and next-term carry", () => {
  const writes: Record<string, unknown>[] = [];
  const commits: Record<string, unknown>[] = [];
  const bindings = { accountDataChanging: () => false, nonNegativeFinite, validPriorGpa, gpaReviewId, captureGpaSystem, gpaSystemChanged, commit: (p: Record<string, unknown>) => commits.push(p),
    persistSemesterProgress: (p: Record<string, unknown>) => writes.push(p),
    resolveScheme: () => SAUDI5, dataRef: { current: { academic: {} } } };
  const setHours = callback("src/store/index.tsx", "setCumulativeHours", bindings);
  const confirm = callback("src/store/index.tsx", "confirmCumulativeForSemester", bindings);
  for (const hours of [0, 0.5, 10.5, 13.5, 30]) {
    setHours(hours);
    assert.equal(writes.at(-1)?.cumulativeStartHours, hours);
    assert.equal(commits.at(-1)?.cumulativeHours, hours);
    confirm(3.5, hours);
    assert.equal(writes.at(-1)?.cumulativeEndHours, hours);
    assert.equal(nextSemesterProgress(writes.at(-1)!, 0, 0, {}, "gregorian").cumulativeStartHours, hours);
  }
  setHours(Infinity);
  assert.equal(writes.at(-1)?.cumulativeStartHours, 0);
});

test("incompatible prior GPA is retained by the store and held in the cumulative calculation", () => {
  const commits: Record<string, unknown>[] = [];
  const setGpa = callback("src/store/index.tsx", "setCumulativeGpa", {
    accountDataChanging: () => false, nonNegativeFinite, validPriorGpa, gpaReviewId, captureGpaSystem, resolveScheme: () => SAUDI4, dataRef: { current: { academic: {} } }, commit: (p: Record<string, unknown>) => commits.push(p), persistSemesterProgress: () => {},
  });
  setGpa(4.8);
  assert.equal(commits[0].cumulativeGpa, 4.8);
  assert.equal(projectedCumulativeFromParts(12, 3, 4.8, 60, SAUDI4), null);
  assert.equal(projectedCumulativeFromParts(12, 3, 4, 60, SAUDI4), 4);
  assert.equal(projectedCumulativeFromParts(12, 3, 0, 60, SAUDI4), 12 / 63);
  assert.equal(projectedCumulativeFromParts(12, 3, NaN, 60, SAUDI4), null);
  assert.equal(projectedCumulativeFromParts(12, 3, 3, Infinity, SAUDI4), null);
});

test("manual rows never substitute zero points for an absent or obsolete grade", () => {
  const scheme = customScheme({ max: 4, bands: [{ letter: "Excellent", points: 4, min: 90 }, { letter: "Fail", points: 0, min: 0 }] })!;
  const blank = { name: "", credits: "", letter: "" };
  assert.deepEqual(manualSemesterTotals([blank], scheme), { credits: 0, points: 0, incomplete: false });
  for (const letter of ["", "A"]) {
    assert.equal(manualSemesterTotals([{ ...blank, credits: "3", letter }], scheme).incomplete, true);
  }
  assert.deepEqual(manualSemesterTotals([{ ...blank, credits: "3.5", letter: "Excellent" }], scheme), { credits: 3.5, points: 14, incomplete: false });
  assert.equal(manualSemesterTotals([{ ...blank, name: "Course" }], scheme).incomplete, true);
  assert.equal(manualSemesterTotals([{ ...blank, credits: "-1", letter: "Excellent" }], scheme).incomplete, true);
  assert.equal(manualSemesterTotals([{ ...blank, credits: "3", letter: "A" }], SAUDI5).incomplete, false);
});

test("public calculator rejects a stale 5-point prior on scale 4, but accepts an explicit zero", () => {
  const calc = (prevGpa: string, prevHours = "60") => callback("src/components/tools/GpaCalculatorTool.tsx", "{ semesterGpa, semesterCredits, cumulativeGpa }", {
    rows: [{ credits: "3", grade: "A+" }], scale: "4", max: 4, prevGpa, prevHours, validPriorGpa, reviewReason: null, pointsFor: () => 4,
  })();
  assert.equal(calc("4.8").cumulativeGpa, null);
  assert.equal(calc("4.8").semesterGpa, 4);
  assert.equal(calc("0").cumulativeGpa, 12 / 63);
  assert.equal(calc("").cumulativeGpa, null);
  assert.equal(calc("0", "0").cumulativeGpa, 4);
});

test("post-term verification names ungraded courses without extending Havi's window", () => {
  const course = { id: "missing", name: "Missing grade", creditHours: 3, components: [] } as any;
  const input = { academic: { universityName: "جامعة الملك سعود", universitySlug: "king-saud", major: "", level: "1" }, courses: [course], cumulativeGpa: 0, cumulativeHours: 0, semesterEnd: "2026-10-01", now: new Date("2026-11-08T12:00:00Z") };
  assert(!gpaGaps(input).some((gap) => gap.kind === "grades"));
  assert.deepEqual(gpaGaps({ ...input, checkGrades: true }).find((gap) => gap.kind === "grades")?.courses, [{ id: "missing", name: "Missing grade" }]);
  assert(!gpaGaps({ ...input, checkGrades: true, courses: [{ ...course, official: { letter: "A+" } }] }).some((gap) => gap.kind === "grades"));
  assert(!gpaGaps({ ...input, checkGrades: true, courses: [{ ...course, official: { letter: "W" } }] }).some((gap) => gap.kind === "grades"));
});

test("saved comparison has one current result for text and color, preserving rounding evidence", () => {
  const historical = { ours: 4.061875, portal: 4.08, result: "match" };
  assert.equal(savedGpaComparison(historical.ours, historical.portal, undefined, historical.result), "mismatch");
  assert.equal(historical.result, "match");
  assert.equal(savedGpaComparison(4.958333, 4.98, undefined, "match"), "mismatch");
  assert.equal(savedGpaComparison(4.654, 4.66, "rounding", "match"), "rounding");
  assert.equal(savedGpaComparison(null, null, null, "match"), "match");
  assert.equal(savedGpaComparison(null, null), null);
});

test("valid cumulative inputs preserve precision on 4, 5 and percentage scales", () => {
  for (const scheme of [SAUDI4, SAUDI5, PERCENTAGE]) {
    const before = scheme.max * .6;
    const points = scheme.max * 3;
    assert.equal(projectedCumulativeFromParts(points, 3, before, 10.5, scheme), (before * 10.5 + points) / 13.5);
  }
});

test("zero previous hours cannot make an unused prior GPA hide the semester result", () => {
  for (const previous of [4.8, 0, NaN]) {
    assert.equal(projectedCumulativeFromParts(11.25, 3, previous, 0, SAUDI4), 3.75);
  }
  assert.equal(projectedCumulativeFromParts(0, 0, 4.8, 0, SAUDI4), null);
  assert.equal(projectedCumulativeFromParts(11.25, 3, 4.8, 10, SAUDI4), null);
});

test("confirmation explicitly rejects invalid values without writing and accepts exact valid values", () => {
  const writes: Record<string, unknown>[] = [];
  const confirm = callback("src/store/index.tsx", "confirmCumulativeForSemester", {
    accountDataChanging: () => false, validPriorGpa, gpaReviewId, captureGpaSystem, gpaSystemChanged, resolveScheme: () => SAUDI4, dataRef: { current: { academic: {} } },
    persistSemesterProgress: (p: Record<string, unknown>) => writes.push(p),
  });
  for (const [gpa, hours] of [[4.8, 10], [3, -1], [3, Infinity], [NaN, 10]]) {
    assert.equal(confirm(gpa, hours), false);
  }
  assert.equal(writes.length, 0);
  assert.equal(confirm(3.75, 10.5), true);
  assert.equal(writes[0].cumulativeEndHours, 10.5);
});
