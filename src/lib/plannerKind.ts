// ---------------------------------------------------------------------------
// Planner text classifier.
//
// Reads the WORDS a student types into a planner note and infers what kind of
// item it is — exam, quiz, assignment, project, or a plain submission deadline —
// in both Arabic and English. Two callers use it:
//   • the Planner, to auto-tag a free-typed note with the right chip + colour;
//   • the Upcoming engine, so a note's REMINDER tone follows its text (a
//     "تسليم"/submission is never reminded as an exam "go review it") instead of
//     depending only on which coloured chip happened to be tapped.
//
// Pure: no React, no imports. Deliberately high-precision — an ambiguous note
// (both exam AND task words, or neither) returns null so the caller falls back
// to the explicit tag rather than guessing.
// ---------------------------------------------------------------------------

export type PlannerKind = "exam" | "quiz" | "assignment" | "project" | "deadline";

/** Which reminder/section bucket a detected kind belongs to. */
export function kindToBucket(kind: PlannerKind): "exam" | "task" {
  return kind === "exam" || kind === "quiz" ? "exam" : "task";
}

/** The planner tag key a detected kind maps to (there is no dedicated project
 *  chip, so a project rides the assignment chip — both are "task" work). */
export function kindToTag(kind: PlannerKind): string {
  switch (kind) {
    case "exam":
      return "tagExam";
    case "quiz":
      return "tagQuiz";
    case "assignment":
    case "project":
      return "tagAssignment";
    case "deadline":
      return "tagDeadline";
  }
}

// Normalise so matching survives Arabic orthographic variation (hamza forms,
// ya/alef-maqsura, ta-marbuta, diacritics, tatweel) and English casing.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, "") // tashkeel + tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

// Keyword sets (already in normalised form). Kept lean and specifically
// academic to avoid false positives on everyday note text.
const EXAM = ["اختبار", "امتحان", "ميدترم", "ميد ترم", "فاينل", "نهائي", "midterm", "final", "exam"];
const QUIZ = ["كويز", "quiz", "اختبار قصير"];
const ASSIGNMENT = ["واجب", "تكليف", "homework", "assignment"];
const PROJECT = ["مشروع", "بحث", "تقديمي", "presentation", "project"];
const DEADLINE = ["تسليم", "موعد تسليم", "deadline", "submit", "submission", "due", "overdue"];

const hasAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

/**
 * Infer the kind of a planner note from its text, or null when the text has no
 * clear signal — or has BOTH exam and task signals (ambiguous). Callers treat
 * null as "defer to the explicit tag".
 */
export function detectPlannerKind(text: string): PlannerKind | null {
  const t = normalize(text);
  if (!t) return null;

  const isQuiz = hasAny(t, QUIZ);
  const isExam = isQuiz || hasAny(t, EXAM);

  const isProject = hasAny(t, PROJECT);
  const isAssignment = hasAny(t, ASSIGNMENT);
  const isDeadline = hasAny(t, DEADLINE);
  const isTask = isProject || isAssignment || isDeadline;

  // Exclusive: an item that reads as BOTH (e.g. "سلّم ورقة الاختبار") is
  // ambiguous — return null and let the caller trust the chosen tag.
  if (isExam && !isTask) return isQuiz ? "quiz" : "exam";
  if (isTask && !isExam) return isProject ? "project" : isAssignment ? "assignment" : "deadline";
  return null;
}

// ── Effective note classification (text-first, tag-fallback) ─────────────────
// The canonical helpers the rest of the app should use to ask "what IS this
// planner note?". The note's TEXT is trusted first; the chip tag is only a
// fallback for text with no clear signal. Centralised here so every surface —
// the Upcoming list, the smart reminders, the daily challenges, the on-open
// toast — agrees, and a submission deadline is never treated as an exam anywhere.

/** Chip tags that read as an exam when we must fall back to the tag. */
const EXAM_TAG_KEYS = new Set(["tagExam", "tagQuiz"]);

/** The exam/task bucket a planner note really belongs to — TEXT first, then tag. */
export function noteBucket(text: string, tag?: string | null): "exam" | "task" {
  const kind = detectPlannerKind(text);
  if (kind) return kindToBucket(kind);
  return tag && EXAM_TAG_KEYS.has(tag) ? "exam" : "task";
}

/** The tag a note effectively reads as (for labels/tone) — TEXT first, then tag. */
export function noteTag(text: string, tag?: string | null): string | undefined {
  const kind = detectPlannerKind(text);
  if (kind) return kindToTag(kind);
  return tag ?? undefined;
}
