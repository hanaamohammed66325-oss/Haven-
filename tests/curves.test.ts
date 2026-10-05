// Courses graded on the cohort average — reading, saving and attaching the
// cutoffs the student entered (preferences.curves). Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Course, CourseCurve } from "@/types";
import { customScheme, SAUDI5, SCHEMES, type GradeScheme } from "@/lib/gradeSchemes";
import { coursePoints, semesterGpaDetail } from "@/lib/grades";
import {
  curveFits,
  curveSaver,
  curvesPref,
  curveUniversity,
  makeCurve,
  nextCurves,
  readCurves,
  withCurves,
} from "@/lib/curves";

const course = (id: string, creditHours: number, pct: number): Course => ({
  id,
  name: id,
  creditHours,
  sessions: [],
  missedLectures: 0,
  missedSessions: [],
  components: [{ id: `${id}-f`, name: "final", type: "final", weight: 100, unit: "percent", total: 100, score: pct, date: null }],
});

const curve = (over: Partial<CourseCurve> = {}): CourseCurve => ({
  method: "cutoffs",
  cutoffs: { "A+": 93, A: 88 },
  complete: false,
  basis: { university: "kfupm", fingerprint: "4|A+:4,A:3.75|D", baseCutoffs: { "A+": 95, A: 90 } },
  at: "2026-10-05T10:00:00.000Z",
  ...over,
});

const TERM = "sem-1";
const saved = (courses: Record<string, unknown>, term = TERM) => ({ term, courses });

describe("readCurves", () => {
  test("a saved entry comes back as it was, through JSON", () => {
    const all = { c1: curve(), c2: curve({ cutoffs: {}, stale: true }) };
    const raw = JSON.parse(JSON.stringify(curvesPref(TERM, all)));
    assert.deepEqual(readCurves(raw, TERM), all);
  });

  test("a complete table keeps every entered row", () => {
    const c = curve({ complete: true, cutoffs: { "A+": 93, A: 88, "B+": 83, B: 78, "C+": 73, C: 68, "D+": 63, D: 58 } });
    assert.deepEqual(readCurves(saved({ c1: c }), TERM), { c1: c });
  });

  test("another semester's entries are dropped", () => {
    assert.deepEqual(readCurves(saved({ c1: curve() }, "sem-0"), TERM), {});
  });

  test("no term on either side reads nothing", () => {
    assert.deepEqual(readCurves(saved({ c1: curve() }, ""), ""), {});
  });

  test("missing or broken blobs read as nothing", () => {
    for (const raw of [undefined, null, 5, "x", [], { term: TERM }, { term: TERM, courses: [] }, { term: TERM, courses: "x" }]) {
      assert.deepEqual(readCurves(raw, TERM), {});
    }
  });

  test("a damaged entry is ignored; the good ones stay", () => {
    const good = curve();
    const bad: unknown[] = [
      null,
      "x",
      { ...good, method: "stats" },
      { ...good, cutoffs: { A: 120 } },
      { ...good, cutoffs: { A: -1 } },
      { ...good, cutoffs: { A: "90" } },
      { ...good, cutoffs: { A: Number.NaN } },
      { ...good, cutoffs: [90] },
      { ...good, cutoffs: { ["X".repeat(25)]: 90 } },
      { ...good, cutoffs: Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`L${i}`, 50])) },
      { ...good, basis: undefined },
      { ...good, basis: { ...good.basis, university: 5 } },
      { ...good, basis: { ...good.basis, fingerprint: 3 } },
      { ...good, basis: { ...good.basis, baseCutoffs: { A: 101 } } },
    ];
    const courses: Record<string, unknown> = { ok: good };
    bad.forEach((b, i) => (courses[`bad${i}`] = b));
    assert.deepEqual(readCurves(saved(courses), TERM), { ok: good });
  });

  test("only a real true ticks complete or stale", () => {
    const raw = { ...curve(), complete: "yes", stale: 1 };
    const got = readCurves(saved({ c1: raw }), TERM).c1;
    assert.equal(got.complete, false);
    assert.equal("stale" in got, false);
  });

  test("a missing save time is kept as empty, not a reason to drop", () => {
    const raw: Record<string, unknown> = { ...curve() };
    delete raw.at;
    assert.equal(readCurves(saved({ c1: raw }), TERM).c1.at, "");
  });

  test("no university picked is still a valid basis", () => {
    const c = curve({ basis: { ...curve().basis, university: "" } });
    assert.deepEqual(readCurves(saved({ c1: c }), TERM), { c1: c });
  });

  test("decimal cutoffs are kept as typed (no rounding)", () => {
    const c = curve({ cutoffs: { A: 87.5 } });
    assert.equal(readCurves(saved({ c1: c }), TERM).c1.cutoffs.A, 87.5);
  });

  test("at most 40 courses are read", () => {
    const many = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`c${i}`, curve()]));
    assert.equal(Object.keys(readCurves(saved(many), TERM)).length, 40);
  });
});

