import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { SAUDI5 } from "@/lib/gradeSchemes";
import { courseRows, gpaIsApprox, projectedCumulativeGpa, semesterGPA, semesterGpaDetail, simulatedSemester } from "@/lib/grades";
import { repeatAdjust } from "@/lib/repeats";
import { gpaGaps } from "@/lib/gpaReadiness";
import type { Course } from "@/types";

const course = (id: string, creditHours: number, letter: string | null, extra: Partial<Course> = {}): Course => ({
  id, name: id, creditHours, sessions: [], missedLectures: 0, missedSessions: [],
  components: [], ...(letter ? { official: { letter } } : {}), ...extra,
});

test("an excluded course leaves the semester GPA: no points, no hours", () => {
  const kept = course("kept", 3, "B");
  const out = course("out", 4, "A+", { gpaExcluded: true });
  assert.equal(semesterGPA([kept, out], SAUDI5), semesterGPA([kept], SAUDI5));
  assert.deepEqual(semesterGpaDetail([kept, out], SAUDI5), semesterGpaDetail([kept], SAUDI5));
  assert.equal(semesterGpaDetail([kept, out], SAUDI5).credits, 3);
  assert.equal(semesterGPA([{ ...out, gpaExcluded: false }, kept], SAUDI5)! > semesterGPA([kept], SAUDI5)!, true);
});

test("all courses excluded is no GPA, never zero", () => {
  assert.equal(semesterGPA([course("a", 3, "A+", { gpaExcluded: true })], SAUDI5), null);
});

test("the cumulative uses only the counted courses and keeps the previous record", () => {
  const kept = course("kept", 3, "B");
  const out = course("out", 4, "F", { gpaExcluded: true });
  assert.equal(projectedCumulativeGpa([kept, out], 4, 30, SAUDI5), projectedCumulativeGpa([kept], 4, 30, SAUDI5));
  assert.equal(projectedCumulativeGpa([out], 4, 30, SAUDI5), 4);
});

test("What-If and the approximate mark skip an excluded course", () => {
  const kept = course("kept", 3, null);
  const out = course("out", 4, null, { gpaExcluded: true });
  const pct = () => 95;
  assert.deepEqual(simulatedSemester([kept, out], SAUDI5, pct), simulatedSemester([kept], SAUDI5, pct));
  assert.equal(gpaIsApprox([out], SAUDI5, pct), false);
});

test("the cumulative modal lists an excluded course with its own letter, never counted", () => {
  const rows = courseRows([course("kept", 3, "B"), course("out", 4, "A+", { gpaExcluded: true })], SAUDI5, { out: "F" });
  const out = rows.find((r) => r.id === "out")!;
  assert.equal(out.excluded, true);
  assert.equal(out.graded, false);
  assert.equal(out.points, null);
  assert.equal(out.letter, "A+");
  assert.equal(out.credits, 4);
  assert.equal(rows.find((r) => r.id === "kept")!.excluded, undefined);
});

test("an excluded repeated course does not take its earlier attempt out of the cumulative", () => {
  const academic = { repeatPolicy: "latest" } as never;
  const repeated = course("rep", 3, "A", { repeat: { letter: "D" } });
  assert.equal(repeatAdjust([repeated], SAUDI5, academic).hours, 3);
  const adjust = repeatAdjust([{ ...repeated, gpaExcluded: true }], SAUDI5, academic);
  assert.deepEqual(adjust, { points: 0, hours: 0, cap: null });
  assert.equal(projectedCumulativeGpa([{ ...repeated, gpaExcluded: true }], 3, 60, SAUDI5, academic), 3);
});

test("an excluded course raises no missing-data note for the GPA", () => {
  const out = course("out", 0, null, { gpaExcluded: true });
  const gaps = gpaGaps({ academic: {} as never, courses: [out], cumulativeGpa: 0, cumulativeHours: 0, semesterEnd: "2020-01-01", checkGrades: true });
  assert.equal(gaps.some((g) => g.courses?.some((c) => c.id === "out")), false);
});

function storeCallback(name: string, bindings: Record<string, unknown>): any {
  const file = "src/store/index.tsx";
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === name) found = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  assert(found && ts.isCallExpression(found));
  const js = ts.transpileModule(`const extracted = ${found.arguments[0].getText(sf)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return extracted;`)(...Object.values(bindings));
}

test("the store saves the exclusion to the semester, drops deleted courses and skips no-op writes", () => {
  const state: any = { courses: [{ id: "a" }, { id: "b" }], gpaExcluded: ["gone"] };
  const writes: any[] = [];
  const set = storeCallback("setCourseGpaExcluded", {
    dataRef: { current: state }, commit: (patch: any) => Object.assign(state, patch),
    persistSemesterProgress: (patch: any) => writes.push(patch),
  });
  set("a", true);
  assert.deepEqual(state.gpaExcluded, ["a"]);
  assert.deepEqual(writes.at(-1), { gpaExcluded: ["a"] });
  set("a", true);
  assert.equal(writes.length, 1, "no write when nothing changed");
  set("a", false);
  assert.deepEqual(state.gpaExcluded, []);
  assert.deepEqual(writes.at(-1), { gpaExcluded: [] });
});

test("a stored exclusion list is read back safely", () => {
  const source = fs.readFileSync("src/store/index.tsx", "utf8");
  const start = source.indexOf("function readIdList");
  assert(start >= 0);
  const fn = source.slice(start, source.indexOf("\n}", start) + 2);
  const js = ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const readIdList = new Function(`${js}; return readIdList;`)();
  assert.deepEqual(readIdList(["a", 3, "", null, "b"]), ["a", "b"]);
  assert.deepEqual(readIdList(undefined), []);
  assert.deepEqual(readIdList({ a: 1 }), []);
});
