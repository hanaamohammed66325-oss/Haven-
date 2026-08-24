// ---------------------------------------------------------------------------
// Cloud data layer. Wraps all Supabase reads/writes for the user's academic
// data so the rest of the app never talks to Supabase directly.
//
// Translation happens HERE (and only here): the app keeps its own field names
// (creditHours, weight, unit, date, …); this module maps them to the database
// column names (credits, percentage, unit, graded_on, …) on the way in/out.
//
// Every insert includes user_id = the current logged-in user's id, which Row
// Level Security requires. Functions return the (translated) data on success
// and throw a clear Error on failure — consistently.
//
// Built to grow: attendance / tasks / schedule features can add their own
// functions to this same file later.
// ---------------------------------------------------------------------------

import { supabase } from "./supabase";
import { toISODate } from "./dates";
import type { ComponentType, GradeComponent, WeightUnit } from "@/types";

/** Resolve the current user's id (required on every insert by RLS). */
async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  const id = data.user?.id;
  if (!id) throw new Error("Not signed in.");
  return id;
}

// ---------------------------------------------------------------------------
// Subscription / premium entitlement (public.subscriptions)
// ---------------------------------------------------------------------------

// Fields are kept in snake_case to match the DB row exactly, so the access
// predicates in premium.js (isInTrial / isActiveSubscriber) can read them
// directly. Status enum: 'trial' | 'active' | 'cancelled' | 'expired' |
// 'payment_failed'.
export interface DbSubscription {
  plan: string; // 'free' | 'premium'
  status: string;
  billing_cycle: string | null; // '4months' | '6months' | 'yearly' | null
  trial_ends_at: string | null;
  expires_at: string | null;
  amount_sar: number | null;
  next_billing_at: string | null;
  cancelled_at: string | null;
}

/** The current user's subscription row, or null if none / not signed in.
 *  Unlike the academic reads, this does NOT throw when signed out — callers
 *  (e.g. the mascot gate) just treat "no session" as "not premium". */
export async function getSubscription(): Promise<DbSubscription | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status, billing_cycle, trial_ends_at, expires_at, amount_sar, next_billing_at, cancelled_at")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    plan: data.plan,
    status: data.status,
    billing_cycle: data.billing_cycle ?? null,
    trial_ends_at: data.trial_ends_at ?? null,
    expires_at: data.expires_at ?? null,
    amount_sar: data.amount_sar ?? null,
    next_billing_at: data.next_billing_at ?? null,
    cancelled_at: data.cancelled_at ?? null,
  };
}

/** The current user's premium-relevant profile flags, or null if not signed in.
 *  Like getSubscription, this never throws on "no session". `is_vip` grants
 *  Premium free forever (set by the DB for the VIP accounts). */
export interface DbProfileFlags {
  is_vip: boolean;
}

export async function getProfileFlags(): Promise<DbProfileFlags | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("is_vip")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { is_vip: Boolean(data?.is_vip) };
}

/**
 * Does this subscription grant ACTIVE premium access (ignoring VIP)?
 * Premium = a paid plan (not 'free') whose status is live and not past its end
 * date: an 'active' plan before expires_at, or a 'trial' before trial_ends_at.
 * Everything else (free, cancelled, expired, payment_failed) is not.
 * NOTE: premium.js is the source of truth for gating; this stays for callers
 * that only have the subscription row and want a quick active check.
 */
export function isActivePremium(sub: DbSubscription | null): boolean {
  if (!sub || sub.plan === "free") return false;
  const inFuture = (d: string | null) => !d || new Date(d).getTime() > Date.now();
  if (sub.status === "active") return inFuture(sub.expires_at);
  if (sub.status === "trial") return inFuture(sub.trial_ends_at);
  return false;
}

// --- app-facing shapes (already in the app's field names) -------------------

export interface DbSemester {
  id: string;
  name: string;
  weeks: number; // teaching_weeks
  finalsWeeks: number; // finals_weeks
  startDate: string | null; // start_date
  endDate: string | null; // end_date
}

export interface DbCourse {
  id: string;
  name: string;
  creditHours: number; // credits
  position: number;
  attendanceLimit: number; // attendance_limit (per-course withdrawal % )
}

// ---------------------------------------------------------------------------
// Semester
// ---------------------------------------------------------------------------

