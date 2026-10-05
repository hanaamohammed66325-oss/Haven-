// The course % never lands on the wrong side of a cutoff through floating-point
// noise: checked against whole-number arithmetic. Before the fix, an assessment
// worth 60% out of 3 marks scored 1 gave 59.99999999999999 (F) for an exact 60
// (D). Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Course, GradeComponent } from "@/types";
import { courseCurrentPct } from "@/lib/grades";

const comp = (i: number, weight: number, total: number, score: number): GradeComponent => ({
  id: `c${i}`,
  name: `c${i}`,
  type: "quiz",
  weight,
  unit: "percent",
  total,
  score,
  date: null,
});

const course = (components: GradeComponent[]): Course => ({
  id: "m",
  name: "m",
  creditHours: 3,
  sessions: [],
  missedLectures: 0,
  missedSessions: [],
  components,
});

/** The exact % as a fraction num / den (whole numbers only). */
function exactPct(items: [number, number, number][]): { num: number; den: number } {
  const den = items.reduce((d, [, t]) => d * t, 1);
  let lost = 0;
  for (const [w, t, s] of items) lost += (t - s) * w * (den / t);
  return { num: 100 * den - lost, den };
}

describe("course % and float noise", () => {
  test("the example that used to read as an F", () => {
    assert.equal(courseCurrentPct(course([comp(0, 60, 3, 1)])), 60);
  });

  test("one assessment: every weight, total and score lands on the right side of every cutoff", () => {
    const weights = [5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 100];
    let checked = 0;
    for (const w of weights) {
      for (let t = 1; t <= 60; t++) {
        for (let s = 0; s <= t; s++) {
          const pct = courseCurrentPct(course([comp(0, w, t, s)]))!;
          const { num, den } = exactPct([[w, t, s]]);
          assert.ok(Math.abs(pct - num / den) < 1e-6);
          // any whole-number cutoff: on the same side as the exact value
          const c = Math.floor(num / den + 1e-12);
          assert.equal(pct >= c, num >= c * den, `${s}/${t} worth ${w}%: ${pct}`);
          assert.equal(pct >= c + 1, num >= (c + 1) * den);
          checked++;
        }
      }
    }
    assert.ok(checked > 20000);
  });

  test("two and three assessments", () => {
    let seed = 20261005;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let k = 0; k < 20000; k++) {
      const n = 2 + Math.floor(rand() * 2);
      const items: [number, number, number][] = [];
      let left = 100;
      for (let i = 0; i < n; i++) {
        const w = i === n - 1 ? left : Math.max(1, Math.floor(rand() * (left - (n - i - 1))));
        left -= w;
        const t = 1 + Math.floor(rand() * 40);
        items.push([w, t, Math.floor(rand() * (t + 1))]);
      }
      const pct = courseCurrentPct(course(items.map(([w, t, s], i) => comp(i, w, t, s))))!;
      const { num, den } = exactPct(items);
      const c = Math.floor(num / den + 1e-12);
      assert.equal(pct >= c, num >= c * den, JSON.stringify(items));
      assert.equal(pct >= c + 1, num >= (c + 1) * den, JSON.stringify(items));
    }
  });

  test("half marks still work", () => {
    assert.equal(courseCurrentPct(course([comp(0, 40, 10, 8.5), comp(1, 60, 20, 15)])), 79);
  });
});
