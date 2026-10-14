// Grade tables checked against each university's own published regulation
// (research audit, October 2026: research/gpa-calendar-audit/*_READY_FOR_TRANSFER.md).
// They override the unverified catalogue (lib/gradeCatalog) for the catalogue
// slug, or add a university the catalogue doesn't list.
//
// Cutoffs: where the university publishes them they are copied as published
// (`approxCutoffs` absent). Where it publishes only points, the cutoffs are the
// usual estimate (lib/gradeSchemes estimateCutoffs) and the letter is shown as
// approximate — the points, and so the GPA formula, are exact.

import type { GradeBand, GradeScheme } from "./gradeSchemes";

export interface VerifiedTable {
  letters: string[];
  points: number[];
  /** published lowest % per row (last row 0); omitted = estimated */
  mins?: number[];
  /** lowest % that passes, when failing rows still carry points */
  passMin?: number;
  /** where it was checked (regulation, page) */
  source: string;
}

const MINUS3 = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"];
const THIRDS = [4, 3.67, 3.33, 3, 2.67, 2.33, 2, 1.67, 1.33, 1, 0];

/** Catalogue slug → its verified table (a correction of the catalogue's). */
export const CORRECTED_TABLES: Record<string, VerifiedTable> = {
  "american-university-of-bahrain": {
    letters: MINUS3,
    points: THIRDS,
    mins: [90, 87, 84, 80, 77, 74, 70, 67, 64, 60, 0],
    source: "AUBH Student Handbook 2026-27 p11",
  },
  "university-of-bahrain": {
    letters: MINUS3,
    points: THIRDS,
    mins: [90, 87, 84, 80, 77, 74, 70, 67, 64, 60, 0],
    source: "UOB Study and Examination Regulation 02/2025, Art. 60 p52",
  },
  "al-balqa-applied-university": {
    letters: ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"],
    points: [4, 3.75, 3.5, 3.25, 3, 2.75, 2.5, 2, 1.75, 1.25, 1, 0.5],
    passMin: 60, // D (1.25) is the lowest pass; D- (1) and F (0.5) fail
    source: "Al-Balqa bachelor (non-medicine) points table, from first semester 2025-26",
  },
  "beirut-arab-university": {
    letters: ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"],
    points: [4, 4, 3.67, 3.33, 3, 2.67, 2.33, 2, 1.67, 1.33, 0],
    mins: [95, 90, 86, 83, 80, 76, 73, 70, 65, 60, 0],
    source: "BAU central undergraduate academic information",
  },
  "holy-spirit-university-of-kaslik": {
    letters: ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"],
    points: [4, 4, 3.67, 3.33, 3, 2.67, 2.33, 2, 1.67, 1.33, 1, 0],
    mins: [93, 90, 87, 83, 80, 77, 73, 70, 67, 63, 60, 0],
    source: "USEK undergraduate catalogue 2024-25",
  },
  "university-of-technology-and-applied-sciences": {
    letters: MINUS3,
    points: [4, 3.7, 3.3, 3, 2.7, 2.3, 2, 1.7, 1.3, 1, 0],
    mins: [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 0],
    source: "UTAS Academic Regulation Art. 79 p34 (students admitted from 2022-23)",
  },
  "american-university-of-ras-al-khaimah": {
    letters: ["A", "B+", "B", "C+", "C", "D+", "D", "F"],
    points: [4, 3.5, 3, 2.5, 2, 1.5, 1, 0],
    source: "AURAK grading table effective 31 Aug 2026",
  },
  "american-university-of-sharjah": {
    letters: ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"],
    points: [4, 3.7, 3.3, 3, 2.7, 2.3, 2, 1.7, 1, 0],
    source: "AUS undergraduate catalog, grade points (no D+)",
  },
  "khalifa-university": {
    letters: ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"],
    points: [4, 3.7, 3.3, 3, 2.7, 2.3, 2, 1.7, 1, 0],
    source: "Khalifa University catalog 2026-27, grade points (no D+)",
  },
  "new-york-university-abu-dhabi": {
    letters: MINUS3,
    points: [4, 3.667, 3.333, 3, 2.667, 2.333, 2, 1.667, 1.333, 1, 0],
    source: "NYUAD Abu Dhabi bulletin, grade points",
  },
  "gulf-medical-university": {
    letters: ["A", "B+", "B", "C+", "C", "D+", "F"],
    points: [4, 3.5, 3, 2.5, 2, 1.5, 0],
    mins: [90, 85, 80, 75, 70, 65, 0],
    source: "GMU catalog 2026-27 p444 (credit programmes, 2023 cohort on; fail below 65, no D)",
  },
};

