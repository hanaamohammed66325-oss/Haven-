// ---------------------------------------------------------------------------
// Grade schemes — the app adapts its GPA to each university's official system
// instead of hardcoding one 5.0 scale.
//
// A scheme is DATA (letters + percentage cutoffs + points + a max), so adding a
// university's system — or a whole other country's later — is a data entry, not
// new logic. Every KSA-undergrad system verified against official sources
// (KSU/SACM 5.0, KFUPM/Alfaisal 4.0) collapses into these; both use the SAME
// letters and cutoffs and differ only in the points column, so a course's LETTER
// is scheme-independent and only the GPA number changes.
//
// The active scheme is resolved from the student's academic profile: it is
// auto-detected from their chosen university (or a hand-typed name, matched
// fuzzily), and can always be overridden manually on the Profile page.
// ---------------------------------------------------------------------------

import { UNIVERSITIES, universityBySlug, type University } from "./tools/universities";
import { CATALOG, CATALOG_TABLES } from "./gradeCatalog";
import { CATALOG_COUNTRY, pickedCountry, stripPick } from "./universityPick";
import type { AcademicInfo, CustomSchemeData } from "@/types";

export interface GradeBand {
  min: number; // lowest percentage that earns this band (descending)
  letter: string;
  points: number; // grade points on this scheme's scale
}

export type SchemeId =
  | "saudi5"
  | "saudi4"
  | "percentage"
  | "plusminus4"
  | "qatar4"
  | "jordan4"
  | "jordan4new"
  | "jordan4plus";

/** Which top-level choice a scheme sits under in the picker ("out of 5",
 *  "out of 4" → then its variants, "percentage"). "other" = any other max
 *  (4.3, 10, 20 …) — only reachable through the catalogue or a custom table. */
export type SchemeFamily = "5" | "4" | "percent" | "other";

export interface GradeScheme {
  /** A built-in SchemeId, "custom" (the student's own table), or `cat:<n>` —
   *  a catalogue table (lib/gradeCatalog). */
  id: SchemeId | "custom" | `cat:${number}`;
  labelKey: string; // i18n key for the human name
  family: SchemeFamily;
  max: number; // 5 | 4 | 100 — the denominator the GPA is shown out of
  bands: GradeBand[]; // descending by `min`
  /** percentage mode: the GPA is a credit-weighted average of the raw course
   *  percentages, so `points` is ignored and the % itself is used. Bands are
   *  kept only to label a course with a letter. */
  percent?: boolean;
  /** Lowest percentage that passes the course. Defaults to the band just above
   *  the last one; set it when a scheme has failing bands that still carry
   *  points (Jordan's D- = 0.75, F = 0.5). */
  passMin?: number;
  /** The university publishes the POINTS but not fixed percentage cutoffs —
   *  the instructor assigns the letter. Points (and so the GPA formula) are
   *  exact; the letter a percentage maps to is only an estimate. */
  approxCutoffs?: boolean;
  /** The cutoffs come from students' real results at this university, approved
   *  by the admin (grade_cutoffs table) — they replace the estimate. */
  learnedCutoffs?: boolean;
}

/** A scheme that can be chosen by id from the picker. */
export type BuiltinScheme = GradeScheme & { id: SchemeId };

// Official Saudi 5.0 (unified regulations — KSU/most public). Identical to the
// historical SCALE in grades.ts.
export const SAUDI5: BuiltinScheme = {
  id: "saudi5",
  labelKey: "gradeScheme5",
  family: "5",
  max: 5,
  bands: [
    { min: 95, letter: "A+", points: 5.0 },
    { min: 90, letter: "A", points: 4.75 },
    { min: 85, letter: "B+", points: 4.5 },
    { min: 80, letter: "B", points: 4.0 },
    { min: 75, letter: "C+", points: 3.5 },
    { min: 70, letter: "C", points: 3.0 },
    { min: 65, letter: "D+", points: 2.5 },
    { min: 60, letter: "D", points: 2.0 },
    { min: 0, letter: "F", points: 1.0 },
  ],
};

