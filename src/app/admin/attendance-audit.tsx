"use client";

// Attendance audit — every attendance % the app shows, with ALL the inputs that
// produced it, so the maths can be checked by hand. admin_attendance_audit()
// returns the raw rows (active semester, courses, weekly sessions, logged
// absences, the semester prefs); they are rebuilt into the app's own
// Semester/Course shapes exactly like the store does on load, then run through
// the SAME attendanceInfo() the student's screen uses — so the % here can never
// drift from what they see.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase, useC, useS, SectionHeader, Loading, ErrorBanner, fmtNum, useDebounce } from "./_lib";
import { attendanceInfo, courseLimit, type AttendanceInfo } from "@/lib/grades";
import { resolveTardinessRule } from "@/lib/tardiness";
import { weekdayFromIso } from "@/lib/db";
import { sanitizeCustomHolidays } from "@/store";
import { holidayCalendar } from "@/lib/universityCountry";
import { registerPublishedCalendar } from "@/lib/countryHolidays";
import { calendarFromRow, type CalendarRow } from "@/lib/publishedCalendars";
import type { Course, Semester } from "@/types";

export interface AuditRecord {
  user_id: string;
  email: string | null;
  semester: { name: string; teaching_weeks: number; finals_weeks: number; start_date: string | null; end_date: string | null };
  prefs: Record<string, unknown>;
  courses: {
    id: string; name: string; credits: number | string;
    attendance_limit: number | string | null; attendance_mode: string | null; per_lecture_pct: number | string | null;
    sessions: { id: string; day: number; minutes: number | null }[];
    absences: { id: string; date: string | null; minutes: number | null; excused: boolean | null; tardiness: number | null }[];
  }[];
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Rebuild the app's Semester exactly as the store does on load (sem row wins
 *  for weeks + dates; the rest comes from preferences). */