describe("nextCurves", () => {
  const all = { c1: curve(), c2: curve({ complete: true }) };

  test("sets one course and keeps the others", () => {
    const c3 = curve({ cutoffs: { A: 85 } });
    assert.deepEqual(nextCurves(all, ["c1", "c2", "c3"], "c3", c3), { ...all, c3 });
  });

  test("replaces an existing entry", () => {
    const c1 = curve({ cutoffs: {} });
    assert.deepEqual(nextCurves(all, ["c1", "c2"], "c1", c1), { c1, c2: all.c2 });
  });

  test("null clears the course", () => {
    assert.deepEqual(nextCurves(all, ["c1", "c2"], "c1", null), { c2: all.c2 });
  });

  test("deleted courses are dropped on the way", () => {
    assert.deepEqual(nextCurves(all, ["c2"], "c2", all.c2), { c2: all.c2 });
  });

  test("a course just added (not listed yet) is still saved", () => {
    const c9 = curve();
    assert.deepEqual(nextCurves({}, [], "c9", c9), { c9 });
  });

  test("never changes the object it was given", () => {
    const before = JSON.stringify(all);
    nextCurves(all, ["c1"], "c2", null);
    assert.equal(JSON.stringify(all), before);
  });
});

describe("withCurves", () => {
  const courses = [course("c1", 3, 91), course("c2", 2, 80)];

  test("no entries → the very same array", () => {
    assert.equal(withCurves(courses, {}), courses);
  });

  test("attaches the entry to its course only", () => {
    const c = curve();
    const out = withCurves(courses, { c1: c, gone: curve() });
    assert.equal(out[0].curve, c);
    assert.equal("curve" in out[1], false);
    assert.equal(out.length, 2);
    assert.equal("curve" in courses[0], false, "the input course is not changed");
  });

  test("attaching changes no grade yet (calculation comes in a later phase)", () => {
    const tagged = withCurves(courses, { c1: curve({ cutoffs: { "A+": 99, A: 98 }, complete: true }) });
    for (const scheme of [SAUDI5, ...SCHEMES]) {
      assert.deepEqual(
        tagged.map((c) => coursePoints(c, scheme)),
        courses.map((c) => coursePoints(c, scheme))
      );
      assert.deepEqual(semesterGpaDetail(tagged, scheme), semesterGpaDetail(courses, scheme));
    }
  });
});

// ── Saving in order (curveSaver) ──────────────────────────────────────────
// Each send waits until the test answers it, so replies can come in any order.

type Curves = Record<string, CourseCurve>;

function harness() {
  const sends: { curves: Curves; ok: () => void; fail: (msg?: string) => void }[] = [];
  let shown: Curves = {};
  let account: Curves = {};
  const saver = curveSaver({
    send: (curves) =>
      new Promise<void>((resolve, reject) =>
        sends.push({
          curves,
          ok: () => {
            account = curves;
            resolve();
          },
          fail: (msg = "offline") => reject(new Error(msg)),
        })
      ),
    show: (curves) => {
      shown = curves;
    },
  });
  // Let queued promise callbacks run.
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { saver, sends, tick, shown: () => shown, account: () => account };
}

