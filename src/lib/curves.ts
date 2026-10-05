// Courses graded on the cohort average («متوسط»): the instructor sets the
// cutoffs from how the whole cohort did, so they can sit a mark or two away
// from the university's table. The student may enter them (some or all) for
// that course at any point in the term; letters they leave out keep the
// university's cutoff. Stored in preferences.curves for the current term, the
// same way as repeats. It is always the student's own entry, never official:
// the portal result (Course.official) still wins.
//
// Each entry remembers what it was entered against (the university and the
// shape of its grade table). If either changes, the entry is kept for the
// student to review but no longer applied, so cutoffs are never read against
// a table they weren't meant for.

import type { AcademicInfo, Course, CourseCurve } from "@/types";
import { passMark, validCutoffMins, type GradeScheme } from "./gradeSchemes";

const MAX_COURSES = 40;
// As large as any table a student can enter (the store keeps up to 40 rows of
// up to 24 characters); curveFits offers cutoffs only for tables that read back.
const MAX_BANDS = 40;
const MAX_LETTER = 24;
const MAX_FINGERPRINT = 4000;
const MAX_UNIVERSITY = 300;

const asObject = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const asText = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;

/** letter → lowest %; null when any row is unusable, so a damaged table is
 *  dropped whole instead of half-applied. */
function readCutoffs(raw: unknown): Record<string, number> | null {
  const o = asObject(raw);
  if (!o) return null;
  const rows = Object.entries(o);
  if (rows.length > MAX_BANDS) return null;
  const out: Record<string, number> = {};
  for (const [letter, v] of rows) {
    if (!letter || letter.length > MAX_LETTER) return null;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) return null;
    out[letter] = v;
  }
  return out;
}

function readCurve(raw: unknown): CourseCurve | null {
  const o = asObject(raw);
  if (!o || o.method !== "cutoffs") return null;
  const cutoffs = readCutoffs(o.cutoffs);
  const b = asObject(o.basis);
  // Empty when the student hadn't picked a university (still a valid basis).
  const university = typeof b?.university === "string" && b.university.length <= MAX_UNIVERSITY ? b.university : null;
  const fingerprint = asText(b?.fingerprint, MAX_FINGERPRINT);
  const baseCutoffs = readCutoffs(b?.baseCutoffs);
  if (!cutoffs || university == null || !fingerprint || !baseCutoffs) return null;
  return {
    method: "cutoffs",
    cutoffs,
    complete: o.complete === true,
    basis: { university, fingerprint, baseCutoffs },
    ...(o.stale === true ? { stale: true } : {}),
    at: asText(o.at, 40) ?? "",
  };
}

/** Validate the stored preferences.curves blob ({ term, courses }). Entries from
 *  another semester are dropped so a new term starts fresh; a damaged entry is
 *  ignored rather than guessed at. */
export function readCurves(raw: unknown, term: string): Record<string, CourseCurve> {
  const r = asObject(raw);
  const courses = asObject(r?.courses);
  if (!r || !term || r.term !== term || !courses) return {};
  const out: Record<string, CourseCurve> = {};
  for (const [id, v] of Object.entries(courses).slice(0, MAX_COURSES)) {
    const curve = readCurve(v);
    if (curve) out[id] = curve;
  }
  return out;
}

/** The preferences.curves value to save for this term. */
export function curvesPref(term: string, curves: Record<string, CourseCurve>): Record<string, unknown> {
  return { term, courses: curves };
}

/** Set (or clear, with null) one course's entry. Entries of courses that no
 *  longer exist are dropped on the way, so deleted courses don't linger. */
export function nextCurves(
  curves: Record<string, CourseCurve>,
  liveIds: readonly string[],
  courseId: string,
  curve: CourseCurve | null
): Record<string, CourseCurve> {
  const live = new Set(liveIds);
  const out: Record<string, CourseCurve> = {};
  for (const [id, c] of Object.entries(curves)) if (id !== courseId && live.has(id)) out[id] = c;
  if (curve) out[courseId] = curve;
  return out;
}