function toSemester(r: AuditRecord): Semester {
  const p = r.prefs ?? {};
  const str = (v: unknown, fb: string) => (typeof v === "string" && v ? v : fb);
  return {
    name: r.semester.name,
    startDate: str(r.semester.start_date, str(p.startDate, "")),
    endDate: str(r.semester.end_date, str(p.endDate, "")),
    calendarType: "gregorian",
    gradingSystem: "saudi5",
    weeks: r.semester.teaching_weeks,
    finalsWeeks: r.semester.finals_weeks,
    withdrawalLimit: typeof p.withdrawalLimit === "number" ? p.withdrawalLimit : 25,
    ...(typeof p.tardinessRuleId === "string" ? { tardinessRuleId: p.tardinessRuleId } : {}),
    ...(typeof p.customTardinessThreshold === "number" ? { customTardinessThreshold: p.customTardinessThreshold } : {}),
    ...(typeof p.customTardiesPerAbsence === "number" ? { customTardiesPerAbsence: p.customTardiesPerAbsence } : {}),
    dismissedHolidays: Array.isArray(p.dismissedHolidays)
      ? (p.dismissedHolidays as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    customHolidays: sanitizeCustomHolidays(p.customHolidays),
  };
}

function toCourse(c: AuditRecord["courses"][number]): Course {
  return {
    id: c.id,
    name: c.name,
    creditHours: Number(c.credits) || 0,
    attendanceLimit: Number(c.attendance_limit) || 0,
    attendanceMode: c.attendance_mode === "lecture" ? "lecture" : "hour",
    perLecturePct: c.per_lecture_pct != null ? Number(c.per_lecture_pct) : undefined,
    sessions: c.sessions.map((s) => ({ id: s.id, day: s.day, minutes: s.minutes ?? 0, notes: [] })),
    missedLectures: 0,
    missedSessions: c.absences.map((a) => ({
      id: a.id,
      day: weekdayFromIso(a.date),
      minutes: Number(a.minutes) || 0,
      date: a.date ?? undefined,
      excused: a.excused ?? false,
      tardiness: a.tardiness != null ? Number(a.tardiness) : undefined,
    })),
    components: [],
  };
}

interface Row {
  rec: AuditRecord;
  sem: Semester;
  raw: AuditRecord["courses"][number];
  course: Course;
  att: AttendanceInfo | null;
}

function buildRows(records: AuditRecord[]): Row[] {
  const rows: Row[] = [];
  for (const rec of records) {
    const sem = toSemester(rec);
    // Same holidays as the student's own screen: their university's calendar,
    // or its country's (lib/universityCountry).
    const calendar = holidayCalendar({
      universitySlug: typeof rec.prefs?.universitySlug === "string" ? rec.prefs.universitySlug : null,
      universityName: typeof rec.prefs?.universityName === "string" ? rec.prefs.universityName : "",
    });
    for (const raw of rec.courses) {
      const course = toCourse(raw);
      rows.push({ rec, sem, raw, course, att: attendanceInfo(course, sem, calendar) });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Section (all users)
// ---------------------------------------------------------------------------
export function AttendanceAuditSection({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const C = useC();
  const S = useS();
  const [records, setRecords] = useState<AuditRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [onlyAbsences, setOnlyAbsences] = useState(true);
  const [q, setQ] = useState("");
  const query = useDebounce(q, 250);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    // Calendars published from the admin page, so each student's holidays match
    // their app (best-effort: without them the country's list is used).
    const cals = await supabase.from("university_calendars").select("*");
    for (const r of (cals.data ?? []) as CalendarRow[]) registerPublishedCalendar(r.key, calendarFromRow(r));
    const { data, error: e } = await supabase.rpc("admin_attendance_audit", { p_user: null });
    if (e) setError(e.message);
    else setRecords((data as AuditRecord[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!records) return [];
    const needle = query.trim().toLowerCase();
    return records
      .filter((r) => !needle || (r.email ?? "").toLowerCase().includes(needle))
      .map((r) => (onlyAbsences ? { ...r, courses: r.courses.filter((c) => c.absences.length > 0) } : r))
      .filter((r) => r.courses.length > 0);
  }, [records, query, onlyAbsences]);

  const totals = useMemo(() => {
    const rows = records ? buildRows(records) : [];
    return {
      users: records?.length ?? 0,
      courses: rows.length,
      withAbsences: rows.filter((r) => r.raw.absences.length > 0).length,
      danger: rows.filter((r) => r.att?.status === "danger").length,
      warn: rows.filter((r) => r.att?.status === "warn").length,
      noSessions: rows.filter((r) => !r.att).length,
    };
  }, [records]);

  if (loading && !records) return <Loading text="Loading attendance…" />;

  return (
    <div>
      <SectionHeader
        title="Attendance audit"
        action={
          <button onClick={() => void load()} className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}>
            {loading ? "…" : "↻ Refresh"}
          </button>
        }
      />
      {error && <ErrorBanner message={error} onRetry={load} />}

      {records && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Mini label="Users with courses" value={totals.users} />
            <Mini label="Courses" value={totals.courses} />
            <Mini label="Courses with absences" value={totals.withAbsences} />
            <Mini label="At / over limit" value={totals.danger} tone={totals.danger ? C.danger : undefined} />
            <Mini label="Approaching limit" value={totals.warn} tone={totals.warn ? C.warning : undefined} />
          </div>
          <p className="text-[12px]" style={{ color: C.textFaint }}>
            Every % below is computed by the app&apos;s own attendanceInfo() from the inputs shown — click a course row to see each weekly session and every logged absence.
            {totals.noSessions > 0 && ` ${fmtNum(totals.noSessions)} courses have no weekly sessions, so the app can't compute a % for them ("—").`}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email…" style={{ ...S.input, maxWidth: 320 }} />
            <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: C.textMuted }}>
              <input type="checkbox" checked={onlyAbsences} onChange={(e) => setOnlyAbsences(e.target.checked)} />
              Only courses with logged absences
            </label>
          </div>

          <AttendanceAuditView records={filtered} onOpenUser={onOpenUser} />
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const C = useC();
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: tone ? C.tint(tone, "44") : C.border, background: tone ? C.tint(tone, "11") : C.panel }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.textDim }}>{label}</div>
      <div className="text-[22px] font-bold leading-none tabular-nums" style={{ color: tone ?? C.text }}>{fmtNum(value)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table (shared with the per-user detail page)
// ---------------------------------------------------------------------------
export function AttendanceAuditView({
  records, onOpenUser,
}: { records: AuditRecord[]; onOpenUser?: (id: string) => void }) {
  const C = useC();
  const S = useS();
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(
    () => records.map((rec) => ({ rec, rows: buildRows([rec]) })),
    [records]
  );

  const cols = ["Course", "Method", "Limit", "Weekly", "Term total", "Holidays off", "Absences", "Counted", "1 unit =", "Absence %", "Left"];
  const statusTone = (s?: string) => (s === "danger" ? C.danger : s === "warn" ? C.warning : C.success);

  if (groups.length === 0) {
    return <p className="rounded-xl border p-8 text-center text-[13px]" style={{ borderColor: C.border, color: C.textFaint }}>No courses match.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
      <table className="w-full text-[12.5px]">
        <thead><tr>{cols.map((h) => <th key={h} style={{ ...S.tableHead, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
        <tbody>
          {groups.map(({ rec, rows }) => {
            const sem = rows[0]?.sem;
            const rule = resolveTardinessRule(sem);
            const custom = sem?.customHolidays?.length ?? 0;
            const dismissed = sem?.dismissedHolidays?.length ?? 0;
            return (
              <Fragment key={rec.user_id}>
                {/* Per-user semester inputs shared by all their courses */}
                <tr style={{ background: C.mode === "light" ? C.panel2 : C.border }}>
                  <td colSpan={cols.length} style={{ ...S.tableCell, paddingTop: 10, paddingBottom: 10 }}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {onOpenUser ? (
                        <button onClick={() => onOpenUser(rec.user_id)} className="font-semibold underline-offset-2 hover:underline" style={{ color: C.primary, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                          {rec.email ?? "—"}
                        </button>
                      ) : (
                        <span className="font-semibold" style={{ color: C.text }}>Semester inputs</span>
                      )}
                      <Kv k="Teaching weeks" v={rec.semester.teaching_weeks} />
                      <Kv k="Dates" v={`${sem?.startDate || "—"} → ${sem?.endDate || "—"}`} />
                      <Kv k="Default limit" v={`${sem?.withdrawalLimit ?? 25}%`} />
                      <Kv k="Tardiness rule" v={rule.id} />
                      <Kv k="University" v={(rec.prefs?.universityName as string) || (rec.prefs?.universitySlug as string) || "—"} />
                      <Kv k="Holidays" v={`${custom} custom · ${dismissed} dismissed`} />
                    </div>
                  </td>
                </tr>
                {rows.map(({ raw, course, att }) => {
                  const key = `${rec.user_id}:${raw.id}`;
                  const full = raw.absences.filter((a) => !a.excused && !(a.tardiness && a.tardiness > 0)).length;
                  const excused = raw.absences.filter((a) => a.excused).length;
                  const tardies = raw.absences.filter((a) => !a.excused && a.tardiness && a.tardiness > 0).length;
                  const weeklyMin = course.sessions.reduce((s, x) => s + x.minutes, 0);
                  const isOpen = open === key;
                  return (
                    <Fragment key={key}>
                      <tr className="admin-hover-row" onClick={() => setOpen(isOpen ? null : key)} style={{ cursor: "pointer" }}>
                        <td style={{ ...S.tableCell, fontWeight: 500 }}>
                          <span className="me-1.5" style={{ color: C.textFaint }}>{isOpen ? "▾" : "▸"}</span>
                          <span dir="auto">{raw.name}</span>
                        </td>
                        <td style={S.tableCell}>{att?.mode ?? course.attendanceMode}</td>
                        <td style={S.tableCell}>
                          {courseLimit(course, sem)}%
                          <span className="ms-1 text-[10px]" style={{ color: C.textFaint }}>{course.attendanceLimit ? "course" : "default"}</span>
                        </td>
                        <td style={{ ...S.tableCell, whiteSpace: "nowrap" }}>{course.sessions.length} × · {weeklyMin} min</td>
                        <td style={{ ...S.tableCell, whiteSpace: "nowrap" }}>
                          {att ? (att.mode === "lecture"
                            ? `${att.totalLectures} lectures`
                            : `${fmtNum(att.totalMinutes)} min`) : "—"}
                          {att && <span className="ms-1 text-[10px]" style={{ color: C.textFaint }}>{att.weeks} wk</span>}
                        </td>
                        <td style={{ ...S.tableCell, color: C.textDim }}>{att ? `${fmtNum(att.holidayMinutesOff)} min` : "—"}</td>
                        <td style={{ ...S.tableCell, whiteSpace: "nowrap" }}>
                          {full} full
                          {excused > 0 && <span style={{ color: C.textDim }}> · {excused} excused</span>}
                          {tardies > 0 && <span style={{ color: C.textDim }}> · {tardies} late</span>}
                        </td>
                        <td style={{ ...S.tableCell, whiteSpace: "nowrap" }}>
                          {att ? (att.mode === "lecture"
                            ? `${att.missedLectures} lectures`
                            : `${fmtNum(att.missedMinutes)} min`) : "—"}
                          {att && att.tardinessMinutes > 0 && <span className="ms-1 text-[10px]" style={{ color: C.textFaint }}>incl. {att.tardinessMinutes} from lates</span>}
                        </td>
                        <td style={{ ...S.tableCell, color: C.textDim }}>
                          {att ? `${r2(att.unit)}%` : "—"}
                          {att?.mode === "lecture" && course.perLecturePct ? <span className="ms-1 text-[10px]" style={{ color: C.textFaint }}>manual</span> : null}
                        </td>
                        <td style={{ ...S.tableCell, fontWeight: 700, color: att ? statusTone(att.status) : C.textFaint }}>
                          {att ? `${r1(att.absence)}%` : "—"}
                        </td>
                        <td style={{ ...S.tableCell, color: C.textDim, whiteSpace: "nowrap" }}>
                          {att ? (att.mode === "lecture" ? `${att.lecturesRemaining} lectures` : `${r1(att.hoursRemaining)} h`) : "—"}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={cols.length} style={{ ...S.tableCell, background: C.mode === "light" ? C.panel2 : C.panel }}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.textDim }}>Weekly sessions</div>
                                {course.sessions.length === 0 ? (
                                  <span style={{ color: C.textFaint }}>None — no % can be computed.</span>
                                ) : course.sessions.map((s) => (
                                  <div key={s.id} className="tabular-nums">{DAY[s.day] ?? s.day} · {s.minutes} min</div>
                                ))}
                                {att && (
                                  <div className="mt-2 text-[12px]" style={{ color: C.textDim }}>
                                    {weeklyMin} min/wk × {att.weeks} wk − {fmtNum(att.holidayMinutesOff)} holiday min = <b style={{ color: C.text }}>{fmtNum(att.totalMinutes)} min</b>
                                    {" · "}{course.sessions.length}/wk × {att.weeks} − holiday lectures = <b style={{ color: C.text }}>{att.totalLectures} lectures</b>
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.textDim }}>Logged absences</div>
                                {raw.absences.length === 0 ? (
                                  <span style={{ color: C.textFaint }}>None.</span>
                                ) : raw.absences.map((a) => (
                                  <div key={a.id} className="tabular-nums">
                                    {a.date ?? "—"} · {a.minutes ?? 0} min
                                    {a.excused && <span style={{ color: C.success }}> · excused</span>}
                                    {!a.excused && a.tardiness ? <span style={{ color: C.warning }}> · late {a.tardiness} min</span> : null}
                                  </div>
                                ))}
                                {att && (
                                  <div className="mt-2 text-[12px]" style={{ color: C.textDim }}>
                                    {att.mode === "lecture"
                                      ? <>{att.missedLectures} lectures × {r2(att.unit)}% = <b style={{ color: C.text }}>{r1(att.absence)}%</b></>
                                      : <>{fmtNum(att.missedMinutes)} ÷ {fmtNum(att.totalMinutes)} min × 100 = <b style={{ color: C.text }}>{r1(att.absence)}%</b></>}
                                    {" "}vs limit {att.limit}% → <b style={{ color: statusTone(att.status) }}>{att.status}</b>
                                    {att.excusedMinutes > 0 && ` · ${fmtNum(att.excusedMinutes)} excused min (counted)`}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string | number }) {
  const C = useC();
  return (
    <span className="text-[12px]" style={{ color: C.textDim }}>
      {k}: <span dir="auto" style={{ color: C.text }}>{v}</span>
    </span>
  );
}
