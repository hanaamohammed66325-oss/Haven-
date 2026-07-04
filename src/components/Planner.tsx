"use client";

import { Fragment, useMemo, useState } from "react";
import { StickyNote, X, Check, GraduationCap, ClipboardList } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Card } from "./Card";
import { addDays, formatShortDate, hijriParts, toISODate } from "@/lib/dates";
import type { PlannerNote, PlannerAutoEdit, CalendarType } from "@/types";
import type { TranslationKey } from "@/i18n/translations/en";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** default colour for a task the student types into a day */
const DEFAULT_NOTE_COLOR = "#477680";

interface AutoItem {
  id: string;
  name: string;
  course: string;
  type: string;
  /** weekday (0=Sun..6=Sat) derived from the item's due date */
  day: number;
}

/** Local-midnight Date for an ISO date, so getDay() is timezone-stable. */
const isoToLocalDate = (iso: string) => new Date(`${iso}T00:00:00`);

interface Week {
  index: number;
  start: Date | null;
  end: Date | null;
}

const TAGS: { key: TranslationKey; color: string }[] = [
  { key: "tagExam", color: "#d9534f" },
  { key: "tagQuiz", color: "#e89b4a" },
  { key: "tagAssignment", color: "#477680" },
  { key: "tagDeadline", color: "#b8975a" },
  { key: "tagHoliday", color: "#5fa98c" },
];
const tagColorOf = (key?: string) => TAGS.find((t) => t.key === key)?.color;

const EXAM_TYPES = ["quiz", "midterm", "final"];
const typeColor = (t: string) =>
  t === "final" || t === "midterm" ? "#d9534f" : t === "quiz" ? "#e89b4a" : t === "project" ? "#8a6fb0" : "#477680";

