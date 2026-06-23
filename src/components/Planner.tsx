"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { StickyNote, X, Check, GraduationCap, ClipboardList } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Card } from "./Card";
import { formatShortDate, toISODate } from "@/lib/dates";
import type { PlannerData, PlannerNote, CalendarType } from "@/types";
import type { TranslationKey } from "@/i18n/translations/en";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** default colour for a task the student types into a day */
const DEFAULT_NOTE_COLOR = "#477680";

interface AutoItem {
  id: string;
  name: string;
  course: string;
  type: string;
}

interface Week {
  index: number;
  start: Date | null;
  end: Date | null;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

const TAGS: { key: TranslationKey; color: string }[] = [
  { key: "tagExam", color: "#d9534f" },
  { key: "tagQuiz", color: "#e89b4a" },
  { key: "tagAssignment", color: "#477680" },
  { key: "tagDeadline", color: "#b8975a" },
  { key: "tagHoliday", color: "#5fa98c" },
];

const EXAM_TYPES = ["quiz", "midterm", "final"];
const typeColor = (t: string) =>
  t === "final" || t === "midterm" ? "#d9534f" : t === "quiz" ? "#e89b4a" : t === "project" ? "#8a6fb0" : "#477680";

export function Planner() {
  const { t, lang } = useT();
  const { hydrated, semester, courses, planner: stored, setPlanner } = useStore();

  const [planner, setLocal] = useState<PlannerData>(stored);
  const [seeded, setSeeded] = useState(false);
  const [activeWeek, setActiveWeek] = useState(0);

  // Seed local state once data has hydrated, then persist on every change.
  useEffect(() => {
    if (hydrated && !seeded) {
      setLocal(stored);
      setSeeded(true);
    }
  }, [hydrated, seeded, stored]);

  useEffect(() => {
    if (seeded) setPlanner(planner);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planner, seeded]);

  // Number of week cards = teaching weeks + finals weeks (from settings),
  // not derived from the semester dates. The date range per card still flows
  // from the start date so each card shows its week in the active calendar.
  const weekCount = Math.max(1, Math.min(40, Math.round((Number(semester.weeks) || 0) + (Number(semester.finalsWeeks) || 0)) || 1));

  const weeks = useMemo<Week[]>(() => {
    const start = new Date(semester.startDate);
    const valid = !Number.isNaN(+start);
    const dayMs = 864e5;
    return Array.from({ length: weekCount }, (_, i) => {
      if (!valid) return { index: i, start: null, end: null };
      const ws = new Date(+start + i * 7 * dayMs);
      const we = new Date(+ws + 6 * dayMs);
      return { index: i, start: ws, end: we };
    });
  }, [semester.startDate, weekCount]);

  // ---- smart touch: exams/assignments shown in their matching week ----
  const autoByWeek = useMemo(() => {
    const map: Record<number, AutoItem[]> = {};
    weeks.forEach((w) => (map[w.index] = []));
    courses.forEach((c) =>
      c.components.forEach((comp) => {
        if (!comp.date) return;
        const w = weeks.find(
          (wk) => wk.start && wk.end && comp.date! >= toISODate(wk.start) && comp.date! <= toISODate(wk.end)
        );
        if (w) map[w.index].push({ id: comp.id, name: comp.name, course: c.name, type: comp.type });
      })
    );
    return map;
  }, [courses, weeks]);

  // ---- note mutations (structured planner — no drawing layer) ----
  const setNotes = (notes: PlannerNote[]) => setLocal((pl) => ({ ...pl, notes }));

  const addNote = (week: number, day: number | undefined, text: string, color: string, tag?: string) => {
    const txt = text.trim();
    if (!txt) return;
    setNotes([...planner.notes, { id: uid(), week, day, text: txt, color, tag, done: false }]);
  };
  const updateNote = (id: string, patch: Partial<PlannerNote>) =>
    setNotes(planner.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const deleteNote = (id: string) => setNotes(planner.notes.filter((n) => n.id !== id));
  const toggleNoteDone = (id: string) =>
    setNotes(planner.notes.map((n) => (n.id === id ? { ...n, done: !n.done } : n)));

  if (!hydrated) return <div className="h-40" />;

  const cal: CalendarType = semester.calendarType;
  const range = (w: Week) =>
    w.start && w.end
      ? `${formatShortDate(toISODate(w.start), lang, cal)} – ${formatShortDate(toISODate(w.end), lang, cal)}`
      : "";

  return (
    <div>
      {/* Toolbar — Note tool + quick tags */}
      <div className="surface-card rounded-2xl p-3 mb-8 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
          style={{ background: "var(--color-primary)", color: "#fff" }}
        >
          <StickyNote size={16} />
          <span className="hidden sm:inline">{t("toolNote")}</span>
        </span>

        <span className="h-6 w-px mx-1" style={{ background: "var(--color-border)" }} />

        <span className="text-[11px] font-medium me-1" style={{ color: "var(--color-muted)" }}>
          {t("plannerActiveWeek", { n: activeWeek + 1 })}
        </span>
        {TAGS.map((tg) => (
          <button
            key={tg.key}
            onClick={() => addNote(activeWeek, undefined, t(tg.key), tg.color, tg.key)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
            style={{ background: `${tg.color}1A`, color: tg.color }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: tg.color }} />
            {t(tg.key)}
          </button>
        ))}
      </div>

      {/* Week grid */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {weeks.map((w) => (
          <WeekCard
            key={w.index}
            label={t("weekLabel", { n: w.index + 1 })}
            range={range(w)}
            notes={planner.notes.filter((n) => n.week === w.index)}
            autoItems={autoByWeek[w.index] ?? []}
            active={activeWeek === w.index}
            onActivate={() => setActiveWeek(w.index)}
            onAdd={(day, text) => addNote(w.index, day, text, DEFAULT_NOTE_COLOR)}
            onUpdate={updateNote}
            onDelete={deleteNote}
            onToggleDone={toggleNoteDone}
          />
        ))}
      </div>
    </div>
  );
}

function WeekCard({
  label,
  range,
  notes,
  autoItems,
  active,
  onActivate,
  onAdd,
  onUpdate,
  onDelete,
  onToggleDone,
}: {
  label: string;
  range: string;
  notes: PlannerNote[];
  autoItems: AutoItem[];
  active: boolean;
  onActivate: () => void;
  onAdd: (day: number | undefined, text: string) => void;
  onUpdate: (id: string, patch: Partial<PlannerNote>) => void;
  onDelete: (id: string) => void;
  onToggleDone: (id: string) => void;
}) {
  const { t } = useT();
  const [editingId, setEditingId] = useState<string | null>(null);

  const general = notes.filter((n) => n.day == null);

  const renderNote = (n: PlannerNote) => {
    if (editingId === n.id) {
      return (
        <input
          key={n.id}
          autoFocus
          defaultValue={n.text}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => { onUpdate(n.id, { text: e.target.value.trim() || n.text }); setEditingId(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="rounded-lg px-2 py-1 text-xs outline-none"
          style={{ border: "1px solid var(--color-primary)", background: "var(--color-surface)", color: "var(--color-ink)" }}
        />
      );
    }
    const done = !!n.done;
    return (
      <span
        key={n.id}
        className="group/note inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs max-w-full"
        style={{ background: `${n.color}1A`, border: "1px solid transparent" }}
      >
        {/* Checkbox — also serves as the note's colour dot */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleDone(n.id); }}
          aria-label={t("plannerToggleDone")}
          aria-pressed={done}
          className="h-3.5 w-3.5 rounded-full shrink-0 inline-flex items-center justify-center transition-colors"
          style={done ? { background: n.color, border: `1px solid ${n.color}` } : { border: `1.5px solid ${n.color}` }}
        >
          {done && <Check size={9} color="#fff" strokeWidth={3} />}
        </button>
        <span
          onClick={(e) => { e.stopPropagation(); setEditingId(n.id); }}
          className="cursor-text truncate"
          style={{ color: "var(--color-ink)", textDecoration: done ? "line-through" : "none", opacity: done ? 0.5 : 1 }}
        >
          {n.text}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
          className="opacity-0 group-hover/note:opacity-100 transition-opacity shrink-0"
          aria-label={t("delete")}
        >
          <X size={11} style={{ color: "var(--color-muted)" }} />
        </button>
      </span>
    );
  };

  return (
    <Card
      padding="p-6"
      className="min-h-[160px]"
      onClick={onActivate}
      style={{ outline: active ? "2px solid var(--color-brass)" : "none", outlineOffset: 2 }}
    >
      <button onClick={(e) => { e.stopPropagation(); onActivate(); }} className="block w-full text-start mb-4">
        <div className="font-display text-base" style={{ color: "var(--color-ink)" }}>{label}</div>
        {range && <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{range}</div>}
      </button>

      {/* Auto items from coursework (read-only) */}
      {autoItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {autoItems.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
              style={{ background: `${typeColor(a.type)}14`, border: `1px dashed ${typeColor(a.type)}66` }}
              title={a.course}
            >
              {EXAM_TYPES.includes(a.type) ? (
                <GraduationCap size={11} style={{ color: typeColor(a.type) }} />
              ) : (
                <ClipboardList size={11} style={{ color: typeColor(a.type) }} />
              )}
              <span style={{ color: "var(--color-ink)" }}>{a.name}</span>
              <span className="text-[10px]" style={{ color: "var(--color-muted)" }}>· {a.course}</span>
            </span>
          ))}
        </div>
      )}

      {/* Whole-week (general) notes — quick tags land here */}
      {general.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--color-muted)" }}>
            {t("plannerGeneral")}
          </div>
          <div className="flex flex-wrap gap-1.5">{general.map(renderNote)}</div>
        </div>
      )}

      {/* Days of the week — add a task to a specific day */}
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-start">
        {WEEKDAYS.map((d) => {
          const dayNotes = notes.filter((n) => n.day === d);
          return (
            <Fragment key={d}>
              <div className="text-[11px] leading-6 pt-0.5" style={{ color: "var(--color-muted)" }}>
                {t(`day${d}` as TranslationKey)}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {dayNotes.map(renderNote)}
                <DayAddInput
                  placeholder={t("plannerDayAdd")}
                  onFocus={onActivate}
                  onAdd={(text) => onAdd(d, text)}
                />
              </div>
            </Fragment>
          );
        })}
      </div>
    </Card>
  );
}

function DayAddInput({
  placeholder,
  onFocus,
  onAdd,
}: {
  placeholder: string;
  onFocus: () => void;
  onAdd: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={onFocus}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && draft.trim()) {
          onAdd(draft);
          setDraft("");
        }
      }}
      placeholder={placeholder}
      className="flex-1 min-w-[70px] rounded-lg border px-2 py-1 text-xs outline-none transition-colors focus:border-[var(--color-primary)]"
      style={{ borderColor: "var(--color-border)", background: "transparent", color: "var(--color-ink)" }}
    />
  );
}