/** Universities the catalogue doesn't list: [slug, Arabic, English, country (catalogue spelling), table]. */
export const ADDED_UNIVERSITIES: [string, string, string, string, VerifiedTable][] = [
  [
    "middle-east-university-lebanon",
    "جامعة الشرق الأوسط - لبنان",
    "Middle East University (Lebanon)",
    "Lebanon",
    {
      letters: ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"],
      points: [4, 3.67, 3.33, 3, 2.67, 2.33, 2, 1.67, 1.33, 1, 0.67, 0],
      source: "MEU Lebanon undergraduate catalog, grade points",
    },
  ],
  [
    "sagesse-university",
    "جامعة الحكمة",
    "Sagesse University",
    "Lebanon",
    {
      letters: ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"],
      points: [4, 3.8, 3.7, 3.3, 3, 2.7, 2.3, 2, 1.7, 1.3, 1, 0],
      mins: [94, 90, 87, 84, 80, 77, 74, 70, 67, 64, 60, 0],
      source: "Sagesse undergraduate regulations, May 2024",
    },
  ],
  [
    "arab-open-university-lebanon",
    "الجامعة العربية المفتوحة - لبنان",
    "Arab Open University (Lebanon)",
    "Lebanon",
    {
      letters: ["A", "B+", "B", "C+", "C", "D", "F"],
      points: [4, 3.5, 3, 2.5, 2, 1.5, 0],
      mins: [90, 82, 74, 66, 58, 50, 0],
      source: "AOU Lebanon undergraduate grade table",
    },
  ],
  [
    "arab-open-university-oman",
    "الجامعة العربية المفتوحة - عمان",
    "Arab Open University (Oman)",
    "Oman",
    {
      letters: ["A", "B+", "B", "C+", "C", "D", "F"],
      points: [4, 3.5, 3, 2.5, 2, 1.5, 0],
      mins: [90, 82, 74, 66, 58, 50, 0],
      source: "AOU Oman student guide 2025-26 p26",
    },
  ],
  [
    "umm-al-quwain-university",
    "جامعة أم القيوين",
    "Umm Al Quwain University",
    "United Arab Emirates",
    {
      letters: ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"],
      points: [4, 3.7, 3.3, 3, 2.7, 2.3, 2, 1.7, 1, 0],
      mins: [95, 90, 87, 84, 80, 77, 74, 70, 60, 0],
      source: "UAQU student guide p32",
    },
  ],
];

/** Catalogue slugs whose own table was checked and matches (no number changes). */
export const MATCHING_TABLES: string[] = [
  // Bahrain
  "ahlia-university", "kingdom-university", "royal-university-for-women", "gulf-university",
  "university-of-technology-bahrain",
  // UAE (united-arab-emirates-university is already verified in gradeSchemes)
  "abu-dhabi-university", "ajman-university", "al-ain-university", "al-wasl-university",
  "american-university-in-dubai", "american-university-in-the-emirates", "city-university-college-of-ajman",
  "hamdan-bin-mohammed-smart-university", "mohammed-bin-rashid-university-of-medicine-and-health-sciences",
  "university-of-dubai", "university-of-sharjah", "zayed-university", "canadian-university-dubai",
  // Oman (sultan-qaboos-university is already verified)
  "al-sharqiyah-university", "dhofar-university", "university-of-nizwa",
  // Jordan
  "al-al-bayt-university", "al-ahliyya-amman-university", "university-of-petra", "arab-open-university",
  "amman-arab-university",
  // Kuwait
  "american-international-university-aiu", "american-university-of-kuwait", "australian-college-of-kuwait",
  // Qatar
  "northwestern-university-in-qatar",
  // Lebanon
  "lebanese-american-university", "notre-dame-university-louaize",
  // Egypt (tables published for the whole university, not one faculty)
  "the-american-university-in-cairo", "alamein-international-university", "new-mansoura-university",
  "the-egyptian-chinese-university",
];

/** A verified table as a scheme. `estimate` supplies cutoffs when none were published. */
export function verifiedScheme(
  key: string,
  t: VerifiedTable,
  estimate: (letters: string[]) => { mins: number[] }
): GradeScheme {
  const mins = t.mins ?? estimate(t.letters).mins;
  const max = Math.max(...t.points);
  const bands: GradeBand[] = t.letters.map((letter, i) => ({ min: mins[i], letter, points: t.points[i] }));
  return {
    id: `uni:${key}`,
    labelKey: "gradeSchemeCatalog",
    family: max === 5 ? "5" : max === 4 ? "4" : "other",
    max,
    bands,
    ...(t.passMin !== undefined ? { passMin: t.passMin } : {}),
    ...(t.mins ? {} : { approxCutoffs: true }),
  };
}
