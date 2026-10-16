"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { semesterProgress } from "@/lib/grades";
import { focusTasks } from "@/lib/pomodoro/focusTasks";
import { fallbackColor } from "@/lib/pomodoro/colors";
import { resolveStudyFocus } from "@/lib/study/focus";
import type { StudyFocus } from "@/lib/study/types";
import { TaskPicker } from "@/components/pomodoro/TaskPicker";

export function StudyTaskPicker({ focus, locked, pending, onChange }: {
  focus: StudyFocus | null; locked: boolean; pending: boolean; onChange: (focus: StudyFocus) => void;
}) {
  const { t } = useT();
  const { courses, planner, semester, taskFocus, setTaskFocus, pomodoroSettings } = useStore();
  const [skipped, setSkipped] = useState<string[]>([]);
  const week = useMemo(() => semesterProgress(semester).currentWeek, [semester]);
  const tasks = useMemo(() => focusTasks(courses, planner.notes, week, taskFocus), [courses, planner.notes, week, taskFocus]);
  return <TaskPicker value={focus?.key ?? "__unchosen"} displayName={focus ? focus.title ?? t("pom_generalFocus") : t("study_chooseFocus")}
    onChange={(key) => { const next = resolveStudyFocus(key, courses, tasks); if (next) onChange(next); }}
    courses={courses} tasks={tasks} taskFocus={taskFocus} currentWeek={week}
    courseColor={(id) => id ? pomodoroSettings.padColors?.[id] ?? courses.find((c) => c.id === id)?.color ?? fallbackColor(id) : null}
    locked={locked} disabled={pending} line={locked ? t("study_focusLocked") : null}
    onEstimate={(key, minutes) => setTaskFocus(key, { estimate: minutes })}
    skipped={skipped} onSkipEstimate={(key) => setSkipped((old) => [...old, key])} />;
}