// Official Saudi 4.0 (KFUPM / Alfaisal / most private). Same letters + cutoffs,
// different points; F = 0 here (not 1).
export const SAUDI4: BuiltinScheme = {
  id: "saudi4",
  labelKey: "gradeScheme4",
  family: "4",
  max: 4,
  bands: [
    { min: 95, letter: "A+", points: 4.0 },
    { min: 90, letter: "A", points: 3.75 },
    { min: 85, letter: "B+", points: 3.5 },
    { min: 80, letter: "B", points: 3.0 },
    { min: 75, letter: "C+", points: 2.5 },
    { min: 70, letter: "C", points: 2.0 },
    { min: 65, letter: "D+", points: 1.5 },
    { min: 60, letter: "D", points: 1.0 },
    { min: 0, letter: "F", points: 0.0 },
  ],
};

// Percentage average (out of 100) — used by systems that report a raw %. Letters
// reuse the 5.0 cutoffs for badge display only.
export const PERCENTAGE: BuiltinScheme = {
  id: "percentage",
  labelKey: "gradeSchemePercent",
  family: "percent",
  max: 100,
  percent: true,
  bands: SAUDI5.bands,
};

// International 4.0 with plus/minus (A, A-, B+, B, B-, …), as used in the Gulf
// outside Saudi. Verified against the official UAEU policy AE-04 (undergrad),
// which the University of Bahrain shares: A 90, A- 87, B+ 84, B 80, B- 77,
// C+ 74, C 70, C- 67, D+ 64, D 60, F below 60. (The US 93/90/87… cutoffs this
// used before matched no Arab university found and mislabelled 30 of the 41
// whole percentages from 60 to 100.) Kuwait University's 3.67/3.33 points differ
// from these by at most 0.03 per course — within the rounding note shown next to
// the GPA.
export const PLUSMINUS4: BuiltinScheme = {
  id: "plusminus4",
  labelKey: "gradeSchemePlusMinus",
  family: "4",
  max: 4,
  bands: [
    { min: 90, letter: "A", points: 4.0 },
    { min: 87, letter: "A-", points: 3.7 },
    { min: 84, letter: "B+", points: 3.3 },
    { min: 80, letter: "B", points: 3.0 },
    { min: 77, letter: "B-", points: 2.7 },
    { min: 74, letter: "C+", points: 2.3 },
    { min: 70, letter: "C", points: 2.0 },
    { min: 67, letter: "C-", points: 1.7 },
    { min: 64, letter: "D+", points: 1.3 },
    { min: 60, letter: "D", points: 1.0 },
    { min: 0, letter: "F", points: 0.0 },
  ],
};

// Qatar University (official grade-symbols page + the SIS GPA-calculator
// manual): half-point steps, no minus grades. A 90 = 4.0, B+ 85 = 3.5, … D 60.
export const QATAR4: BuiltinScheme = {
  id: "qatar4",
  labelKey: "gradeSchemeQatar",
  family: "4",
  max: 4,
  bands: [
    { min: 90, letter: "A", points: 4.0 },
    { min: 85, letter: "B+", points: 3.5 },
    { min: 80, letter: "B", points: 3.0 },
    { min: 75, letter: "C+", points: 2.5 },
    { min: 70, letter: "C", points: 2.0 },
    { min: 65, letter: "D+", points: 1.5 },
    { min: 60, letter: "D", points: 1.0 },
    { min: 0, letter: "F", points: 0.0 },
  ],
};

// Jordan. Every table found shares A 4 · A- 3.75 · B+ 3.5 · B 3 · B- 2.75 ·
// C+ 2.5 · C 2 · C- 1.75 · D+ 1.5 and passes at D; they differ only below that.
// No Jordanian university found publishes percentage cutoffs — the instructor
// assigns the letter — so the cutoffs here are an ESTIMATE (4-point steps from
// 90, D at 54: deliberately on the strict side, so a student is never told a
// letter is safe when it may not be). Points are exact.
const JO_CUTOFFS = [90, 86, 82, 78, 74, 70, 66, 62, 58, 54, 50, 0];
const JO_LETTERS = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];
const joBands = (points: number[]): GradeBand[] =>
  JO_LETTERS.map((letter, i) => ({ min: JO_CUTOFFS[i], letter, points: points[i] }));
const JO_TOP = [4.0, 3.75, 3.5, 3.0, 2.75, 2.5, 2.0, 1.75, 1.5];

// Middle East University (official undergrad rules table) and the University of
// Jordan's OLD system: D 1.00 (lowest pass), D- 0.75 (fail), F 0.
export const JORDAN4: BuiltinScheme = {
  id: "jordan4",
  labelKey: "gradeSchemeJordan",
  family: "4",
  max: 4,
  bands: joBands([...JO_TOP, 1.0, 0.75, 0.0]),
  passMin: 54,
  approxCutoffs: true,
};

