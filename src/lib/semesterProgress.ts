import type { Semester } from "@/types";
import { termEnded } from "./termCheck";

const coversDay = (term: { startDate: string | null; endDate: string | null }, today: string) =>
  !!term.startDate && !!term.endDate && term.startDate <= today && today <= term.endDate;

/** A term can be the student's chosen current term when it is the one running, or
 *  when no other term is running. Choosing a term that has not begun, or one
 *  that has ended, while another runs would leave the running term without its
 *  reminders (every reminder follows the current term): the dates decide then. */
export function canPinSemester(
  term: { id: string; startDate: string | null; endDate: string | null },
  semesters: readonly { id: string; startDate: string | null; endDate: string | null }[],
  today: string
): boolean {
  return coversDay(term, today) || !semesters.some((other) => other.id !== term.id && coversDay(other, today));
}

/** The current term follows its saved dates unless the student chose one that
 *  can still be chosen (canPinSemester); a choice stops holding once its term
 *  has ended and the next one is running. */
export function currentSemesterForDate<T extends {
  id: string; startDate: string | null; endDate: string | null; isActive: boolean;
}>(semesters: readonly T[], today: string, manualId?: string | null): T | null {
  if (!semesters.length) return null;
  const manual = manualId ? semesters.find((term) => term.id === manualId) : undefined;
  if (manual && canPinSemester(manual, semesters, today)) return manual;
  const byStart = (a: T, b: T) => (b.startDate ?? "").localeCompare(a.startDate ?? "") || a.id.localeCompare(b.id);
  const current = semesters.filter((term) => term.startDate && term.endDate &&
    term.startDate <= today && today <= term.endDate).sort(byStart);
  if (current.length) return current.find((term) => term.isActive) ?? current[0];
  const past = semesters.filter((term) => term.endDate && term.endDate < today).sort(byStart);
  if (past.length) return past[0];
  const future = semesters.filter((term) => term.startDate && term.startDate > today)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!) || a.id.localeCompare(b.id));
  return future[0] ?? semesters.find((term) => term.isActive) ?? semesters[0];
}

export function semesterForAward(
  awardedAt: number,
  semesters: readonly { id: string; startDate: string | null; endDate: string | null }[]
): string | null {
  if (!Number.isFinite(awardedAt)) return null;
  const date = new Date(awardedAt);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const matching = semesters.filter((term) => term.startDate && term.endDate &&
    term.startDate <= day && day <= term.endDate);
  if (matching.length > 1) return null;
  if (matching.length === 1) return matching[0].id;
  // A student may keep studying after a term's end while choosing Later.
  // Until the next term starts, that gap still belongs to the prior term.
  const preceding = semesters.filter((term) => term.startDate && term.endDate &&
    term.startDate <= day && term.endDate < day)
    .sort((a, b) => b.startDate!.localeCompare(a.startDate!));
  if (!preceding.length || (preceding.length > 1 &&
      preceding[0].startDate === preceding[1].startDate)) return null;
  const nextStart = semesters.filter((term) => term.startDate && term.startDate > preceding[0].startDate!)
    .map((term) => term.startDate!).sort()[0];
  return nextStart && day >= nextStart ? null : preceding[0].id;
}

/** A new term begins the day after the running one ends, confirmed dates or not,
 *  so two terms never share dates (and never the same university term). Only a
 *  term that has already ended lets the new one start today. */
export function nextSemesterDates(
  previousEnd: string,
  now = new Date()
): { startDate: string; endDate: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const previous = /^\d{4}-\d{2}-\d{2}$/.test(previousEnd) ? new Date(`${previousEnd}T00:00:00`) : null;
  const start = previous && Number.isFinite(+previous) && previous >= today
    ? new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 1)
    : today;
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 105);
  return { startDate: iso(start), endDate: iso(end) };
}

export function semesterEndPromptDue(
  semester: Semester,
  now: Date,
  dismissed: boolean,
  datesConfirmed: boolean
): boolean {
  return datesConfirmed && !dismissed && termEnded(semester, now);
}

/** Carry a term's old date-based week marks onto stable week positions. */
export function stablePlannerWeekMaps(
  progress: Record<string, unknown>,
  startDate: string | null,
  endDate: string | null
): { patch: Record<string, unknown>; changed: boolean } {
  if (!startDate || !endDate) return { patch: {}, changed: false };
  const prefix = `${startDate}:${endDate}:`;
  const keys = ["plannerCompletedWeeks", "plannerWeekIcons", "plannerWeekStrikes"] as const;
  const patch: Record<string, unknown> = {};
  let changed = false;
  for (const key of keys) {
    const source = progress[key];
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const current = source as Record<string, unknown>;
    const next = { ...current };
    for (const [oldKey, value] of Object.entries(current)) {
      if (!oldKey.startsWith(prefix)) continue;
      const weekStart = oldKey.slice(prefix.length);
      const index = /^\d+$/.test(weekStart)
        ? Number(weekStart)
        : Math.round((+new Date(`${weekStart}T00:00:00`) - +new Date(`${startDate}T00:00:00`)) / (7 * 864e5));
      if (!Number.isInteger(index) || index < 0 || index >= 40) continue;
      const stableKey = `week:${index}`;
      if (Object.prototype.hasOwnProperty.call(next, stableKey)) continue;
      next[stableKey] = value;
      changed = true;
    }
    if (next !== current) patch[key] = next;
  }
  return { patch, changed };
}