const mapSemester = (row: {
  id: string;
  name: string;
  teaching_weeks: number;
  finals_weeks: number;
  start_date: string | null;
  end_date: string | null;
}): DbSemester => ({
  id: row.id,
  name: row.name,
  weeks: row.teaching_weeks,
  finalsWeeks: row.finals_weeks,
  startDate: row.start_date,
  endDate: row.end_date,
});

const SEMESTER_COLS = "id, name, teaching_weeks, finals_weeks, start_date, end_date";

/** The current user's active semester, or null if none exists yet.
 *  ALWAYS scoped to the current auth user — a semester is never resolved for
 *  anyone else, which is what keeps a course from attaching to the wrong account. */
export async function getActiveSemester(): Promise<DbSemester | null> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("semesters")
    .select(SEMESTER_COLS)
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSemester(data) : null;
}

/** Today + a total term length (weeks), as a start/end ISO pair. Used ONLY to
 *  seed a brand-new semester row's dates at creation, and to backfill a
 *  pre-existing row that has neither date set — never to override a semester
 *  that already has a real saved date. */
function defaultDateRange(teachingWeeks: number, finalsWeeks: number): { startDate: string; endDate: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const totalWeeks = Math.max(1, teachingWeeks + finalsWeeks);
  const end = new Date(+start + totalWeeks * 7 * 864e5);
  return { startDate: toISODate(start), endDate: toISODate(end) };
}

/** The owner (user_id) of a semester row, or null if it can't be read. Used to
 *  double-check ownership right before inserting a course under it. */
async function semesterOwnerId(semesterId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("semesters")
    .select("user_id")
    .eq("id", semesterId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.user_id as string | undefined) ?? null;
}

/**
 * Return the active semester, creating one if the user has none yet.
 * `settings` (the app's semester settings) seeds the new row's week counts.
 *
 * "Default start date = today" is applied HERE, at most once, and persisted
 * immediately — never as a client-side fallback recomputed on every load
 * (which would silently show a DIFFERENT "today" each day for anyone who
 * hasn't set a real date yet, and could look like an existing date being
 * reset). Two cases:
 *   - No row yet (first-ever load for this user): the new row is created
 *     WITH today's date + a default term already set.
 *   - A row exists but was created before dates were seeded (both columns
 *     still null): backfilled once, here, and never touched again once set.
 * A semester with ANY real saved date (from either path) is always returned
 * as-is — this function never overwrites one.
 */
