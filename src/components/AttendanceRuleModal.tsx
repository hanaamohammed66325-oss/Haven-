"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { normalizeArabicDigits } from "@/lib/dates";
import { submitPolicyReport, submitVote } from "@/lib/attendancePolicy";
import type { PersonalAttendanceRule } from "@/types";

type Method = "lectures" | "hours" | "unspecified";

const pctOf = (raw: string): number | null => {
  const s = normalizeArabicDigits(raw).replace(/[^0-9.]/g, "");
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
};

/** "How does your university count absence?" — the student's own answer. It
 *  applies to them straight away (the whole term, or one course), and goes to
 *  the admin queue; with an official regulation link it can become the rule for
 *  every student at that university. */
export function AttendanceRuleModal({ open, onClose, courseId }: { open: boolean; onClose: () => void; courseId?: string }) {
  const { t } = useT();
  const { academic, courses, personalAttendanceRule, setPersonalAttendanceRule, updateCourse, universityPolicy } = useStore();
  const [scope, setScope] = useState<"university" | "course">(courseId ? "course" : "university");
  const [course, setCourse] = useState(courseId ?? "");
  const [limit, setLimit] = useState("");
  const [method, setMethod] = useState<Method>("lectures");
  const [excused, setExcused] = useState<"yes" | "no">("yes");
  const [unexcused, setUnexcused] = useState("");
  const [late, setLate] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // Start from what the student told us before, if anything.
  useEffect(() => {
    if (!open) return;
    const p = personalAttendanceRule;
    setScope(courseId ? "course" : "university");
    setCourse(courseId ?? "");
    setLimit(p?.maxAbsence != null ? String(p.maxAbsence) : p?.maxUnexcused != null ? String(p.maxUnexcused) : "");
    setMethod(p?.method ?? "lectures");
    setExcused(p && !p.excusedCounts ? "no" : "yes");
    setUnexcused(p?.maxUnexcused != null && p.maxAbsence != null && p.maxUnexcused !== p.maxAbsence ? String(p.maxUnexcused) : "");
    setLate(p?.lateRule ?? "");
    setUrl(p?.regulationUrl ?? "");
    setErr("");
  }, [open, courseId, personalAttendanceRule]);

  const save = async () => {
    setErr("");
    const lim = pctOf(limit);
    if (lim == null || !(lim > 0 && lim <= 100)) return setErr(t("ruleFormErrLimit"));
    const unexc = scope === "university" && excused === "yes" ? pctOf(unexcused) : null;
    if (unexc != null && !(unexc > 0 && unexc <= 100)) return setErr(t("ruleFormErrLimit"));
    const link = url.trim();
    if (link && !/^https?:\/\//.test(link)) return setErr(t("ruleFormErrUrl"));
    if (scope === "course" && !course) return setErr(t("ruleFormErrCourse"));

    setSaving(true);
    const answers = {
      max_absence: lim,
      method,
      excused_counts: excused === "yes",
      max_unexcused: unexc,
      late_rule: late.trim() || null,
    };
    if (scope === "course") {
      updateCourse(course, {
        attendanceLimit: lim,
        ...(method === "lectures" ? { attendanceMode: "lecture" as const } : method === "hours" ? { attendanceMode: "hour" as const } : {}),
      });
    } else {
      const rule: PersonalAttendanceRule = {
        maxAbsence: excused === "yes" ? lim : null,
        maxUnexcused: excused === "yes" ? unexc : lim,
        excusedCounts: excused === "yes",
        method,
        lateRule: late.trim() || null,
        regulationUrl: link || null,
        reportedAt: new Date().toISOString(),
      };
      setPersonalAttendanceRule(rule);
      // Counts towards (or against) the university's rule for other students.
      if (academic.universitySlug && academic.universitySlug !== "other") {
        void submitVote({
          subject: "attendance",
          universitySlug: academic.universitySlug,
          agrees: false,
          answer: {
            method: rule.method,
            max_absence: rule.maxAbsence,
            max_unexcused: rule.maxUnexcused,
            excused_counts: rule.excusedCounts,
          },
        }).catch(() => {
          /* the student's own rule is saved either way */
        });
      }
    }
    // The answer already applies to the student; the report only asks for a review.
    try {
      await submitPolicyReport({
        universitySlug: academic.universitySlug && academic.universitySlug !== "other" ? academic.universitySlug : null,
        universityName: academic.universityName || null,
        scope,
        courseName: scope === "course" ? courses.find((c) => c.id === course)?.name ?? null : null,
        answers,
        regulationUrl: link || null,
      });
    } catch {
      /* the student's own rule is saved either way */
    }
    setSaving(false);
    onClose();
  };

  const field = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const fieldStyle = { borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" };
  const label = (k: Parameters<typeof t>[0]) => (
    <span className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-ink)" }}>{t(k)}</span>
  );
  const choice = <T extends string>(value: T, current: T, set: (v: T) => void, text: string) => (
    <button
      type="button"
      onClick={() => set(value)}
      aria-pressed={current === value}
      className="rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors"
      style={
        current === value
          ? { background: "var(--color-primary-soft)", color: "var(--color-primary)", borderColor: "var(--color-primary)" }
          : { color: "var(--color-muted)", borderColor: "var(--color-border)" }
      }
    >
      {text}
    </button>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("ruleFormTitle")}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {personalAttendanceRule && scope === "university" ? (
            <button
              type="button"
              onClick={() => {
                setPersonalAttendanceRule(null);
                onClose();
              }}
              className="text-xs underline underline-offset-2"
              style={{ color: "var(--color-muted)" }}
            >
              {universityPolicy ? t("ruleFormUseUniversity") : t("ruleFormClear")}
            </button>
          ) : (
            <span />
          )}
          <Button onClick={() => void save()} disabled={saving}>
            {t("ruleFormSave")}
          </Button>
        </div>
      }
    >
      <p className="text-sm mb-5 leading-relaxed" style={{ color: "var(--color-muted)" }}>{t("ruleFormIntro")}</p>

      <div className="mb-4">
        {label("ruleFormScope")}
        <div className="flex flex-wrap gap-2">
          {choice("university", scope, setScope, t("ruleFormScopeUniversity"))}
          {choice("course", scope, setScope, t("ruleFormScopeCourse"))}
        </div>
      </div>

      {scope === "course" && (
        <label className="block mb-4">
          {label("ruleFormCourse")}
          <select value={course} onChange={(e) => setCourse(e.target.value)} className={field} style={fieldStyle}>
            <option value="">—</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      <label className="block mb-4">
        {label("ruleFormLimit")}
        <input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} className={field} style={fieldStyle} />
        <span className="block text-[11px] mt-1" style={{ color: "var(--color-muted)" }}>{t("ruleFormLimitHint")}</span>
      </label>

      <div className="mb-4">
        {label("ruleFormMethod")}
        <div className="flex flex-wrap gap-2">
          {choice("lectures", method, setMethod, t("ruleFormMethodLectures"))}
          {choice("hours", method, setMethod, t("ruleFormMethodHours"))}
          {choice("unspecified", method, setMethod, t("ruleFormDontKnow"))}
        </div>
      </div>

      {scope === "university" && (
        <>
          <div className="mb-4">
            {label("ruleFormExcused")}
            <div className="flex flex-wrap gap-2">
              {choice("yes", excused, setExcused, t("ruleFormYes"))}
              {choice("no", excused, setExcused, t("ruleFormNo"))}
            </div>
          </div>
          {excused === "yes" && (
            <label className="block mb-4">
              {label("ruleFormUnexcused")}
              <input inputMode="decimal" value={unexcused} onChange={(e) => setUnexcused(e.target.value)} className={field} style={fieldStyle} />
            </label>
          )}
          <label className="block mb-4">
            {label("ruleFormLate")}
            <input value={late} onChange={(e) => setLate(e.target.value)} placeholder={t("ruleFormLatePlaceholder")} className={field} style={fieldStyle} />
          </label>
        </>
      )}

      <label className="block">
        {label("ruleFormUrl")}
        <input dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className={field} style={fieldStyle} />
        <span className="block text-[11px] mt-1" style={{ color: "var(--color-muted)" }}>{t("ruleFormUrlHint")}</span>
      </label>

      {err && <p className="text-xs mt-3" style={{ color: "var(--color-danger)" }}>{err}</p>}
    </Modal>
  );
}
