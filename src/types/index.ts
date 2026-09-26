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
  endTime?: string; // end time "HH:MM" (optional) — shown as "From X to Y"
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
  /** actual date of absence (ISO YYYY-MM-DD) — null for legacy entries */
  date?: string;
  /** excused absences still count toward the withdrawal limit (an accepted
   *  excuse lets the college lift a denial); flagged to show "X% of it excused" */
  excused?: boolean;
  /** tardiness in minutes (0 or undefined = full absence, >0 = late arrival) */
  tardiness?: number;
}

export interface Course {
  id: string;
  name: string;
  creditHours: number;
  /** this course's own withdrawal ("حرمان") limit as an absence % (from
   *  courses.attendance_limit). 0/undefined → the term's rule. Older rows carry
   *  the default (25 / the term limit) the app saved on every course, so only a
   *  value the student chose counts (see hasOwnLimit in lib/grades). */
  attendanceLimit?: number;
  /** true when the student set attendanceLimit themselves (preferences.ownLimits,
   *  attached by the store, not persisted on the course). */
  ownLimit?: boolean;
  /** how this course counts absence toward حرمان:
   *  - "hour" (default): duration-based — each contact hour is a share of 100%.
   *  - "lecture": each missed lecture is an equal share (100 / total lectures),
   *    matching a professor who counts absences by session, not by hour.
   *  Undefined behaves as "hour" so existing courses are unchanged. */
  attendanceMode?: "hour" | "lecture";
  /** lecture mode only: a manual per-lecture % that overrides the auto share,
   *  for a professor who fixes each absence at a set percentage (e.g. 8%).
   *  0/undefined → auto (100 / total lectures). */
  perLecturePct?: number;
  instructorName?: string;
  color?: string;
  /** weekly class meetings — drives totals for both counting methods */
  sessions: CourseSession[];
  /** missed count for the "by lecture" method */
  missedLectures: number;
  /** logged missed sessions for the "by hour" method */
  missedSessions: MissedEntry[];
  components: GradeComponent[];
  /** The course's official result from the university portal, entered in the
   *  end-of-term check. Derived from `TermCheck.grades` by the store (never a
   *  courses-table column); when present it replaces the estimate everywhere. */
  official?: OfficialGrade;
  /** Set when the student is repeating the course (lib/repeats): why, and the
   *  earlier attempt's grade when the university drops it from the cumulative
   *  GPA. Derived from `AppData.repeats` by the store (never a courses-table
   *  column). */
  repeat?: RepeatInfo;
}

/** A repeated course's earlier attempt. `kind` is asked at Saudi universities,
 *  whose study regulations decide it: a failed course keeps both grades; a
 *  passed one the college assigns to reach the graduation GPA counts the
 *  higher grade. Elsewhere AcademicInfo.repeatPolicy decides. */
export interface RepeatInfo extends OfficialGrade {
  kind?: "failed" | "raise";
}

/** An official course result: the portal letter (points schemes) or the final
 *  mark (percentage schemes). */
export interface OfficialGrade {
  letter?: string;
  mark?: number;
}

export type TermMismatchReason = "repeat" | "notCounted" | "hours" | "unknown";

/** The student's answers in the end-of-term check (per account, in
 *  preferences.termCheck), scoped to one semester. See components/TermCheck. */
/** The cumulative GPA after a term compared with the portal's: ours from the
 *  cumulative GPA before the term (and its hours) plus the term's courses. */
export interface CumulativeCheck {
  /** cumulative GPA before the term, and the hours it covers */
  before: number;
  hours: number;
  /** the portal's cumulative GPA after the term */
  portal: number;
  /** ours for the same point */
  ours: number;
  result: "match" | "mismatch";
  reason?: TermMismatchReason;
}

export interface TermCheck {
  /** semesters.id the answers belong to — a new term starts a fresh check. */
  term: string;
  /** did our semester GPA match the portal's? unset until they answer. */
  answer?: "match" | "mismatch";
  portalGpa?: number;
  /** official result per course id. */
  grades: Record<string, OfficialGrade>;
  /** agreed to let the Haven team see this term's courses and grades. */
  consent?: boolean;
  reason?: TermMismatchReason;
  /** "not out yet" — ask again from this ISO date. */
  snoozeUntil?: string;
  /** the cumulative GPA after this term, checked against the portal */
  cum?: CumulativeCheck;
  at: string;
}