export async function ensureActiveSemester(settings?: {
  name?: string;
  weeks?: number;
  finalsWeeks?: number;
}): Promise<DbSemester> {
  const existing = await getActiveSemester();
  if (existing) {
    if (!existing.startDate && !existing.endDate) {
      const range = defaultDateRange(existing.weeks, existing.finalsWeeks);
      await updateSemester(existing.id, range);
      return { ...existing, startDate: range.startDate, endDate: range.endDate };
    }
    return existing;
  }

  const userId = await currentUserId();
  const teachingWeeks = settings?.weeks ?? 13;
  const finalsWeeks = settings?.finalsWeeks ?? 2;
  const range = defaultDateRange(teachingWeeks, finalsWeeks);
  const { data, error } = await supabase
    .from("semesters")
    .insert({
      user_id: userId,
      name: settings?.name?.trim() || "Current semester",
      teaching_weeks: teachingWeeks,
      finals_weeks: finalsWeeks,
      is_active: true,
      start_date: range.startDate,
      end_date: range.endDate,
    })
    .select(SEMESTER_COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapSemester(data);
}

export async function updateSemester(
  id: string,
  fields: Partial<{
    name: string;
    weeks: number;
    finalsWeeks: number;
    // startDate/endDate mirror the same values still written to
    // profiles.preferences; the DATE columns feed notification scheduling.
    // An empty string means "cleared" and is stored as NULL — never a fallback.
    startDate: string;
    endDate: string;
  }>
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.weeks !== undefined) patch.teaching_weeks = fields.weeks;
  if (fields.finalsWeeks !== undefined) patch.finals_weeks = fields.finalsWeeks;
  if (fields.startDate !== undefined) patch.start_date = fields.startDate.trim() || null;
  if (fields.endDate !== undefined) patch.end_date = fields.endDate.trim() || null;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("semesters").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

const mapCourse = (row: {
  id: string;
  name: string;
  credits: number;
  position: number;
  attendance_limit: number | null;
}): DbCourse => ({
  id: row.id,
  name: row.name,
  creditHours: Number(row.credits) || 0,
  position: row.position ?? 0,
  attendanceLimit: Number(row.attendance_limit) || 0,
});

const COURSE_COLS = "id, name, credits, position, attendance_limit";

export async function getCourses(semesterId: string): Promise<DbCourse[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("courses")
    .select(COURSE_COLS)
    .eq("user_id", userId)
    .eq("semester_id", semesterId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCourse);
}

export async function addCourse(
  course: { name: string; creditHours: number; position?: number; attendanceLimit?: number }
): Promise<DbCourse> {
  const userId = await currentUserId();
  // ALWAYS resolve the active semester fresh for THIS user at insert time.
  // Never trust a semester id from cached client state — it may belong to a
  // previously signed-in account and would attach the course to the wrong user.
  let sem = await ensureActiveSemester();
  // Belt-and-suspenders: confirm the resolved semester truly belongs to the
  // current user before inserting; if not, re-resolve once and re-check.
  if ((await semesterOwnerId(sem.id)) !== userId) {
    sem = await ensureActiveSemester();
    if ((await semesterOwnerId(sem.id)) !== userId) {
      throw new Error("Could not resolve the current user's active semester.");
    }
  }
  const { data, error } = await supabase
    .from("courses")
    .insert({
      user_id: userId,
      semester_id: sem.id,
      name: course.name,
      credits: course.creditHours,
      position: course.position ?? 0,
      // Seed the per-course limit (e.g. from the global default); omit → DB default.
      ...(course.attendanceLimit != null && course.attendanceLimit > 0
        ? { attendance_limit: course.attendanceLimit }
        : {}),
    })
    .select(COURSE_COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapCourse(data);
}

export async function updateCourse(
  id: string,
  fields: Partial<{ name: string; creditHours: number; position: number; attendanceLimit: number }>
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.creditHours !== undefined) patch.credits = fields.creditHours;
  if (fields.position !== undefined) patch.position = fields.position;
  if (fields.attendanceLimit !== undefined) patch.attendance_limit = fields.attendanceLimit;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("courses").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCourse(id: string): Promise<void> {
  // Remove every child row that references the course first, then the course
  // itself, so the delete succeeds regardless of the FKs' ON DELETE behaviour.
  for (const table of [
    "grade_components",
    "attendance_absences",
    "attendance_sessions",
    "timetable_entries",
  ]) {
    const del = await supabase.from(table).delete().eq("course_id", id);
    if (del.error) throw new Error(del.error.message);
  }
  const delCourse = await supabase.from("courses").delete().eq("id", id);
  if (delCourse.error) throw new Error(delCourse.error.message);
}

/** Delete every course (and its components) in a semester — used by reset/demo. */
export async function deleteCoursesForSemester(semesterId: string): Promise<void> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("courses")
    .select("id")
    .eq("user_id", userId)
    .eq("semester_id", semesterId);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r) => r.id);
  if (!ids.length) return;
  for (const table of [
    "grade_components",
    "attendance_absences",
    "attendance_sessions",
    "timetable_entries",
  ]) {
    const del = await supabase.from(table).delete().in("course_id", ids);
    if (del.error) throw new Error(del.error.message);
  }
  const delCourses = await supabase.from("courses").delete().in("id", ids);
  if (delCourses.error) throw new Error(delCourses.error.message);
}

// ---------------------------------------------------------------------------
// Grade components
// ---------------------------------------------------------------------------

const mapComponent = (row: {
  id: string;
  name: string;
  type: string | null;
  percentage: number | null;
  unit: string | null;
  total: number | null;
  score: number | null;
  graded_on: string | null;
}): GradeComponent => ({
  id: row.id,
  name: row.name,
  type: (row.type ?? "quiz") as ComponentType,
  weight: Number(row.percentage) || 0,
  unit: (row.unit === "points" ? "points" : "percent") as WeightUnit,
  total: Number(row.total) || 0,
  score: row.score == null ? null : Number(row.score),
  date: row.graded_on,
});

const COMPONENT_COLS = "id, name, type, percentage, unit, total, score, graded_on";

export async function getGradeComponents(courseId: string): Promise<GradeComponent[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("grade_components")
    .select(COMPONENT_COLS)
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapComponent);
}

