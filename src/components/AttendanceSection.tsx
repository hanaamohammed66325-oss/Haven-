"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useStore, type MutationResult } from "@/store";
import { useT } from "@/i18n";
import { AttendanceBadge } from "./AttendanceBadge";
import { attendanceInfo, fmtPct, ruleMode, STATUS_COLOR } from "@/lib/grades";
import { formatDuration } from "@/lib/format";
import { toEnglishDigits, formatLongDate } from "@/lib/dates";
import { AttendanceApproxNote } from "./AttendanceApproxNote";
import { ATTENDANCE_CALC_SUSPENDED } from "@/lib/featureFlags";
import { absenceLog } from "@/lib/absenceLog";
import type { Course } from "@/types";
import type { TranslationKey } from "@/i18n/translations/en";
import { holidayCalendar } from "@/lib/universityCountry";

/** Sanitise the manual "% per lecture" box: Arabic or ASCII digits with one
 *  optional decimal, clamped to (0, 100]. Anything else (a sign, letters, an
 *  empty box) → undefined, which means "auto" (an even split). Blocks negatives
 *  and nonsense so a bad value can never drive the حرمان math. */
function sanitizePct(raw: string): number | undefined {
  const s = toEnglishDigits(raw).replace(/[^0-9.]/g, "");
  if (s === "") return undefined;
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(100, n);
}


