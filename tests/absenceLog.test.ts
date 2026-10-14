// The raw absence log shown while the attendance calculation is suspended.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MissedEntry } from "@/types";
import { absenceLog, sumAbsenceLogs } from "@/lib/absenceLog";

const entry = (over: Partial<MissedEntry>): MissedEntry => ({ id: Math.random().toString(36), day: 0, minutes: 90, ...over });

test("full absences count as lectures with their minutes", () => {
  const log = absenceLog({ missedSessions: [entry({}), entry({ minutes: 50, excused: true })] });
  assert.deepEqual(log, { lectures: 2, minutes: 140, excused: 1, lates: 0, lateMinutes: 0 });
});

test("a late arrival stays late: never a lecture, only its minutes late", () => {
  const log = absenceLog({ missedSessions: [entry({ tardiness: 15 }), entry({ tardiness: 20 }), entry({})] });
  assert.deepEqual(log, { lectures: 1, minutes: 90, excused: 0, lates: 2, lateMinutes: 35 });
});

test("an empty or missing log is all zeros", () => {
  const zero = { lectures: 0, minutes: 0, excused: 0, lates: 0, lateMinutes: 0 };
  assert.deepEqual(absenceLog({ missedSessions: [] }), zero);
  assert.deepEqual(absenceLog({} as never), zero);
});

test("logs add up across courses", () => {
  const a = absenceLog({ missedSessions: [entry({})] });
  const b = absenceLog({ missedSessions: [entry({ minutes: 60, excused: true }), entry({ tardiness: 10 })] });
  assert.deepEqual(sumAbsenceLogs([a, b]), { lectures: 2, minutes: 150, excused: 1, lates: 1, lateMinutes: 10 });
});
