"use client";
import { InteractionButton } from "@/components/motion/Interaction";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "@/components/motion/icons";
import { useT } from "@/i18n";
import { daysUntil } from "@/lib/upcoming";
import { spokenDuration } from "@/lib/format";
import { isTaskKey, type FocusTask } from "@/lib/pomodoro/focusTasks";
import type { Course, TaskFocus } from "@/types";
import { GLASS } from "./glass";
import { motion, type Variants } from "motion/react";
import { MotionModal } from "@/components/motion/MotionModal";
import { MotionRoot, Press } from "@/components/motion/Press";
import { POP, PRESS } from "@/components/motion/springs";

interface Props {
  /** Group rounds can retain a historical title or an unselected placeholder. */
  displayName?: string;
  disabled?: boolean;
  /** "" (a free session), a course id, or a task key */
  value: string;
  onChange: (key: string) => void;
  courses: Course[];
  tasks: FocusTask[];
  taskFocus: Record<string, TaskFocus>;
  currentWeek: number;
  courseColor: (id: string | null) => string | null;
  /** a session is under way: the chip only names what it's spent on */
  locked: boolean;
  /** under the name: the time spent on the chosen task (of its estimate) */
  line: string | null;
  onEstimate: (key: string, minutes: number) => void;
  /** tasks whose estimate question was put off */
  skipped: string[];
  onSkipEstimate: (key: string) => void;
}

const GROUPS = [
  ["assignment", "pom_groupAssignments"],
  ["exam", "pom_groupExams"],
  ["planner", "pom_groupPlanner"],
] as const;

// The estimate chips (minutes) offered for a task.
const ESTIMATES = [30, 60, 90, 120, 180];

// The sheet's rows arrive one after another (Motion); a press dips the row.
const ROWS: Variants = { out: {}, in: { transition: { staggerChildren: 0.025, delayChildren: 0.06 } } };
const ROW: Variants = { out: { opacity: 0, y: 8 }, in: { opacity: 1, y: 0, transition: POP } };

