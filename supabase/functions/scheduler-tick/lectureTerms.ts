// supabase/functions/scheduler-tick/lectureTerms.ts
// Which term's lectures a student is reminded of today. Kept free of Deno APIs so
// tests can run it (tests/lectureTerms.test.ts).
//
// The term is decided by the DATES: the term that covers the student's today (on
// their own clock). Not by the is_active flag alone: that flag is only moved
// when the app is opened, so on the first day of a new term it would still point
// at the one that has just ended and the new term's first lectures would pass
// without a reminder. One term per student at most: when two overlapping terms
// both cover today, the active one wins, else the one that began last, so a
// lecture is never reminded twice.

export interface TermInfo {
  id: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
}

export function lectureTermByUser(
  entries: readonly { user_id: string; semester_id: string }[],
  termOf: ReadonlyMap<string, TermInfo>,
  dateOf: (userId: string) => string
): Map<string, string> {
  const covering = new Map<string, Set<string>>();
  for (const entry of entries) {
    const term = termOf.get(entry.semester_id);
    const date = dateOf(entry.user_id);
    if (!term?.start_date || !term.end_date || date < term.start_date || date > term.end_date) continue;
    if (!covering.has(entry.user_id)) covering.set(entry.user_id, new Set());
    covering.get(entry.user_id)!.add(term.id);
  }
  const chosen = new Map<string, string>();
  for (const [userId, ids] of covering) {
    const terms = [...ids].map((id) => termOf.get(id)!);
    terms.sort((a, b) =>
      Number(b.is_active) - Number(a.is_active) ||
      (b.start_date ?? '').localeCompare(a.start_date ?? '') ||
      a.id.localeCompare(b.id));
    chosen.set(userId, terms[0].id);
  }
  return chosen;
}