// University of Jordan NEW system (its official registration GPA workbook):
// D 1.25 (lowest pass), D- 1.00 and F 0.50 (both fail).
export const JORDAN4_NEW: BuiltinScheme = {
  id: "jordan4new",
  labelKey: "gradeSchemeJordanNew",
  family: "4",
  max: 4,
  bands: joBands([...JO_TOP, 1.25, 1.0, 0.5]),
  passMin: 54,
  approxCutoffs: true,
};

// Jordan's A+ system (Hashemite University instructions Art. 16; the Ministry's
// Study-in-Jordan grading page): A+ 4 · A 3.75 · A- 3.5 · B+ 3.25 · … · D 1.5
// (lowest pass) · F 0. Same estimated cutoffs, one step higher at the top.
export const JORDAN4_PLUS: BuiltinScheme = {
  id: "jordan4plus",
  labelKey: "gradeSchemeJordanPlus",
  family: "4",
  max: 4,
  bands: [
    { min: 94, letter: "A+", points: 4.0 },
    { min: 90, letter: "A", points: 3.75 },
    { min: 86, letter: "A-", points: 3.5 },
    { min: 82, letter: "B+", points: 3.25 },
    { min: 78, letter: "B", points: 3.0 },
    { min: 74, letter: "B-", points: 2.75 },
    { min: 70, letter: "C+", points: 2.5 },
    { min: 66, letter: "C", points: 2.25 },
    { min: 62, letter: "C-", points: 2.0 },
    { min: 58, letter: "D+", points: 1.75 },
    { min: 54, letter: "D", points: 1.5 },
    { min: 0, letter: "F", points: 0.0 },
  ],
  approxCutoffs: true,
};

// Order = picker order: the 4.0 variants appear in this sequence.
export const SCHEMES: BuiltinScheme[] = [
  SAUDI5,
  SAUDI4,
  QATAR4,
  JORDAN4,
  JORDAN4_NEW,
  JORDAN4_PLUS,
  PLUSMINUS4,
  PERCENTAGE,
];

/** The GPA goal to measure against. The stored goal defaults to 4.5 (a 5.0
 *  number), so one that can't belong to this scheme — above its max, or so low
 *  it must be from another scale (4.5 for a percentage student) — falls back to
 *  90% of the scheme's max: 4.5 / 3.6 / 90. */
export function effectiveGpaGoal(goal: number, scheme: GradeScheme): number {
  if (goal > 0 && goal <= scheme.max && goal >= scheme.max * 0.4) return goal;
  return Math.round(scheme.max * 0.9 * 100) / 100;
}

/** Lowest percentage that passes a course under this scheme. */
export const passMark = (scheme: GradeScheme): number =>
  scheme.passMin ?? scheme.bands[scheme.bands.length - 2]?.min ?? 60;

export const schemeById = (id: string | null | undefined): BuiltinScheme | undefined =>
  SCHEMES.find((s) => s.id === id);

/** The scheme a university's `scale` maps to. */
export const schemeForUniversity = (u: University | undefined): GradeScheme =>
  u?.scale === "4" ? SAUDI4 : SAUDI5;

// ── Smart detection ────────────────────────────────────────────────────────

/** A name particle glued to the word after it, so a name matches however the
 *  student spaced it: "أبو ظبي"/"أبوظبي", "عبد العزيز"/"عبدالعزيز", "أم القرى".
 *  Both sides of every comparison go through it. Expects normalised text. */
const PARTICLE = /(^|\s)(ابو|ابي|ام|عبد|abu|abd|abdul|abdel)\s+(?=\S)/g;
export const joinParticles = (normalised: string) => normalised.replace(PARTICLE, "$1$2");

/** Normalise Arabic (and Latin) so a hand-typed name matches the catalogue:
 *  drop diacritics/tatweel, unify alef/taa/yaa forms, strip "جامعة"/"university"
 *  and the definite article, collapse punctuation + spacing, and glue name
 *  particles (joinParticles). */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "") // harakat + tatweel
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/جامعة|جامعه|كلية|كليه|university|univ|college/g, " ")
    // No definite-article strip: "الفيصل" (Alfaisal) and "فيصل" (King Faisal)
    // are different universities. What's left of "الجامعة" after the word is
    // removed — a bare "ال" — is dropped as a stopword below.
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(PARTICLE, "$1$2");
}

