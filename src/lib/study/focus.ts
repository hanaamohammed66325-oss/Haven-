import type { Course } from "@/types";
import type { FocusTask } from "@/lib/pomodoro/focusTasks";
import type { StudyFocus, StudyState } from "./types";
import { isRunning, phaseAt } from "./rules";

/** null means not chosen; an empty key explicitly chooses a free session. */
export function resolveStudyFocus(key: string, courses: readonly Course[], tasks: readonly FocusTask[]): StudyFocus | null {
  if (key === "") return { key, courseId: null, task: null, title: null, courseName: null };
  const task = tasks.find((x) => x.key === key);
  if (task) return { key, courseId: task.courseId, task: task.key, title: task.name, courseName: task.courseName };
  const course = courses.find((x) => x.id === key);
  return course ? { key, courseId: course.id, task: null, title: course.name, courseName: null } : null;
}

export function studyFocusLocked(state: StudyState | null, now: number): boolean {
  return !!state?.round && isRunning(phaseAt(state.round, now));
}