const avg = curve({ cutoffs: {} });
const table = curve({ cutoffs: { "A+": 93, A: 88 }, complete: true });

describe("curveSaver", () => {
  test("one request at a time: Average then Fixed ends Fixed on the account", async () => {
    const h = harness();
    const first = h.saver.write({ c1: avg });
    const second = h.saver.write({});
    await h.tick();
    assert.equal(h.sends.length, 1, "the second waits for the first");
    assert.deepEqual(h.shown(), {}, "the screen shows the newest choice at once");
    h.sends[0].ok();
    await h.tick();
    assert.equal(h.sends.length, 2);
    assert.deepEqual(h.sends[1].curves, {});
    h.sends[1].ok();
    assert.deepEqual(await first, { ok: true });
    assert.deepEqual(await second, { ok: true });
    assert.deepEqual(h.account(), {}, "the account keeps the last choice");
  });

  test("changes made while a request is on its way go together in the next", async () => {
    const h = harness();
    const a = h.saver.write({ c1: avg });
    await h.tick();
    const b = h.saver.write({ c1: avg, c2: avg });
    const c = h.saver.write({ c1: table, c2: avg });
    h.sends[0].ok();
    await h.tick();
    assert.equal(h.sends.length, 2, "one request for both later changes");
    assert.deepEqual(h.sends[1].curves, { c1: table, c2: avg });
    h.sends[1].ok();
    for (const r of await Promise.all([a, b, c])) assert.deepEqual(r, { ok: true });
    await h.tick();
    assert.equal(h.sends.length, 2, "nothing left to send");
  });

  test("a failed save puts back what the account holds", async () => {
    const h = harness();
    h.saver.reset({ c1: avg });
    const r = h.saver.write({ c1: table });
    assert.deepEqual(h.shown(), { c1: table });
    await h.tick();
    h.sends[0].fail("offline");
    assert.deepEqual(await r, { ok: false, error: "offline" });
    assert.deepEqual(h.shown(), { c1: avg }, "the new cutoffs are no longer applied");
  });

  test("a failed switch back to Fixed brings the entry back", async () => {
    const h = harness();
    h.saver.reset({ c1: table });
    const r = h.saver.write({});
    await h.tick();
    h.sends[0].fail();
    assert.equal((await r).ok, false);
    assert.deepEqual(h.shown(), { c1: table });
  });

  test("after a failure the same choice can be tried again", async () => {
    const h = harness();
    const first = h.saver.write({ c1: avg });
    await h.tick();
    h.sends[0].fail();
    assert.equal((await first).ok, false);
    assert.deepEqual(h.shown(), {});
    const again = h.saver.write({ c1: avg });
    await h.tick();
    assert.equal(h.sends.length, 2, "the queue goes on after a failure");
    h.sends[1].ok();
    assert.deepEqual(await again, { ok: true });
    assert.deepEqual(h.account(), { c1: avg });
  });

  test("a failure with a newer change waiting: the newer request carries both", async () => {
    const h = harness();
    const a = h.saver.write({ c1: avg });
    await h.tick();
    const b = h.saver.write({ c1: avg, c2: table });
    h.sends[0].fail();
    await h.tick();
    assert.deepEqual(h.shown(), { c1: avg, c2: table }, "not put back: a newer save is coming");
    assert.equal(h.sends.length, 2);
    h.sends[1].ok();
    assert.deepEqual(await a, { ok: true });
    assert.deepEqual(await b, { ok: true });
    assert.deepEqual(h.account(), { c1: avg, c2: table });
  });

  test("both failing puts back the last saved entries and reports both", async () => {
    const h = harness();
    h.saver.reset({ c3: avg });
    const a = h.saver.write({ c3: avg, c1: avg });
    await h.tick();
    const b = h.saver.write({ c3: avg, c1: table });
    h.sends[0].fail();
    await h.tick();
    h.sends[1].fail();
    assert.equal((await a).ok, false);
    assert.equal((await b).ok, false);
    assert.deepEqual(h.shown(), { c3: avg });
  });

  test("a send that throws at once counts as a failure", async () => {
    let shown: Curves = { c1: avg };
    const saver = curveSaver({
      send: () => {
        throw new Error("not ready");
      },
      show: (c) => {
        shown = c;
      },
    });
    saver.reset({ c1: avg });
    assert.deepEqual(await saver.write({}), { ok: false, error: "not ready" });
    assert.deepEqual(shown, { c1: avg });
  });

  test("another account: the old saves are dropped and late replies ignored", { timeout: 5000 }, async () => {
    const h = harness();
    const a = h.saver.write({ c1: avg });
    await h.tick();
    const b = h.saver.write({});
    h.saver.reset({ x: table });
    assert.equal((await a).ok, false);
    assert.equal((await b).ok, false);
    const before = h.shown();
    h.sends[0].fail();
    await h.tick();
    assert.equal(h.sends.length, 1, "nothing more is sent for the old account");
    assert.equal(h.shown(), before, "a late reply doesn't touch the screen");
    const c = h.saver.write({ x: table, y: avg });
    await h.tick();
    assert.equal(h.sends.length, 2);
    h.sends[1].ok();
    assert.deepEqual(await c, { ok: true });
  });

  test("a late success for the old account never becomes what a failure goes back to", { timeout: 5000 }, async () => {
    const h = harness();
    void h.saver.write({ old: avg });
    await h.tick();
    h.saver.reset({ mine: table });
    h.sends[0].ok();
    await h.tick();
    const r = h.saver.write({});
    await h.tick();
    h.sends[1].fail();
    assert.equal((await r).ok, false);
    assert.deepEqual(h.shown(), { mine: table }, "this account's entries, not the old one's");
  });
});