// Connector words carry no identifying signal and would otherwise inflate the
// overlap between unrelated names.
// A bare "ال" (from "الجامعة") once made "الجامعة الأردنية" match the Saudi
// Electronic University ("الجامعة السعودية الإلكترونية").
// "في"/"al"/"el" join names ("الجامعة الأمريكية في دبي", "Al Baha University")
// and are often left out when a student types them.
const STOPWORDS = new Set(["of", "the", "for", "and", "in", "at", "al", "el", "bin", "bint", "ال", "في"]);
// Words many institutions share (after normalize): one of these alone never
// identifies a university.
const GENERIC = new Set([
  "الاهليه", "الدوليه", "العالميه", "الوطنيه", "العربيه", "الاسلاميه", "الامريكيه", "المفتوحه", "الاهلي",
  "الملك", "الامير", "الاميره", "الامام", "للعلوم", "العلوم", "الطبيه", "الصحيه", "التقنيه", "والتقنيه",
  "كليات", "private", "international", "national", "american", "arab", "islamic", "king", "prince",
  "princess", "imam", "science", "sciences", "technology", "medical", "health",
]);
// A name picked with its country ("… (عُمان)", lib/universityPick) is matched
// without it; the country then narrows which university it is.
const tokenize = (s: string): string[] =>
  normalize(stripPick(s))
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t));

/**
 * Best-effort match of a free-typed university name to the catalogue, by token
 * overlap against each entry's name + aliases. Returns undefined when nothing is
 * confidently close, so callers fall back to the national default. Only used to
 * pick a grading scheme, and the user can override — so a near miss is harmless.
 */
export function matchUniversityByName(name: string): University | undefined {
  const pick = pickedCountry(name);
  if (pick && pick !== "SA") return undefined;
  const qTokens = tokenize(name);
  if (!qTokens.length) return undefined;
  const q = new Set(qTokens);

  let best: { u: University; score: number } | null = null;
  for (const u of UNIVERSITIES) {
    if (u.slug === "other") continue;
    const hay = new Set(tokenize([u.name, u.nameEn, ...(u.aliases ?? [])].join(" ")));
    let inter = 0;
    for (const tk of q) if (hay.has(tk)) inter++;
    // A single shared GENERIC word ("جامعة النجوم الأهلية" vs "كليات الريان
    // الأهلية") is no evidence; a distinctive one ("طيبة") still counts.
    if (!inter || (inter === 1 && q.size > 1 && [...q].some((tk) => hay.has(tk) && GENERIC.has(tk)))) continue;
    // Coverage of the shorter side rewards a full acronym/short-name hit.
    const score = inter / Math.min(q.size, hay.size || 1);
    if (score > (best?.score ?? 0)) best = { u, score };
  }
  return best && best.score >= 0.5 ? best.u : undefined;
}

// Universities outside Saudi whose official table we verified, so a student who
// types one of these names gets the right system without choosing it.
const FOREIGN_UNIVERSITIES: { scheme: GradeScheme; countries: string[]; names: string[] }[] = [
  { scheme: QATAR4, countries: ["QA"], names: ["جامعة قطر", "Qatar University"] },
  { scheme: JORDAN4, countries: ["JO"], names: ["جامعة الشرق الأوسط", "Middle East University", "MEU"] },
  { scheme: JORDAN4_NEW, countries: ["JO"], names: ["الجامعة الأردنية", "University of Jordan", "Jordan University"] },
  { scheme: JORDAN4_PLUS, countries: ["JO"], names: ["الجامعة الهاشمية", "Hashemite University"] },
  {
    scheme: PLUSMINUS4,
    countries: ["AE", "BH"],
    names: ["جامعة الإمارات", "جامعة الإمارات العربية المتحدة", "UAEU", "United Arab Emirates University", "جامعة البحرين", "University of Bahrain"],
  },
];

/** How many words a typed name may add to a known one: one ("جامعة الشرق
 *  الأوسط عمان") — but none to a one-word name, or "جامعة النجوم الأهلية"
 *  would be taken for "جامعة الأهلية". */
const allowedExtra = (want: string[]) => (want.length >= 2 ? 1 : 0);

/** A typed name matches when it contains every token of a known name, with at
 *  most one extra word (see allowedExtra), so a different university that
 *  merely shares words isn't swept in. */
