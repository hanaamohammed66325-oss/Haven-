import { pointsForOfficial, type GradeScheme } from "./gradeSchemes";
import { pastTermCumulative, pastTermGpa } from "./termCheck";
import type { OfficialGrade, PastTermCourse } from "../types";
import type { ReviewResults, ReviewSnapshot } from "./gpaReviewCases";

export type ReviewCourse = {
  id: string;
  name: string;
  hours: number;
  excluded: boolean;
  grade: number | string | null;
  estimate?: number | string | null;
  repeated?: boolean;
  points: number | null;
};
export type ReviewCaseData = {
  courseTable: ReviewCourse[];
  grading: GradeScheme;
  prior?: { gpa: number; hours: number };
};

export function reviewCourse(id: string, name: string, hours: number, scheme: GradeScheme,
  grade: OfficialGrade | undefined, excluded: boolean, estimate?: number | string | null, repeated?: boolean): ReviewCourse {
  return {
    id, name, hours, excluded: excluded || grade?.letter === "W",
    grade: grade?.letter ?? grade?.mark ?? null, estimate, repeated,
    points: grade ? pointsForOfficial(scheme, grade) : null,
  };
}

export function requestDataMissing(snapshot: ReviewSnapshot) {
  const missing: ("label" | "courses" | "prior" | "grading")[] = [];
  const data = snapshot.details as Partial<ReviewCaseData>;
  if (!snapshot.label.trim()) missing.push("label");
  if (!data.grading?.bands?.length || data.grading.id !== snapshot.scheme || data.grading.max !== snapshot.max) missing.push("grading");
  const counted = data.courseTable?.filter((course) => !course.excluded) ?? [];
  if (!counted.length || counted.some((course) => !course.name.trim() || !(course.hours > 0) ||
    !Number.isFinite(course.hours) || course.points === null || !Number.isFinite(course.points))) missing.push("courses");
  if (snapshot.results.cumulative && (!data.prior || !Number.isFinite(data.prior.gpa) ||
    !Number.isFinite(data.prior.hours) || data.prior.gpa < 0 || data.prior.gpa > snapshot.max ||
    data.prior.hours < 0 || (data.prior.hours === 0 && data.prior.gpa !== 0))) missing.push("prior");
  return missing;
}

export function recalculateReview(data: ReviewCaseData, portal: ReviewResults) {
  if (!data.grading?.bands?.length || !data.courseTable.length) return {};
  const rows: PastTermCourse[] = data.courseTable.map((course) => ({
    name: course.name,
    hours: course.hours,
    excludedFromGpa: course.excluded,
    ...(typeof course.grade === "number" ? { mark: course.grade } : typeof course.grade === "string" ? { letter: course.grade } : {}),
  }));
  const results: ReviewResults = {};
  if (portal.semester) {
    const value = pastTermGpa(rows, data.grading);
    if (value !== null) results.semester = { ours: value.toFixed(2), portal: portal.semester.portal };
  }
  // A draft cannot settle a repeat calculation without evidence of the
  // previous attempt and the program's treatment of both attempts.
  if (portal.cumulative && data.prior && !data.courseTable.some((course) => course.repeated && !course.excluded)) {
    const value = pastTermCumulative(rows, data.grading, data.prior.gpa, data.prior.hours);
    if (value !== null) results.cumulative = { ours: value.toFixed(2), portal: portal.cumulative.portal };
  }
  return results;
}
