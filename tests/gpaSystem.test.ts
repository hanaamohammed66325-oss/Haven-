import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { gpaReviewId, captureGpaSystem, readGpaSystem, gpaSystemChanged, priorGpaReview, priorGpaReviewKey } from "@/lib/gpaSystem";
import { SAUDI4, SAUDI5 } from "@/lib/gradeSchemes";
import { projectedCumulativeFromParts } from "@/lib/grades";
import { nextSemesterProgress } from "@/lib/semesterProgress";
import { nonNegativeFinite, validPriorGpa } from "@/lib/gpaInputs";

function storeCallback(name: string, bindings: Record<string, unknown>): (...args: number[]) => any {
  const source = fs.readFileSync("src/store/index.tsx", "utf8");
  const sf = ts.createSourceFile("store.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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

test("grading reference ignores presentation but detects scale and letter-point changes", () => {
  const reference = captureGpaSystem(SAUDI5);
  assert.equal(gpaSystemChanged({ ...SAUDI5, id: "custom", bands: [...SAUDI5.bands].reverse() }, reference), false);
  assert.equal(gpaSystemChanged(SAUDI4, reference), true);
  for (const field of ["points", "min"] as const) {
    const bands = SAUDI5.bands.map((band, i) => i === 1 ? { ...band, [field]: band[field] - 0.1 } : band);
    assert.equal(gpaSystemChanged({ ...SAUDI5, bands }, reference), field === "points", field);
  }
  assert.deepEqual(readGpaSystem(JSON.parse(JSON.stringify(reference))), reference);
  assert.equal(readGpaSystem(undefined), undefined);
  assert.equal(readGpaSystem({ ...reference, version: 2 }), undefined);
  assert.equal(readGpaSystem({ ...reference, max: NaN }), undefined);
});

test("3.8 after a scale change computes with review; legacy and zero-hours behavior remain", () => {
  const reference = captureGpaSystem(SAUDI5);
  assert.equal(priorGpaReview(3.8, 30, SAUDI4, reference), "systemChanged");
  assert.equal(projectedCumulativeFromParts(12, 3, 3.8, 30, SAUDI4, undefined, reference), 126 / 33);
  assert.equal(projectedCumulativeFromParts(12, 3, 3.8, 30, SAUDI4), 126 / 33);
  assert.equal(projectedCumulativeFromParts(12, 3, 4.8, 30, SAUDI4), null);
  assert.equal(projectedCumulativeFromParts(12, 3, 4.8, 0, SAUDI4, undefined, reference), 4);
  assert.equal(priorGpaReview(4.8, 0, SAUDI4), null);
  assert.equal(projectedCumulativeFromParts(12, 3, 3.8, 30, SAUDI4, undefined, captureGpaSystem(SAUDI4)), 126 / 33);
});

test("actual store confirms the same GPA against new rules atomically, but hours alone never acknowledge them", () => {
  const writes: Record<string, unknown>[] = [];
  const state: any = { academic: {}, cumulativeGpa: 3.8, cumulativeHours: 30, cumulativeGpaSystem: captureGpaSystem(SAUDI5) };
  const bindings = {
    nonNegativeFinite, validPriorGpa, gpaReviewId, captureGpaSystem, gpaSystemChanged, priorGpaReview, priorGpaReviewKey,
    semesterIdRef: { current: "term" }, readyUidRef: { current: null }, historicalSelectionRef: { current: null },
    dataRef: { current: state }, resolveScheme: () => SAUDI4, accountDataChanging: () => false,
    commit: (patch: any) => Object.assign(state, patch),
    persistSemesterProgress: (patch: Record<string, unknown>) => writes.push(patch),
  };
  storeCallback("setCumulativeHours", bindings)(30.5);
  assert.equal(gpaSystemChanged(SAUDI4, state.cumulativeGpaSystem), true);
  assert.equal(writes.at(-1)?.cumulativeStartSystem, undefined);
  const end = storeCallback("confirmCumulativeForSemester", bindings);
  assert.equal(end(3.82, 33.5), false);
  const count = writes.length;
  const confirm = storeCallback("confirmPreviousGpa", bindings);
  assert.equal(confirm(4.8, 30.5), false);
  assert.equal(writes.length, count);
  assert.equal(confirm(3.8, 30.5), true);
  assert.equal(state.cumulativeGpa, 3.8);
  assert.deepEqual(writes.at(-1), { cumulativeStartGpa: 3.8, cumulativeStartHours: 30.5, cumulativeStartSystem: state.cumulativeGpaSystem });
  assert.equal(end(3.82, 33.5), true);
  assert.equal(gpaSystemChanged(SAUDI4, writes.at(-1)?.cumulativeEndSystem as any), false);
  assert.equal(typeof (writes.at(-1)?.cumulativeEndSystem as any).reviewId, "string");
  assert.equal(gpaSystemChanged(SAUDI4, state.cumulativeGpaSystem), false);
  storeCallback("setCumulativeGpa", { ...bindings, confirmPreviousGpa: confirm })(3.7);
  assert.equal(gpaSystemChanged(SAUDI4, writes.at(-1)?.cumulativeStartSystem as any), false);
  assert.equal(typeof (writes.at(-1)?.cumulativeStartSystem as any).reviewId, "string");
});

test("semester carry preserves confirmed or starting references without inventing a legacy reference", () => {
  const five = captureGpaSystem(SAUDI5), four = captureGpaSystem(SAUDI4);
  const carry = (progress: Record<string, unknown>) => nextSemesterProgress(progress, 3, 20, {}, "gregorian");
  const start = { cumulativeStartGpa: 3.8, cumulativeStartHours: 30.5, cumulativeStartSystem: five };
  assert.deepEqual(carry(start).cumulativeStartSystem, five);
  assert.deepEqual(carry({ ...start, cumulativeEndGpa: 3.9, cumulativeEndHours: 33.5, cumulativeEndSystem: four, cumulativeConfirmedAt: "2026-11-09" }).cumulativeStartSystem, four);
  assert.equal(carry({ cumulativeStartGpa: 3.8, cumulativeStartHours: 30 }).cumulativeStartSystem, undefined);
  assert.equal(carry({ ...start, cumulativeEndGpa: 3.9, cumulativeEndHours: 33.5, cumulativeConfirmedAt: "2026-11-09" }).cumulativeStartSystem, undefined);
});

test("the actual cold-load expression restores a persisted reference and leaves legacy data unknown", () => {
  const source = fs.readFileSync("src/store/index.tsx", "utf8");
  const sf = ts.createSourceFile("store.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(sf) === "cumulativeGpaSystem" && node.initializer.getText(sf).includes("semesterValue")) expression = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  assert(expression);
  const load = (progress: Record<string, unknown>) => new Function("readGpaSystem", "semesterValue", `return ${expression!.getText(sf)};`)(
    readGpaSystem, (key: string, fallback: unknown) => progress[key] ?? fallback,
  );
  const persisted = JSON.parse(JSON.stringify({ cumulativeStartSystem: captureGpaSystem(SAUDI5) }));
  assert.equal(priorGpaReview(3.8, 30, SAUDI4, load(persisted)), "systemChanged");
  assert.equal(load({}), undefined);
});