/** One course of a past term the student entered from their transcript. */
export interface PastTermCourse {
  name?: string;
  hours: number;
  /** portal letter (points schemes) */
  letter?: string;
  /** final mark (percentage schemes) */
  mark?: number;
  /** optional course % — teaches us where the letter cutoffs sit */
  pct?: number;
}

/** A past term checked against the portal (per account, preferences.pastTerms). */
export interface PastTerm {
  id: string;
  name: string;
  /** the scheme the letters belong to, when entered */
  scheme: string;
  courses: PastTermCourse[];
  portalGpa: number;
  /** our GPA for these courses, when entered */
  ours: number;
  result: "match" | "mismatch";
  /** the cumulative GPA before and after this term, when entered */
  cum?: CumulativeCheck;
  consent?: boolean;
  reason?: TermMismatchReason;
  at: string;
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
  /** tardiness conversion rule id (default: "standard") */
  tardinessRuleId?: string;
  customTardinessThreshold?: number;
  customTardiesPerAbsence?: number;
  /** holiday IDs the student has dismissed (don't apply to them) */
  dismissedHolidays?: string[];
  /** extra holidays the student added by hand to match their university's own
   *  official calendar (the escape hatch for per-university variance). */
  customHolidays?: CustomHoliday[];
  /** How this term's absence limit is decided — set at runtime by the store
   *  (never persisted): the university's verified rule, the student's own
   *  answer, or none. Absent (demo, admin, tests) = the legacy withdrawalLimit. */
  attendanceRule?: AttendanceRule;
}

/** Where the absence limit comes from and what it is. See lib/attendancePolicy. */
export interface AttendanceRule {
  /** university = verified official rule · personal = the student's own
   *  answer · none = unknown, so no percentage is shown */
  source: "university" | "personal" | "none";
  /** denial above this % (excused included unless excusedCounts is false) */
  maxAbsence: number | null;
  /** a separate, lower limit for absence without an accepted excuse */
  maxUnexcused: number | null;
  excusedCounts: boolean;
  warnings: number[];
  method: "hours" | "lectures" | "count" | "none" | "unspecified";
  /** denial AT the limit itself ("20% or more"), not only above it */
  inclusive?: boolean;
  /** the university has a rule the student hasn't confirmed yet: until they do,
   *  absence is shown in hours / lectures without a percentage */
  pending?: boolean;
}

/** The student's own answer about how their university counts absence
 *  (preferences.attendanceRule). Applies to them right away; it becomes the
 *  university's rule only after an admin accepts it with an official link. */
export interface PersonalAttendanceRule {
  maxAbsence: number | null;
  maxUnexcused: number | null;
  excusedCounts: boolean;
  method: "hours" | "lectures" | "unspecified";
  lateRule?: string | null;
  regulationUrl?: string | null;
  reportedAt: string;
}

/** A user-added holiday for the active semester — the freedom to make the app's
 *  calendar match a university's real, recently published one. Persisted inside
 *  profiles.preferences alongside the rest of the semester config (no DB column). */
