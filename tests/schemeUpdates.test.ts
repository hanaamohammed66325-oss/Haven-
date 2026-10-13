// The corrected-GPA-system pop-up: who is asked, who is not, and that every
// listed change really moves the university's automatic system.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SCHEME_UPDATES, pendingSchemeUpdate, universityPatch } from "@/lib/schemeUpdates";
import { detectScheme } from "@/lib/gradeSchemes";
import type { AcademicInfo } from "@/types";

const student = (patch: Partial<AcademicInfo>): AcademicInfo => ({
  universitySlug: "taif",
  universityName: "جامعة الطائف",
  major: "CS",
  level: "3",
  ...patch,
});

describe("pendingSchemeUpdate", () => {
  test("an automatic-system student at a corrected university is asked", () => {
    assert.equal(pendingSchemeUpdate(student({}))?.slug, "taif");
    assert.equal(pendingSchemeUpdate(student({ gpaSchemeId: "auto" }))?.slug, "taif");
  });
  test("a student who picked a system by hand is asked too (his points may differ)", () => {
    assert.equal(pendingSchemeUpdate(student({ gpaSchemeId: "saudi5" }))?.slug, "taif");
    assert.equal(pendingSchemeUpdate(student({ gpaSchemeId: "plusminus4" }))?.slug, "taif");
  });
  test("not asked: his own table, the percentage average, or already on the university's table", () => {
    assert.equal(pendingSchemeUpdate(student({ gpaSchemeId: "custom" })), null);
    assert.equal(pendingSchemeUpdate(student({ gpaSchemeId: "percentage" })), null);
    assert.equal(pendingSchemeUpdate(student({ gpaSchemeId: "saudi4" })), null);
  });
  test("once answered, never again; another university is not asked", () => {
    const u = SCHEME_UPDATES.find((x) => x.slug === "taif")!;
    assert.equal(pendingSchemeUpdate(student({ schemeUpdate: { id: u.id, answer: "yes", at: "2026-10-05" } })), null);
    assert.equal(pendingSchemeUpdate(student({ universitySlug: "king-saud" })), null);
    assert.equal(pendingSchemeUpdate(null), null);
  });
});

describe("the listed changes match what the automatic system now gives", () => {
  for (const u of SCHEME_UPDATES) {
    test(u.slug, () => {
      const auto = detectScheme(student({ universitySlug: u.slug }));
      assert.equal(auto.scheme.id, u.next);
      const kept = detectScheme(student({ universitySlug: u.slug, gpaSchemeId: u.previous }));
      assert.equal(kept.scheme.id, u.previous);
    });
  }
});

describe("only students whose university was set before the update are asked", () => {
  test("a new student choosing a corrected university is marked and never asked", () => {
    const empty = student({ universitySlug: null, universityName: "" });
    const after = { ...empty, ...universityPatch(empty, { universitySlug: "taif", universityName: "جامعة الطائف" }) };
    assert.equal(after.schemeUpdate?.answer, "new");
    assert.equal(pendingSchemeUpdate(after), null);
  });
  test("an existing student moving to a corrected university is not asked", () => {
    const ksu = student({ universitySlug: "king-saud", universityName: "جامعة الملك سعود" });
    const after = { ...ksu, ...universityPatch(ksu, { universitySlug: "hail", universityName: "جامعة حائل" }) };
    assert.equal(pendingSchemeUpdate(after), null);
  });
  test("a university without an update gets no mark; an existing affected student is still asked", () => {
    const empty = student({ universitySlug: null, universityName: "" });
    assert.equal(universityPatch(empty, { universitySlug: "king-saud" }).schemeUpdate, undefined);
    assert.equal(pendingSchemeUpdate(student({}))?.slug, "taif");
  });
});