// ── Table size: an entry for any table that takes cutoffs reads back ──────

/** A student's own table with `n` rows, letters G0… (custom tables keep 40). */
const bigScheme = (n: number): GradeScheme =>
  customScheme({
    max: 4,
    bands: Array.from({ length: n }, (_, i) => ({
      letter: `G${i}`,
      points: ((n - 1 - i) * 4) / (n - 1),
      min: i === n - 1 ? 0 : 99 - 2 * i,
    })),
  })!;

const roundTrip = (entry: CourseCurve) =>
  readCurves(JSON.parse(JSON.stringify(curvesPref(TERM, { c1: entry }))), TERM).c1;

describe("table size", () => {
  for (const n of [31, 32, 40]) {
    test(`a ${n}-row table: waiting, partial and complete entries all read back`, () => {
      const s = bigScheme(n);
      assert.equal(s.bands.length, n);
      assert.equal(curveFits(s), true);
      const rows = s.bands.slice(0, -1).map((b, i) => ({ letter: b.letter, min: b.min - 1, entered: i < 3 }));
      for (const entry of [makeCurve(s, null, [], false), makeCurve(s, null, rows, false), makeCurve(s, null, rows, true)]) {
        assert.deepEqual(roundTrip(entry), entry);
      }
    });
  }

  test("a table too large to save back is not offered course cutoffs", () => {
    const n = 42;
    const s: GradeScheme = {
      ...SAUDI5,
      bands: Array.from({ length: n }, (_, i) => ({ letter: `G${i}`, points: n - 1 - i, min: i === n - 1 ? 0 : 99 - 2 * i })),
    };
    assert.equal(curveFits(s), false);
  });

  test("a letter longer than an entry keeps is not offered course cutoffs", () => {
    const s: GradeScheme = { ...SAUDI5, bands: SAUDI5.bands.map((b, i) => (i ? b : { ...b, letter: "X".repeat(25) })) };
    assert.equal(curveFits(s), false);
  });

  test("a very long typed university name still reads back", () => {
    const academic = { universitySlug: "other", universityName: "جامعة ".repeat(200) } as Parameters<typeof curveUniversity>[0];
    const entry = makeCurve(SAUDI5, academic, [], false);
    assert.ok(entry.basis.university.length <= 300);
    assert.deepEqual(roundTrip(entry), entry);
  });
});
