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
import type { ComponentType, GradeComponent, WeightUnit } from "@/types";

/** Resolve the current user's id (required on every insert by RLS). */
async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  const id = data.user?.id;
  if (!id) throw new Error("Not signed in.");
  return id;
}

// --- app-facing shapes (already in the app's field names) -------------------

export interface DbSemester {
  id: string;
  name: string;
  weeks: number; // teaching_weeks
  finalsWeeks: number; // finals_weeks
}

export interface DbCourse {
  id: string;
  name: string;
  creditHours: number; // credits
  position: number;
}

// ---------------------------------------------------------------------------
// Semester
// ---------------------------------------------------------------------------

const mapSemester = (row: {
  id: string;
  name: string;
  teaching_weeks: number;
  finals_weeks: number;
}): DbSemester => ({
  id: row.id,
  name: row.name,
  weeks: row.teaching_weeks,
  finalsWeeks: row.finals_weeks,
});

/** The current user's active semester, or null if none exists yet. */
export async function getActiveSemester(): Promise<DbSemester | null> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("semesters")
    .select("id, name, teaching_weeks, finals_weeks")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSemester(data) : null;
}

/**
 * Return the active semester, creating one if the user has none yet.
 * `settings` (the app's semester settings) seeds the new row's week counts.
 */
export async function ensureActiveSemester(settings?: {
  name?: string;
  weeks?: number;
  finalsWeeks?: number;
}): Promise<DbSemester> {
  const existing = await getActiveSemester();
  if (existing) return existing;

  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("semesters")
    .insert({
      user_id: userId,
      name: settings?.name?.trim() || "Current semester",
      teaching_weeks: settings?.weeks ?? 13,
      finals_weeks: settings?.finalsWeeks ?? 2,
      is_active: true,
    })
    .select("id, name, teaching_weeks, finals_weeks")
    .single();
  if (error) throw new Error(error.message);
  return mapSemester(data);
}

export async function updateSemester(
  id: string,
  fields: Partial<{ name: string; weeks: number; finalsWeeks: number }>
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.weeks !== undefined) patch.teaching_weeks = fields.weeks;
  if (fields.finalsWeeks !== undefined) patch.finals_weeks = fields.finalsWeeks;
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
}): DbCourse => ({
  id: row.id,
  name: row.name,
  creditHours: Number(row.credits) || 0,
  position: row.position ?? 0,
});

export async function getCourses(semesterId: string): Promise<DbCourse[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("courses")
    .select("id, name, credits, position")
    .eq("user_id", userId)
    .eq("semester_id", semesterId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCourse);
}

export async function addCourse(
  semesterId: string,
  course: { name: string; creditHours: number; position?: number }
): Promise<DbCourse> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("courses")
    .insert({
      user_id: userId,
      semester_id: semesterId,
      name: course.name,
      credits: course.creditHours,
      position: course.position ?? 0,
    })
    .select("id, name, credits, position")
    .single();
  if (error) throw new Error(error.message);
  return mapCourse(data);
}

export async function updateCourse(
  id: string,
  fields: Partial<{ name: string; creditHours: number; position: number }>
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.creditHours !== undefined) patch.credits = fields.creditHours;
  if (fields.position !== undefined) patch.position = fields.position;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("courses").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCourse(id: string): Promise<void> {
  // Remove the course's grade components first, then the course itself, so the
  // delete succeeds regardless of the FK's ON DELETE behaviour.
  const del1 = await supabase.from("grade_components").delete().eq("course_id", id);
  if (del1.error) throw new Error(del1.error.message);
  const del2 = await supabase.from("courses").delete().eq("id", id);
  if (del2.error) throw new Error(del2.error.message);
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
  const delComps = await supabase.from("grade_components").delete().in("course_id", ids);
  if (delComps.error) throw new Error(delComps.error.message);
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
