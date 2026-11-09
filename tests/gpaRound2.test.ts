import { test } from "node:test";
import assert from "node:assert/strict";
import { gpaReviewId, captureGpaSystem, gpaSystemChanged, priorGpaReview, priorGpaReviewKey, heldPreviousGpa, legacyReferenceBeforeChange } from "@/lib/gpaSystem";
import { SAUDI4, SAUDI5 } from "@/lib/gradeSchemes";
import { projectedCumulativeFromParts } from "@/lib/grades";

test("Round2 computes through a known change but never through an invalid prior record", () => {
  const reference = captureGpaSystem(SAUDI5);
  assert.equal(projectedCumulativeFromParts(12, 3, 3.8, 30, SAUDI4, undefined, reference), 126 / 33);
  assert.equal(heldPreviousGpa(null, "cumulative", 3.8, 30, SAUDI4, reference), null);
  assert.equal(priorGpaReview(4.44, 30, SAUDI4, reference), "invalid");
  assert.equal(projectedCumulativeFromParts(12, 3, 4.44, 30, SAUDI4, undefined, reference), null);
  assert.equal(heldPreviousGpa(null, "cumulative", 4.44, 30, SAUDI4, reference), 4.44);
});

test("Round2 learned cutoffs alone do not change review semantics or dedupe keys", () => {
  const old = captureGpaSystem(SAUDI4, "same-record");
  const learned = { ...SAUDI4, bands: SAUDI4.bands.map((b, i) => ({ ...b, min: i ? b.min + 0.1 : b.min })) };
  assert.equal(gpaSystemChanged(learned, old), false);
  assert.equal(priorGpaReview(3.8, 30, learned, old), null);
  assert.equal(legacyReferenceBeforeChange(30, undefined, SAUDI4, learned), undefined);
  for (const reason of ["systemChanged", "invalid", "requested"] as const) {
    assert.equal(priorGpaReviewKey(old, learned, reason, "term"), priorGpaReviewKey(old, SAUDI4, reason, "term"));
    assert.equal(priorGpaReviewKey(captureGpaSystem(learned, "same-record"), SAUDI4, reason, "term"), priorGpaReviewKey(old, SAUDI4, reason, "term"));
  }
  assert.equal(gpaSystemChanged({ ...learned, percent: !learned.percent }, old), true);
});

test("Round2 shared review IDs work without crypto.randomUUID or crypto", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    for (const value of [{}, undefined]) {
      Object.defineProperty(globalThis, "crypto", { configurable: true, value });
      const a = gpaReviewId(), b = gpaReviewId();
      assert(a.length > 0 && a.length <= 80);
      assert.notEqual(a, b);
      const ref = legacyReferenceBeforeChange(30, undefined, SAUDI5, SAUDI4);
      assert.equal(ref?.max, 5);
      assert.equal(typeof ref?.reviewId, "string");
    }
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: { randomUUID: () => "native-id" } });
    assert.equal(gpaReviewId(), "native-id");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});
