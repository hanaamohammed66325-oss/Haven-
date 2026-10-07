import { test } from "node:test";
import assert from "node:assert/strict";
import { compareCumulativeGpa, priorGpaDecimals, sameDisplayedGpa } from "@/lib/gpaComparison";
import { readCumulative } from "@/lib/termCheck";

test("displayed equality replaces a blanket tolerance, on every scale", () => {
  assert.equal(sameDisplayedGpa(4.529411, 4.53), true);
  assert.equal(sameDisplayedGpa(4.061875, 4.08), false);
  assert.equal(sameDisplayedGpa(82.04, 82.1), false);
  assert.equal(sameDisplayedGpa(NaN, 4), false);
  assert.equal(sameDisplayedGpa(1.005, Number((1.005).toFixed(2))), true);
});
test("Hanaa level four is compatible, without changing the computed GPA", () => {
  const calculate = (prior: number) => (prior * 49 + 71) / 64;
  const ours = calculate(4.63);
  assert.equal(ours.toFixed(2), "4.65");
  assert.equal(compareCumulativeGpa(ours, 4.66, 4.63, 49, 5, calculate), "rounding");
  assert.equal(compareCumulativeGpa(ours, 4.67, 4.63, 49, 5, calculate), "mismatch");
});
test("student incorrect prior credits cannot be explained by rounding", () => {
  const calculate = (prior: number) => (prior * 16 + 57.5) / 32;
  assert.equal(compareCumulativeGpa(calculate(4.53), 4.08, 4.53, 16, 5, calculate), "mismatch");
  const first = (prior: number) => (prior * 17 + 77) / 34;
  assert.equal(compareCumulativeGpa(first(5), 4.53, 5, 17, 5, first), "mismatch");
});
test("zero previous credits cannot introduce rounding uncertainty", () => {
  const calculate = (_prior: number) => 77 / 17;
  assert.equal(compareCumulativeGpa(77 / 17, 4.53, 0, 0, 5, calculate), "match");
  assert.equal(compareCumulativeGpa(77 / 17, 4.54, 0, 0, 5, calculate), "mismatch");
});
test("more precise prior input narrows the interval and survives reload", () => {
  const calculate = (prior: number) => (prior * 49 + 71) / 64;
  assert.equal(priorGpaDecimals("4.6300"), 4);
  assert.equal(priorGpaDecimals("4,63"), 2);
  assert.equal(compareCumulativeGpa(calculate(4.63), 4.66, 4.63, 49, 5, calculate, 4), "mismatch");
  const raw = { before: 4.63, hours: 49, portal: 4.66, ours: calculate(4.63), result: "match", comparison: "rounding", beforeDecimals: 2 };
  assert.deepEqual(readCumulative(JSON.parse(JSON.stringify(raw))), raw);
  assert.equal(readCumulative({ ...raw, comparison: "invented", beforeDecimals: 9 })?.comparison, undefined);
});
test("callback retains adjustments, scale caps, and fractional credits", () => {
  const calculate = (prior: number) => Math.min(4, (prior * 30 - 6 + 23.75) / 32.5);
  assert.equal(compareCumulativeGpa(calculate(3.5), Number(calculate(3.5).toFixed(2)), 3.5, 30, 4, calculate), "match");
  const cap = (_prior: number) => 4;
  assert.equal(compareCumulativeGpa(4, 3.99, 4, 30, 4, cap), "mismatch");
});
test("a half-open interval excludes an unreachable next-cent tie", () => {
  const identity = (prior: number) => prior;
  assert.equal(compareCumulativeGpa(4.63, 4.64, 4.63, 20, 5, identity), "mismatch");
});
test("rounded prior compatibility across 4, 5, 20 and percentage scales", () => {
  let seed = 87324;
  const random = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (const max of [4, 5, 20, 100]) for (let i = 0; i < 2500; i++) {
    const exactPrior = random(max * 10000 + 1) / 10000;
    const prior = Number(exactPrior.toFixed(2));
    const hours = 1 + random(160), credits = 1 + random(25);
    const points = random(max * 10000 + 1) / 10000 * credits;
    const calculate = (p: number) => (p * hours + points) / (hours + credits);
    const portal = Number(calculate(exactPrior).toFixed(2));
    const ours = calculate(prior);
    assert.notEqual(compareCumulativeGpa(ours, portal, prior, hours, max, calculate), "mismatch");
    assert.equal(compareCumulativeGpa(ours, Number((Number(ours.toFixed(2)) + 0.02).toFixed(2)), prior, hours, max, calculate), "mismatch");
  }
});
