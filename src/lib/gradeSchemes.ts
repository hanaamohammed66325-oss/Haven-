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
import type { AcademicInfo } from "@/types";

export interface GradeBand {
  min: number; // lowest percentage that earns this band (descending)
  letter: string;
  points: number; // grade points on this scheme's scale
}

export type SchemeId = "saudi5" | "saudi4" | "percentage" | "plusminus4";

export interface GradeScheme {
  id: SchemeId;
  labelKey: string; // i18n key for the human name
  max: number; // 5 | 4 | 100 — the denominator the GPA is shown out of
  bands: GradeBand[]; // descending by `min`
  /** percentage mode: the GPA is a credit-weighted average of the raw course
   *  percentages, so `points` is ignored and the % itself is used. Bands are
   *  kept only to label a course with a letter. */
  percent?: boolean;
}

// Official Saudi 5.0 (unified regulations — KSU/most public). Identical to the
// historical SCALE in grades.ts.
export const SAUDI5: GradeScheme = {
  id: "saudi5",
  labelKey: "gradeScheme5",
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
export const SAUDI4: GradeScheme = {
  id: "saudi4",
  labelKey: "gradeScheme4",
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
export const PERCENTAGE: GradeScheme = {
  id: "percentage",
  labelKey: "gradeSchemePercent",
  max: 100,
  percent: true,
  bands: SAUDI5.bands,
};

// International 4.0 with plus/minus (A, A-, B+, B, B-, …). The system used by
// American-style universities across the Arab world OUTSIDE Saudi (e.g. AUC in
// Egypt; many Emirati/Jordanian/Lebanese private universities), which is why it
// is offered as a manual preference rather than auto-detected from the Saudi
// university list. Points follow the widely published table (A-=3.7, B+=3.3,
// B-=2.7, C-=1.7 …). DATA HONESTY: the PERCENTAGE cutoffs below are the common US
// standard (93/90/87/83/80/77/73/70/67/63); a given university can shift them, so
// this is the "verify with your own regulations" default, consistent with the
// Saudi schemes. No D- band, matching the usual A…D+ D F letter set.
export const PLUSMINUS4: GradeScheme = {
  id: "plusminus4",
  labelKey: "gradeSchemePlusMinus",
  max: 4,
  bands: [
    { min: 93, letter: "A", points: 4.0 },
    { min: 90, letter: "A-", points: 3.7 },
    { min: 87, letter: "B+", points: 3.3 },
    { min: 83, letter: "B", points: 3.0 },
    { min: 80, letter: "B-", points: 2.7 },
    { min: 77, letter: "C+", points: 2.3 },
    { min: 73, letter: "C", points: 2.0 },
    { min: 70, letter: "C-", points: 1.7 },
    { min: 67, letter: "D+", points: 1.3 },
    { min: 63, letter: "D", points: 1.0 },
    { min: 0, letter: "F", points: 0.0 },
  ],
};

export const SCHEMES: GradeScheme[] = [SAUDI5, SAUDI4, PERCENTAGE, PLUSMINUS4];

export const schemeById = (id: string | null | undefined): GradeScheme | undefined =>
  SCHEMES.find((s) => s.id === id);

/** The scheme a university's `scale` maps to. */
export const schemeForUniversity = (u: University | undefined): GradeScheme =>
  u?.scale === "4" ? SAUDI4 : SAUDI5;

// ── Smart detection ────────────────────────────────────────────────────────

/** Normalise Arabic (and Latin) so a hand-typed name matches the catalogue:
 *  drop diacritics/tatweel, unify alef/taa/yaa forms, strip "جامعة"/"university"
 *  and the definite article, and collapse punctuation + spacing. */
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
    .replace(/\bال/g, " ") // rough definite-article strip
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Connector words carry no identifying signal and would otherwise inflate the
// overlap between unrelated names.
const STOPWORDS = new Set(["of", "the", "for", "and", "bin", "bint"]);
const tokenize = (s: string): string[] =>
  normalize(s)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t));

/**
 * Best-effort match of a free-typed university name to the catalogue, by token
 * overlap against each entry's name + aliases. Returns undefined when nothing is
 * confidently close, so callers fall back to the national default. Only used to
 * pick a grading scheme, and the user can override — so a near miss is harmless.
 */
export function matchUniversityByName(name: string): University | undefined {
  const qTokens = tokenize(name);
  if (!qTokens.length) return undefined;
  const q = new Set(qTokens);

  let best: { u: University; score: number } | null = null;
  for (const u of UNIVERSITIES) {
    if (u.slug === "other") continue;
    const hay = new Set(tokenize([u.name, u.nameEn, ...(u.aliases ?? [])].join(" ")));
    let inter = 0;
    for (const tk of q) if (hay.has(tk)) inter++;
    if (!inter) continue;
    // Coverage of the shorter side rewards a full acronym/short-name hit.
    const score = inter / Math.min(q.size, hay.size || 1);
    if (score > (best?.score ?? 0)) best = { u, score };
  }
  return best && best.score >= 0.5 ? best.u : undefined;
}

/**
 * The scheme to calculate with, given the student's academic profile:
 *   1. an explicit manual choice (gpaSchemeId) always wins;
 *   2. otherwise a known selected university → its official scale;
 *   3. otherwise a hand-typed name → fuzzy-matched university → its scale;
 *   4. otherwise the Saudi national default (5.0).
 */
export function resolveScheme(academic: AcademicInfo | null | undefined): GradeScheme {
  const chosen = schemeById(academic?.gpaSchemeId);
  if (chosen) return chosen;

  const slug = academic?.universitySlug;
  if (slug && slug !== "other") {
    const u = universityBySlug(slug);
    if (u) return schemeForUniversity(u);
  }
  const typed = academic?.universityName?.trim();
  if ((slug === "other" || !slug) && typed) {
    const u = matchUniversityByName(typed);
    if (u) return schemeForUniversity(u);
  }
  return SAUDI5;
}

// ── Per-scheme helpers ──────────────────────────────────────────────────────

/** The band (letter) a percentage falls into for this scheme. */
export const bandForPct = (scheme: GradeScheme, pct: number): GradeBand =>
  scheme.bands.find((b) => pct >= b.min)!;

/** The grade points a percentage earns under this scheme — or the percentage
 *  itself in percentage mode. */
export const pointsForPct = (scheme: GradeScheme, pct: number): number =>
  scheme.percent ? pct : bandForPct(scheme, pct).points;
