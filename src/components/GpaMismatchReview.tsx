"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { InteractionButton } from "@/components/motion/Interaction";
import { REVIEW_CHANGED, studentGpaReviews, submitGpaReview, type ReviewKind, type ReviewReason, type ReviewSnapshot, type ReviewStatus } from "@/lib/gpaReviewCases";
import { requestDataMissing, type ReviewCaseData } from "@/lib/gpaReviewData";
import { useGpaRequiredFields } from "./GpaRequiredFields";

export type ReviewField = "courseHours" | "priorTotals" | "grade" | "notCounted" | "repeat" | "repeatNote" | "termLabel" | "courseLabel";
export const courseReviewFields = ["courseHours", "notCounted", "repeat"] as const;
export type CourseReviewField = (typeof courseReviewFields)[number];
type ReviewDestination = { field: Exclude<ReviewField, "termLabel" | "courseLabel">; courses?: Array<{ id: string; name: string }> };

export function focusReviewField(target: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-gpa-field="${CSS.escape(target)}"]`)?.focus());
}

const copy = {
  ar: {
    reasons: { hours: "الساعات أو النقاط", grade: "التقدير أو الوزن", notCounted: "مقرر غير محتسب", repeat: "مقرر معاد", unknown: "السبب غير واضح" },
    fields: { courseHours: "تعديل ساعات المقرر", priorTotals: "تعديل بيانات المعدل السابق", grade: "تعديل التقدير", notCounted: "تعديل احتساب المقرر", repeat: "تعديل بيانات الإعادة", repeatNote: "إضافة تفاصيل الإعادة" },
    title: "سبب الاختلاف",
    choose: "اختر السبب",
    chooseCourse: "اختر المقرر",
    course: "المقرر",
    kinds: { semester: "الفصلي", cumulative: "التراكمي" },
    numbers: (ours: string, portal: string) => `معدل Haven ${ours} · معدل البوابة ${portal}`,
    note: "تفاصيل من السجل الأكاديمي (اختياري)",
    confirm: "أؤكد أن تقديرات المقررات المحتسبة مأخوذة من سجلي الأكاديمي",
    missing: { label: "أدخل اسم الفصل", grading: "أكّد سلم المعدل", courses: "أكمل اسم كل مقرر محتسب وساعاته وتقديره النهائي", prior: "أكمل المعدل السابق والساعات المحتسبة" },
    missingCourseName: "أدخل اسم المقرر المحدد",
    waiting: "بانتظار معلومات",
    send: "إرسال طلب المراجعة",
    sending: "جارٍ إرسال الطلب…",
    received: "شكرًا لتأكيد بياناتك. نعتذر عن اختلاف المعدل عن سجلك الأكاديمي. استلمنا طلبك وسنراجع سبب الفرق ونعمل على تصحيحه إذا تبيّن وجود خلل في الاحتساب. سنتواصل معك في أقرب وقت ممكن.",
    error: "تعذّر تأكيد استلام الطلب. بقيت نتيجة المقارنة محفوظة، ويمكنك إعادة الإرسال.",
    open: "قيد المراجعة",
    resolved: "تم الحل",
    same: "تطابقت المقارنة بعد إعادة التحقق.",
  },
  en: {
    reasons: { hours: "Hours or points", grade: "Grade or weighting", notCounted: "Excluded course", repeat: "Repeated course", unknown: "Unsure" },
    fields: { courseHours: "Edit course credits", priorTotals: "Edit previous GPA details", grade: "Edit grade", notCounted: "Edit course inclusion", repeat: "Edit repeat details", repeatNote: "Add repeat details" },
    title: "Reason for the difference",
    choose: "Choose a reason",
    chooseCourse: "Choose the course",
    course: "Course",
    kinds: { semester: "Semester", cumulative: "Cumulative" },
    numbers: (ours: string, portal: string) => `Haven GPA ${ours} · Portal GPA ${portal}`,
    note: "Details from your academic record (optional)",
    confirm: "I confirm that the counted grades come from my academic record",
    missing: { label: "Enter the term name", grading: "Confirm the grading scale", courses: "Complete each counted course’s name, credits and final grade", prior: "Complete the previous GPA and counted credits" },
    missingCourseName: "Enter the name of the selected course",
    waiting: "Waiting for information",
    send: "Send review request",
    sending: "Submitting request…",
    received: "Thank you for confirming your entries. We’re sorry your GPA differs from your academic record. We received your request and will investigate the difference, correct any issue we find in Haven’s calculation, and get back to you as soon as possible.",
    error: "We couldn’t confirm receipt. Your comparison is saved. You can try sending the request again.",
    open: "Under review",
    resolved: "Resolved",
    same: "The results matched after a new comparison.",
  },
};

const reasons: ReviewReason[] = ["unknown", "hours", "grade", "notCounted", "repeat"];
const buttonClass = "inline-flex min-h-9 max-w-full items-center justify-center rounded-lg border px-3 py-2 text-start text-xs leading-relaxed [overflow-wrap:anywhere]";
const inputClass = "block min-h-9 w-full min-w-0 rounded-lg border px-3 py-2 text-sm";
const inputStyle = { borderColor: "var(--color-border)", background: "var(--color-surface)" };

export function GpaReviewNumbers({ ours, portal, kind }: { ours: string; portal: string; kind?: "semester" | "cumulative" }) {
  const { lang } = useT();
  const labels = copy[lang];
  return <span className="tabular-nums">{kind && <span className="font-medium">{labels.kinds[kind]} · </span>}{labels.numbers(ours, portal)}</span>;
}

export function GpaMismatchReview({ snapshot, destinations, onEdit, onReceived }: {
  snapshot: ReviewSnapshot;
  destinations: Partial<Record<ReviewReason, ReviewDestination>>;
  onEdit: (field: ReviewField, courseId?: string) => void;
  onReceived?: (reason: ReviewReason) => void;
}) {
  const { lang } = useT();
  const labels = copy[lang];
  const { accountId } = useStore();
  const [reason, setReason] = useState<ReviewReason | "">("");
  const [courseId, setCourseId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const fields = useGpaRequiredFields();
  const [note, setNote] = useState("");
  const noteField = useRef<HTMLTextAreaElement>(null);
  const destination = reason ? destinations[reason] : undefined;
  const options = destination?.courses ?? [];
  const selectedCourse = options.some((course) => course.id === courseId) ? courseId : options.length === 1 ? options[0].id : "";
  const missing = requestDataMissing(snapshot);
  const courseTable = (snapshot.details as Partial<ReviewCaseData>).courseTable ?? [];
  const incompleteCourse = courseTable.find((course) => !course.excluded &&
    (!course.name.trim() || !(course.hours > 0) || course.points === null || !Number.isFinite(course.points)));
  const unnamedSelection = courseTable.some((course) => course.id === selectedCourse && !course.name.trim());
  const [state, setState] = useState<"idle" | "sending" | "received" | "resolved" | "error">("idle");
  const busy = useRef(false);
  const submission = useRef<{ input: string; id: string } | null>(null);
  const current = useRef(accountId);
  current.current = accountId;
  const send = async () => {
    if (!accountId || busy.current) return;
    const valid = fields.validate([...missing, !reason && "reason", Boolean(options.length && !selectedCourse) && "course",
      unnamedSelection && "selected-course-name", !confirmed && "confirmed"]);
    if (!valid || !reason) return;
    busy.current = true;
    setState("sending");
    try {
      const payload = { ...snapshot, reason, details: { ...snapshot.details, note: note.trim(), confirmation: true,
        selectedCourse: selectedCourse || null } };
      const input = JSON.stringify(payload);
      if (submission.current?.input !== input) {
        const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        submission.current = { input, id };
      }
      const receipt = await submitGpaReview({ ...payload, submissionId: submission.current.id }, true);
      if (current.current !== accountId) return;
      if (!receipt?.id || !["open", "pending", "waiting", "resolved"].includes(receipt.status)) throw new Error("Review receipt missing");
      setState(receipt.status === "resolved" ? "resolved" : "received");
      onReceived?.(reason);
    } catch {
      if (current.current === accountId) setState("error");
    } finally {
      busy.current = false;
    }
  };

  if (state === "received" || state === "resolved") {
    return <p className="mt-4 text-sm leading-relaxed" role="status">{state === "received" ? labels.received : labels.resolved}</p>;
  }
  return (
    <div className="mt-4 min-w-0 space-y-3">
      <fieldset className="min-w-0 space-y-2" disabled={state === "sending"}>
        {missing.map((field) => (
          <div key={field}>
            <InteractionButton type="button" className={buttonClass} {...fields.props(field)}
              style={{ borderColor: "var(--color-border)", ...fields.style(field) }}
              onClick={() => onEdit(field === "label" ? "termLabel" : field === "prior" ? "priorTotals" :
                incompleteCourse && !incompleteCourse.name.trim() ? "courseLabel" : "grade", incompleteCourse?.id ?? destinations.grade?.courses?.[0]?.id)}>
              {labels.missing[field]}
            </InteractionButton>
            {fields.message(field)}
          </div>
        ))}
        <label className="block text-xs">
          <span className="mb-1 block">{labels.title}</span>
          <select value={reason} {...fields.props("reason")} onChange={(event) => {
            setReason(event.target.value as ReviewReason | ""); setCourseId(""); fields.clear("reason"); fields.clear("course");
          }} className={inputClass} style={{ ...inputStyle, ...fields.style("reason") }}>
            <option value="">{labels.choose}</option>
            {reasons.map((option) => <option key={option} value={option}>{labels.reasons[option]}</option>)}
          </select>
          {fields.message("reason")}
        </label>
        {options.length > 1 && <label className="block text-xs">
          <span className="mb-1 block">{labels.course}</span>
          <select value={selectedCourse} {...fields.props("course")} onChange={(event) => { setCourseId(event.target.value); fields.clear("course"); }}
            className={inputClass} style={{ ...inputStyle, ...fields.style("course") }}>
            <option value="">{labels.chooseCourse}</option>
            {options.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
          </select>
          {fields.message("course")}
        </label>}
        {destination && (!destination.courses || selectedCourse) && (
          <InteractionButton type="button" className={buttonClass} style={{ borderColor: "var(--color-border)" }}
            onClick={() => destination.field === "repeatNote" ? noteField.current?.focus() : onEdit(destination.field, selectedCourse)}>
            {labels.fields[destination.field]}
          </InteractionButton>
        )}
        {unnamedSelection && <div>
          <InteractionButton type="button" className={buttonClass} {...fields.props("selected-course-name")}
            style={{ borderColor: "var(--color-border)", ...fields.style("selected-course-name") }}
            onClick={() => onEdit("courseLabel", selectedCourse)}>{labels.missingCourseName}</InteractionButton>
          {fields.message("selected-course-name")}
        </div>}
        <label className="block text-xs">
          <span className="mb-1 block">{labels.note}</span>
          <textarea ref={noteField} className={inputClass} rows={2} maxLength={400} value={note} onChange={(event) => setNote(event.target.value)} style={inputStyle} />
        </label>
        <div>
          <label className="flex items-start gap-2 text-xs leading-relaxed">
            <input type="checkbox" checked={confirmed} {...fields.props("confirmed")} className="mt-0.5 shrink-0"
              onChange={(event) => { setConfirmed(event.target.checked); fields.clear("confirmed"); }} />
            {labels.confirm}
          </label>
          {fields.message("confirmed")}
        </div>
      </fieldset>
      {state === "error" && <p role="status" className="text-sm leading-relaxed" style={{ color: "var(--color-danger)" }}>{labels.error}</p>}
      <InteractionButton type="button" onClick={() => void send()} disabled={!accountId || state === "sending"}
        className={buttonClass + " font-semibold"} style={{ background: "var(--color-primary-soft)", borderColor: "var(--color-primary)", color: "var(--color-ink)" }}>
        {state === "sending" ? labels.sending : labels.send}
      </InteractionButton>
    </div>
  );
}

export function useStudentGpaReviews() {
  const { accountId, hydrated } = useStore();
  const [snapshot, setSnapshot] = useState<{ accountId: string; rows: ReviewStatus[] } | null>(null);
  useEffect(() => {
    if (!accountId || !hydrated) return;
    let request = 0;
    const load = async () => {
      const id = ++request;
      try {
        const rows = await studentGpaReviews();
        if (request === id) setSnapshot({ accountId, rows });
      } catch { /* The existing GPA comparison remains available. */ }
    };
    void load();
    window.addEventListener(REVIEW_CHANGED, load);
    window.addEventListener("focus", load);
    return () => {
      request++;
      window.removeEventListener(REVIEW_CHANGED, load);
      window.removeEventListener("focus", load);
    };
  }, [accountId, hydrated]);
  return snapshot && snapshot.accountId === accountId ? snapshot.rows : [];
}

export function useGpaReviewMatch(snapshot: ReviewSnapshot | null) {
  const reviews = useStudentGpaReviews();
  const sent = useRef<ReviewSnapshot | null>(null);
  useEffect(() => {
    if (!snapshot || sent.current === snapshot) return;
    const row = reviews.find((item) => item.source === snapshot.source && item.termId === snapshot.termId);
    if (!row || row.status === "resolved") return;
    sent.current = snapshot;
    void submitGpaReview(snapshot, false, row.revision).catch(() => {});
  }, [reviews, snapshot]);
}

export function GpaReviewStatusBadge({ review, kind, soleKind }: { review?: ReviewStatus; kind: ReviewKind; soleKind?: boolean }) {
  const { lang } = useT();
  const labels = copy[lang];
  if (!review || (review.affectedKinds ? !review.affectedKinds.includes(kind) : !soleKind)) return null;
  const resolved = review.status === "resolved";
  return (
    <span className="inline-flex max-w-full items-center rounded-md px-2 py-0.5 text-xs font-medium"
      title={review.resolution === "matched" ? labels.same : review.resolution ?? undefined}
      style={{ color: resolved ? "var(--color-success)" : "var(--color-ink)", background: "var(--color-surface-alt)" }}>
      {resolved ? labels.resolved : review.status === "waiting" ? labels.waiting : labels.open}
    </span>
  );
}