/** Attach each course's entry to the course (derived, never saved on it). An
 *  entry made at another university than `university` (curveUniversity) is
 *  attached as stale: kept for review, not applied. */
export function withCurves(
  courses: Course[],
  curves: Record<string, CourseCurve>,
  university?: string
): Course[] {
  if (!Object.keys(curves).length) return courses;
  return courses.map((c) => {
    const curve = curves[c.id];
    if (!curve) return c;
    const moved = university != null && curve.basis.university !== university;
    return { ...c, curve: moved && !curve.stale ? { ...curve, stale: true } : curve };
  });
}

// ── What an entry is checked against ──────────────────────────────────────

/** The student's university as an entry records it: the slug, the typed name
 *  ("typed:<name>"), or "" when none is set. */
export function curveUniversity(academic: AcademicInfo | null | undefined): string {
  const slug = academic?.universitySlug?.trim();
  if (slug && slug !== "other") return slug;
  // Cut short so an entry always reads back (MAX_UNIVERSITY), however long the name.
  const name = academic?.universityName?.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200);
  return name ? `typed:${name}` : "";
}

/** The letter of the lowest passing band (where the scheme's pass mark falls),
 *  or null. Jordan's D, not its failing D- that still carries points. */
export function passLetter(scheme: GradeScheme): string | null {
  const pass = passMark(scheme);
  const passing = scheme.bands.slice(0, -1).filter((b) => b.min >= pass);
  return passing.length ? passing[passing.length - 1].letter : null;
}

const fingerprints = new WeakMap<GradeScheme, string>();

/** A grade table's shape, without its cutoffs: scale, each letter with its
 *  points, and the passing letter. Two tables with the same shape take the
 *  same course cutoffs; any other change makes an entry stale. */
export function schemeFingerprint(scheme: GradeScheme): string {
  const hit = fingerprints.get(scheme);
  if (hit != null) return hit;
  const fp = [
    scheme.max,
    scheme.percent ? "%" : "",
    scheme.bands.map((b) => `${b.letter}:${b.points}`).join(","),
    passLetter(scheme) ?? "",
  ].join("|");
  fingerprints.set(scheme, fp);
  return fp;
}

/** Whether course cutoffs can apply to this table: letters with points (not a
 *  percentage average, where a course's mark itself is what counts), at least
 *  two bands, each letter once, and small enough that an entry for it reads
 *  back (readCurves), so a saved choice never vanishes on reopening. */
export function curveFits(scheme: GradeScheme): boolean {
  if (scheme.percent || scheme.bands.length < 2) return false;
  return (
    new Set(scheme.bands.map((b) => b.letter)).size === scheme.bands.length &&
    readCutoffs(baseCutoffs(scheme)) != null &&
    schemeFingerprint(scheme).length <= MAX_FINGERPRINT
  );
}

/** The university's cutoffs, letter → lowest %, for every band but the last
 *  (which starts at 0): what an entry records as its base. */
export function baseCutoffs(scheme: GradeScheme): Record<string, number> {
  return Object.fromEntries(scheme.bands.slice(0, -1).map((b) => [b.letter, b.min]));
}

// ── A course's own table ──────────────────────────────────────────────────

/** How sure a course's letter is:
 *    waiting — no cutoffs in yet (or the entry can't be applied): the
 *              university's table, approximate;
 *    partial — some cutoffs in, the rest from the university: approximate;
 *    entered — the student entered every cutoff. */
export type CurveStatus = "waiting" | "partial" | "entered";

export interface CourseCutoffs {
  /** the table this course's % is read through */
  scheme: GradeScheme;
  status: CurveStatus;
  /** entered for another university or another grade table: kept, not applied */
  stale: boolean;
  /** the entered cutoffs no longer fit around the university's (e.g. its
   *  cutoffs changed): kept, not applied */
  conflict: boolean;
  /** the university's own cutoffs changed since the entry; the rows the student
   *  didn't enter follow the new ones */
  baseMoved: boolean;
}

