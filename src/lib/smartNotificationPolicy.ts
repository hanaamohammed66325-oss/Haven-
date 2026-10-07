import type { Suggestion } from './smartSuggestions';
import type { Semester } from '@/types';
import { toISODate } from './dates';
import { daysUntil } from './upcoming';

export interface SmartCandidate { key: string; kind: string; body: string; cooldownDays: number }
/** Notification cadence is about the event, never the date the app opened. */
export function smartCandidates(items: Suggestion[], semester: Semester, now: Date): SmartCandidate[] {
  const term = `${semester.startDate}:${semester.endDate}`;
  return items.flatMap((item): SmartCandidate[] => {
    if (['att-warn', 'att-danger', 'all-good', 'checkin'].includes(item.kind)) return [];
    let stage = '';
    if (item.kind === 'exam' || item.kind === 'task') {
      const date = item.id.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      const days = date ? daysUntil(date, now) : item.id === 'tasks-tomorrow-many' ? 1 : null;
      if (days !== 0 && days !== 1) return [];
      stage = `:${date ?? toISODate(now)}:${days === 0 ? 'today' : 'tomorrow'}`;
    }
    return [{ key: `smart2:${term}:${item.id}${stage}`, kind: item.kind, body: item.text,
      cooldownDays: ['ungraded', 'gpa-goal'].includes(item.kind) ? 7 : 0 }];
  }).slice(0,100);
}
