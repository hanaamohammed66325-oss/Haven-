// ---------------------------------------------------------------------------
// Absence alerts: one notification per level, never a daily repeat.
//
// The levels follow the student's own rule: the university's official warning
// levels when it has them (e.g. 5% / 10% / 15%), otherwise 40%, 60% and 80% of
// the student's limit (10% / 15% / 20% of a 25% limit); then one alert on
// denial. Each level has a stable key that carries the rule's own limits (every
// cap that can deny), so a changed limit starts fresh levels; the server sends
// a key only once (sync_absence_alerts). Pure: reads the same figures as the
// course page (attendanceInfo), changes none.
// ---------------------------------------------------------------------------

import type { Course, Semester } from "@/types";
import { attendanceInfo, courseRule } from "./grades";

/** Shares of the limit alerted at when the rule has no official warning levels. */
export const LIMIT_SHARES = [0.4, 0.6, 0.8];

const EPS = 1e-9;

export interface AbsenceLevel {
  /** stable per course and level: the notification goes out once per key */
  key: string;
  /** over the limit (denial) */
  denied: boolean;
  /** the absence figure and the cap it's measured against, in % */
  absence: number;
  limit: number;
  /** the figure is absence without an accepted excuse */
  unexcused: boolean;
}

/** The highest alert level a course has reached, or null: no level yet, or the
 *  rule is unknown (no percentage, so nothing to alert on). */
export function absenceLevel(c: Course, sem?: Semester, calendar?: string | null): AbsenceLevel | null {
  const att = attendanceInfo(c, sem, calendar);
  if (!att || !att.limitKnown || !(att.limit > 0)) return null;
  const rule = courseRule(c, sem);
  const main = { absence: att.absence, limit: att.limit, unexcused: att.limitIsUnexcused };
  // Beside a total cap there can be a second, lower cap on unexcused absence
  // (15% unexcused / 25% total); either one can deny.
  const second =
    att.unexcusedLimit != null && att.unexcusedLimit > 0
      ? { absence: att.unexcusedAbsence, limit: att.unexcusedLimit, unexcused: true }
      : null;
  // `att-<course>-<rule>-<level>`, the rule being every cap that can deny, as
  // the rule states it (not rounded for display): l25 = the main limit (u: it
  // counts unexcused absence only), x15 = the second cap, i = denied on
  // reaching the limit. A changed cap is a new rule, so its levels are new; the
  // absence figure and the date are never in the key (no daily repeat).
  const ruleId = `l${String(main.limit)}${main.unexcused ? "u" : ""}${second ? `x${String(second.limit)}` : ""}${rule.inclusive ? "i" : ""}`;
  const key = (level: string) => `att-${c.id}-${ruleId}-${level}`;

  if (att.status === "danger") return { key: key("denied"), denied: true, ...main };

  // Official warning levels, measured on the same figure as the main limit.
  const warnings = rule.warnings.filter((w) => w > 0 && w < att.limit).sort((a, b) => b - a);
  if (warnings.length) {
    const w = warnings.find((v) => att.absence >= v - EPS);
    return w == null ? null : { key: key(`w${String(w)}`), denied: false, ...main };
  }

  // Shares of the limit, on whichever cap is further along (x: the second cap).
  const onSecond = second != null && second.absence / second.limit > main.absence / main.limit;
  const fig = onSecond && second ? second : main;
  const share = [...LIMIT_SHARES].reverse().find((s) => fig.absence >= s * fig.limit - EPS);
  return share == null
    ? null
    : { key: key(`${onSecond ? "x" : ""}p${Math.round(share * 100)}`), denied: false, ...fig };
}
