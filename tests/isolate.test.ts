// Grade letters kept in their own reading order ("A+", not "+A"). Run: npm test
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isolate, isolateOption } from "@/lib/format";

const LRM = "‎";
const RLM = "‏";

describe("isolate", () => {
  test("wraps the text in a first-strong isolate", () => {
    assert.equal(isolate("A+"), "⁨A+⁩");
  });
});

describe("isolateOption (drop-down text)", () => {
  test("starts with the letter itself, so typing it still jumps to the option", () => {
    for (const l of ["A+", "B", "أ+", "ب", "F"]) assert.ok(isolateOption(l, true).startsWith(l));
  });

  test("a Latin letter is closed left to right, an Arabic one right to left", () => {
    assert.equal(isolateOption("A+"), `A+${LRM}`);
    assert.equal(isolateOption("أ+"), `أ+${RLM}`);
    assert.equal(isolateOption("+A"), `+A${LRM}`, "the first letter decides, not the first character");
  });

  test("text after the letter goes back to the list's direction", () => {
    assert.equal(isolateOption("A+", true), `A+${LRM}${RLM}`);
    assert.equal(isolateOption("A+", false), `A+${LRM}${LRM}`);
    assert.equal(isolateOption("أ+", false), `أ+${RLM}${LRM}`);
  });

  test("no letter at all (a number grade) is closed left to right", () => {
    assert.equal(isolateOption("4"), `4${LRM}`);
  });
});
