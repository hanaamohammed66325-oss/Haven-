import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { readPastTerms, readTermCheck, sharedCourse } from "@/lib/termCheck";
import { SAUDI5 } from "@/lib/gradeSchemes";

// Exercise the actual callbacks, without an account or a real event write.
function callback(name: string, contains: string, bindings: Record<string, unknown>) {
  const sf = ts.createSourceFile("TermCheck.tsx", fs.readFileSync("src/components/TermCheck.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === name && node.initializer?.getText(sf).includes(contains)) expression = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  assert(expression, `${name}: ${contains}`);
  const js = ts.transpileModule(`const run = ${expression.getText(sf)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return run;`)(...Object.values(bindings));
}

function harness() {
  const events: { event: string; meta: any }[] = [];
  const saves: any[] = [];
  const courses = [{ name: "Calculus", hours: 3, official: "B", estimated: "A" }];
  const bindings = {
    save: (value: any) => saves.push(value),
    reportTermCheck: (event: string, meta: any) => events.push({ event, meta }),
    baseMeta: () => ({ ours: 4.5, portal: 4, scheme: "saudi5", university: "Test" }),
    courseMeta: () => courses,
    termCheck: { consent: false, grades: {} },
    setStep: () => {}, finish: () => {},
  };
  return { events, saves, courses, bindings };
}

test("live mismatch submits courses even when an earlier check refused sharing", () => {
  const h = harness();
  callback("next", '"term_gpa_mismatch"', { ...h.bindings, portal: 4, guesses: [] })();
  assert.equal(h.events[0].meta.reviewShared, true);
  assert.deepEqual(h.events[0].meta.courses, h.courses);
  assert.equal(h.events[0].meta.portal, 4);
  assert.equal(h.saves[0].reviewShared, true);
  assert.equal(h.saves[0].consent, undefined);
});

test("grade list and targeted correction both submit their diagnostic snapshot", () => {
  for (const via of ["list", "guess"]) {
    const h = harness();
    const bindings = { ...h.bindings, gradesFromDraft: () => ({ c: { letter: "B" } }), setError: assert.fail, t: (s: string) => s, portal: null, matches: false, g: { courseId: "c", letter: "B" }, course: { name: "Calculus" }, setFound: () => {} };
    callback(via === "list" ? "submit" : "yes", `via: "${via}"`, bindings)();
    assert.equal(h.events[0].meta.via, via);
    assert.equal(h.events[0].meta.reviewShared, true);
    assert.deepEqual(h.events[0].meta.courses, h.courses);
    assert.equal(h.saves[0].reviewShared, true);
  }
});

test("cumulative comparison and its reason retain all diagnostic inputs", () => {
  const h = harness();
  const cum = { before: 3.5, hours: 30, portal: 4, ours: 3.6, result: "mismatch", comparison: "mismatch" };
  const cumMeta = (c: any) => ({ ...c, courses: h.courses, scheme: "saudi5" });
  callback("compareCum", '"term_cum_checked"', {
    ...h.bindings, cumEdit: false, cumulativeGpa: 3.5, cumulativeHours: 30,
    parseNumber: Number, cumPortalRaw: "4", scheme: SAUDI5, courses: [], academic: {},
    projectedCumulativeGpa: () => 3.6, confirmPreviousGpa: () => true,
    priorGpaDecimals: () => 2, toEnglishDigits: (s: string) => s,
    compareCumulativeGpa: () => "mismatch", cumMeta,
    setCumSaved: () => {}, setCumReasonDone: () => {},
  })();
  callback("pick", '"term_cum_reason"', {
    ...h.bindings, cumSaved: cum, cumMeta, gaps: [], missingKinds: () => [],
    setCumSaved: () => {}, setCumReasonDone: () => {},
  })("unknown");
  for (const { meta } of h.events) {
    assert.equal(meta.reviewShared, true);
    assert.equal(meta.before, 3.5);
    assert.equal(meta.hours, 30);
    assert.equal(meta.portal, 4);
    assert.deepEqual(meta.courses, h.courses);
  }
});

test("past-term reason includes the same snapshot as its comparison", () => {
  const h = harness();
  const saved = { id: "old", consent: false, reviewShared: true, scheme: "saudi5", name: "Term", ours: 4.5, portalGpa: 4, result: "mismatch", courses: h.courses, cum: { before: 3.5, hours: 30 } };
  callback("pickReason", '"past_term_reason"', {
    ...h.bindings, saved, pastTerms: [saved], setPastTerms: () => {},
    university: "Test", catalog: null, setSaved: () => {}, setReasonDone: () => {},
  })("unknown");
  assert.equal(h.events[0].meta.reviewShared, true);
  assert.deepEqual(h.events[0].meta.courses, h.courses);
  assert.deepEqual(h.events[0].meta.cum, saved.cum);
  assert.equal(h.events[0].meta.portal, 4);
});

test("reload preserves new sharing marker without upgrading historical refusals", () => {
  const live = { term: "t", consent: false, grades: {}, at: "old" };
  assert.equal(readTermCheck(live, "t")?.reviewShared, undefined);
  assert.equal(readTermCheck({ ...live, reviewShared: true }, "t")?.reviewShared, true);
  assert.equal(readTermCheck({ ...live, reviewShared: "true" }, "t")?.reviewShared, undefined);
  const past = { id: "old", consent: false, courses: [{ letter: "B", hours: 3 }], portalGpa: 4, ours: 4, scheme: "saudi5" };
  assert.equal(readPastTerms([past])[0].reviewShared, undefined);
  const restored = readPastTerms([{ ...past, reviewShared: true }])[0];
  assert.equal(restored.reviewShared, true);
  assert.equal(restored.consent, false);
  assert.equal(past.consent, false);
});

test("diagnostic course snapshot identifies GPA exclusions", () => {
  const course = { id: "c", name: "Calculus", creditHours: 3, gpaExcluded: true, components: [], sessions: [], missedLectures: 0, missedSessions: [] };
  const shared = sharedCourse(course, SAUDI5, { letter: "B" });
  assert.equal(shared.excludedFromGpa, true);
  assert.equal(shared.hours, 3);
  assert.equal(shared.official, "B");
});