export function matchForeignScheme(name: string): GradeScheme | undefined {
  const typed = tokenize(name);
  if (!typed.length) return undefined;
  const set = new Set(typed);
  const pick = pickedCountry(name);
  for (const f of FOREIGN_UNIVERSITIES) {
    if (pick && !f.countries.includes(pick)) continue;
    for (const n of f.names) {
      const want = tokenize(n);
      if (want.length && want.every((w) => set.has(w)) && typed.length - want.length <= allowedExtra(want)) return f.scheme;
    }
  }
  return undefined;
}

// ── The university catalogue (unverified, lib/gradeCatalog) ────────────────

export interface CatalogUniversity {
  slug: string;
  ar: string;
  en: string;
  country: string;
  table: number;
}

export const CATALOG_UNIVERSITIES: CatalogUniversity[] = CATALOG.map(([slug, ar, en, country, table]) => ({
  slug,
  ar,
  en,
  country,
  table,
}));

/** Catalogue entries whose table we checked against the university's own
 *  official page. The catalogue's University of Jordan table is the outdated
 *  one, so the verified scheme replaces it; the rest match their entry. */
const VERIFIED_CATALOG: Record<string, GradeScheme | "table"> = {
  "the-university-of-jordan": JORDAN4_NEW,
  "middle-east-university": JORDAN4,
  "the-hashemite-university": JORDAN4_PLUS,
  "qatar-university": QATAR4,
  "united-arab-emirates-university": PLUSMINUS4,
  "university-of-bahrain": PLUSMINUS4,
  "kuwait-university": "table",
  "sultan-qaboos-university": "table",
  "king-saud-university": "table",
};

// Percentage cutoffs are not in the catalogue — only letters and points. These
// are the usual Arab cutoffs (Saudi/Qatar without minus grades, UAEU/Bahrain
// with them), used as an ESTIMATE; the student is told the letter is approximate.
const CUTOFFS_PLAIN: Record<string, number> = { "A+": 95, A: 90, "B+": 85, B: 80, "C+": 75, C: 70, "D+": 65, D: 60 };
const CUTOFFS_MINUS: Record<string, number> = {
  "A+": 95, A: 90, "A-": 87, "B+": 84, B: 80, "B-": 77, "C+": 74, C: 70, "C-": 67, "D+": 64, D: 60, "D-": 57,
};

/**
 * Estimated lowest percentage for each row of a letters+points table. The last
 * row is the failing grade (0). Numeric "letters" ("89", ">=90") are their own
 * cutoff. Letters outside the common set are spaced evenly from 90 down to 60.
 * Returns `exact` when every cutoff came from the letters themselves.
 */
export function estimateCutoffs(letters: string[]): { mins: number[]; exact: boolean } {
  const n = letters.length;
  const passing = letters.slice(0, -1).map((l) => l.trim().toUpperCase().replace(/^([A-D])0$/, "$1"));
  const numeric = passing.map((l) => Number(l.replace(/^>=?/, "")));
  if (passing.length && numeric.every((x) => Number.isFinite(x) && x > 0 && x <= 100)) {
    return { mins: [...numeric, 0], exact: true };
  }
  const map = passing.some((l) => l.endsWith("-")) ? CUTOFFS_MINUS : CUTOFFS_PLAIN;
  let mins = passing.map((l) => map[l]);
  const descending = mins.every((m, i) => m !== undefined && (i === 0 || m < mins[i - 1]));
  if (!descending) {
    const k = passing.length;
    mins = passing.map((_, i) => (k === 1 ? 60 : Math.round(90 - (30 * i) / (k - 1))));
  }
  return { mins: [...mins.slice(0, n - 1), 0], exact: false };
}

const familyForMax = (max: number): SchemeFamily => (max === 5 ? "5" : max === 4 ? "4" : "other");

const sameBands = (a: GradeBand[], letters: string[], points: number[]) =>
  a.length === points.length &&
  a.every((b, i) => b.points === points[i] && (i === a.length - 1 || b.letter === letters[i]));

const FAIL_LABEL = /راسب|فاشل/;
const catalogCache = new Map<number, GradeScheme>();

/** The scheme for a catalogue table. A table identical to one of our verified
 *  schemes reuses it (and its cutoffs); anything else gets estimated cutoffs. */
