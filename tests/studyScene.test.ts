// Group study: where the desks stand on the session lake (lib/study/scene.ts).
// Her rule (2026-10-06, replacing fixed places): the lake and the desks fit how
// many desks stand: they share a ring round the centre leaf evenly, two stand
// either side of it, and the lake grows as more come. Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { StudyScene, deskLayout, ringFor, sessionSizing } from "@/lib/study/scene";
import { lakeRadii } from "@/lib/pomodoro/lakeWorld";

const SCREENS: Array<[number, number]> = [
  [1200, 860], [1440, 900], [1920, 1080], [1024, 768], [768, 1024],
  [390, 844], [375, 667], [360, 740], [559, 767], [800, 600],
];
const COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const PAD = 34; // a desk's pad radius at the design size
const LEAF = 34; // the centre leaf's largest radius

test("rapid seated taps restart immediately; arrivals and absent Havis cannot react", () => {
  const scene = new StudyScene(800, 600, 1);
  const internals = scene as unknown as {
    places: Array<{ who: string; whoAt: number }>;
    pokes: Map<string, number>;
  };
  internals.places = [{ who: "member", whoAt: -10_000 }];
  for (let i = 0; i < 10; i++) {
    assert.equal(scene.poke("member", i * 50), true);
    assert.equal(internals.pokes.get("member"), i * 50);
  }
  assert.equal(scene.poke("absent", 500), false);
  internals.places = [{ who: "arriving", whoAt: 500 }];
  assert.equal(scene.poke("arriving", 501), false);
  assert.equal(internals.pokes.has("arriving"), false);
});

describe("desk layout", () => {
  test("two desks stand either side of the centre leaf, level with it", () => {
    const [a, b] = deskLayout(2);
    assert.ok(a.x < 0 && b.x > 0, "the first on the left, the second on the right");
    assert.ok(Math.abs(a.x + b.x) < 1 && Math.abs(a.y) < 1 && Math.abs(b.y) < 1);
  });

  test("every count is mirrored across the middle, with the gap at the front", () => {
    for (const n of COUNTS) {
      const pts = deskLayout(n);
      for (let j = 0; j < n; j++) {
        const m = pts[n - 1 - j];
        assert.ok(Math.abs(pts[j].x + m.x) < 1 && Math.abs(pts[j].y - m.y) < 1, `${n} desks: ${j} mirrors ${n - 1 - j}`);
      }
      // nobody stands right in front of the leaf (the dock's side)
      assert.ok(pts.every((p) => !(p.y > 0 && Math.abs(p.x) < PAD)), `${n} desks: the front stays open`);
    }
  });

  test("neighbours are evenly apart all the way round", () => {
    for (const n of COUNTS.filter((c) => c >= 3)) {
      const pts = deskLayout(n);
      const gaps = pts.slice(1).map((p, j) => Math.hypot(p.x - pts[j].x, p.y - pts[j].y));
      const spread = Math.max(...gaps) / Math.min(...gaps);
      assert.ok(spread < 1.15, `${n} desks: neighbour gaps vary by ${spread.toFixed(2)}`);
    }
  });

  test("desks keep their room (no overlap, ~90 apart at least), and none covers the centre leaf", () => {
    for (const n of COUNTS) {
      const pts = deskLayout(n);
      for (let a = 0; a < n; a++) {
        assert.ok(Math.hypot(pts[a].x, pts[a].y) > LEAF + PAD + 4, `${n} desks: ${a} is too near the leaf`);
        for (let b = a + 1; b < n; b++) {
          const d = Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
          assert.ok(d > 90, `${n} desks: ${a} and ${b} are ${d.toFixed(1)} apart`);
        }
      }
    }
  });

  test("more desks never make the ring or the lake smaller", () => {
    for (let n = 3; n <= 10; n++) {
      const a = ringFor(n - 1), b = ringFor(n);
      assert.ok(b.rx >= a.rx && b.ry >= a.ry, `ring at ${n}`);
      for (const [w, h] of SCREENS) {
        const s0 = sessionSizing(w, h, n - 1), s1 = sessionSizing(w, h, n);
        assert.ok(s1.lakeScale >= s0.lakeScale, `${w}x${h}: lake at ${n}`);
      }
    }
    // a small group gets a smaller lake on a wide screen
    assert.ok(sessionSizing(1200, 860, 2).lakeScale < sessionSizing(1200, 860, 10).lakeScale);
  });

  test("every desk and its pad stay inside the session lake, for every count and screen", () => {
    for (const [w, h] of SCREENS) {
      for (const n of COUNTS) {
        const { u, lakeScale } = sessionSizing(w, h, n);
        const { rx, ry } = lakeRadii(w, h, 0, lakeScale);
        for (const p of deskLayout(n, u)) {
          // The lake's shore wobbles by up to ~12 %; keep the pad inside the smallest shore.
          const reach = ((p.x / (rx * 0.88)) ** 2 + (p.y / (ry * 0.88)) ** 2) ** 0.5 + (PAD * u) / Math.min(rx, ry);
          assert.ok(reach < 1, `${w}x${h}, ${n} desks: a desk reaches ${reach.toFixed(2)} of the shore`);
        }
      }
    }
  });
});
