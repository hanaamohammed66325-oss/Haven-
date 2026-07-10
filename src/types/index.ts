export type CalendarType = "hijri" | "gregorian";

export type ThemeId =
  | "haven"
  | "midnight"
  | "rose"
  | "lavender"
  | "sand"
  | "forest"
  | "ocean"
  | "mono";

export type ComponentType = "quiz" | "midterm" | "final" | "project" | "assignment";
export type WeightUnit = "percent" | "points";

export interface GradeComponent {
  id: string;
  name: string;
  type: ComponentType;
  weight: number;
  unit: WeightUnit;
  total: number;
  score: number | null;
  date: string | null;
}

/** A recurring weekly class meeting: a weekday and its duration in minutes. */
export interface CourseSession {
  id: string; // attendance_sessions row id (this session's own id)
  day: number; // 0 = Sunday … 6 = Saturday
  minutes: number; // duration of this session in minutes
  time?: string; // start time "HH:MM" (optional)
  building?: string; // building name/number (optional)
  room?: string; // room number (optional)
  note?: string; // legacy single note — migrated into `notes`
  notes?: string[]; // multiple free notes for this session
  /** id of this session's SEPARATE timetable_entries detail row, when it has
   *  timetable details. Distinct from `id` so the two rows never share an id. */
  timetableId?: string;
}

/** A single logged absence. Carries its own weekday + minutes so it stands on
 *  its own in the cloud (attendance_absences has no session reference); the
 *  minutes drive the attendance %. `sessionId` is kept only for the session in
 *  which it was logged and is not persisted. */
export interface MissedEntry {
  id: string;
  sessionId?: string;
  /** weekday of the missed session, 0 = Sunday … 6 = Saturday */
  day: number;
  /** missed minutes — weighted into the attendance percentage */
  minutes: number;
}

export interface Course {
  id: string;
  name: string;
  creditHours: number;
  /** this course's own withdrawal ("حرمان") limit as an absence % (from
   *  courses.attendance_limit). 0/undefined → fall back to the semester default. */
  attendanceLimit?: number;
  /** weekly class meetings — drives totals for both counting methods */
  sessions: CourseSession[];
  /** missed count for the "by lecture" method */
  missedLectures: number;
  /** logged missed sessions for the "by hour" method */
  missedSessions: MissedEntry[];
  components: GradeComponent[];
}

export interface Semester {
  name: string;
  startDate: string;
  endDate: string;
  calendarType: CalendarType;
  gradingSystem: "saudi5";
  /** teaching length in weeks — shared by all courses, used in attendance math */
  weeks: number;
  /** number of finals weeks (informational, set separately) */
  finalsWeeks: number;
  /** withdrawal ("حرمان") threshold as a percentage of absence */
  withdrawalLimit: number;
}

/** A typed note/task placed inside a planner week. */
export interface PlannerNote {
  id: string;
  week: number; // 1-based displayed week number (matches planner_items.week_number)
  day?: number; // 0 = Sunday … 6 = Saturday; undefined = whole-week / general
  text: string;
  color: string; // hex
  tag?: string; // tag key (exam/quiz/…) when it's a quick tag
  highlight?: boolean;
  done?: boolean; // task checked off
  /** optional deadline time "HH:MM" (24h) for reminder-eligible dated chips;
   *  null/undefined = all-day. Stored in planner_items.due_time. */
  dueTime?: string | null;
}

/** A freehand pen stroke on the planner drawing layer. */
export interface PlannerStroke {
  id: string;
  color: string;
  width: number;
  points: number[][]; // [[x,y], …] in grid-relative px
}

/** Planner-only overrides for course-derived (auto) items, keyed by component id.
 *  These affect the planner display only — never the underlying course data. */
export interface PlannerAutoEdit {
  hidden?: boolean; // removed from the planner view
  tag?: string; // re-tagged (changes the chip colour)
  done?: boolean; // checked off in the planner (planner-view only)
}

export interface PlannerData {
  notes: PlannerNote[];
  strokes: PlannerStroke[];
  highlights: number[]; // highlighted week indices
  autoEdits: Record<string, PlannerAutoEdit>; // component-id → planner override
}

export interface AppData {
  profileName: string;
  email: string;
  /** profile picture as a data URL (stored locally) */
  profilePhoto: string | null;
  /** target semester GPA (0–5) */
  gpaGoal: number;
  language: "en" | "ar";
  /** active color theme */
  theme: ThemeId;
  semester: Semester;
  courses: Course[];
  planner: PlannerData;
  /** course ids in the order the Tasks page sections are arranged.
   *  Cloud-backed per account via profiles.preferences.taskOrder. */
  taskOrder: string[];
  /** how many days ahead the reminder toast looks (per account, default 2). */
  reminderDays: number;
  /** semester-GPA card mode: live semester GPA, or projected cumulative. */
  gpaMode: GpaMode;
  /** the user's current cumulative GPA (0–5), used by cumulative mode. */
  cumulativeGpa: number;
  /** completed credit hours behind the current cumulative GPA. */
  cumulativeHours: number;
}

/** Semester-GPA card mode. "semester" = live GPA out of 5.0; "cumulative" =
 *  projected new cumulative starting from the user's entered current GPA. */
export type GpaMode = "semester" | "cumulative";