export function Planner() {
  const { t, lang } = useT();
  const {
    hydrated,
    semester,
    courses,
    planner,
    addPlannerNote,
    updatePlannerNote,
    deletePlannerNote,
    setPlannerAutoEdit,
  } = useStore();

  const [activeWeek, setActiveWeek] = useState(0);
  const [activeDay, setActiveDay] = useState<number | null>(null); // null = whole week

  // Week cards = teaching weeks + finals weeks (from settings), date range from start date.
  const weekCount = Math.max(1, Math.min(40, Math.round((Number(semester.weeks) || 0) + (Number(semester.finalsWeeks) || 0)) || 1));

  const weeks = useMemo<Week[]>(() => {
    const start = new Date(semester.startDate);
    const valid = !Number.isNaN(+start);
    const dayMs = 864e5;
    return Array.from({ length: weekCount }, (_, i) => {
      if (!valid) return { index: i, start: null, end: null };
      const ws = new Date(+start + i * 7 * dayMs);
      return { index: i, start: ws, end: new Date(+ws + 6 * dayMs) };
    });
  }, [semester.startDate, weekCount]);

  // Smart touch: exams/assignments shown in their matching week AND on their
  // exact weekday (from the item's due date), not the whole-week row.
  const autoByWeek = useMemo(() => {
    const map: Record<number, AutoItem[]> = {};
    weeks.forEach((w) => (map[w.index] = []));
    courses.forEach((c) =>
      c.components.forEach((comp) => {
        if (!comp.date) return;
        const w = weeks.find(
          (wk) => wk.start && wk.end && comp.date! >= toISODate(wk.start) && comp.date! <= toISODate(wk.end)
        );
        if (w) {
          const day = isoToLocalDate(comp.date).getDay(); // 0=Sun..6=Sat
          map[w.index].push({ id: comp.id, name: comp.name, course: c.name, type: comp.type, day });
        }
      })
    );
    return map;
  }, [courses, weeks]);

  // ---- mutations (cloud-backed via the store) ----
  // NOTE: `week` here is the 1-based displayed week number ("Week 11" → 11),
  // the same identifier stored in planner_items.week_number and matched against
  // each week cell on read (see the grid below: n.week === w.index + 1). Keep
  // write and read on this identifier so notes reappear in the exact week.
  const addNote = (week: number, day: number | undefined, text: string, color: string, tag?: string) => {
    const txt = text.trim();
    if (!txt) return;
    addPlannerNote({ week, day, text: txt, color, tag, done: false });
  };
  const updateNote = (id: string, patch: Partial<PlannerNote>) => updatePlannerNote(id, patch);
  const deleteNote = (id: string) => deletePlannerNote(id);
  const toggleNoteDone = (id: string) => {
    const n = planner.notes.find((x) => x.id === id);
    updatePlannerNote(id, { done: !n?.done });
  };
  const setAutoEdit = (id: string, patch: PlannerAutoEdit) => setPlannerAutoEdit(id, patch);

  const setTarget = (week: number, day: number | null) => {
    setActiveWeek(week);
    setActiveDay(day);
  };

  if (!hydrated) return <div className="h-40" />;

  const cal: CalendarType = semester.calendarType;
  const range = (w: Week) =>
    w.start && w.end
      ? `${formatShortDate(toISODate(w.start), lang, cal)} – ${formatShortDate(toISODate(w.end), lang, cal)}`
      : "";
  // Compact day-of-month number for a date, in the active calendar (Hijri aware).
  const dayNumber = (iso: string) => {
    const d = isoToLocalDate(iso);
    if (Number.isNaN(+d)) return "";
    return cal === "hijri" ? String(hijriParts(d).day) : String(d.getDate());
  };
  // Calendar date shown against each weekday row (0=Sun..6=Sat) of a week,
  // derived from the week's start date + the offset to that weekday.
  const dayDatesFor = (w: Week): (string | null)[] => {
    if (!w.start) return WEEKDAYS.map(() => null);
    const base = isoToLocalDate(toISODate(w.start));
    const baseDow = base.getDay();
    return WEEKDAYS.map((d) => dayNumber(toISODate(addDays(base, (d - baseDow + 7) % 7))));
  };
  const targetLabel = activeDay == null ? t("plannerWholeWeek") : t(`day${activeDay}` as TranslationKey);

  return (
    <div>
      {/* Toolbar — Note tool + active target + quick tags */}
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
          {t("plannerActiveTarget", { n: activeWeek + 1, target: targetLabel })}
        </span>
        {TAGS.map((tg) => (
          <button
            key={tg.key}
            onClick={() => addNote(activeWeek + 1, activeDay ?? undefined, t(tg.key), tg.color, tg.key)}
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
            notes={planner.notes.filter((n) => n.week === w.index + 1)}
            autoItems={autoByWeek[w.index] ?? []}
            dayDates={dayDatesFor(w)}
            autoEdits={planner.autoEdits ?? {}}
            isActiveWeek={activeWeek === w.index}
            activeDay={activeWeek === w.index ? activeDay : undefined}
            onSetTarget={(day) => setTarget(w.index, day)}
            onAdd={(day, text) => addNote(w.index + 1, day ?? undefined, text, DEFAULT_NOTE_COLOR)}
            onUpdate={updateNote}
            onDelete={deleteNote}
            onToggleDone={toggleNoteDone}
            onHideAuto={(id) => setAutoEdit(id, { hidden: true })}
            onRetagAuto={(id, tag) => setAutoEdit(id, { tag })}
          />
        ))}
      </div>
    </div>
  );
}