export function catalogScheme(index: number): GradeScheme {
  const hit = catalogCache.get(index);
  if (hit) return hit;
  const t = CATALOG_TABLES[index];
  let scheme: GradeScheme;
  if ("pct" in t) {
    const bands = t.pct.map(([min, label]) => ({ min, letter: label, points: min }));
    const passing = bands.slice(0, -1).filter((b) => !FAIL_LABEL.test(b.letter));
    scheme = {
      id: `cat:${index}`,
      labelKey: "gradeSchemePercent",
      family: "percent",
      max: 100,
      percent: true,
      bands,
      passMin: passing.length ? passing[passing.length - 1].min : undefined,
    };
  } else {
    const same = SCHEMES.find((s) => !s.percent && sameBands(s.bands, t.l, t.p));
    if (same) scheme = same;
    else {
      const { mins, exact } = estimateCutoffs(t.l);
      const max = Math.max(...t.p);
      scheme = {
        id: `cat:${index}`,
        labelKey: "gradeSchemeCatalog",
        family: familyForMax(max),
        max,
        bands: t.l.map((letter, i) => ({ min: mins[i], letter, points: t.p[i] })),
        approxCutoffs: !exact,
      };
    }
  }
  catalogCache.set(index, scheme);
  return scheme;
}

// Every searchable name of an entry, tokenised once on first use: the Arabic
// and English names plus a bracketed acronym ("(GJU)", "(PSUT)").
let catalogTokens: { u: CatalogUniversity; names: string[][] }[] | null = null;
function catalogIndex() {
  if (!catalogTokens) {
    catalogTokens = CATALOG_UNIVERSITIES.map((u) => {
      const acronym = u.en.match(/\(([A-Za-z]{2,})\)/)?.[1];
      const names = [u.ar, u.en.replace(/\(.*?\)/g, ""), ...(acronym ? [acronym] : [])];
      return { u, names: names.map(tokenize).filter((t) => t.length) };
    });
  }
  return catalogTokens;
}

/** The catalogue university a typed name refers to: every word of one of its
 *  names must be present, with at most one extra word (see allowedExtra); the
 *  tightest fit wins. */
export function matchCatalog(name: string): CatalogUniversity | undefined {
  const typed = tokenize(name);
  if (!typed.length) return undefined;
  const set = new Set(typed);
  const pick = pickedCountry(name);
  let best: { u: CatalogUniversity; extra: number } | null = null;
  for (const { u, names } of catalogIndex()) {
    if (pick && CATALOG_COUNTRY[u.country] !== pick) continue;
    for (const want of names) {
      const extra = typed.length - want.length;
      if (extra < 0 || extra > allowedExtra(want) || !want.every((w) => set.has(w))) continue;
      if (!best || extra < best.extra) best = { u, extra };
    }
  }
  return best?.u;
}

export const catalogBySlug = (slug: string | null | undefined): CatalogUniversity | undefined =>
  slug ? CATALOG_UNIVERSITIES.find((u) => u.slug === slug) : undefined;

// ── A table the student entered themselves ─────────────────────────────────

/** The student's own table as a scheme, or undefined if it isn't usable. Rows
 *  are ordered by points; percentage cutoffs they left blank are estimated. */
export function customScheme(c: CustomSchemeData | null | undefined): GradeScheme | undefined {
  if (!c || !(c.max > 0)) return undefined;
  if (c.percent) {
    // Bands only name the marks here, so every one needs its lowest %.
    const rows = c.bands
      .filter((b) => b.letter.trim())
      .map((b, i, all) => ({ letter: b.letter.trim(), points: 0, min: i === all.length - 1 ? 0 : b.min ?? NaN }));
    const ok =
      rows.length >= 2 && rows.every((b, i) => b.min >= 0 && b.min <= 100 && (i === 0 || b.min < rows[i - 1].min));
    if (!ok) return undefined;
    return {
      id: "custom",
      labelKey: "gradeSchemeCustom",
      family: "percent",
      max: 100,
      percent: true,
      bands: rows.map((b) => ({ ...b, points: b.min })),
      passMin: rows[rows.length - 2].min,
    };
  }
  const rows = c.bands
    .filter((b) => b.letter.trim() && Number.isFinite(b.points) && b.points >= 0 && b.points <= c.max)
    .sort((a, b) => b.points - a.points);
  if (rows.length < 2) return undefined;
  const given = rows.slice(0, -1).map((b) => b.min);
  const complete = given.every((m, i) => m !== null && m > 0 && m <= 100 && (i === 0 || m < given[i - 1]!));
  const mins = complete ? [...(given as number[]), 0] : estimateCutoffs(rows.map((b) => b.letter)).mins;
  return {
    id: "custom",
    labelKey: "gradeSchemeCustom",
    family: familyForMax(c.max),
    max: c.max,
    bands: rows.map((b, i) => ({ min: mins[i], letter: b.letter.trim(), points: b.points })),
    approxCutoffs: !complete,
  };
}

