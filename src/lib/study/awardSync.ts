import type { PendingStudyAward } from "./types";
type Preferences = Record<string, unknown>;
/** A small testable boundary around the two-device compare-and-swap protocol. */
export async function syncEarnedAwards(io: {
  active: () => boolean;
  pending: () => Promise<PendingStudyAward[]>;
  read: () => Promise<Preferences>;
  project: (prefs: Preferences, awards: PendingStudyAward[]) => Preferences;
  apply: (ids: string[], expected: Preferences, projection: Preferences) => Promise<{ ok: boolean; preferences: Preferences }>;
  accept: (prefs: Preferences) => void;
}): Promise<boolean> {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!io.active()) return false;
      const awards = (await io.pending()).slice(0, 200);
      if (!io.active()) return false;
      const prefs = await io.read();
      if (!io.active()) return false;
      if (!awards.length) { io.accept(prefs); return true; }
      const projection = io.project(prefs, awards);
      if (!io.active()) return false;
      const result = await io.apply(awards.map((a) => a.id), {
        pomodoroStats: prefs.pomodoroStats ?? null, gamification: prefs.gamification ?? null,
      }, projection);
      if (!io.active()) return false;
      if (!result.ok) continue;
      io.accept(result.preferences);
      return true;
    }
  } catch { /* The ledger is durable; caller offers retry on network failure. */ }
  return false;
}
