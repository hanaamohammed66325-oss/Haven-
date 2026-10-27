/** Match saved university terms to the semester being viewed, not the clock. */
export function termForSemester<T extends { start?: string; end?: string }>(
  terms: readonly T[],
  semester: { startDate: string; endDate: string } | null | undefined,
): T | null {
  if (!semester || !/^\d{4}-\d{2}-\d{2}$/.test(semester.startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(semester.endDate) || semester.endDate < semester.startDate) return null;
  let selected: T | null = null;
  let overlap = 0;
  for (const term of terms) {
    const start = term.start ?? term.end;
    const end = term.end ?? term.start;
    if (!start || !end) continue;
    const first = start > semester.startDate ? start : semester.startDate;
    const last = end < semester.endDate ? end : semester.endDate;
    if (last < first) continue;
    const days = (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 864e5 + 1;
    if (days > overlap) {
      selected = term;
      overlap = days;
    }
  }
  return selected;
}