export interface CustomHoliday {
  id: string; // "custom-<timestamp>"
  name: string; // student-typed label (shown as-is in both languages)
  startDate: string; // ISO yyyy-mm-dd (inclusive)
  endDate: string; // ISO yyyy-mm-dd (inclusive)
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

/** The student's academic identity — university, major, and level. Stored per
 *  account in profiles.preferences.academic and shown as a header on the
 *  dashboard/profile plus in the admin per-user view and aggregates. */
export interface AcademicInfo {
  /** slug from lib/tools/universities, or "other" for a manually typed name. */
  universitySlug: string | null;
  /** display name of the university (the custom text when slug is "other"). */
  universityName: string;
  /** free-text field of study. */
  major: string;
  /** academic level: "1".."10", or any custom text the student enters. */
  level: string;
  /** GPA grading system: "auto" (or unset) detects it from the university;
   *  the rest force a specific scheme. Mirrors SchemeId in lib/gradeSchemes. */
  gpaSchemeId?:
    | "auto"
    | "saudi5"
    | "saudi4"
    | "percentage"
    | "plusminus4"
    | "qatar4"
    | "jordan4"
    | "jordan4new"
    | "jordan4plus"
    | "custom";
  /** The student's answer to "is this your university's points table?" for a
   *  table detected from the unverified catalogue. `key` is the catalogue
   *  slug it was asked about, so picking another university asks again. */
  gradeCheck?: GradeCheck;
  /** Confirmed their university's holidays (outside Saudi Arabia). */
  holidayCheck?: HolidayCheck;
  /** A points table the student entered themselves (used when gpaSchemeId is
   *  "custom"); also reported to the admin to correct the catalogue. */
  customScheme?: CustomSchemeData;
  /** How the university counts a repeated course in the cumulative GPA, for
   *  universities outside Saudi Arabia (asked the first time the student marks
   *  one): the higher grade, the latest grade, both attempts, or "other" —
   *  described in repeatPolicyNote, sent to us to add, and counted as "both"
   *  until then. */
  repeatPolicy?: RepeatPolicy;
  repeatPolicyNote?: string;
  /** The major's minimum graduation GPA — the ceiling a Saudi student's GPA
   *  can reach through courses repeated to raise it. */
  gradMinGpa?: number;
}

export type RepeatPolicy = "higher" | "latest" | "both" | "other";

/** The student confirmed "these are my university's holidays" (Settings →
 *  Holidays), for a university outside Saudi Arabia. `calendar` is the
 *  calendar key they confirmed (lib/universityCountry holidayCalendar), so a
 *  new university or calendar asks again. The admin page reads it together
 *  with the holidays they removed or added. */
export interface HolidayCheck {
  calendar: string;
  /** ISO timestamp of the answer. */
  at: string;
}

export interface GradeCheck {
  key: string;
  answer: "yes" | "no";
  /** ISO timestamp of the answer. */
  at: string;
}

export interface CustomSchemeData {
  /** What the GPA is out of (4, 5, 4.3, 10, 20 …); 100 when `percent`. */
  max: number;
  /** A percentage-average system: the GPA is the average of the course marks,
   *  and the rows only name the grade bands (`points` is unused). */
  percent?: boolean;
  /** One row per grade; `min` = lowest percentage for it, null when unknown. */
  bands: { letter: string; points: number; min: number | null }[];
}

/** What the student confirmed in the setup check. `semester` = "my core
 *  settings (term dates, weeks, حرمان limit, breaks) are correct". */
export interface SetupConfirmed {
  semester?: boolean;
  /** the suggested calendar the student answered about in mid-term
   *  ("slug|YYYY-YYYY|term"), so they're asked once per term */
  calendar?: string;
  /** the official term (lib/universityTerms, "key|YYYY-YYYY|term") whose
   *  dates were last put on the semester automatically */
  termApplied?: string;
  /** that term's start and end, to tell whether the student changed them since */
  termAppliedDates?: { start: string; end: string };
  /** the semester's dates before that, so the student can take them back */
  termPrev?: { startDate: string; endDate: string; weeks: number; finalsWeeks: number };
  /** the term the student answered about — confirmed, corrected or completed
   *  ("key|YYYY-YYYY|term"), or "none|…" once they added their own dates for a
   *  university with no calendar on record */
  termAnswered?: string;
}

export interface AppData {
  profileName: string;
  email: string;
  /** the student's university / major / level (per account). */
  academic: AcademicInfo;
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
  /** customizable notification preferences (per account, in preferences.notifPrefs). */
  notifPrefs: NotifPrefs;
  /** custom name for the Havi mascot (default "Havi") */
  haviName: string;
  /** the whole absence system on/off (Settings); off hides every absence
   *  screen, card and reminder. Per account in preferences.attendanceEnabled. */
  attendanceEnabled: boolean;
  /** the student's own absence rule, or null (preferences.attendanceRule). */
  personalAttendanceRule: PersonalAttendanceRule | null;
  /** the university rule the student confirmed, as "<id>:<rule>" so a change to
   *  the rule itself asks again (preferences.attendancePolicyAck). Until it
   *  matches, no absence percentage is shown. */
  attendancePolicyAck: string | null;
  /** ids of courses whose attendanceLimit the student chose themselves
   *  (preferences.ownLimits). Other stored limits are the old saved default. */
  ownLimits: string[];
  /** whether the first-run onboarding walkthrough has been completed/skipped
   *  (per account, in preferences.onboardingSeen). Drives the one-time tour. */
  onboardingSeen: boolean;
  /** essential-setup answers the student confirmed in the setup check (per
   *  account, in preferences.setupConfirmed). See components/SetupCheck. */
  setupConfirmed: SetupConfirmed;
  gamification: import("@/lib/gamification").GamificationState;
  /** Pomodoro focus-timer configuration (per account, in preferences.pomodoroSettings). */
  pomodoroSettings: PomodoroSettings;
  /** Pomodoro session history + stats (per account, in preferences.pomodoroStats). */
  pomodoroStats: PomodoroStats;
  /** end-of-term GPA check answers for the current semester, or null. */
  termCheck: TermCheck | null;
  /** past terms checked against the portal (optional, from the Profile page). */
  pastTerms: PastTerm[];
  /** repeated courses this semester: course id → the earlier attempt's grade. */
  repeats: Record<string, RepeatInfo>;
}

export interface PomodoroSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** focus sessions before a long break */
  sessionsBeforeLong: number;
  soundEnabled: boolean;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  /** per-course chosen bloom colour (courseId → hex). Overrides the course's own
   *  colour in the pond; absent = the course colour, else a hashed fallback. */
  padColors?: Record<string, string>;
}