export async function addGradeComponent(
  courseId: string,
  comp: Omit<GradeComponent, "id">
): Promise<GradeComponent> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("grade_components")
    .insert({
      user_id: userId,
      course_id: courseId,
      name: comp.name,
      type: comp.type,
      percentage: comp.weight,
      unit: comp.unit,
      total: comp.total,
      score: comp.score,
      graded_on: comp.date,
    })
    .select(COMPONENT_COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapComponent(data);
}

export async function updateGradeComponent(
  id: string,
  fields: Partial<Omit<GradeComponent, "id">>
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.type !== undefined) patch.type = fields.type;
  if (fields.weight !== undefined) patch.percentage = fields.weight;
  if (fields.unit !== undefined) patch.unit = fields.unit;
  if (fields.total !== undefined) patch.total = fields.total;
  if (fields.score !== undefined) patch.score = fields.score;
  if (fields.date !== undefined) patch.graded_on = fields.date;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("grade_components").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteGradeComponent(id: string): Promise<void> {
  const { error } = await supabase.from("grade_components").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// User preferences (profiles.preferences jsonb)
//
// Per-account UI/settings — theme, language, calendar, attendance limits, etc.
// These used to live in localStorage (device-scoped, so they leaked between
// accounts on a shared device); they now belong to the signed-in user's row.
// ---------------------------------------------------------------------------

export type Preferences = Record<string, unknown>;

/** The current user's stored preferences, or {} if the column is null/empty. */
export async function getPreferences(): Promise<Preferences> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const prefs = data?.preferences;
  return prefs && typeof prefs === "object" ? (prefs as Preferences) : {};
}

/**
 * Merge `partial` into the current user's preferences.
 *
 * Uses a SERVER-SIDE atomic merge (`merge_preferences` RPC, jsonb `||`).
 * The old read-merge-write here lost data: Settings saves on every keystroke,
 * so two overlapping calls both read the same snapshot and both wrote their own
 * merge — whichever UPDATE landed last silently discarded the other's keys.
 * Typing "20" into the withdrawal limit could persist "2", after which every
 * course was evaluated against a 2% limit and the dashboard filled with false
 * withdrawal warnings.
 */
export async function savePreferences(partial: Preferences): Promise<void> {
  if (!partial || Object.keys(partial).length === 0) return;
  const { error } = await supabase.rpc("merge_preferences", { patch: partial });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Schedule + attendance (weekly sessions, timetable details, planner, absences)
//
// A weekly class meeting is modelled in the app as ONE CourseSession that
// carries BOTH the attendance duration and the timetable display fields. The DB
// splits that across attendance_sessions (day + duration — drives the % ) and a
// SEPARATE timetable_entries row (its OWN id) for the display extras (time /
// room / building / notes). The two rows are linked by the session id stored in
// the timetable row's JSON note (`sid`) — never by sharing a primary key — so
// each is created/updated/deleted independently and one never clobbers the
// other. Absences store their weekday inside the date-only `absent_on` column.
// ---------------------------------------------------------------------------

// Canonical weekday integers used for BOTH read and write:
//   Sunday=0, Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5, Saturday=6
// (identical to the app's day values and JS Date.getUTCDay()). `toDayOfWeek`
// preserves any valid selection 0..6 exactly and only falls back to 0 for
// genuinely invalid input — it never overrides a real weekday.
function toDayOfWeek(day: number): number {
  const n = Math.trunc(Number(day));
  return Number.isFinite(n) && n >= 0 && n <= 6 ? n : 0;
}
const fromDayOfWeek = toDayOfWeek;

// Pick a real calendar date whose weekday equals `day` (0=Sun..6=Sat) so an
// absence can carry its weekday through the date-only `absent_on` column.
// All UTC to stay timezone-stable.
function isoForWeekday(day: number): string {
  const base = new Date();
  const offset = ((((day | 0) - base.getUTCDay()) % 7) + 7) % 7;
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offset));
  return d.toISOString().slice(0, 10);
}
function weekdayFromIso(iso: string | null): number {
  if (!iso) return 0;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// timetable_entries.note holds the fields with no column of their own, plus the
// owning session id (`sid`) that links this detail row back to its session.
function encodeTtNote(sessionId: string, building?: string, notes?: string[]): string {
  const b = building && building.trim() ? building.trim() : undefined;
  const ns = (notes ?? []).filter((n): n is string => typeof n === "string");
  return JSON.stringify({ sid: sessionId, building: b, notes: ns });
}
function decodeTtNote(note: string | null): { sessionId: string | null; building?: string; notes: string[] } {
  if (!note) return { sessionId: null, notes: [] };
  try {
    const o = JSON.parse(note) as { sid?: unknown; building?: unknown; notes?: unknown };
    if (o && typeof o === "object") {
      return {
        sessionId: typeof o.sid === "string" ? o.sid : null,
        building: typeof o.building === "string" ? o.building : undefined,
        notes: Array.isArray(o.notes) ? o.notes.filter((x): x is string => typeof x === "string") : [],
      };
    }
  } catch {
    // not JSON → treat legacy plain text as a single note (unlinked)
  }
  return { sessionId: null, notes: [note] };
}

// ---- Attendance sessions (day + duration) ---------------------------------
export interface DbAttendanceSession {
  id: string;
  courseId: string;
  day: number;
  minutes: number;
}

export async function getAttendanceSessions(): Promise<DbAttendanceSession[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("attendance_sessions")
    .select("id, course_id, day_of_week, duration_minutes")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    courseId: r.course_id,
    day: fromDayOfWeek(r.day_of_week), // integer weekday back to the app's value
    minutes: r.duration_minutes ?? 0,
  }));
}

