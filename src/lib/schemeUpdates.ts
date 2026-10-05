// Universities whose GPA system was corrected to match the official regulation
// (research audit, October 2026). A student who followed the old automatic
// system is asked once, in a pop-up, whether he agrees with the update; his
// answer is stored on his academic profile (AcademicInfo.schemeUpdate).
//
// Students on "auto" are asked, and so are those who picked a system by hand
// (a student who chose "out of 4" may still be on points that differ from his
// university's real table). Not asked: someone who entered his own table, one
// who chose the percentage average, and one already on the university's table.

import type { AcademicInfo } from "@/types";
import type { SchemeId } from "./gradeSchemes";

export interface SchemeUpdate {
  /** stable id of this change; a new correction for the same university gets a new id */
  id: string;
  slug: string;
  /** what the automatic system gave him before the update */
  previous: SchemeId;
  /** what it gives him now */
  next: SchemeId;
}

export const SCHEME_UPDATES: SchemeUpdate[] = [
  { id: "taif:2026-10", slug: "taif", previous: "saudi5", next: "saudi4" },
  { id: "hail:2026-10", slug: "hail", previous: "saudi5", next: "saudi4" },
  { id: "saudi-electronic:2026-10", slug: "saudi-electronic", previous: "saudi5", next: "saudi4" },
  { id: "umm-alqura:2026-10", slug: "umm-alqura", previous: "saudi5", next: "saudi4" },
  { id: "dar-alhekma:2026-10", slug: "dar-alhekma", previous: "saudi4", next: "saudi5" },
  { id: "almaarefa:2026-10", slug: "almaarefa", previous: "saudi5", next: "saudi4" },
  { id: "arab-open:2026-10", slug: "arab-open", previous: "saudi4", next: "aou4" },
];

/** The update this student still has to answer, or null. */
export function pendingSchemeUpdate(academic: AcademicInfo | null | undefined): SchemeUpdate | null {
  if (!academic?.universitySlug) return null;
  const update = SCHEME_UPDATES.find((u) => u.slug === academic.universitySlug);
  if (!update) return null;
  const chosen = academic.gpaSchemeId;
  if (chosen === "custom" || chosen === "percentage" || chosen === update.next) return null;
  return academic.schemeUpdate?.id === update.id ? null : update;
}