/** Older account preferences belong only to the active term being imported. */
export function prepareSemesterProgress(
  stored: Record<string, unknown>,
  compatibility: unknown,
  legacy: Record<string, unknown>,
  startDate: string | null,
  endDate: string | null
): { progress: Record<string, unknown>; savePatch: Record<string, unknown> | null } {
  const fallback = compatibility && typeof compatibility === "object" && !Array.isArray(compatibility)
    ? compatibility as Record<string, unknown> : {};
  const source = Object.keys(stored).length > 0 ? stored : fallback;
  let progress = source.semesterVersion === 1
    ? source : { ...legacy, ...source, semesterVersion: 1 };
  const stable = stablePlannerWeekMaps(progress, startDate, endDate);
  if (stable.changed) progress = { ...progress, ...stable.patch };
  return {
    progress,
    savePatch: source.semesterVersion === 1
      ? stable.changed ? stable.patch : null
      : progress,
  };
}

export function nextSemesterProgress(
  current: Record<string, unknown>,
  startingGpa: number,
  startingHours: number,
  academic: unknown,
  calendarType: string
): Record<string, unknown> {
  const confirmed = typeof current.cumulativeConfirmedAt === "string" &&
    typeof current.cumulativeEndGpa === "number" && Number.isFinite(current.cumulativeEndGpa) &&
    typeof current.cumulativeEndHours === "number" && Number.isFinite(current.cumulativeEndHours);
  return {
    semesterVersion: 1,
    cumulativeStartGpa: confirmed ? current.cumulativeEndGpa : startingGpa,
    cumulativeStartHours: confirmed ? current.cumulativeEndHours : startingHours,
    academic,
    semesterSettings: { calendarType },
  };
}

type TermShape = {
  id: string; startDate: string | null; endDate: string | null; isActive: boolean;
  progress: Record<string, unknown>;
};

/** Terms that could be an empty leftover copy of another one: not the current
 *  term, not the one being viewed, no saved progress of their own, and the
 *  exact dates of another term. Only these are worth checking for rows. */
export function duplicateSemesterCandidates(
  semesters: readonly TermShape[],
  keepId?: string | null
): string[] {
  const byDates = new Map<string, TermShape[]>();
  for (const term of semesters) {
    if (!term.startDate || !term.endDate) continue;
    const key = `${term.startDate}|${term.endDate}`;
    byDates.set(key, [...(byDates.get(key) ?? []), term]);
  }
  const out: string[] = [];
  for (const group of byDates.values()) {
    if (group.length < 2) continue;
    for (const term of group) {
      if (!term.isActive && term.id !== keepId && Object.keys(term.progress).length === 0) out.push(term.id);
    }
  }
  return out;
}

/** The empty copies to leave out of the term list. One term always stays
 *  visible for each set of dates, so a pair of empty copies never both vanish. */
export function hiddenDuplicateSemesters(
  semesters: readonly TermShape[],
  emptyIds: ReadonlySet<string>,
  keepId?: string | null
): Set<string> {
  const candidates = new Set(duplicateSemesterCandidates(semesters, keepId));
  const hidden = new Set<string>();
  const byDates = new Map<string, TermShape[]>();
  for (const term of semesters) {
    if (!term.startDate || !term.endDate) continue;
    const key = `${term.startDate}|${term.endDate}`;
    byDates.set(key, [...(byDates.get(key) ?? []), term]);
  }
  for (const group of byDates.values()) {
    const empties = group.filter((term) => candidates.has(term.id) && emptyIds.has(term.id));
    if (!empties.length) continue;
    const stays = group.length - empties.length;
    for (const term of stays > 0 ? empties : empties.slice(1)) hidden.add(term.id);
  }
  return hidden;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Why the dates typed for a new term cannot be used, or null when they can:
 *  both are required, the end may not come before the start, and the term may
 *  not share a day with another term of the account (so two terms never carry
 *  the same holidays or the same university term). The first overlapping term
 *  named is the current one when it is among them. */
export function semesterDatesProblem(
  startDate: string,
  endDate: string,
  others: readonly { name: string; startDate: string | null; endDate: string | null; isActive: boolean }[]
): { kind: "required" | "order" } | { kind: "overlap"; name: string } | null {
  if (!ISO_DAY.test(startDate) || !ISO_DAY.test(endDate)) return { kind: "required" };
  if (endDate < startDate) return { kind: "order" };
  const clash = others
    .filter((term) => term.startDate && term.endDate && term.startDate <= endDate && startDate <= term.endDate)
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.startDate!.localeCompare(b.startDate!))[0];
  return clash ? { kind: "overlap", name: clash.name } : null;
}

/** Teaching and finals weeks for a term typed by its dates: the whole span in
 *  weeks, two of them finals (none when the term is only a week or two long).
 *  Stays inside what the database accepts (1 to 52 teaching, 0 to 20 finals). */
export function semesterWeeks(startDate: string, endDate: string): { weeks: number; finalsWeeks: number } {
  const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 864e5) + 1;
  const total = Number.isFinite(days) ? Math.max(1, Math.ceil(days / 7)) : 1;
  const finalsWeeks = Math.min(2, total - 1);
  return { weeks: Math.min(52, Math.max(1, total - finalsWeeks)), finalsWeeks };
}