export async function addAttendanceSession(
  courseId: string,
  fields: { day: number; minutes: number }
): Promise<DbAttendanceSession> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("attendance_sessions")
    .insert({
      user_id: userId,
      course_id: courseId,
      day_of_week: toDayOfWeek(fields.day), // store the selected weekday, not 0
      duration_minutes: fields.minutes,
    })
    .select("id, course_id, day_of_week, duration_minutes")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    courseId: data.course_id,
    day: fromDayOfWeek(data.day_of_week),
    minutes: data.duration_minutes ?? 0,
  };
}

export async function updateAttendanceSession(
  id: string,
  fields: Partial<{ day: number; minutes: number }>
): Promise<void> {
  const patch: Record<string, unknown> = {};
  // Persist the exact weekday the user picked (0..6) — never hardcode/default.
  if (fields.day !== undefined) patch.day_of_week = toDayOfWeek(fields.day);
  if (fields.minutes !== undefined) patch.duration_minutes = fields.minutes;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("attendance_sessions").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteAttendanceSession(id: string): Promise<void> {
  const { error } = await supabase.from("attendance_sessions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- Timetable details (its OWN row/id, linked to a session by `sessionId`) -
export interface DbTimetableEntry {
  id: string; // the timetable row's own id (NOT the session id)
  sessionId: string | null; // owning attendance_sessions id, from the note JSON
  courseId: string | null;
  day: number;
  time?: string;
  endTime?: string;
  building?: string;
  room?: string;
  notes: string[];
}

export async function getTimetable(): Promise<DbTimetableEntry[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("timetable_entries")
    .select("id, course_id, day_of_week, start_time, end_time, room, note")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const { sessionId, building, notes } = decodeTtNote(r.note);
    return {
      id: r.id,
      sessionId,
      courseId: r.course_id,
      day: fromDayOfWeek(r.day_of_week),
      time: r.start_time ?? undefined,
      endTime: r.end_time ?? undefined,
      building,
      room: r.room ?? undefined,
      notes,
    };
  });
}

interface TimetableFields {
  sessionId: string;
  courseId: string;
  day: number;
  time?: string;
  endTime?: string;
  building?: string;
  room?: string;
  notes?: string[];
}

/** Create a NEW timetable-detail row (its own id) for a session; returns its id. */
export async function addTimetableEntry(fields: TimetableFields): Promise<string> {
  const userId = await currentUserId();
  const sem = await ensureActiveSemester();
  const { data, error } = await supabase
    .from("timetable_entries")
    .insert({
      user_id: userId,
      semester_id: sem.id,
      course_id: fields.courseId,
      day_of_week: toDayOfWeek(fields.day),
      start_time: fields.time && fields.time.trim() ? fields.time.trim() : null,
      end_time: fields.endTime && fields.endTime.trim() ? fields.endTime.trim() : null,
      room: fields.room && fields.room.trim() ? fields.room.trim() : null,
      note: encodeTtNote(fields.sessionId, fields.building, fields.notes),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Update an existing timetable-detail row by its OWN id. */
export async function updateTimetableEntry(id: string, fields: TimetableFields): Promise<void> {
  const { error } = await supabase
    .from("timetable_entries")
    .update({
      course_id: fields.courseId,
      day_of_week: toDayOfWeek(fields.day),
      start_time: fields.time && fields.time.trim() ? fields.time.trim() : null,
      end_time: fields.endTime && fields.endTime.trim() ? fields.endTime.trim() : null,
      room: fields.room && fields.room.trim() ? fields.room.trim() : null,
      note: encodeTtNote(fields.sessionId, fields.building, fields.notes),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTimetableEntry(id: string): Promise<void> {
  const { error } = await supabase.from("timetable_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- Absences (missed sessions) -------------------------------------------
export interface DbAbsence {
  id: string;
  courseId: string;
  day: number;
  minutes: number;
}

export async function getAbsences(): Promise<DbAbsence[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("attendance_absences")
    .select("id, course_id, absent_on, minutes")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    courseId: r.course_id,
    day: weekdayFromIso(r.absent_on),
    minutes: Number(r.minutes) || 0,
  }));
}

export async function addAbsence(
  courseId: string,
  fields: { day: number; minutes: number }
): Promise<DbAbsence> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("attendance_absences")
    .insert({
      user_id: userId,
      course_id: courseId,
      absent_on: isoForWeekday(fields.day),
      minutes: fields.minutes,
      excused: false,
    })
    .select("id, course_id, absent_on, minutes")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    courseId: data.course_id,
    day: weekdayFromIso(data.absent_on),
    minutes: Number(data.minutes) || 0,
  };
}

export async function deleteAbsence(id: string): Promise<void> {
  const { error } = await supabase.from("attendance_absences").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- Planner items ---------------------------------------------------------
export interface DbPlannerItem {
  id: string;
  week: number;
  day: number | null;
  tag: string | null;
  text: string;
  done: boolean;
  dueTime: string | null; // due_time "HH:MM" (24h) or null
}
// planner_items.day_of_week is NOT NULL — sentinel for whole-week (general) notes.
const PLANNER_WHOLE_WEEK = -1;

// Normalize a time to "HH:MM" (24h) or null; guards the DB CHECK constraint.
const cleanTime = (t?: string | null): string | null => {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
};

export async function getPlannerItems(): Promise<DbPlannerItem[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("planner_items")
    .select("id, week_number, day_of_week, tag, note, done, due_time")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    week: r.week_number ?? 0,
    day: r.day_of_week == null || r.day_of_week === PLANNER_WHOLE_WEEK ? null : r.day_of_week,
    tag: r.tag ?? null,
    text: r.note ?? "",
    done: !!r.done,
    dueTime: r.due_time ?? null,
  }));
}

export async function addPlannerItem(item: {
  week: number;
  day: number | null;
  tag?: string | null;
  text: string;
  done?: boolean;
  dueTime?: string | null;
}): Promise<DbPlannerItem> {
  const userId = await currentUserId();
  const sem = await ensureActiveSemester();
  const { data, error } = await supabase
    .from("planner_items")
    .insert({
      user_id: userId,
      semester_id: sem.id,
      week_number: item.week,
      day_of_week: item.day == null ? PLANNER_WHOLE_WEEK : item.day,
      tag: item.tag ?? null,
      note: item.text,
      done: item.done ?? false,
      due_time: cleanTime(item.dueTime),
    })
    .select("id, week_number, day_of_week, tag, note, done, due_time")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    week: data.week_number ?? 0,
    day: data.day_of_week === PLANNER_WHOLE_WEEK ? null : data.day_of_week,
    tag: data.tag ?? null,
    text: data.note ?? "",
    done: !!data.done,
    dueTime: data.due_time ?? null,
  };
}

export async function updatePlannerItem(
  id: string,
  fields: Partial<{
    week: number;
    day: number | null;
    tag: string | null;
    text: string;
    done: boolean;
    dueTime: string | null;
  }>
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (fields.week !== undefined) patch.week_number = fields.week;
  if (fields.day !== undefined) patch.day_of_week = fields.day == null ? PLANNER_WHOLE_WEEK : fields.day;
  if (fields.tag !== undefined) patch.tag = fields.tag;
  if (fields.text !== undefined) patch.note = fields.text;
  if (fields.done !== undefined) patch.done = fields.done;
  if (fields.dueTime !== undefined) patch.due_time = cleanTime(fields.dueTime); // null when unset
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("planner_items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePlannerItem(id: string): Promise<void> {
  const { error } = await supabase.from("planner_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
