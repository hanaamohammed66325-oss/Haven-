export interface WeeklyMeeting { id: string; day: number; time?: string | null }

/** Sort by the next local occurrence, including the transition to a new week. */
export function upcomingMeetings<T extends WeeklyMeeting>(sessions: readonly T[], now: Date): { session: T; date: Date }[] {
  return sessions.flatMap(session => {
    if (!Number.isInteger(session.day) || session.day < 0 || session.day > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(session.time ?? '')) return [];
    const [hour, minute] = session.time!.split(':').map(Number);
    const date = new Date(now);
    date.setDate(now.getDate() + (session.day - now.getDay() + 7) % 7);
    date.setHours(hour, minute, 0, 0);
    if (date.getTime() < now.getTime()) date.setDate(date.getDate() + 7);
    return [{ session, date }];
  }).sort((a, b) => a.date.getTime() - b.date.getTime());
}
