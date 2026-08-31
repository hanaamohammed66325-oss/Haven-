"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/store";
import { useT, usePageTitle } from "@/i18n";
import { Card } from "@/components/Card";
import { AttendanceBadge } from "@/components/AttendanceBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { attendanceInfo, courseLimit, STATUS_COLOR } from "@/lib/grades";
import { formatDuration } from "@/lib/format";
import { toISODate } from "@/lib/dates";
import { resolveHolidaysForSemester } from "@/lib/holidays";
import { TARDINESS_RULES, resolveTardinessRule, buildCustomRule, DEFAULT_RULE_ID } from "@/lib/tardiness";
import { Shield, Clock, CalendarOff, ChevronDown, ChevronUp, CheckCircle, XCircle, AlertTriangle, X, Trash2 } from "lucide-react";
import type { Course } from "@/types";
import type { TranslationKey } from "@/i18n/translations/en";

const isTardy = (m: { tardiness?: number | null }) => (m.tardiness ?? 0) > 0;

function StatBox({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="text-[11px] font-medium mb-1" style={{ color: "var(--color-muted)" }}>
        {label}
      </div>
      <div
        className="font-display text-xl leading-none"
        style={{ color: color ?? "var(--color-ink)" }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] mt-1" style={{ color: "var(--color-muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function CourseAttendanceCard({ course }: { course: Course }) {
  const { t, lang } = useT();
  const { semester, updateMissedSession, addMissedSession, removeMissedSession } = useStore();
  const [expanded, setExpanded] = useState(false);
  const [addingAbsence, setAddingAbsence] = useState(false);
  const [addType, setAddType] = useState<"full" | "late">("full");
  const [addSession, setAddSession] = useState("");
  const [addMinutesLate, setAddMinutesLate] = useState("");
  const [editTardinessId, setEditTardinessId] = useState<string | null>(null);
  const [editTardinessVal, setEditTardinessVal] = useState("");

  const att = attendanceInfo(course, semester);
  if (!att) return null;

  const hUnit = t("hoursUnit");
  const mUnit = t("minutesUnit");
  const dur = (minutes: number) => formatDuration(minutes, hUnit, mUnit);
  const dayLabel = (d: number) => t(`day${d}` as TranslationKey);

  const limit = courseLimit(course, semester);
  const pct = att.absence;
  const barColor = STATUS_COLOR[att.status];

  let unexcusedCount = 0, excusedCount = 0;
  for (const m of course.missedSessions) m.excused ? excusedCount++ : unexcusedCount++;

  return (
    <Card>
      <div className="px-5 sm:px-6 py-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3
              className="font-display text-base font-semibold truncate"
              style={{ color: "var(--color-ink)" }}
            >
              {course.name}
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <AttendanceBadge status={att.status} explain limit={att.limit} />
              <span className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                {t("attLimitShort", { n: limit })}
              </span>
            </div>
          </div>
          <div className="text-end shrink-0">
            <span
              className="font-display text-2xl leading-none"
              style={{ color: barColor }}
            >
              {pct.toFixed(1)}%
            </span>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--color-muted)" }}>
              {t("absenceRate")}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <ProgressBar value={Math.min((pct / limit) * 100, 100)} color={barColor} />
          <div className="flex justify-between mt-1">
            <span className="text-[10px]" style={{ color: "var(--color-muted)" }}>
              0%
            </span>
            <span className="text-[10px] font-medium" style={{ color: barColor }}>
              {t("hoursRemainingBeforeLimit", { n: att.hoursRemaining.toFixed(1) })}
            </span>
            <span className="text-[10px]" style={{ color: "var(--color-muted)" }}>
              {limit}%
            </span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <StatBox
            label={t("totalContactHours")}
            value={dur(att.totalMinutes)}
          />
          <StatBox
            label={t("missedHours")}
            value={dur(att.missedMinutes)}
            color={att.missedMinutes > 0 ? "var(--color-danger)" : undefined}
          />
          <StatBox
            label={t("excusedHours")}
            value={dur(att.excusedMinutes)}
            color={att.excusedMinutes > 0 ? "var(--color-success)" : undefined}
          />
          <StatBox
            label={t("holidayHoursOff")}
            value={dur(att.holidayMinutesOff)}
          />
          {att.tardinessMinutes > 0 && (
            <StatBox
              label={t("tardinessAsAbsence")}
              value={dur(att.tardinessMinutes)}
              color="#C77E2E"
            />
          )}
        </div>

        {/* Expand/collapse absences */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-[12px] font-medium transition-colors hover:opacity-80 mt-1"
          style={{ color: "var(--color-primary)" }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {t("missedListLabel")} ({unexcusedCount} {t("unexcused")}
          {excusedCount > 0 ? `, ${excusedCount} ${t("excused")}` : ""})
        </button>

        {expanded && (
          <div className="mt-3">
            {course.missedSessions.length === 0 ? (
              <p className="text-xs py-2" style={{ color: "var(--color-muted)" }}>
                {t("noAbsences")}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {course.missedSessions.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[12px]"
                    style={{
                      borderColor: "var(--color-border)",
                      opacity: m.excused ? 0.6 : 1,
                    }}
                  >
                    {m.excused ? (
                      <CheckCircle size={14} style={{ color: "var(--color-success)", flexShrink: 0 }} />
                    ) : isTardy(m) ? (
                      <Clock size={14} style={{ color: "#C77E2E", flexShrink: 0 }} />
                    ) : (
                      <XCircle size={14} style={{ color: "var(--color-danger)", flexShrink: 0 }} />
                    )}
                    <span className="font-medium" style={{ color: "var(--color-ink)" }}>
                      {dayLabel(m.day)}
                    </span>
                    <span style={{ color: "var(--color-muted)" }}>·</span>
                    <span style={{ color: "var(--color-muted)" }}>{dur(m.minutes)}</span>
                    {m.date && (
                      <>
                        <span style={{ color: "var(--color-muted)" }}>·</span>
                        <span style={{ color: "var(--color-muted)" }}>{m.date}</span>
                      </>
                    )}
                    {isTardy(m) && (
                      <>
                        <span style={{ color: "var(--color-muted)" }}>·</span>
                        <span style={{ color: "#C77E2E", fontWeight: 500 }}>
                          {t("minutesLate", { n: m.tardiness! })}
                        </span>
                      </>
                    )}
                    <span className="flex-1" />
                    {/* Tardy toggle */}
                    {editTardinessId === m.id ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={editTardinessVal}
                          onChange={(e) => setEditTardinessVal(e.target.value)}
                          placeholder={t("minutesLate", { n: "?" })}
                          className="w-14 text-center text-[11px] rounded border px-1 py-0.5"
                          style={{ borderColor: "var(--color-border)" }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const val = Number(editTardinessVal);
                              if (val > 0) {
                                updateMissedSession(course.id, m.id, { tardiness: val });
                              }
                              setEditTardinessId(null);
                            } else if (e.key === "Escape") {
                              setEditTardinessId(null);
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            const val = Number(editTardinessVal);
                            if (val > 0) updateMissedSession(course.id, m.id, { tardiness: val });
                            setEditTardinessId(null);
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{ background: "#C77E2E20", color: "#C77E2E" }}
                        >{t("save")}</button>
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          if (isTardy(m)) {
                            updateMissedSession(course.id, m.id, { tardiness: null });
                          } else {
                            setEditTardinessId(m.id);
                            setEditTardinessVal("");
                          }
                        }}
                        className="text-[11px] px-2 py-0.5 rounded-md font-medium transition-colors"
                        style={{
                          background: isTardy(m)
                            ? "#C77E2E20"
                            : "var(--color-surface, #f5f5f5)",
                          color: isTardy(m)
                            ? "#C77E2E"
                            : "var(--color-muted)",
                        }}
                      >
                        {isTardy(m) ? t("fullAbsence") : t("lateArrival")}
                      </button>
                    )}
                    <button
                      onClick={() =>
                        updateMissedSession(course.id, m.id, { excused: !m.excused })
                      }
                      className="text-[11px] px-2 py-0.5 rounded-md font-medium transition-colors"
                      style={{
                        background: m.excused
                          ? "var(--color-danger-soft, #FDEAEA)"
                          : "var(--color-success-soft, #E8F5E9)",
                        color: m.excused ? "var(--color-danger)" : "var(--color-success)",
                      }}
                    >
                      {m.excused ? t("markUnexcused") : t("markExcused")}
                    </button>
                    <button
                      onClick={() => removeMissedSession(course.id, m.id)}
                      className="p-1 rounded transition-colors hover:opacity-70"
                      style={{ color: "var(--color-muted)" }}
                      title={t("delete")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Log new absence */}
            {!addingAbsence ? (
              <button
                onClick={() => { setAddingAbsence(true); setAddSession(course.sessions[0]?.id ?? ""); }}
                className="mt-3 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-dashed transition-colors hover:opacity-80"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
              >
                + {t("logAbsence")}
              </button>
            ) : (
              <div
                className="mt-3 rounded-lg border p-3 flex flex-wrap items-center gap-2"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface, #fafafa)" }}
              >
                <select
                  value={addSession}
                  onChange={(e) => setAddSession(e.target.value)}
                  className="text-[12px] rounded border px-2 py-1"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  {course.sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {dayLabel(s.day)} · {dur(s.minutes)}
                    </option>
                  ))}
                </select>
                <div className="inline-flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
                  <button
                    onClick={() => setAddType("full")}
                    className="text-[11px] px-2.5 py-1 font-medium"
                    style={{
                      background: addType === "full" ? "var(--color-danger)" : "transparent",
                      color: addType === "full" ? "#fff" : "var(--color-muted)",
                    }}
                  >
                    {t("fullAbsence")}
                  </button>
                  <button
                    onClick={() => setAddType("late")}
                    className="text-[11px] px-2.5 py-1 font-medium"
                    style={{
                      background: addType === "late" ? "#C77E2E" : "transparent",
                      color: addType === "late" ? "#fff" : "var(--color-muted)",
                    }}
                  >
                    {t("lateArrival")}
                  </button>
                </div>
                {addType === "late" && (
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={addMinutesLate}
                    onChange={(e) => setAddMinutesLate(e.target.value)}
                    placeholder={t("minutesLate", { n: "?" })}
                    className="w-16 text-center text-[12px] rounded border px-2 py-1"
                    style={{ borderColor: "var(--color-border)" }}
                  />
                )}
                <button
                  onClick={async () => {
                    if (!addSession) return;
                    const tardiness = addType === "late" ? Number(addMinutesLate) || undefined : undefined;
                    const today = toISODate(new Date());
                    await addMissedSession(course.id, addSession, {
                      date: today,
                      tardiness,
                    });
                    setAddingAbsence(false);
                    setAddMinutesLate("");
                    setAddType("full");
                  }}
                  className="text-[11px] px-3 py-1 rounded-md font-medium"
                  style={{ background: "var(--color-primary)", color: "#fff" }}
                >
                  {t("save")}
                </button>
                <button
                  onClick={() => setAddingAbsence(false)}
                  className="text-[11px] px-2 py-1 rounded-md"
                  style={{ color: "var(--color-muted)" }}
                >
                  {t("cancel")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function AttendancePage() {
  const { t, lang } = useT();
  usePageTitle("attendancePageTitle");
  const { courses, semester, setSemester } = useStore();

  const holidays = useMemo(() => {
    if (!semester?.startDate || !semester?.endDate) return [];
    return resolveHolidaysForSemester(
      semester.startDate,
      semester.endDate,
      semester.dismissedHolidays
    );
  }, [semester?.startDate, semester?.endDate, semester?.dismissedHolidays]);

  const ruleId = semester?.tardinessRuleId ?? DEFAULT_RULE_ID;
  const tardinessRule = resolveTardinessRule(semester);

  const coursesWithAttendance = useMemo(
    () => courses.filter((c) => c.sessions.length > 0),
    [courses]
  );

  // Summary stats
  const summary = useMemo(() => {
    let totalMissed = 0;
    let totalExcused = 0;
    let totalContact = 0;
    let atRisk = 0;
    let approaching = 0;

    for (const c of coursesWithAttendance) {
      const att = attendanceInfo(c, semester);
      if (!att) continue;
      totalMissed += att.missedMinutes;
      totalExcused += att.excusedMinutes;
      totalContact += att.totalMinutes;
      if (att.status === "danger") atRisk++;
      else if (att.status === "warn") approaching++;
    }

    return { totalMissed, totalExcused, totalContact, atRisk, approaching };
  }, [coursesWithAttendance, semester]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Page header */}
      <div className="mb-8">
        <h1
          className="font-display text-2xl font-semibold"
          style={{ color: "var(--color-ink)" }}
        >
          {t("attendancePageTitle")}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          {t("attendancePageSubtitle")}
        </p>
      </div>

      {/* Summary cards */}
      {coursesWithAttendance.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatBox
            label={t("totalContactHours")}
            value={formatDuration(summary.totalContact, t("hoursUnit"), t("minutesUnit"))}
          />
          <StatBox
            label={t("missedHours")}
            value={formatDuration(summary.totalMissed, t("hoursUnit"), t("minutesUnit"))}
            color={summary.totalMissed > 0 ? "var(--color-danger)" : undefined}
          />
          {summary.atRisk > 0 && (
            <StatBox
              label={t("attLegend_danger")}
              value={String(summary.atRisk)}
              color="var(--color-danger)"
            />
          )}
          {summary.approaching > 0 && (
            <StatBox
              label={t("attLegend_warn")}
              value={String(summary.approaching)}
              color="#C77E2E"
            />
          )}
        </div>
      )}

      {/* Holidays section */}
      {holidays.length > 0 && (
        <div className="mb-8">
          <h2
            className="text-sm font-semibold mb-3 flex items-center gap-2"
            style={{ color: "var(--color-ink)" }}
          >
            <CalendarOff size={16} style={{ color: "var(--color-success)" }} />
            {t("holidaysInSemester")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {holidays.map((h) => (
              <div
                key={`${h.id}-${h.startDate}`}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px]"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-success-soft, #E8F5E9)",
                }}
              >
                <span className="font-medium" style={{ color: "var(--color-success)" }}>
                  {lang === "ar" ? h.nameAr : h.nameEn}
                </span>
                <span style={{ color: "var(--color-muted)" }}>
                  {h.startDate} — {h.endDate}
                </span>
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                  style={{ background: "var(--color-success)", color: "#fff" }}
                >
                  {h.durationDays}d
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tardiness rule selector */}
      <div
        className="rounded-xl border px-4 py-3 mb-8 flex flex-wrap items-center gap-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <Clock size={16} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
        <span className="text-[12px] font-medium" style={{ color: "var(--color-ink)", whiteSpace: "nowrap" }}>
          {t("tardinessRule")}:
        </span>
        <select
          value={ruleId}
          onChange={(e) => setSemester({ tardinessRuleId: e.target.value })}
          className="text-[12px] rounded-lg border px-2 py-1.5 flex-1 min-w-0"
          style={{
            borderColor: "var(--color-border)",
            background: "var(--color-surface, #fafafa)",
            color: "var(--color-ink)",
          }}
        >
          {TARDINESS_RULES.map((r) => (
            <option key={r.id} value={r.id}>
              {lang === "ar" ? r.nameAr : r.nameEn}
            </option>
          ))}
          <option value="custom">
            {lang === "ar" ? "مخصص" : "Custom"}
          </option>
        </select>
        {ruleId === "custom" && (
          <div className="w-full flex items-center gap-2 mt-1">
            <label className="text-[11px]" style={{ color: "var(--color-muted)" }}>
              {lang === "ar" ? "العتبة (دقائق):" : "Threshold (min):"}
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={semester?.customTardinessThreshold ?? 15}
              onChange={(e) => setSemester({ customTardinessThreshold: Number(e.target.value) || 15 })}
              className="w-14 text-center text-[12px] rounded border px-1 py-1"
              style={{ borderColor: "var(--color-border)" }}
            />
            <label className="text-[11px]" style={{ color: "var(--color-muted)" }}>
              {lang === "ar" ? "تأخيرات لكل غياب:" : "Tardies per absence:"}
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={semester?.customTardiesPerAbsence ?? 3}
              onChange={(e) => setSemester({ customTardiesPerAbsence: Number(e.target.value) || 3 })}
              className="w-14 text-center text-[12px] rounded border px-1 py-1"
              style={{ borderColor: "var(--color-border)" }}
            />
          </div>
        )}
      </div>

      {/* Course cards */}
      {coursesWithAttendance.length === 0 ? (
        <div className="text-center py-16">
          <Shield size={40} style={{ color: "var(--color-muted)", margin: "0 auto" }} />
          <p className="text-sm mt-3" style={{ color: "var(--color-muted)" }}>
            {t("noSessions")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {coursesWithAttendance.map((c) => (
            <CourseAttendanceCard key={c.id} course={c} />
          ))}
        </div>
      )}
    </div>
  );
}