// What the session is spent on: a glass chip under the timer that opens a sheet
// of the student's courses and open tasks, soonest first. A chosen task asks
// once how long it should take (at the top of the sheet, where it can change).
export function TaskPicker({
  displayName,
  disabled = false,
  value,
  onChange,
  courses,
  tasks,
  taskFocus,
  currentWeek,
  courseColor,
  locked,
  line,
  onEstimate,
  skipped,
  onSkipEstimate,
}: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (locked) { setOpen(false); setEditing(false); } }, [locked]);
  const estimateRef = useRef<HTMLDivElement>(null);
  const dur = (m: number) => spokenDuration(m, t);

  const task = tasks.find((x) => x.key === value) ?? null;
  const course = task ? null : (courses.find((c) => c.id === value) ?? null);
  const name = displayName ?? (task ? task.name : course ? course.name : t("pom_generalFocus"));
  const sub = task?.courseName ?? null;
  const dot = courseColor(task ? task.courseId : course ? course.id : null);
  const estimate = task ? taskFocus[task.key]?.estimate : undefined;

  // a task just picked with no estimate yet: the question comes into view
  useEffect(() => {
    if (open && editing) estimateRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [open, editing, value]);

  const close = () => {
    setOpen(false);
    setEditing(false);
  };

  const due = (x: FocusTask): string | null => {
    if (x.kind === "planner") return x.week === currentWeek ? t("pom_thisWeek") : t("pom_nextWeek");
    const d = daysUntil(x.date);
    if (d == null) return null;
    if (d < 0) return t("pom_duePast");
    if (d === 0) return t("dueToday");
    if (d === 1) return t("pom_dueTomorrow");
    return t("dueInDays", { n: d });
  };

  const pick = (key: string) => {
    if (locked || disabled) return;
    onChange(key);
    if (isTaskKey(key) && !taskFocus[key]?.estimate && !skipped.includes(key)) setEditing(true);
    else close();
  };

  const row = (key: string, label: string, color: string | null, meta: (string | null)[], spent = 0) => {
    const selected = key === value;
    const detail = meta.filter(Boolean).join(" · ");
    return (
      <motion.button
        key={key || "free"}
        type="button"
        variants={ROW}
        whileTap={locked || disabled ? undefined : { scale: 0.98 }}
        onClick={() => pick(key)}
        disabled={locked || disabled}
        aria-pressed={selected}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-[var(--color-primary-soft)]"
        style={{ background: selected ? "var(--color-primary-soft)" : undefined }}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: color ?? "transparent", boxShadow: color ? undefined : "inset 0 0 0 1.5px var(--color-muted)" }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
            {label}
          </span>
          {detail && (
            <span className="block truncate text-xs" style={{ color: "var(--color-muted)" }}>
              {detail}
            </span>
          )}
        </span>
        {spent > 0 && (
          <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--color-muted)" }}>
            {dur(spent)}
          </span>
        )}
        {selected && <motion.span className="grid shrink-0" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={POP}><Check size={16} style={{ color: "var(--color-primary)" }} /></motion.span>}
      </motion.button>
    );
  };

  const heading = (label: string) => (
    <p className="px-3 pb-1 pt-4 text-xs font-medium" style={{ color: "var(--color-muted)" }}>
      {label}
    </p>
  );

  return (
    <MotionRoot>
      <Press
        data-tour="pom-focus-course"
        onClick={() => setOpen(true)}
        disabled={locked || disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex min-w-0 max-w-full flex-col items-center px-4 py-2 text-sm font-medium ${line ? "rounded-2xl" : "rounded-full"}`}
        style={GLASS}
      >
        <span className="flex min-w-0 max-w-full items-center gap-2.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: dot ?? "transparent", boxShadow: dot ? "0 0 8px " + dot : "inset 0 0 0 1.5px rgba(244,241,230,0.7)" }}
          />
          <span className="min-w-0 truncate">
            {name}
            {sub && <span style={{ opacity: 0.65 }}> · {sub}</span>}
          </span>
          {!locked && <motion.span className="grid shrink-0" animate={{ rotate: open ? 180 : 0 }} transition={POP}><ChevronDown size={15} style={{ opacity: 0.7 }} /></motion.span>}
        </span>
        {line && (
          <span className="mt-0.5 block max-w-full truncate text-xs font-normal" style={{ opacity: 0.72 }}>
            {line}
          </span>
        )}
      </Press>

      <MotionModal open={open} onClose={close} title={t("pom_pickTitle")} variant="sheet">
        {/* built only while open: the page re-renders every second of a session */}
        {open && (
          <motion.div className="-mx-3 -my-3" variants={ROWS} initial="out" animate="in">
            {task && (
              // the chosen task: how long it should take
              <div ref={estimateRef} className="mx-1 mb-2 rounded-2xl px-4 py-3" style={{ background: "var(--color-primary-soft)" }}>
                <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                  {task.name}
                </p>
                {estimate && !editing ? (
                  <p className="mt-0.5 text-xs" style={{ color: "var(--color-muted)" }}>
                    {t("pom_taskExpected", { estimate: dur(estimate) })}
                    {" · "}
                    <InteractionButton onClick={() => setEditing(true)} className="font-medium" style={{ color: "var(--color-primary)" }}>
                      {t("pom_estimateEdit")}
                    </InteractionButton>
                  </p>
                ) : (
                  <>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--color-muted)" }}>
                      {t("pom_estimateAsk")}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {ESTIMATES.map((m) => {
                        const on = estimate === m;
                        return (
                          <motion.button
                            key={m}
                            type="button"
                            whileTap={{ scale: 0.92 }}
                            transition={PRESS}
                            onClick={() => {
                              onEstimate(task.key, m);
                              close();
                            }}
                            aria-pressed={on}
                            className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-surface)]"
                            style={{
                              background: on ? "var(--color-surface)" : "transparent",
                              border: `1px solid ${on ? "var(--color-primary)" : "var(--color-border)"}`,
                              color: "var(--color-ink)",
                            }}
                          >
                            {dur(m)}
                          </motion.button>
                        );
                      })}
                      <InteractionButton
                        onClick={() => {
                          onSkipEstimate(task.key);
                          close();
                        }}
                        className="px-2 py-1.5 text-xs font-medium"
                        style={{ color: "var(--color-muted)" }}
                      >
                        {t("pom_estimateSkip")}
                      </InteractionButton>
                    </div>
                  </>
                )}
              </div>
            )}
            {row("", t("pom_generalFocus"), null, [t("pom_generalHint")])}
            {courses.length > 0 && (
              <>
                {heading(t("pom_groupCourses"))}
                {courses.map((c) => row(c.id, c.name, courseColor(c.id), []))}
              </>
            )}
            {GROUPS.map(([kind, label]) => {
              const list = tasks.filter((x) => x.kind === kind);
              if (!list.length) return null;
              return (
                <div key={kind}>
                  {heading(t(label))}
                  {list.map((x) => row(x.key, x.name, courseColor(x.courseId), [x.courseName, due(x)], taskFocus[x.key]?.minutes ?? 0))}
                </div>
              );
            })}
          </motion.div>
        )}
      </MotionModal>
    </MotionRoot>
  );
}