export function AttendanceSection({ course }: { course: Course }) {
  const { t, lang } = useT();
  const {
    semester,
    academic,
    updateCourse,
    addMissedSession,
    removeMissedSession,
  } = useStore();

  // While the calculation is suspended the section shows only the raw log.
  const att = ATTENDANCE_CALC_SUSPENDED ? null : attendanceInfo(course, semester, holidayCalendar(academic));
  const log = absenceLog(course);
  const mode = course.attendanceMode ?? "hour";
  // The rule the student took on counts differently from this course.
  const termMode = ruleMode(semester);
  const offRule = termMode != null && termMode !== mode;
  const border = { borderColor: "var(--color-border)" };
  // Surfaced when a cloud-backed add fails, so it isn't a silent no-op.
  const [addError, setAddError] = useState("");
  const runAdd = async (p: Promise<MutationResult>) => {
    setAddError("");
    const res = await p;
    if (!res.ok) setAddError(t("saveError"));
  };

  const hUnit = t("hoursUnit");
  const mUnit = t("minutesUnit");
  const dayLabel = (d: number) => t(`day${d}` as TranslationKey);
  const dur = (minutes: number) => formatDuration(minutes, hUnit, mUnit);

  return (
    <div className="px-5 sm:px-8 py-6 border-t" style={border}>
      {/* Heading + status */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <span className="haven-label" style={{ color: "var(--color-ink)" }}>
            {t("attendanceEditor")}
          </span>
          {att?.limitKnown && <AttendanceBadge status={att.status} explain limit={att.limit} atLimit={att.atLimit} />}
        </div>
        {ATTENDANCE_CALC_SUSPENDED && (
          <div className="text-right rtl:text-left">
            <span className="font-display text-lg leading-none" style={{ color: "var(--color-ink)" }}>
              {log.lectures === 0 ? t("attLog_none") : t("attLog_summary", { n: log.lectures, h: dur(log.minutes) })}
            </span>
            {log.lates > 0 && (
              <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                {t("attLog_latesLine", { n: log.lates, m: dur(log.lateMinutes) })}
              </div>
            )}
          </div>
        )}
        {att && !att.limitKnown && (
          <div className="text-right rtl:text-left">
            <span className="font-display text-lg leading-none" style={{ color: "var(--color-ink)" }}>
              {t("attMissedLectures", { n: att.missedLectures })}
            </span>
          </div>
        )}
        {att?.limitKnown && (
          <div className="text-right rtl:text-left">
            <span
              className="font-display text-2xl leading-none"
              style={{ color: STATUS_COLOR[att.status] }}
            >
              {fmtPct(att.absence)}%
            </span>
            <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
              {t(att.mode === "lecture" ? "eachLecture" : "eachHour", {
                pct: fmtPct(att.unit),
              })}{" "}
              · {t("attLimitShort", { n: fmtPct(att.limit) })}
            </div>
            {att.unexcusedLimit != null && (
              <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                {t("attUnexcusedLine", { pct: fmtPct(att.unexcusedAbsence), limit: fmtPct(att.unexcusedLimit) })}
              </div>
            )}
            {att.excusedPct > 0 && !att.limitIsUnexcused && (
              <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                {t("attExcusedShare", { pct: fmtPct(att.excusedPct) })}
              </div>
            )}
          </div>
        )}
      </div>
      {att && <AttendanceApproxNote className="-mt-4 mb-6" compact />}

      {/* Counting method — per course. "By hour" weighs each session by length;
          "by lecture" counts every missed lecture equally, with an optional
          fixed per-lecture % for professors who set one. */}
      {!ATTENDANCE_CALC_SUSPENDED && <div className="mb-6 flex flex-col gap-2">
        <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
          {t("attMethodLabel")}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-xl p-1"
            style={{ background: "var(--color-primary-soft)" }}
          >
            {(["hour", "lecture"] as const).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => updateCourse(course.id, { attendanceMode: m })}
                  aria-pressed={active}
                  className="rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors"
                  style={
                    active
                      ? {
                          background: "var(--color-surface)",
                          color: "var(--color-primary)",
                          boxShadow: "var(--shadow-card)",
                        }
                      : { color: "var(--color-muted)" }
                  }
                >
                  {t(m === "hour" ? "attMethodHour" : "attMethodLecture")}
                </button>
              );
            })}
          </div>
          {mode === "lecture" && (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                inputMode="decimal"
                className="w-20 rounded-lg border px-2.5 py-1.5 text-sm text-center outline-none transition-colors focus:border-[var(--color-primary)]"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-ink)",
                }}
                placeholder={att ? fmtPct(att.unit) : t("perLecturePctPlaceholder")}
                value={
                  course.perLecturePct && course.perLecturePct > 0
                    ? String(course.perLecturePct)
                    : ""
                }
                onChange={(e) =>
                  updateCourse(course.id, { perLecturePct: sanitizePct(e.target.value) })
                }
                aria-label={t("perLecturePctLabel")}
              />
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {t("perLecturePctLabel")}
              </span>
            </div>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          {mode === "lecture" && att
            ? t("perLecturePctHint", { pct: fmtPct(100 / att.totalLectures) })
            : t("attMethodHint")}
        </p>
        {offRule && (
          <p className="text-xs rounded-lg px-3 py-2" style={{ color: "var(--color-ink)", background: "rgba(199,126,46,0.12)" }}>
            {t("attMethodOffRule", {
              rule: t(termMode === "lecture" ? "attMethodLecture" : "attMethodHour").toLowerCase(),
              course: t(mode === "lecture" ? "attMethodLecture" : "attMethodHour").toLowerCase(),
            })}
          </p>
        )}
      </div>}

      {/* Logging absence — tap a session to log its missed minutes */}
      {addError && (
        <span className="block mb-2 text-xs" style={{ color: "var(--color-danger)" }}>{addError}</span>
      )}
      {course.sessions.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <span className="text-sm font-medium block mb-2" style={{ color: "var(--color-ink)" }}>
              {t("logMissed")}
            </span>
            <div className="flex flex-wrap gap-2">
              {course.sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => runAdd(addMissedSession(course.id, s.id))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors hover:opacity-80"
                  style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
                >
                  <Plus size={12} />
                  {dayLabel(s.day)} ({dur(s.minutes)})
                </button>
              ))}
            </div>
          </div>

          {course.missedSessions.length > 0 && (
            <div>
              <span className="text-xs font-medium block mb-2" style={{ color: "var(--color-muted)" }}>
                {t("missedListLabel")}
              </span>
              <div className="flex flex-wrap gap-2">
                {course.missedSessions.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                    style={{ background: "#FDEAEA", color: "var(--color-danger)" }}
                  >
                    {dayLabel(m.day)} · {dur(m.minutes)}
                    {m.date && <time dateTime={m.date}> · {formatLongDate(`${m.date}T00:00:00`, lang, semester.calendarType)}</time>}
                    <button
                      onClick={() => removeMissedSession(course.id, m.id)}
                      className="rounded-full transition-opacity hover:opacity-70"
                      aria-label={t("remove")}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
