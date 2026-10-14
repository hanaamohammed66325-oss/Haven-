// The audited grade tables (lib/verifiedTables): every corrected or added
// university resolves to exactly its published points, the matching ones keep
// the catalogue table, and the update pop-up reaches only the students it should.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { catalogBySlug, catalogScheme, customScheme, detectScheme } from "@/lib/gradeSchemes";
import { ADDED_UNIVERSITIES, CORRECTED_TABLES, MATCHING_TABLES } from "@/lib/verifiedTables";
import { catalogSchemeUpdates, keepPrevious, pendingSchemeUpdate } from "@/lib/schemeUpdates";
import type { AcademicInfo } from "@/types";

const typed = (name: string, patch: Partial<AcademicInfo> = {}): AcademicInfo => ({
  universitySlug: "other",
  universityName: name,
  major: "",
  level: "",
  ...patch,
});
const points = (s: { bands: { letter: string; points: number }[] }) => s.bands.map((b) => `${b.letter}=${b.points}`).join(" ");

describe("corrected and added tables resolve to their published points", () => {
  const all = [
    ...Object.entries(CORRECTED_TABLES).map(([slug, t]) => {
      const c = catalogBySlug(slug)!;
      return { slug, ar: c.ar, en: c.en, t };
    }),
    ...ADDED_UNIVERSITIES.map(([slug, ar, en, , t]) => ({ slug, ar, en, t })),
  ];
  for (const { slug, ar, en, t } of all) {
    test(slug, () => {
      for (const name of [ar, en]) {
        const d = detectScheme(typed(name));
        assert.equal(d.catalog?.slug, slug, name);
        assert.equal(d.scheme.id, `uni:${slug}`);
        assert.deepEqual(d.scheme.bands.map((b) => b.letter), t.letters);
        assert.deepEqual(d.scheme.bands.map((b) => b.points), t.points);
        if (t.mins) assert.deepEqual(d.scheme.bands.map((b) => b.min), t.mins);
        assert.equal(d.scheme.approxCutoffs, t.mins ? undefined : true);
        // cutoffs strictly descending, the last one 0
        const mins = d.scheme.bands.map((b) => b.min);
        assert.equal(mins[mins.length - 1], 0);
        assert.ok(mins.every((m, i) => i === 0 || m < mins[i - 1]), mins.join(","));
      }
    });
  }
  test("Al-Balqa passes at D (1.25); D- and F fail", () => {
    const s = detectScheme(typed("جامعة البلقاء التطبيقية")).scheme;
    assert.equal(s.passMin, s.bands.find((b) => b.letter === "D")!.min);
  });
});

describe("matching tables: points unchanged, now shown as the university's own", () => {
  for (const slug of MATCHING_TABLES) {
    test(slug, () => {
      const c = catalogBySlug(slug)!;
      const d = detectScheme(typed(c.en));
      assert.equal(d.catalog?.slug, slug);
      assert.equal(d.source, "typed");
      assert.equal(points(d.scheme), points(catalogScheme(c.table)));
    });
  }
});

describe("the update pop-up for catalogue universities", () => {
  test("one update per corrected table, and each really changes the points", () => {
    const ups = catalogSchemeUpdates();
    assert.equal(ups.length, Object.keys(CORRECTED_TABLES).length + 1); // + American University in Dubai
    for (const u of ups) assert.notEqual(points(u.previous as never), points(u.next as never), u.slug);
  });
  test("University of Bahrain: was the one-decimal table, now thirds", () => {
    const u = pendingSchemeUpdate(typed("جامعة البحرين"))!;
    assert.equal(u.slug, "university-of-bahrain");
    assert.equal(typeof u.previous === "object" && u.previous.id, "plusminus4");
    assert.deepEqual(keepPrevious(u.previous as never), { gpaSchemeId: "plusminus4" });
  });
  test("an automatic student is asked; custom / percentage / answered are not", () => {
    assert.ok(pendingSchemeUpdate(typed("American University of Bahrain")));
    assert.ok(pendingSchemeUpdate(typed("American University of Bahrain", { gpaSchemeId: "saudi4" })));
    assert.equal(pendingSchemeUpdate(typed("American University of Bahrain", { gpaSchemeId: "custom" })), null);
    assert.equal(pendingSchemeUpdate(typed("American University of Bahrain", { gpaSchemeId: "percentage" })), null);
    const id = "american-university-of-bahrain:2026-10";
    assert.equal(pendingSchemeUpdate(typed("American University of Bahrain", { schemeUpdate: { id, answer: "no", at: "x" } })), null);
  });
  test("American University in Dubai: no longer taken for the American College of Dubai", () => {
    for (const name of ["الجامعة الأمريكية في دبي", "American University in Dubai"]) {
      const u = pendingSchemeUpdate(typed(name))!;
      assert.equal(u.slug, "american-university-in-dubai");
      assert.equal(detectScheme(typed(name)).catalog?.slug, "american-university-in-dubai");
    }
    assert.equal(detectScheme(typed("الكلية الأمريكية في دبي")).catalog?.slug, "american-college-of-dubai");
  });
  test("not asked: a matching or added university, or an unknown name", () => {
    assert.equal(pendingSchemeUpdate(typed("Zayed University")), null);
    assert.equal(pendingSchemeUpdate(typed("Sagesse University")), null);
    assert.equal(pendingSchemeUpdate(typed("جامعة غير موجودة")), null);
  });
  test("'no' keeps a catalogue table exactly as it was (as his own table)", () => {
    const u = pendingSchemeUpdate(typed("American University of Bahrain"))!;
    const prev = u.previous as never as Parameters<typeof keepPrevious>[0];
    const kept = keepPrevious(prev);
    assert.equal(kept.gpaSchemeId, "custom");
    const own = customScheme(kept.customScheme)!;
    assert.equal(points(own), points(prev));
    assert.deepEqual(own.bands.map((b) => b.min), prev.bands.map((b) => b.min));
  });
});
