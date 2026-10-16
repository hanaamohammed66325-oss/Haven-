"use client";
import { InteractionButton } from "@/components/motion/Interaction";

// A course's weekly sessions (day + length). They feed the weekly timetable and
// lecture reminders as well as absence logging, so they stay visible even when
// attendance tracking is off (Hanaa, 2026-10-13). Moved out of AttendanceSection.

import { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "@/components/motion/icons";
import { useStore, type MutationResult } from "@/store";
import { useT } from "@/i18n";
import { useUndo } from "./UndoManager";
import type { Course } from "@/types";
import type { TranslationKey } from "@/i18n/translations/en";

const DAYS = [0, 1, 2, 3, 4, 5, 6];

/** A number input with up/down stepper buttons, matching the day selector's
 *  arrow affordance. Clicking a step clamps to [min, max]; typing directly
 *  still works exactly as before (unclamped, same as the plain input did). */
function NumberStepper({
  value,
  min,
  max,
  ariaLabel,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  ariaLabel: string;
  onChange: (v: number) => void;
}) {
  const border = { borderColor: "var(--color-border)" };
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const btnCls = "flex items-center justify-center h-[15px] w-5 transition-colors hover:bg-black/5";
  return (
    <div className="inline-flex items-stretch rounded-lg border overflow-hidden" style={border}>
      <input
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-11 px-1.5 py-1.5 text-sm text-center outline-none"
        style={{ color: "var(--color-ink)" }}
      />
      <div className="flex flex-col border-s" style={border}>
        <InteractionButton
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          aria-label={`${ariaLabel} +1`}
          className={btnCls}
        >
          <ChevronUp size={10} style={{ color: "var(--color-muted)" }} />
        </InteractionButton>
        <InteractionButton
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          aria-label={`${ariaLabel} -1`}
          className={`${btnCls} border-t`}
          style={border}
        >
          <ChevronDown size={10} style={{ color: "var(--color-muted)" }} />
        </InteractionButton>
      </div>
    </div>
  );
}

export function WeeklySessions({ course }: { course: Course }) {
  const { t } = useT();
  const { addSession, updateSession, deleteSession, softDeleteSession, restoreSession } = useStore();
  const { undoableDelete } = useUndo();
  const border = { borderColor: "var(--color-border)" };
  const [addError, setAddError] = useState("");
  const runAdd = async (p: Promise<MutationResult>) => {
    setAddError("");
    const res = await p;
    if (!res.ok) setAddError(t("saveError"));
  };
  const hUnit = t("hoursUnit");
  const mUnit = t("minutesUnit");
  const dayLabel = (d: number) => t(`day${d}` as TranslationKey);

  return (
    <div className="px-5 sm:px-8 py-6 border-t" style={border}>
      {/* Weekly sessions editor */}
      <div data-tour="sessions-box" className="rounded-xl border p-4" style={border}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
            {t("weeklySessionsLabel")}
          </span>
          <InteractionButton
            data-tour="add-session"
            onClick={() => runAdd(addSession(course.id, { day: 0, minutes: 60 }))}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
            style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
          >
            <Plus size={13} />
            {t("addSession")}
          </InteractionButton>
        </div>
        {addError && (
          <span className="block mb-2 text-xs" style={{ color: "var(--color-danger)" }}>{addError}</span>
        )}

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
                  <div className="flex items-center gap-1.5 shrink-0">
                    <NumberStepper
                      value={h}
                      min={0}
                      max={23}
                      ariaLabel={hUnit}
                      onChange={(nh) => updateSession(course.id, s.id, { minutes: nh * 60 + m })}
                    />
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>{hUnit}</span>
                    <NumberStepper
                      value={m}
                      min={0}
                      max={59}
                      ariaLabel={mUnit}
                      onChange={(nm) => updateSession(course.id, s.id, { minutes: h * 60 + nm })}
                    />
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>{mUnit}</span>
                  </div>
                  <InteractionButton
                    onClick={() => {
                      const removed = softDeleteSession(course.id, s.id);
                      if (!removed) return;
                      undoableDelete({
                        message: t("sessionDeleted"),
                        onUndo: () => restoreSession(course.id, removed),
                        onCommit: () => deleteSession(course.id, s.id),
                      });
                    }}
                    className="rounded-lg p-1.5 transition-colors hover:bg-black/5 shrink-0"
                    aria-label={t("delete")}
                  >
                    <Trash2 size={14} style={{ color: "var(--color-muted)" }} />
                  </InteractionButton>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
