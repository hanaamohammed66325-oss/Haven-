// Optional contribution while the attendance calculation is suspended: a
// covered image of the portal's absence record for one course, plus the
// context Haven already has, frozen at sending time. Review material only; it
// changes no calculation. Server side: migration 20261024_attendance_contributions.

import type { AcademicInfo, Course, Semester } from "@/types";
import { supabase } from "./supabase";

export const EVIDENCE_BUCKET = "attendance-evidence";
/** The bucket refuses larger files (600 KB); the app aims a little below. */
export const EVIDENCE_MAX_BYTES = 580 * 1024;
const MAX_SIDE = 1600;

export type MatchAnswer = "yes" | "no" | "unsure";

/** A rectangle in the source image's own pixels. */
export interface Rect { x: number; y: number; w: number; h: number }

/** What the contribution freezes about the course at sending time: everything
 *  the review needs to compare with the portal, nothing about the student
 *  beyond their study context. */
export function contributionContext(course: Course, semester: Semester, academic: AcademicInfo) {
  return {
    v: 1,
    university: { slug: academic.universitySlug, name: academic.universityName },
    major: academic.major || null,
    level: academic.level || null,
    term: {
      start: semester.startDate || null,
      end: semester.endDate || null,
      weeks: semester.weeks ?? null,
      calendar: semester.calendarType ?? null,
    },
    course: {
      name: course.name,
      credits: course.creditHours,
      mode: course.attendanceMode ?? "hour",
      sessions: course.sessions.map((s) => ({ day: s.day, minutes: s.minutes, time: s.time ?? null })),
    },
    absences: (course.missedSessions ?? []).map((m) => ({
      date: m.date ?? null,
      day: m.day,
      minutes: m.minutes,
      excused: !!m.excused,
      late: m.tardiness && m.tardiness > 0 ? m.tardiness : null,
    })),
  };
}

/** The crop clamped to the image, at least 1×1 pixel. Null means the whole image. */
export function clampRect(r: Rect | null, width: number, height: number): Rect {
  if (!r) return { x: 0, y: 0, w: width, h: height };
  const x = Math.max(0, Math.min(width - 1, Math.round(Math.min(r.x, r.x + r.w))));
  const y = Math.max(0, Math.min(height - 1, Math.round(Math.min(r.y, r.y + r.h))));
  const x2 = Math.max(x + 1, Math.min(width, Math.round(Math.max(r.x, r.x + r.w))));
  const y2 = Math.max(y + 1, Math.min(height, Math.round(Math.max(r.y, r.y + r.h))));
  return { x, y, w: x2 - x, h: y2 - y };
}

/** Output size for a crop: the long side at most `maxSide`, aspect kept. */
export function fitSize(w: number, h: number, maxSide = MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Draws the cropped image with the covered areas painted solid, then encodes
 *  it as JPEG small enough for the bucket. Redrawing on a canvas also drops the
 *  file's hidden data (location, device). Only this copy is ever sent. */
export async function renderEvidence(img: HTMLImageElement, crop: Rect | null, covers: Rect[]): Promise<Blob> {
  const c = clampRect(crop, img.naturalWidth, img.naturalHeight);
  let side = MAX_SIDE;
  let quality = 0.8;
  for (let i = 0; i < 8; i++) {
    const size = fitSize(c.w, c.h, side);
    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    const k = size.w / c.w;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, size.w, size.h);
    ctx.fillStyle = "#111";
    for (const r of covers) {
      const rr = clampRect(r, img.naturalWidth, img.naturalHeight);
      ctx.fillRect((rr.x - c.x) * k, (rr.y - c.y) * k, rr.w * k, rr.h * k);
    }
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("encode");
    if (blob.size <= EVIDENCE_MAX_BYTES) return blob;
    if (quality > 0.55) quality -= 0.1;
    else side = Math.round(side * 0.8);
  }
  throw new Error("too_large");
}

export type SubmitResult = { ok: true } | { ok: false; reason: "too_many" | "failed" };

/** Uploads the covered image into the student's own folder, then records the
 *  contribution. With no signed-in account (demo pages) nothing is sent. */
export async function submitContribution(
  accountId: string | null | undefined,
  input: { image: Blob; coversUntil: string | null; matches: MatchAnswer; ruleUrl: string; note: string; context: unknown }
): Promise<SubmitResult> {
  if (!accountId) return { ok: true };
  const path = `${accountId}/${crypto.randomUUID()}.jpg`;
  const up = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, input.image, { contentType: "image/jpeg", upsert: false });
  if (up.error) return { ok: false, reason: "failed" };
  const { error } = await supabase.rpc("submit_attendance_contribution", {
    p_image_path: path,
    p_covers_until: input.coversUntil,
    p_matches: input.matches,
    p_rule_url: input.ruleUrl,
    p_note: input.note,
    p_context: input.context,
  });
  if (error) return { ok: false, reason: error.code === "54000" ? "too_many" : "failed" };
  return { ok: true };
}