/** How the active scheme was decided. "default" = nothing told us (a typed,
 *  unrecognised university falls here), which is when the app asks the
 *  student to pick their system instead of silently assuming 5.0. "catalog" =
 *  an unverified catalogue table, which the student is asked to confirm. */
export type SchemeSource = "manual" | "custom" | "university" | "typed" | "catalog" | "default";

export interface SchemeDetection {
  scheme: GradeScheme;
  source: SchemeSource;
  /** The catalogue university the typed name matched, if any. */
  catalog?: CatalogUniversity;
}

/**
 * The scheme to calculate with, given the student's academic profile:
 *   1. an explicit manual choice (gpaSchemeId) always wins — a built-in
 *      scheme, or "custom" = the table the student entered;
 *   2. otherwise a known selected university → its official scale;
 *   3. otherwise a hand-typed name → a verified foreign university; else a
 *      non-Saudi catalogue university (unverified); else a fuzzy-matched Saudi
 *      one → its official scale; else a Saudi catalogue entry;
 *   4. otherwise the Saudi national default (5.0).
 */
export function detectScheme(academic: AcademicInfo | null | undefined): SchemeDetection {
  if (academic?.gpaSchemeId === "custom") {
    const own = customScheme(academic.customScheme);
    if (own) return { scheme: own, source: "custom" };
  }
  const chosen = schemeById(academic?.gpaSchemeId);
  if (chosen) return { scheme: chosen, source: "manual" };

  const slug = academic?.universitySlug;
  if (slug && slug !== "other") {
    const u = universityBySlug(slug);
    if (u) return { scheme: schemeForUniversity(u), source: "university" };
  }
  const typed = academic?.universityName?.trim();
  if ((slug === "other" || !slug) && typed) {
    const cat = matchCatalog(typed);
    const foreign = matchForeignScheme(typed);
    if (foreign) return withLearned({ scheme: foreign, source: "typed", ...(cat ? { catalog: cat } : {}) });
    const verified = cat && VERIFIED_CATALOG[cat.slug];
    if (cat && verified) {
      return withLearned({ scheme: verified === "table" ? catalogScheme(cat.table) : verified, source: "typed", catalog: cat });
    }
    if (cat && cat.country !== "Saudi Arabia") return withLearned({ scheme: catalogScheme(cat.table), source: "catalog", catalog: cat });
    const u = matchUniversityByName(typed);
    if (u) return { scheme: schemeForUniversity(u), source: "typed" };
    if (cat) return withLearned({ scheme: catalogScheme(cat.table), source: "catalog", catalog: cat });
  }
  return { scheme: SAUDI5, source: "default" };
}

// ── Cutoffs learned from students' results ─────────────────────────────────
//
// Where a university doesn't publish percentage cutoffs we estimate them. Once
// enough students have shared real results (a course's % next to the letter
// it got) and the admin approves the cutoffs they point to, those replace the
// estimate for everyone at that university. Keyed by catalogue slug; loaded
// by the store at start-up (public grade_cutoffs table).

/** catalogue slug → lowest % for each letter (all but the last band). */
export type LearnedCutoffs = Record<string, Record<string, number>>;

let learned: LearnedCutoffs = {};
const learnedCache = new Map<string, { from: GradeScheme; cutoffs: Record<string, number>; scheme: GradeScheme }>();

export function setLearnedCutoffs(map: LearnedCutoffs): void {
  learned = map;
  learnedCache.clear();
}

/** The scheme with approved cutoffs applied, or null when they don't fit it
 *  (a letter missing, or not strictly descending) — then the estimate stays. */
export function applyCutoffs(scheme: GradeScheme, cutoffs: Record<string, number>): GradeScheme | null {
  const last = scheme.bands.length - 1;
  const mins = scheme.bands.map((b, i) => (i === last ? 0 : cutoffs[b.letter]));
  const ok = mins.every(
    (m, i) => typeof m === "number" && m >= 0 && m <= 100 && (i === 0 || i === last || m < mins[i - 1])
  );
  if (!ok || !(mins[last - 1] > 0)) return null;
  return {
    ...scheme,
    bands: scheme.bands.map((b, i) => ({ ...b, min: mins[i] })),
    approxCutoffs: false,
    learnedCutoffs: true,
  };
}

