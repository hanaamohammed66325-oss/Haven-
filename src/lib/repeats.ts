// Repeated courses — a course the student already took, retaken this term.
//
// How the earlier attempt counts in the cumulative GPA depends on the
// university:
//   • Saudi universities follow the national study regulations (checked
//     against Qassim, King Abdulaziz, Umm Al-Qura and Taif): a FAILED course is
//     retaken and both attempts count (the cumulative GPA covers every course
//     studied); a PASSED course can only be retaken when the college assigns it
//     to bring the GPA up to the graduation minimum (Article 42) — then the
//     higher grade counts and the GPA can't rise above that minimum.
//   • Elsewhere it varies (Jordan and Kuwait count the higher grade, others the
//     latest or both), so the student tells us (AcademicInfo.repeatPolicy). A
//     rule we don't offer is described in words ("other"), reported to the
//     admin to add as a real option, and counted as "both" meanwhile.
// The earlier attempt's points and hours are taken out of the cumulative GPA
// the student entered, before this term is added.

import type { AcademicInfo, Course, RepeatInfo, RepeatPolicy } from "@/types";
import { isSaudiUniversity, isWithdrawn, pointsForOfficial, type GradeScheme } from "./gradeSchemes";
import { coursePoints } from "./grades";

/** Validate the stored preferences.repeats blob ({ term, courses }); repeats
 *  from another semester are dropped so a new term starts fresh. */
export function readRepeats(raw: unknown, term: string): Record<string, RepeatInfo> {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!r || r.term !== term || !r.courses || typeof r.courses !== "object") return {};
  const out: Record<string, RepeatInfo> = {};
  for (const [id, g] of Object.entries(r.courses as Record<string, unknown>).slice(0, 40)) {
    const o = g && typeof g === "object" ? (g as Record<string, unknown>) : null;
    if (!o) continue;
    const info: RepeatInfo = {};
    if (o.kind === "failed" || o.kind === "raise") info.kind = o.kind;
    if (typeof o.letter === "string" && o.letter) info.letter = o.letter.slice(0, 24);
    else if (typeof o.mark === "number" && o.mark >= 0 && o.mark <= 100) info.mark = o.mark;
    out[id] = info; // a repeat whose earlier grade wasn't given is still a repeat
  }
  return out;
}

/** Attach each repeated course's earlier attempt to the course. */
export function withRepeats(courses: Course[], repeats: Record<string, RepeatInfo>): Course[] {
  if (!Object.keys(repeats).length) return courses;
  return courses.map((c) => (repeats[c.id] ? { ...c, repeat: repeats[c.id] } : c));
}

export type RepeatMode = Exclude<RepeatPolicy, "other">;

/** Which attempt counts for this repeat at this student's university. */
export function repeatMode(info: RepeatInfo, academic: AcademicInfo | null | undefined): RepeatMode {
  if (isSaudiUniversity(academic)) return info.kind === "raise" ? "higher" : "both";
  const p = academic?.repeatPolicy;
  return p === "higher" || p === "latest" ? p : "both";
}

export interface RepeatAdjust {
  /** quality points and hours taken out of the entered cumulative GPA */
  points: number;
  hours: number;
  /** the highest the cumulative GPA can reach (Saudi Article 42), or null */
  cap: number | null;
}

export const NO_ADJUST: RepeatAdjust = { points: 0, hours: 0, cap: null };

/**
 * How repeated courses change the cumulative GPA the student entered.
 *   • both   → nothing: the old attempt stays and the new one is added;
 *   • latest → the old attempt comes out;
 *   • higher → the old attempt comes out, unless it beats the new grade — then
 *     the new one is the one dropped (taking out the lower of the two does both).
 * A repeat whose earlier grade wasn't given can't be removed, so it's skipped.
 */
export function repeatAdjust(
  courses: Course[],
  scheme: GradeScheme,
  academic: AcademicInfo | null | undefined
): RepeatAdjust {
  let points = 0,
    hours = 0,
    raise = false;
  for (const c of courses) {
    // Withdrawn from the retake: the earlier attempt stays as it was.
    if (!c.repeat || isWithdrawn(c.official)) continue;
    const mode = repeatMode(c.repeat, academic);
    if (mode === "both") continue;
    const old = pointsForOfficial(scheme, c.repeat);
    const h = Number(c.creditHours) || 0;
    if (old == null || !(h > 0)) continue;
    const now = mode === "higher" ? coursePoints(c, scheme) : null;
    points += (now == null ? old : Math.min(old, now)) * h;
    hours += h;
    if (c.repeat.kind === "raise") raise = true;
  }
  const min = academic?.gradMinGpa;
  return { points, hours, cap: raise && min && min > 0 ? min : null };
}