/** One day's Pomodoro activity, kept in a rolling 30-day window. */
export interface PomodoroSessionRecord {
  date: string; // ISO YYYY-MM-DD
  completedSessions: number;
  totalFocusMinutes: number;
  abandonedSessions: number;
}

/** One completed focus session, kept as a single lily pad in the pond. Carries
 *  which course it was spent on so the pond can bloom that subject's colour — the
 *  lake becomes a living map of what the student actually studied. */
export interface PomodoroPad {
  date: string; // ISO YYYY-MM-DD
  courseId: string | null; // null = "General" (no specific course)
  minutes: number;
}

export interface PomodoroStats {
  totalSessions: number;
  totalFocusMinutes: number;
  longestDailyStreak: number;
  currentDailyStreak: number;
  lastSessionDate: string | null;
  recentDays: PomodoroSessionRecord[];
  /** lily pads currently floating in the pond (visual continuity across reloads) */
  lilyPadCount: number;
  /** per-session pads (newest last), each tagged with the course it was spent on.
   *  May be shorter than lilyPadCount for sessions logged before this existed. */
  pads: PomodoroPad[];
}

/** Semester-GPA card mode. "semester" = live GPA out of 5.0; "cumulative" =
 *  projected new cumulative starting from the user's entered current GPA. */
export type GpaMode = "semester" | "cumulative";

/**
 * Customizable notification preferences, stored under
 * profiles.preferences.notifPrefs. The client persists and reads this;
 * the scheduler in src/lib/notifScheduler.ts fires timed notifications. Offset arrays hold 1 or 2 values, largest
 * (earliest) lead time first. See src/lib/notifPrefs.ts for defaults + the
 * read/normalize helper.
 */
export interface NotifPrefs {
  /** date-based items (quizzes, midterms, finals, assignments, projects) */
  exams: { enabled: boolean; days: number[] }; // up to 2, each 1..30
  /** planner items that carry a specific time */
  tasks: { enabled: boolean; hours: number[] }; // up to 2, each 1..72
  /** approaching-the-absence-limit alerts (timing computed automatically) */
  attendance: { enabled: boolean };
  /** minutes before a class start to remind — 5..120 */
  lectures: { enabled: boolean; minutesBefore: number };
  /** hour of day (0..23) day-based reminders are delivered */
  dailyReminderHour: number;
}
