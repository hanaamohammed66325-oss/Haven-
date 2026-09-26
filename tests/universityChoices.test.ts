// Universities that share a name across countries: the student is offered each
// one with its country, and the one picked is saved with it. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { countryFromName, holidayCalendar, universityChoices } from "@/lib/universityCountry";
import { pickedCountry, stripPick, withCountry } from "@/lib/universityPick";
import { detectScheme, matchCatalog } from "@/lib/gradeSchemes";

test("a name shared across countries offers each university with its country", () => {
  const choices = universityChoices("كلية الشرق الأوسط")!;
  assert.ok(choices, "expected choices");
  const countries = new Set(choices.map((c) => c.country));
  assert.ok(countries.has("OM") && countries.has("JO"), [...countries].join());
  assert.equal(choices[0].ar, "كلية الشرق الأوسط");
  assert.equal(choices[0].country, "OM");

  const tripoli = universityChoices("جامعة طرابلس")!;
  assert.deepEqual(new Set(tripoli.map((c) => c.country)), new Set(["LB", "LY"]));
});

test("until picked: the exact name decides, two exact names leave it unknown", () => {
  assert.equal(countryFromName("كلية الشرق الأوسط"), "OM");
  assert.equal(countryFromName("جامعة الشرق الأوسط"), "JO");
  assert.equal(countryFromName("جامعة طرابلس"), null);
});

test("a name one country's universities hold asks nothing", () => {
  assert.equal(universityChoices("جامعة قطر"), null);
  assert.equal(universityChoices("جامعة الشارقة"), null);
  assert.equal(universityChoices(""), null);
  assert.equal(countryFromName("جامعة قطر"), "QA");
});

test("the picked university: its country, its catalogue entry, its grade table", () => {
  const om = withCountry("جامعة الشرق الأوسط", "OM");
  assert.equal(om, "جامعة الشرق الأوسط (عُمان)");
  assert.equal(pickedCountry(om), "OM");
  assert.equal(stripPick(om), "جامعة الشرق الأوسط");
  assert.equal(universityChoices(om), null);
  assert.equal(countryFromName(om), "OM");
  assert.equal(matchCatalog(om)?.slug, "middle-east-college");
  assert.equal(matchCatalog(withCountry("كلية الشرق الأوسط", "JO"))?.slug, "middle-east-university");
  assert.equal(countryFromName(withCountry("جامعة طرابلس", "LY")), "LY");
  assert.equal(holidayCalendar({ universitySlug: "other", universityName: withCountry("جامعة طرابلس", "LY") }), "LY");
  // Middle East University's (Jordan) grade table isn't Middle East College's.
  const jo = detectScheme({ universitySlug: "other", universityName: withCountry("جامعة الشرق الأوسط", "JO") } as never);
  const omScheme = detectScheme({ universitySlug: "other", universityName: om } as never);
  assert.notEqual(jo.scheme.id, omScheme.scheme.id);
  // A bracket that isn't a country is part of the name.
  assert.equal(pickedCountry("American University of Sharjah (AUS)"), null);
});
