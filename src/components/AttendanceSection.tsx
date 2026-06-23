"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { AttendanceBadge } from "./AttendanceBadge";
import { attendanceInfo } from "@/lib/grades";
import { formatDuration } from "@/lib/format";
import type { Course } from "@/types";
import type { TranslationKey } from "@/i18n/translations/en";

const DAYS = [0, 1, 2, 3, 4, 5, 6];

const statusColor: Record<"ok" | "warn" | "danger", string> = {
  ok: "var(--color-success)",
  warn: "#C77E2E",
  danger: "var(--color-danger)",
};

export function AttendanceSection({ course }: { course: Course }) {
  const { t } = useT();
  const {
    semester,
    addSession,
    updateSession,
    deleteSession,
    addMissedSession,
    removeMissedSession,
  } = useStore();

  const att = attendanceInfo(course, semester);
  const border = { borderColor: "var(--color-border)" };

  const hUnit = t("hoursUnit");
  const mUnit = t("minutesUnit");
  const dayLabel = (d: number) => t(`day${d}` as TranslationKey);
  const dur = (minutes: number) => formatDuration(minutes, hUnit, mUnit);

  return (
    <div className="px-8 py-6 border-t" style={border}>
      {/* Heading + status */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <span className="haven-label" style={{ color: "var(--color-ink)" }}>
            {t("attendanceEditor")}
          </span>
          {att && <AttendanceBadge status={att.status} explain limit={att.limit} />}
        </div>
        {att && (
          <div className="text-right rtl:text-left">
            <span
              className="font-display text-2xl leading-none"
              style={{ color: statusColor[att.status] }}
            >
              {att.absence.toFixed(1)}%
            </span>
            <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
              {t("eachHour", { pct: att.unit.toFixed(1) })}
            </div>
          </div>
        )}
      </div>

      {/* Weekly sessions editor */}
      <div className="rounded-xl border p-4" style={border}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
            {t("weeklySessionsLabel")}
          </span>
          <button
            onClick={() => addSession(course.id, { day: 0, minutes: 60 })}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
            style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
          >
            <Plus size={13} />
            {t("addSession")}
          </button>
        </div>

        {course.sessions.length === 0 ? (
          <p className="text-xs py-1" style={{ color: "var(--color-muted)" }}>
            {t("noSessions")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {course.sessions.map((s) => {
              const h = Math.floor(s.minutes / 60);
              const m = s.minutes % 60;
              return (
                <div key={s.id} className="flex items-center gap-2 flex-wrap">
                  <select
                    value={s.day}
                    onChange={(e) => updateSession(course.id, s.id, { day: Number(e.target.value) })}
                    className="flex-1 min-w-[110px] rounded-lg border px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
                    style={border}
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>{dayLabel(d)}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={h}
                      aria-label={hUnit}
                      onChange={(e) =>
                        updateSession(course.id, s.id, { minutes: (Number(e.target.value) || 0) * 60 + m })
                      }
                      className="w-12 rounded-lg border px-2 py-1.5 text-sm text-center outline-none transition-colors focus:border-[var(--color-primary)]"
                      style={border}
                    />
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>{hUnit}</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      step="5"
                      value={m}
                      aria-label={mUnit}
                      onChange={(e) =>
                        updateSession(course.id, s.id, { minutes: h * 60 + (Number(e.target.value) || 0) })
                      }
                      className="w-12 rounded-lg border px-2 py-1.5 text-sm text-center outline-none transition-colors focus:border-[var(--color-primary)]"
                      style={border}
                    />
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>{mUnit}</span>
                  </div>
                  <button
                    onClick={() => deleteSession(course.id, s.id)}
                    className="rounded-lg p-1.5 transition-colors hover:bg-black/5 shrink-0"
                    aria-label={t("delete")}
                  >
                    <Trash2 size={14} style={{ color: "var(--color-muted)" }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Logging absence — tap a session to log its missed minutes */}
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
                  onClick={() => addMissedSession(course.id, s.id)}
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
                {course.missedSessions.map((m) => {
                  const s = course.sessions.find((x) => x.id === m.sessionId);
                  if (!s) return null;
                  return (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                      style={{ background: "#FDEAEA", color: "var(--color-danger)" }}
                    >
                      {dayLabel(s.day)} · {dur(s.minutes)}
                      <button
                        onClick={() => removeMissedSession(course.id, m.id)}
                        className="rounded-full transition-opacity hover:opacity-70"
                        aria-label={t("remove")}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
