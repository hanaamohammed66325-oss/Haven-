import { test } from "node:test";
import assert from "node:assert/strict";
import { gpaGaps } from "@/lib/gpaReadiness";
import type { AcademicInfo, Course } from "@/types";

const academic = (patch: Partial<AcademicInfo> = {}): AcademicInfo => ({
  universitySlug: "king-saud",
  universityName: "جامعة الملك سعود",
  major: "",
  level: "1",
  ...patch,
});

const course = (id: string, creditHours: number, weights: number[], patch: Partial<Course> = {}): Course =>
  ({
    id,
    name: `Course ${id}`,
    creditHours,
    sessions: [],
    missedLectures: 0,
    missedSessions: [],
    components: weights.map((weight, i) => ({ id: `${id}-${i}`, name: "", type: "quiz", weight, score: null, total: 10 })),
    ...patch,
  }) as unknown as Course;

const kinds = (input: Parameters<typeof gpaGaps>[0]) => gpaGaps(input).map((g) => g.kind);

test("complete first-level data has nothing missing", () => {
  assert.deepEqual(kinds({ academic: academic(), courses: [course("a", 3, [40, 60])], cumulativeGpa: 0, cumulativeHours: 0 }), []);
});

test("no university, or one typed but unknown", () => {
  assert.deepEqual(kinds({ academic: academic({ universityName: "", universitySlug: null }), courses: [], cumulativeGpa: 0, cumulativeHours: 0 }), ["university"]);
  assert.deepEqual(kinds({ academic: academic({ universityName: "Unknown Institute Xyz", universitySlug: "other" }), courses: [], cumulativeGpa: 0, cumulativeHours: 0 }), ["table"]);
});

test("courses with no credit hours or weights not totalling 100 are named", () => {
  const gaps = gpaGaps({
    academic: academic(),
    courses: [course("a", 0, [100]), course("b", 3, [30, 30]), course("c", 3, []), course("d", 3, [50, 50])],
    cumulativeGpa: 0,
    cumulativeHours: 0,
  });
  assert.deepEqual(gaps.map((g) => [g.kind, g.courses?.map((c) => c.id)]), [
    ["credits", ["a"]],
    ["weights", ["b"]],
  ]);
});

test("withdrawn courses and portal results are not flagged", () => {
  const gaps = gpaGaps({
    academic: academic(),
    courses: [course("w", 0, [20], { official: { letter: "W" } } as Partial<Course>), course("o", 3, [20], { official: { letter: "A" } } as Partial<Course>), course("p", 3, [], { official: { letter: "B" } } as Partial<Course>)],
    cumulativeGpa: 0,
    cumulativeHours: 0,
  });
  assert.deepEqual(gaps.map((g) => g.kind), []);
});

test("cumulative needs both numbers, and is expected past the first level", () => {
  const base = { academic: academic(), courses: [] as Course[] };
  assert.deepEqual(kinds({ ...base, cumulativeGpa: 4.2, cumulativeHours: 0 }), ["cumulative"]);
  assert.deepEqual(kinds({ ...base, cumulativeGpa: 0, cumulativeHours: 30 }), ["cumulative"]);
  assert.deepEqual(kinds({ ...base, academic: academic({ level: "3" }), cumulativeGpa: 0, cumulativeHours: 0 }), ["cumulative"]);
  assert.deepEqual(kinds({ ...base, academic: academic({ level: "3" }), cumulativeGpa: 4.2, cumulativeHours: 30 }), []);
});

test("courses with no grade are named only in the term's last month", () => {
  const graded = course("g", 3, [40, 60]);
  (graded.components[0] as { score: number | null }).score = 8;
  const input = {
    academic: academic(),
    courses: [course("e", 3, []), course("n", 3, [40, 60]), graded],
    cumulativeGpa: 0,
    cumulativeHours: 0,
    semesterEnd: "2026-12-31",
  };
  assert.deepEqual(kinds({ ...input, now: new Date("2026-11-15T12:00:00") }), []);
  const gaps = gpaGaps({ ...input, now: new Date("2026-12-10T12:00:00") });
  assert.deepEqual(gaps.map((g) => [g.kind, g.courses?.map((c) => c.id)]), [["grades", ["e", "n"]]]);
  assert.deepEqual(kinds({ ...input, now: new Date("2027-01-02T12:00:00") }), []);
});