const has = (o: Record<string, number>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** A course graded on the cohort average, read through its own cutoffs: the
 *  university's table with the entered rows replaced. null for a course with
 *  fixed cutoffs (no entry), or a table that can't take course cutoffs.
 *  Letters and points never change; only where each band starts, and the pass
 *  mark with it (the passing letter's new cutoff). */
export function courseCutoffs(course: Course, scheme: GradeScheme): CourseCutoffs | null {
  const curve = course.curve;
  if (!curve || !curveFits(scheme)) return null;
  const waiting = (why: Partial<CourseCutoffs> = {}): CourseCutoffs => ({
    scheme,
    status: "waiting",
    stale: false,
    conflict: false,
    baseMoved: false,
    ...why,
  });
  if (curve.stale || curve.basis.fingerprint !== schemeFingerprint(scheme)) return waiting({ stale: true });
  const last = scheme.bands.length - 1;
  const rows = scheme.bands.slice(0, last);
  const entered = rows.filter((b) => has(curve.cutoffs, b.letter)).length;
  if (!entered) return waiting();
  const mins = scheme.bands.map((b, i) =>
    i === last ? 0 : has(curve.cutoffs, b.letter) ? curve.cutoffs[b.letter] : b.min
  );
  if (!validCutoffMins(mins)) return waiting({ conflict: true });
  const complete = curve.complete && entered === last;
  const baseMoved = rows.some((b) => !has(curve.cutoffs, b.letter) && curve.basis.baseCutoffs[b.letter] !== b.min);
  const bands = scheme.bands.map((b, i) => ({ ...b, min: mins[i] }));
  const out: GradeScheme = { ...scheme, bands };
  // An explicit pass mark moves with its letter (Jordan: D at 54 → D's new cutoff).
  if (scheme.passMin != null) {
    const pass = passLetter(scheme);
    const band = pass == null ? undefined : bands.find((b) => b.letter === pass);
    if (band) out.passMin = band.min;
  }
  // Every row is the student's own now: none is the university's estimate.
  if (complete) {
    delete out.approxCutoffs;
    delete out.learnedCutoffs;
  }
  return { scheme: out, status: complete ? "entered" : "partial", stale: false, conflict: false, baseMoved };
}

/** The table a course's % is read through: its own cutoffs when it has usable
 *  ones, else the student's table unchanged. */
export function courseScheme(course: Course, scheme: GradeScheme): GradeScheme {
  return courseCutoffs(course, scheme)?.scheme ?? scheme;
}

// ── The cutoffs editor ────────────────────────────────────────────────────
// `mins` below are the cutoffs of every band above the last one (the last,
// failing band always starts at 0), top letter first.

/** What stops a table from being saved: the row and why. `pass` = the lowest
 *  row must be above 0. Same rule as validCutoffMins. */
export type CutoffProblem = { index: number; kind: "range" | "order" | "pass" };

export function cutoffProblem(mins: readonly number[]): CutoffProblem | null {
  for (let i = 0; i < mins.length; i++) {
    const m = mins[i];
    if (!Number.isFinite(m) || m < 0 || m > 100) return { index: i, kind: "range" };
    if (i > 0 && !(m < mins[i - 1])) return { index: i, kind: "order" };
  }
  const last = mins.length - 1;
  if (last >= 0 && !(mins[last] > 0)) return { index: last, kind: "pass" };
  return null;
}

/** Every cutoff moved by `by` marks, or the first row that would leave 0–100
 *  (or bring the lowest to 0): then the whole shift is refused, nothing is
 *  clamped. */
export function shiftCutoffs(mins: readonly number[], by: number): { mins: number[] } | { blocked: number } {
  const next = mins.map((m) => Math.round((m + by) * 1e6) / 1e6);
  const last = next.length - 1;
  const blocked = next.findIndex((m, i) => m < 0 || m > 100 || (i === last && !(m > 0)));
  return blocked >= 0 ? { blocked } : { mins: next };
}

/** The entry to save from the editor's rows: the rows the student set, or
 *  every row once they ticked "complete" (so a complete table never inherits
 *  a later change to the university's), recorded against the student's
 *  current university and grade table. */
export function makeCurve(
  scheme: GradeScheme,
  academic: AcademicInfo | null | undefined,
  rows: readonly { letter: string; min: number; entered: boolean }[],
  complete: boolean,
  at = new Date().toISOString()
): CourseCurve {
  const cutoffs = Object.fromEntries(rows.filter((r) => complete || r.entered).map((r) => [r.letter, r.min]));
  return {
    method: "cutoffs",
    cutoffs,
    complete,
    basis: { university: curveUniversity(academic), fingerprint: schemeFingerprint(scheme), baseCutoffs: baseCutoffs(scheme) },
    at,
  };
}

// ── Saving ────────────────────────────────────────────────────────────────

type SaveResult = { ok: true } | { ok: false; error: string };

export interface CurveSaver {
  /** The account's entries as just loaded ({} while none is): what a failed
   *  save goes back to. Drops the previous account's saves still waiting. */
  reset(curves: Record<string, CourseCurve>): void;
  /** Show `next` at once and save it after every earlier save. Settles ok once
   *  a save that carries it reaches the account; when it can't, the screen goes
   *  back to what the account holds. */
  write(next: Record<string, CourseCurve>): Promise<SaveResult>;
}

/** Saves the whole entries object one request at a time, in order, so an older
 *  request can never land after a newer one and win. Each request carries the
 *  newest entries (changes made while one is on its way go together in the
 *  next). A failed request with nothing newer waiting puts the screen back to
 *  what the account last confirmed, so the student sees what is really saved
 *  and can try again; a newer change waiting carries the failed one with it. */
export function curveSaver(io: {
  send: (curves: Record<string, CourseCurve>) => Promise<unknown>;
  show: (curves: Record<string, CourseCurve>) => void;
}): CurveSaver {
  let account: Record<string, CourseCurve> = {}; // what the account holds
  let latest = account; // what the screen shows
  let edits = 0; // changes made since reset
  let settled = 0; // changes saved or put back
  let busy = false;
  let epoch = 0; // bumped on reset: replies for an earlier account are ignored
  let waiting: { n: number; done: (r: SaveResult) => void }[] = [];

  const settle = (upTo: number, r: SaveResult) => {
    settled = upTo;
    const left: typeof waiting = [];
    for (const w of waiting) {
      if (w.n <= upTo) w.done(r);
      else left.push(w);
    }
    waiting = left;
  };

  const pump = () => {
    if (busy || settled === edits) return;
    busy = true;
    const mine = epoch;
    const upTo = edits;
    const snapshot = latest;
    Promise.resolve()
      .then(() => io.send(snapshot))
      .then(
        () => {
          if (mine !== epoch) return;
          busy = false;
          account = snapshot;
          settle(upTo, { ok: true });
          pump();
        },
        (e: unknown) => {
          if (mine !== epoch) return;
          busy = false;
          if (upTo === edits) {
            latest = account;
            io.show(account);
            settle(upTo, { ok: false, error: e instanceof Error ? e.message : String(e) });
          }
          pump();
        }
      );
  };

  return {
    reset(curves) {
      epoch++;
      account = latest = curves;
      edits = settled = 0;
      busy = false;
      const left = waiting;
      waiting = [];
      for (const w of left) w.done({ ok: false, error: "the account changed" });
    },
    write(next) {
      latest = next;
      io.show(next);
      const n = ++edits;
      const result = new Promise<SaveResult>((done) => waiting.push({ n, done }));
      pump();
      return result;
    },
  };
}
