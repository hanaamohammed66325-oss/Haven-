import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { plural } from "@/lib/format";

const GRADES = ["درجة وحدة", "درجتين", "# درجات", "# درجة"];

describe("plural — Arabic counted nouns", () => {
  it("1 and 2 take their own words", () => {
    assert.equal(plural(1, GRADES), "درجة وحدة");
    assert.equal(plural(2, GRADES), "درجتين");
  });
  it("3–10 take the plural", () => {
    assert.equal(plural(3, GRADES), "3 درجات");
    assert.equal(plural(10, GRADES), "10 درجات");
  });
  it("11+ take the singular", () => {
    assert.equal(plural(11, GRADES), "11 درجة");
    assert.equal(plural(99, GRADES), "99 درجة");
    assert.equal(plural(100, GRADES), "100 درجة");
    assert.equal(plural(102, GRADES), "102 درجة");
  });
  it("the last two digits decide past 100", () => {
    assert.equal(plural(103, GRADES), "103 درجات");
    assert.equal(plural(111, GRADES), "111 درجة");
  });
  it("zero takes the plural", () => {
    assert.equal(plural(0, GRADES), "0 درجات");
  });
  it("a fraction or a number sent as text", () => {
    assert.equal(plural(2.5, ["ساعة", "ساعتين", "# ساعات", "# ساعة"]), "2.5 ساعة");
    assert.equal(plural("4", ["ساعة", "ساعتين", "# ساعات", "# ساعة"]), "4 ساعات");
  });
});

describe("plural — English", () => {
  it("one vs the rest", () => {
    assert.equal(plural(1, ["# grade", "# grades"]), "1 grade");
    assert.equal(plural(0, ["# grade", "# grades"]), "0 grades");
    assert.equal(plural(5, ["# grade", "# grades"]), "5 grades");
  });
});
