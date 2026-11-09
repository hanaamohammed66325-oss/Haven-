import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { SAUDI5, PERCENTAGE, SPECIAL_RESULTS } from "@/lib/gradeSchemes";
import { pastTermGpa, pastTermCumulative, pastTermSummary, readPastTerms, sameGpa } from "@/lib/termCheck";

test("excluded past-term rows remove their points and hours without changing original values", () => {
  const courses = [{ name: "Kept", hours: 3.5, letter: "B" }, { name: "Excluded", hours: 4, letter: "A+", excludedFromGpa: true }];
  assert.equal(pastTermGpa(courses, SAUDI5), 4);
  assert.equal(pastTermCumulative(courses, SAUDI5, 3, 20), 74 / 23.5);
  assert.equal(courses[1].hours, 4);
  assert.equal(courses[1].letter, "A+");
  assert.equal(pastTermGpa(courses.map(c => ({ ...c, excludedFromGpa: false })), SAUDI5), 34 / 7.5);
});

test("all-excluded is absent, not zero, including percentage mode and excluded zero-credit rows", () => {
  assert.equal(pastTermGpa([{ hours: 3, letter: "A+", excludedFromGpa: true }], SAUDI5), null);
  assert.equal(pastTermGpa([{ hours: 0, excludedFromGpa: true }], SAUDI5), null);
  assert.equal(pastTermGpa([{ hours: 3, mark: 80 }, { hours: 4, mark: 100, excludedFromGpa: true }], PERCENTAGE), 80);
  assert.equal(pastTermGpa([{ hours: 3, letter: "W" }, { hours: 3, letter: "DN" }], SAUDI5), 1);
});

test("stored excluded rows survive reload, including optional grade/zero hours; legacy rows stay counted", () => {
  const saved = { id: "term", courses: [{ hours: 3.5, letter: "B" }, { hours: 4, letter: "A+", excludedFromGpa: true }, { hours: 0, name: "No credit", excludedFromGpa: true }], portalGpa: 4, ours: 4 };
  const loaded = readPastTerms(JSON.parse(JSON.stringify([saved])))[0];
  assert.equal(loaded.courses.length, 3);
  assert.equal(loaded.courses[1].excludedFromGpa, true);
  assert.equal(loaded.courses[1].letter, "A+");
  assert.equal(loaded.courses[2].hours, 0);
  assert.equal(pastTermGpa(loaded.courses, SAUDI5), 4);
  assert.equal(pastTermGpa(readPastTerms([{ ...saved, courses: [{ hours: 3, letter: "A+" }] }])[0].courses, SAUDI5), 5);
});

test("summaries separate entered hours from explicit exclusion and W without reinterpreting grades", () => {
  assert.deepEqual(pastTermSummary([{ hours: 3.5, letter: "B" }, { hours: 4, letter: "A+", excludedFromGpa: true }, { hours: 2, letter: "W" }, { hours: 0, excludedFromGpa: true }]),
    { entered: 4, enteredHours: 9.5, counted: 1, countedHours: 3.5, excluded: 3, excludedHours: 6 });
});

function actualCallback(file: string, name: string, bindings: Record<string, unknown>): () => any {
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === name) expression = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  assert(expression);
  const code = ts.isCallExpression(expression) ? expression.arguments[0] : expression;
  const js = ts.transpileModule(`const extracted = ${code.getText(sf)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return extracted;`)(...Object.values(bindings));
}

test("actual comparison saves exclusion privately, shares course details only with consent, and blocks all-excluded", () => {
  const rows = [{ name: "Kept", hours: "3.5", grade: "B", pct: "", excludedFromGpa: false }, { name: "Excluded", hours: "4", grade: "A+", pct: "95", excludedFromGpa: true }];
  const run = (consent: boolean, allExcluded = false) => {
    let saved: any; let error: string | undefined; let payload: any;
    actualCallback("src/components/TermCheck.tsx", "compare", {
      rows: allExcluded ? rows.map(r => ({ ...r, excludedFromGpa: true })) : rows,
      parseNumber: (raw: string) => raw.trim() ? Number(raw) : NaN,
      t: (key: string) => key, setError: (value: string) => { error = value; },
      scheme: SAUDI5, SPECIAL_RESULTS, pastTermGpa, pastTermCumulative, portalRaw: "4", cumBeforeRaw: "", cumHoursRaw: "", cumAfterRaw: "",
      term: null, newId: () => "new", name: "Term", sameGpa, consent, pastTerms: [],
      setPastTerms: (terms: any[]) => { saved = terms[0]; }, setSaved: () => {},
      reportTermCheck: (_: string, meta: any) => { payload = meta; }, university: "Test", catalog: null,
    })();
    return { saved, error, payload };
  };
  const privateResult = run(false);
  assert.equal(privateResult.saved.courses[1].excludedFromGpa, true);
  assert.equal(privateResult.saved.ours, 4);
  assert.deepEqual(Object.keys(privateResult.payload).sort(), ["result", "scheme"]);
  assert.equal(run(true).payload.courses[1].excludedFromGpa, true);
  assert.equal(run(false, true).error, "pt_noCounted");
  assert.equal(run(false, true).saved, undefined);
});

test("actual admin cutoff observations never learn from excluded rows", () => {
  const groups = actualCallback("src/app/admin/gpa-checks.tsx", "byUni", {
    all: [{ user_id: "test", meta: { courses: [{ letter: "A+", pct: 95, excludedFromGpa: true }, { letter: "B", pct: 80 }] } }],
    slugOf: () => "test", coursesOf: (m: any) => m.courses,
    schemeFor: () => ({ approxCutoffs: true }), approved: {},
  })();
  assert.deepEqual(groups[0].obs, [{ letter: "B", pct: 80 }]);
});
