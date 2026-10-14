// The student's own absence record for one course, with no rule applied.
// While the attendance calculation is suspended (featureFlags) this is all a
// student sees: what they logged, never a percentage against a limit. Late
// arrivals stay late arrivals; no tardiness rule turns them into absences.

import type { Course } from "@/types";

export interface AbsenceLog {
  /** logged full absences (excused included) */
  lectures: number;
  /** minutes of those full absences */
  minutes: number;
  /** the excused part of `lectures` */
  excused: number;
  /** logged late arrivals */
  lates: number;
  /** minutes late, summed over `lates` */
  lateMinutes: number;
}

export function absenceLog(c: Pick<Course, "missedSessions">): AbsenceLog {
  const log: AbsenceLog = { lectures: 0, minutes: 0, excused: 0, lates: 0, lateMinutes: 0 };
  for (const m of c.missedSessions ?? []) {
    const late = Number(m.tardiness) || 0;
    if (late > 0) {
      log.lates++;
      log.lateMinutes += late;
      continue;
    }
    log.lectures++;
    log.minutes += Number(m.minutes) || 0;
    if (m.excused) log.excused++;
  }
  return log;
}

/** The logs of several courses added together. */
export function sumAbsenceLogs(logs: AbsenceLog[]): AbsenceLog {
  const out: AbsenceLog = { lectures: 0, minutes: 0, excused: 0, lates: 0, lateMinutes: 0 };
  for (const l of logs) {
    out.lectures += l.lectures;
    out.minutes += l.minutes;
    out.excused += l.excused;
    out.lates += l.lates;
    out.lateMinutes += l.lateMinutes;
  }
  return out;
}
