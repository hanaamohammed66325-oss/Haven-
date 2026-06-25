"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarRange, Clock, MapPin, DoorOpen, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Card } from "./Card";
import { formatDuration } from "@/lib/format";
import type { TranslationKey } from "@/i18n/translations/en";

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const COURSE_COLORS = ["#477680", "#5fa98c", "#e89b4a", "#8a6fb0", "#3b6ea5", "#b8975a", "#d9534f"];

export function Timetable() {
  const { t } = useT();
  const { courses, updateSession } = useStore();

  const hUnit = t("hoursUnit");
  const mUnit = t("minutesUnit");

  const colorOf = (id: string) => {
    const idx = courses.findIndex((c) => c.id === id);
    return COURSE_COLORS[(idx < 0 ? 0 : idx) % COURSE_COLORS.length];
  };

  const dayLabel = (d: number) => t(`day${d}` as TranslationKey);

  // Flat list of every session for the smart toolbar picker.
  const allSessions = courses.flatMap((c) =>
    c.sessions.map((s) => ({ key: `${c.id}:${s.id}`, courseId: c.id, sessionId: s.id, course: c.name, session: s }))
  );

  // ---- Smart detail toolbar state ----
  const [selKey, setSelKey] = useState("");
  const [time, setTime] = useState("");
  const [building, setBuilding] = useState("");
  const [room, setRoom] = useState("");

  const onPick = (key: string) => {
    setSelKey(key);
    const found = allSessions.find((x) => x.key === key);
    setTime(found?.session.time ?? "");
    setBuilding(found?.session.building ?? "");
    setRoom(found?.session.room ?? "");
  };

  const applyDetails = () => {
    const found = allSessions.find((x) => x.key === selKey);
    if (!found) return;
    updateSession(found.courseId, found.sessionId, {
      time: time.trim() || undefined,
      building: building.trim() || undefined,
      room: room.trim() || undefined,
    });
  };

  const byDay = DAYS.map((d) => ({
    day: d,
    entries: courses.flatMap((c) =>
      c.sessions
        .filter((s) => s.day === d)
        .map((s) => ({ key: `${c.id}:${s.id}`, courseId: c.id, sessionId: s.id, course: c.name, session: s }))
    ),
  }));

  const hasAny = byDay.some((d) => d.entries.length > 0);

  if (!hasAny) {
    return (
      <Card className="text-center py-16">
        <div
          className="mx-auto mb-4 flex items-center justify-center rounded-2xl"
          style={{ width: 56, height: 56, background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
        >
          <CalendarRange size={24} />
        </div>
        <p className="text-[15px] max-w-md mx-auto mb-4" style={{ color: "var(--color-muted)" }}>
          {t("timetableEmpty")}
        </p>
        <Link href="/courses" className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
          {t("nav_courses")}
        </Link>
      </Card>
    );
  }

  const fieldCls =
    "rounded-lg border px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";
  const border = { borderColor: "var(--color-border)" };

  return (
    <div>
      {/* Smart detail toolbar — quickly set a session's time, building, and room */}
      <div className="surface-card rounded-2xl p-4 mb-6">
        <div className="mb-3">
          <div className="haven-label" style={{ color: "var(--color-ink)" }}>{t("ttQuickTitle")}</div>
          <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{t("ttQuickHint")}</div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <span className="text-[11px] font-medium" style={{ color: "var(--color-muted)" }}>{t("ttSelectSession")}</span>
            <select className={fieldCls} style={border} value={selKey} onChange={(e) => onPick(e.target.value)}>
              <option value="">— {t("ttSelectSession")} —</option>
              {allSessions.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.course} · {dayLabel(x.session.day)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 w-[120px]">
            <span className="text-[11px] font-medium" style={{ color: "var(--color-muted)" }}>{t("ttTime")}</span>
            <input type="time" className={fieldCls} style={border} value={time} onChange={(e) => setTime(e.target.value)} disabled={!selKey} />
          </label>
          <label className="flex flex-col gap-1 w-[130px]">
            <span className="text-[11px] font-medium" style={{ color: "var(--color-muted)" }}>{t("ttBuilding")}</span>
            <input className={fieldCls} style={border} value={building} onChange={(e) => setBuilding(e.target.value)} disabled={!selKey} />
          </label>
          <label className="flex flex-col gap-1 w-[110px]">
            <span className="text-[11px] font-medium" style={{ color: "var(--color-muted)" }}>{t("ttRoom")}</span>
            <input className={fieldCls} style={border} value={room} onChange={(e) => setRoom(e.target.value)} disabled={!selKey} />
          </label>
          <button
            type="button"
            onClick={applyDetails}
            disabled={!selKey}
            className="haven-btn px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t("ttApply")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
        {byDay.map(({ day, entries }) => (
          <div
            key={day}
            className="rounded-2xl border p-4"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          >
            <div className="haven-label mb-3" style={{ color: "var(--color-ink)" }}>
              {dayLabel(day)}
            </div>
            {entries.length === 0 ? (
              <div className="text-sm" style={{ color: "var(--color-muted)" }}>—</div>
            ) : (
              <div className="flex flex-col gap-2">
                {entries.map((e) => {
                  const col = colorOf(e.courseId);
                  const s = e.session;
                  return (
                    <div
                      key={e.key}
                      className="rounded-xl px-3 py-2"
                      style={{ background: `${col}14`, borderInlineStart: `3px solid ${col}` }}
                    >
                      <div className="text-sm font-medium truncate" style={{ color: "var(--color-ink)" }}>
                        {e.course}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                        {formatDuration(s.minutes, hUnit, mUnit)}
                      </div>

                      {/* Detail chips */}
                      {(s.time || s.building || s.room) && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {s.time && <DetailChip icon={<Clock size={10} />} text={s.time} />}
                          {s.building && <DetailChip icon={<MapPin size={10} />} text={s.building} />}
                          {s.room && <DetailChip icon={<DoorOpen size={10} />} text={s.room} />}
                        </div>
                      )}

                      {/* Per-session notes (multiple, auto-grow) */}
                      <SessionNotes
                        notes={s.notes ?? []}
                        onChange={(notes) => updateSession(e.courseId, e.sessionId, { notes })}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Textarea that grows to fit its content (no fixed max height). */
function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };
  useEffect(resize, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full resize-none overflow-hidden rounded-lg border px-2 py-1 text-xs outline-none transition-colors focus:border-[var(--color-primary)]"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
    />
  );
}

/** A session's notes: multiple auto-grow notes, each deletable, plus "Add note". */
function SessionNotes({ notes, onChange }: { notes: string[]; onChange: (n: string[]) => void }) {
  const { t } = useT();
  const update = (i: number, val: string) => onChange(notes.map((n, j) => (j === i ? val : n)));
  const remove = (i: number) => onChange(notes.filter((_, j) => j !== i));
  const add = () => onChange([...notes, ""]);

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {notes.map((n, i) => (
        <div key={i} className="flex items-start gap-1">
          <AutoGrowTextarea value={n} onChange={(v) => update(i, v)} placeholder={t("ttNotePlaceholder")} />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={t("delete")}
            className="shrink-0 mt-0.5 rounded p-1 transition-colors hover:bg-black/5"
          >
            <Trash2 size={12} style={{ color: "var(--color-muted)" }} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1 self-start text-[11px] font-medium"
        style={{ color: "var(--color-primary)" }}
      >
        <Plus size={12} />
        {t("ttAddNote")}
      </button>
    </div>
  );
}

function DetailChip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
    >
      {icon}
      <span style={{ color: "var(--color-ink)" }}>{text}</span>
    </span>
  );
}
