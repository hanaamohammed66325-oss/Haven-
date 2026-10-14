// Universities whose GPA system was corrected to match the official regulation
// (research audit, October 2026). A student who followed the old automatic
// system is asked once, in a pop-up, whether he agrees with the update; his
// answer is stored on his academic profile (AcademicInfo.schemeUpdate).
//
// Students on "auto" are asked, and so are those who picked a system by hand
// (a student who chose "out of 4" may still be on points that differ from his
// university's real table). Not asked: someone who entered his own table, one
// who chose the percentage average, and one already on the university's table.
//
// Two kinds: a Saudi university picked from the list (`slug`, built-in schemes
// on both sides) and a catalogue university matched from the typed name
// (`catalog`, its corrected table from lib/verifiedTables).

import type { AcademicInfo } from "@/types";
import { catalogBySlug, catalogScheme, detectScheme, PLUSMINUS4, schemeById, type GradeScheme, type SchemeId } from "./gradeSchemes";
import { CORRECTED_TABLES } from "./verifiedTables";

export interface SchemeUpdate {
  /** stable id of this change; a new correction for the same university gets a new id */
  id: string;
  /** the Saudi university slug, or the catalogue slug when `catalog` */
  slug: string;
  /** a typed-name (catalogue) university rather than one picked from the Saudi list */
  catalog?: boolean;
  /** what the automatic system gave him before the update */
  previous: SchemeId | GradeScheme;
  /** what it gives him now */
  next: SchemeId | GradeScheme;
}

/** A Saudi university's update: built-in schemes on both sides. */
export type SaudiSchemeUpdate = SchemeUpdate & { previous: SchemeId; next: SchemeId };

export const SCHEME_UPDATES: SaudiSchemeUpdate[] = [
  { id: "taif:2026-10", slug: "taif", previous: "saudi5", next: "saudi4" },
  { id: "hail:2026-10", slug: "hail", previous: "saudi5", next: "saudi4" },
  { id: "saudi-electronic:2026-10", slug: "saudi-electronic", previous: "saudi5", next: "saudi4" },
  { id: "umm-alqura:2026-10", slug: "umm-alqura", previous: "saudi5", next: "saudi4" },
  { id: "dar-alhekma:2026-10", slug: "dar-alhekma", previous: "saudi4", next: "saudi5" },
  { id: "almaarefa:2026-10", slug: "almaarefa", previous: "saudi5", next: "saudi4" },
  { id: "arab-open:2026-10", slug: "arab-open", previous: "saudi4", next: "aou4" },
];

/** What a catalogue university's students had before its correction: the
 *  catalogue table, except the University of Bahrain, which the app had mapped
 *  to the one-decimal plus/minus scheme. */
const PREVIOUS_OVERRIDE: Record<string, () => GradeScheme> = {
  "university-of-bahrain": () => PLUSMINUS4,
  // The typed name used to resolve to the American College of Dubai's table.
  "american-university-in-dubai": () => catalogScheme(catalogBySlug("american-college-of-dubai")!.table),
};

let catalogUpdates: SchemeUpdate[] | null = null;
/** One update per corrected catalogue table (lib/verifiedTables). */
export function catalogSchemeUpdates(): SchemeUpdate[] {
  if (!catalogUpdates) {
    const slugs = [...new Set([...Object.keys(CORRECTED_TABLES), ...Object.keys(PREVIOUS_OVERRIDE)])];
    catalogUpdates = slugs.flatMap((slug) => {
      const cat = catalogBySlug(slug);
      if (!cat) return [];
      const next = detectScheme({ universitySlug: "other", universityName: cat.en, major: "", level: "" }).scheme;
      const previous = PREVIOUS_OVERRIDE[slug]?.() ?? catalogScheme(cat.table);
      return [{ id: `${slug}:2026-10`, slug, catalog: true, previous, next }];
    });
  }
  return catalogUpdates;
}

/** The update this student still has to answer, or null. */
export function pendingSchemeUpdate(academic: AcademicInfo | null | undefined): SchemeUpdate | null {
  if (!academic) return null;
  const chosen = academic.gpaSchemeId;
  if (chosen === "custom" || chosen === "percentage") return null;
  let update: SchemeUpdate | undefined;
  const slug = academic.universitySlug;
  if (slug && slug !== "other") {
    update = SCHEME_UPDATES.find((u) => u.slug === slug);
  } else if (academic.universityName?.trim()) {
    // The university the typed name resolves to on the automatic system.
    const auto = detectScheme({ ...academic, gpaSchemeId: undefined });
    const cat = auto.catalog;
    if (cat && auto.source === "typed") update = catalogSchemeUpdates().find((u) => u.slug === cat.slug);
  }
  if (!update) return null;
  if (typeof update.next === "string" ? chosen === update.next : false) return null;
  return academic.schemeUpdate?.id === update.id ? null : update;
}

/** A change of university by the student (profile or setup): the patch plus,
 *  when the new university has a GPA update, a "new" mark for it, so the pop-up
 *  is only for students whose university was set before the update. */
export function universityPatch(academic: AcademicInfo, patch: Partial<AcademicInfo>): Partial<AcademicInfo> {
  const next = { ...academic, ...patch, schemeUpdate: undefined };
  const update = pendingSchemeUpdate(next);
  return update ? { ...patch, schemeUpdate: { id: update.id, answer: "new", at: new Date().toISOString() } } : patch;
}

/** "No, keep my system" for an automatic student: the old system as his own
 *  choice — a built-in one by id, or a catalogue table kept as his own table
 *  (cutoffs only where they were exact, so the same estimate applies). */
export function keepPrevious(previous: GradeScheme): Pick<AcademicInfo, "gpaSchemeId" | "customScheme"> {
  if (schemeById(previous.id)) return { gpaSchemeId: previous.id as SchemeId };
  const last = previous.bands.length - 1;
  return {
    gpaSchemeId: "custom",
    customScheme: {
      max: previous.max,
      bands: previous.bands.map((b, i) => ({
        letter: b.letter,
        points: b.points,
        min: i === last || previous.approxCutoffs ? null : b.min,
      })),
    },
  };
}