/** Small inline editor used to rename a note and/or change its tag colour. */
function TagEditor({
  text,
  allowRename,
  onText,
  onPick,
  onDone,
  onDelete,
}: {
  text: string;
  allowRename: boolean;
  onText: (v: string) => void;
  onPick: (tag: string, color: string) => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  return (
    <div
      className="rounded-xl border p-2 flex flex-col gap-2"
      style={{ borderColor: "var(--color-primary)", background: "var(--color-surface)", minWidth: 180 }}
      onClick={(e) => e.stopPropagation()}
    >
      {allowRename ? (
        <input
          autoFocus
          defaultValue={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onDone(); }}
          className="rounded-lg border px-2 py-1 text-xs outline-none"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
        />
      ) : (
        <div className="text-xs font-medium truncate" style={{ color: "var(--color-ink)" }}>{text}</div>
      )}
      <div className="flex items-center gap-1.5">
        {TAGS.map((tg) => (
          <button
            key={tg.key}
            type="button"
            onClick={() => onPick(tg.key, tg.color)}
            aria-label={t(tg.key)}
            title={t(tg.key)}
            className="h-5 w-5 rounded-full transition-transform hover:scale-110"
            style={{ background: tg.color, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1)" }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button type="button" onClick={onDelete} className="text-[11px] font-medium" style={{ color: "var(--color-danger)" }}>
          {t("delete")}
        </button>
        <button type="button" onClick={onDone} className="text-[11px] font-medium" style={{ color: "var(--color-primary)" }}>
          {t("save")}
        </button>
      </div>
    </div>
  );
}

function WeekCard({
  label,
  range,
  notes,
  autoItems,
  dayDates,
  autoEdits,
  isActiveWeek,
  activeDay,
  onSetTarget,
  onAdd,
  onUpdate,
  onDelete,
  onToggleDone,
  onHideAuto,
  onRetagAuto,
}: {
  label: string;
  range: string;
  notes: PlannerNote[];
  autoItems: AutoItem[];
  dayDates: (string | null)[];
  autoEdits: Record<string, PlannerAutoEdit>;
  isActiveWeek: boolean;
  activeDay: number | null | undefined;
  onSetTarget: (day: number | null) => void;
  onAdd: (day: number | null, text: string) => void;
  onUpdate: (id: string, patch: Partial<PlannerNote>) => void;
  onDelete: (id: string) => void;
  onToggleDone: (id: string) => void;
  onHideAuto: (id: string) => void;
  onRetagAuto: (id: string, tag: string) => void;
}) {
  const { t } = useT();
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [editAutoId, setEditAutoId] = useState<string | null>(null);

  const general = notes.filter((n) => n.day == null);
  const visibleAuto = autoItems.filter((a) => !autoEdits[a.id]?.hidden);
  const wholeWeekActive = isActiveWeek && activeDay == null;

  const activeRing = { outline: "1px dashed var(--color-primary)", outlineOffset: 2, borderRadius: 8 };

  const renderNote = (n: PlannerNote) => {
    if (editNoteId === n.id) {
      if (n.tag) {
        return (
          <TagEditor
            key={n.id}
            text={n.text}
            allowRename
            onText={(v) => onUpdate(n.id, { text: v.trim() || n.text })}
            onPick={(tag, color) => onUpdate(n.id, { tag, color })}
            onDone={() => setEditNoteId(null)}
            onDelete={() => { onDelete(n.id); setEditNoteId(null); }}
          />
        );
      }
      return (
        <input
          key={n.id}
          autoFocus
          defaultValue={n.text}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => { onUpdate(n.id, { text: e.target.value.trim() || n.text }); setEditNoteId(null); }}
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
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleDone(n.id); }}
          aria-label={t("plannerToggleDone")}
          aria-pressed={done}
          className="h-3.5 w-3.5 rounded-full shrink-0 inline-flex items-center justify-center transition-colors"
          style={done ? { background: n.color, border: `1px solid ${n.color}` } : { border: `1.5px solid ${n.color}` }}
        >
          {done && <Check size={9} color="#fff" strokeWidth={3} />}
        </button>
        <span
          onClick={(e) => { e.stopPropagation(); setEditNoteId(n.id); }}
          className="cursor-text truncate"
          style={{ color: "var(--color-ink)", textDecoration: done ? "line-through" : "none", opacity: done ? 0.5 : 1 }}
        >
          {n.text}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
          className="opacity-0 group-hover/note:opacity-100 transition-opacity shrink-0"
          aria-label={t("delete")}
        >
          <X size={11} style={{ color: "var(--color-muted)" }} />
        </button>
      </span>
    );
  };

  const renderAuto = (a: AutoItem) => {
    const override = autoEdits[a.id]?.tag;
    const color = (override && tagColorOf(override)) || typeColor(a.type);
    if (editAutoId === a.id) {
      return (
        <TagEditor
          key={a.id}
          text={a.name}
          allowRename={false}
          onText={() => {}}
          onPick={(tag) => onRetagAuto(a.id, tag)}
          onDone={() => setEditAutoId(null)}
          onDelete={() => { onHideAuto(a.id); setEditAutoId(null); }}
        />
      );
    }
    return (
      <span
        key={a.id}
        className="group/auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
        style={{ background: `${color}14`, border: `1px dashed ${color}66` }}
        title={a.course}
      >
        {EXAM_TYPES.includes(a.type) ? (
          <GraduationCap size={11} style={{ color }} />
        ) : (
          <ClipboardList size={11} style={{ color }} />
        )}
        <span
          onClick={(e) => { e.stopPropagation(); setEditAutoId(a.id); }}
          className="cursor-pointer"
          style={{ color: "var(--color-ink)" }}
        >
          {a.name}
        </span>
        <span className="text-[10px]" style={{ color: "var(--color-muted)" }}>· {a.course}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onHideAuto(a.id); }}
          className="opacity-0 group-hover/auto:opacity-100 transition-opacity shrink-0"
          aria-label={t("plannerRemoveFromView")}
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
      style={{ outline: isActiveWeek ? "2px solid var(--color-brass)" : "none", outlineOffset: 2 }}
    >
      <button onClick={() => onSetTarget(null)} className="block w-full text-start mb-4">
        <div className="font-display text-base" style={{ color: "var(--color-ink)" }}>{label}</div>
        {range && <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{range}</div>}
      </button>

      {/* Whole week: general (undated) notes + whole-week add. Dated items now
          land on their exact day row below, never here. */}
      <div className="mb-3">
        <button
          type="button"
          onClick={() => onSetTarget(null)}
          className="block text-[10px] font-semibold uppercase tracking-wide mb-1.5"
          style={{ color: wholeWeekActive ? "var(--color-primary)" : "var(--color-muted)" }}
        >
          {t("plannerWholeWeek")}
        </button>
        <div className="flex flex-wrap items-center gap-1.5 p-0.5" style={wholeWeekActive ? activeRing : undefined}>
          {general.map(renderNote)}
          <DayAddInput placeholder={t("plannerDayAdd")} onFocus={() => onSetTarget(null)} onAdd={(text) => onAdd(null, text)} />
        </div>
      </div>

      {/* Days of the week — each shows its calendar date + any items due that day */}
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-start">
        {WEEKDAYS.map((d) => {
          const dayNotes = notes.filter((n) => n.day === d);
          const dayAuto = visibleAuto.filter((a) => a.day === d);
          const dayActive = isActiveWeek && activeDay === d;
          const date = dayDates[d];
          return (
            <Fragment key={d}>
              <button
                type="button"
                onClick={() => onSetTarget(d)}
                className="text-[11px] leading-6 pt-0.5 text-start whitespace-nowrap"
                style={{ color: dayActive ? "var(--color-primary)" : "var(--color-muted)", fontWeight: dayActive ? 600 : 400 }}
              >
                {t(`day${d}` as TranslationKey)}
                {date && <span className="ms-1 opacity-60">{date}</span>}
              </button>
              <div className="flex flex-wrap items-center gap-1.5 min-w-0 p-0.5" style={dayActive ? activeRing : undefined}>
                {dayAuto.map(renderAuto)}
                {dayNotes.map(renderNote)}
                <DayAddInput placeholder={t("plannerDayAdd")} onFocus={() => onSetTarget(d)} onAdd={(text) => onAdd(d, text)} />
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