function withLearned(d: SchemeDetection): SchemeDetection {
  const cutoffs = d.catalog && learned[d.catalog.slug];
  if (!cutoffs || !d.scheme.approxCutoffs || d.scheme.percent) return d;
  const key = d.catalog!.slug;
  const hit = learnedCache.get(key);
  // Cached per university so the scheme object stays stable across renders.
  if (hit && hit.from === d.scheme && hit.cutoffs === cutoffs) return { ...d, scheme: hit.scheme };
  const scheme = applyCutoffs(d.scheme, cutoffs);
  if (!scheme) return d;
  learnedCache.set(key, { from: d.scheme, cutoffs, scheme });
  return { ...d, scheme };
}

/** Whether the student's university is Saudi (its rules follow the national
 *  study regulations): true / false, or null when we can't tell. */
export function isSaudiUniversity(academic: AcademicInfo | null | undefined): boolean | null {
  const slug = academic?.universitySlug;
  if (slug && slug !== "other") return universityBySlug(slug) ? true : null;
  const typed = academic?.universityName?.trim();
  if (!typed) return null;
  if (matchForeignScheme(typed)) return false;
  const cat = matchCatalog(typed);
  if (cat) return cat.country === "Saudi Arabia";
  return matchUniversityByName(typed) ? true : null;
}

export const resolveScheme = (academic: AcademicInfo | null | undefined): GradeScheme =>
  detectScheme(academic).scheme;

/** True when the student typed a university we don't recognise and never
 *  picked a system — their GPA is on the 5.0 default only by assumption. */
export const schemeNeedsChoice = (academic: AcademicInfo | null | undefined): boolean =>
  detectScheme(academic).source === "default" && !!academic?.universityName?.trim();

/**
 * Where the student stands on their university's points table:
 *   "confirm"  — detected from the unverified catalogue, not yet answered;
 *   "rejected" — they said it differs and haven't entered theirs yet;
 *   "unknown"  — typed a university we don't have at all, no system picked;
 *   "ok"       — verified, confirmed, chosen by hand, or their own table.
 */
export type GradeTableStatus = "confirm" | "rejected" | "unknown" | "ok";

export function gradeTableStatus(academic: AcademicInfo | null | undefined): GradeTableStatus {
  const d = detectScheme(academic);
  if (d.source === "default") return academic?.universityName?.trim() ? "unknown" : "ok";
  if (d.source !== "catalog" || !d.catalog) return "ok";
  const check = academic?.gradeCheck;
  if (check?.key !== d.catalog.slug) return "confirm";
  return check.answer === "no" ? "rejected" : "ok";
}

// ── Per-scheme helpers ──────────────────────────────────────────────────────

/** The band (letter) a percentage falls into for this scheme. */
export const bandForPct = (scheme: GradeScheme, pct: number): GradeBand =>
  scheme.bands.find((b) => pct >= b.min)!;

/** The grade points a percentage earns under this scheme — or the percentage
 *  itself in percentage mode. */
export const pointsForPct = (scheme: GradeScheme, pct: number): number =>
  scheme.percent ? pct : bandForPct(scheme, pct).points;

/** Portal results that aren't one of the scheme's letters:
 *    W  (منسحب) — withdrawn: the course leaves the GPA entirely;
 *    DN (محروم) — denied for absence: counts as the failing grade (1 on the
 *       Saudi 5.0 scale, 0 on 4.0), per the unified study regulation. */
export const WITHDRAWN = "W";
export const DENIED = "DN";
export const SPECIAL_RESULTS = [DENIED, WITHDRAWN] as const;

/** A withdrawn course: not in the GPA at all (neither points nor hours). */
export const isWithdrawn = (g?: { letter?: string } | null): boolean => g?.letter === WITHDRAWN;

/** The points an official result earns: the portal letter's points, or the
 *  final mark itself in percentage mode. null when it doesn't count (W) or
 *  doesn't fit the scheme (e.g. a letter from a table the student has since
 *  changed). */
export function pointsForOfficial(scheme: GradeScheme, g: { letter?: string; mark?: number }): number | null {
  if (scheme.percent) return typeof g.mark === "number" ? g.mark : null;
  if (!g.letter || g.letter === WITHDRAWN) return null;
  if (g.letter === DENIED) return scheme.bands[scheme.bands.length - 1].points;
  const band = scheme.bands.find((b) => b.letter === g.letter);
  return band ? band.points : null;
}
