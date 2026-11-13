import { test } from "node:test";
import assert from "node:assert/strict";
// "What you need on the final" must agree with the course badge: with every
// item but the final graded and weights summing to 100, the highest reachable
// letter IS the badge letter, and every mark it asks for is the minimum.
import { finalAdvice, gradeCourse } from "@/lib/grades";
import { SAUDI5, SAUDI4, PLUSMINUS4 } from "@/lib/gradeSchemes";
import type { Course, GradeComponent } from "@/types";

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const types: GradeComponent["type"][] = ["quiz", "midterm", "final", "project", "assignment"];
test("invariant: highest reachable == badge letter, needed mark minimal", () => {
  let checked = 0;
  for (const scheme of [SAUDI5, SAUDI4, PLUSMINUS4]) {
    for (let i = 0; i < 4000; i++) {
      const n = 1 + Math.floor(rnd() * 6);
      const finalW = 10 + Math.floor(rnd() * 50);
      const sumTo = 100;
      let left = sumTo - finalW;
      const comps: GradeComponent[] = [];
      for (let k = 0; k < n && left > 0; k++) {
        const w = k === n - 1 ? left : Math.max(1, Math.min(left, Math.round(rnd() * left / 2 * 2) / 2));
        left -= w;
        const total = [w, 10, 20, 100][Math.floor(rnd() * 4)];
        const score = Math.round(rnd() * total * 2) / 2;
        comps.push({ id: `c${k}`, name: "x", type: types[Math.floor(rnd() * types.length)], weight: w, unit: "percent", total, score, date: null });
      }
      if (!comps.length) continue;
      const finalTotal = [finalW, 40, 50, 100][Math.floor(rnd() * 4)];
      const fin: GradeComponent = { id: "F", name: "F", type: "final", weight: finalW, unit: "percent", total: finalTotal, score: null, date: null };
      const pos = Math.floor(rnd() * (comps.length + 1));
      comps.splice(pos, 0, fin);
      const course: Course = { id: "k", name: "k", creditHours: 3, sessions: [], missedLectures: 0, missedSessions: [], components: comps } as Course;
      const a = finalAdvice(course, scheme);
      assert.ok(a, "advice exists");
      const badge = gradeCourse(course, scheme).letter;
      const withFinal = (raw: number) => {
        const c2 = { ...course, components: course.components.map((c) => (c.id === "F" ? { ...c, score: raw } : c)) };
        return gradeCourse(c2, scheme).letter;
      };
      checked++;
      const passing = a.ceiling != null;
      if (passing) {
        assert.equal(a.ceiling!.letter, badge, `ceiling vs badge ${JSON.stringify(comps)}`);
        assert.equal(withFinal(a.ceiling!.raw), badge, "raw reaches letter");
        if (a.ceiling!.raw > 0) assert.notEqual(withFinal(a.ceiling!.raw - 1), badge, "raw minimal");
      }
      if (!a.passesAtZero) {
        assert.notEqual(withFinal(a.avoidFraw), "F", "avoid F reaches pass");
        if (a.avoidFraw > 0) assert.equal(withFinal(a.avoidFraw - 1), scheme.bands.at(-1)!.letter, "avoid F minimal");
      }
    }
  }
  assert.ok(checked > 9000);
});
