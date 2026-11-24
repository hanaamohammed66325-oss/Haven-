"use client";
import { gpaSystemChanged } from "@/lib/gpaSystem";
import { GpaPriorReview, GpaReviewLink } from "./GpaPriorReview";
import { InteractionButton } from "@/components/motion/Interaction";

// TermCheck — the end-of-term window: "does our semester GPA match your
// portal?". A mismatch submits diagnostic details for admin review, then we work out
// which course most likely differs (lib/termCheck explainGap) and ask about just
// that one; entering every course's official letter is the fallback. Official
// results then replace the estimates everywhere. After it, the student can
// compare the cumulative GPA too (the one before the term plus this term's
// courses against the portal's new one). Also: TermCheckProfileCard (the
// Profile page line to edit results) and TermCheckFlow (the
// window's contents, reused by the local test station).

import { useWhatsNewReady } from "./useWhatsNewReady";
import { Suspense, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Calculator, CheckCircle2, History, Pencil, Plus, Trash2, TrendingUp, X } from "@/components/motion/icons";
import { useStore, useScheme } from "@/store";
import { useT } from "@/i18n";
import { Modal } from "./Modal";
import { pendingSetupSteps } from "./SetupCheck";
import { useGpaChecked } from "./GpaCheckNudge";
import { focusReviewField, GpaMismatchReview, GpaReviewNumbers, GpaReviewStatusBadge, useGpaReviewMatch, useStudentGpaReviews, type ReviewField } from "./GpaMismatchReview";
import { useGpaRequiredFields } from "./GpaRequiredFields";
import { reviewCourse } from "@/lib/gpaReviewData";
import { reviewComparison, type ReviewReason, type ReviewResults, type ReviewSnapshot, type ReviewStatus } from "@/lib/gpaReviewCases";
import { courseCurrentPct, projectedCumulativeGpa, semesterGpaDetail, semesterGPA } from "@/lib/grades";
import { repeatAdjust } from "@/lib/repeats";
import { gpaGaps, type GpaGap } from "@/lib/gpaReadiness";
import { compareCumulativeGpa, priorGpaDecimals, sameDisplayedGpa, savedGpaComparison } from "@/lib/gpaComparison";
import { DENIED, SPECIAL_RESULTS, detectScheme, type GradeScheme } from "@/lib/gradeSchemes";
import { toEnglishDigits } from "@/lib/dates";
import { isolate, isolateOption } from "@/lib/format";
import {
  estimatedLetter,
  explainGap,
  pastTermCumulative,
  pastTermGpa,
  pastTermSummary,
  sameGpa,
  sharedCourse,
  snoozeDate,
  termCheckDue,
  termEnded,
} from "@/lib/termCheck";
import type {
  Course,
  CumulativeCheck,
  OfficialGrade,
  PastTerm,
  PastTermCourse,
  TermCheck as TermCheckData,
  TermMismatchReason,
} from "@/types";

/** sessionStorage: open the window on the next app load ("1", or "grades" to
 *  start at entering results) — set by the test station. */
export const TERM_CHECK_OPEN_KEY = "haven-term-check-open";
/** window event that opens it right away (detail: { step?: "grades" }). */
export const TERM_CHECK_EVENT = "haven:term-check-open";
const SESSION_SKIP_KEY = "haven-term-check-session-skip";

type Start = "ask" | "grades" | "cum";

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function openTermCheck(step: Start = "ask") {
  window.dispatchEvent(new CustomEvent(TERM_CHECK_EVENT, { detail: { step } }));
}

export function TermCheck() {
  const store = useStore();
  const { hydrated, onboardingSeen } = store;
  const whatsNewReady = useWhatsNewReady(store.accountId, store.whatsNewSeen ?? {});
  const { t } = useT();
  const [start, setStart] = useState<Start | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const step = (e as CustomEvent).detail?.step;
      setStart(step === "grades" || step === "cum" ? step : "ask");
    };
    window.addEventListener(TERM_CHECK_EVENT, onOpen);
    return () => window.removeEventListener(TERM_CHECK_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!hydrated || !onboardingSeen) return;
    const requested = readSession(TERM_CHECK_OPEN_KEY);
    if (requested) {
      // The flag is cleared when the window actually opens (not here), so
      // StrictMode's effect re-run can't consume it before the timer fires.
      const id = window.setTimeout(() => {
        try {
          sessionStorage.removeItem(TERM_CHECK_OPEN_KEY);
        } catch {
          /* ignore */
        }
        setStart(requested === "grades" ? "grades" : "ask");
      }, 1200);
      return () => window.clearTimeout(id);
    }
    if (readSession(SESSION_SKIP_KEY) === "1") return;
    // Never on top of the What's-New popup or an unfinished setup window.
    try {
      if (!whatsNewReady) return;
    } catch {
      return;
    }
    if (pendingSetupSteps(store).length || !termCheckDue(store)) return;
    const id = window.setTimeout(() => setStart("ask"), 1400);
    return () => window.clearTimeout(id);
    // Evaluated once the app is ready — not on every store change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, onboardingSeen, store.accountId, store.whatsNewSeen, whatsNewReady]);

  if (!start) return null;
  const close = () => {
    try {
      sessionStorage.setItem(SESSION_SKIP_KEY, "1");
    } catch {
      /* ignore */
    }
    setStart(null);
  };
  return (
    <Modal open onClose={close} title={t(start === "grades" ? "tc_gradesTitle" : start === "cum" ? "tc_cumTitle" : "tc_title")}>
      <TermCheckFlow start={start} onClose={close} />
    </Modal>
  );
}

type Step = "ask" | "portal" | "review" | "guess" | "grades" | "reason" | "done" | "cum" | "cumResult";
type Done = "match" | "close" | "snoozed" | "found" | "saved" | "reason";

const withoutOfficial = (courses: Course[]): Course[] => courses.map(({ official: _o, ...c }) => c);

/** English digits, with a decimal comma read as a point → a parseable number. */
function parseNumber(raw: string): number {
  const latin = toEnglishDigits(raw.trim()).replace(",", ".");
  return latin === "" ? NaN : Number(latin);
}

export function TermCheckFlow({ start = "ask", onClose }: { start?: Start; onClose: () => void }) {
  const { t } = useT();
  const required = useGpaRequiredFields();
  const router = useRouter();
  const { courses, academic, semester, activeSemesterId, termCheck, setTermCheck, reportTermCheck, cumulativeGpa, cumulativeHours, cumulativeGpaSystem, confirmPreviousGpa, confirmCumulativeForSemester } =
    useStore();
  const scheme = useScheme();
  const termId = semester.id ?? activeSemesterId;
  const [confirmedMatch, setConfirmedMatch] = useState<ReviewSnapshot | null>(null);
  useGpaReviewMatch(confirmedMatch);
  const reviewSnapshot = (results: ReviewResults, details: Record<string, unknown>): ReviewSnapshot => ({
    source: "current", termId: termId ?? "", label: semester.name.trim() || t("tc_profileTitle"), scheme: scheme.id, max: scheme.max, results, details,
  });
  const courseTable = (grades: Record<string, OfficialGrade>) => courses.map((course) => reviewCourse(
    course.id, course.name, course.creditHours, scheme, grades[course.id] ?? course.official, course.gpaExcluded === true,
    estimatedLetter(course, scheme), Boolean(course.repeat)
  ));
  const courseOptions = courses.map((course) => ({ id: course.id, name: course.name }));
  const openCourseEditor = (field: ReviewField, courseId?: string) => {
    if (!courseId) return;
    const query = new URLSearchParams({ gpaCourse: courseId, gpaField: field });
    onClose();
    router.push(`/courses/?${query}`);
  };

  const estCourses = useMemo(() => withoutOfficial(courses), [courses]);
  const ours = useMemo(() => semesterGPA(estCourses, scheme), [estCourses, scheme]);
  const fmt = (g: number) => g.toFixed(2);

  const [step, setStep] = useState<Step>(start);
  const [done, setDone] = useState<Done>("match");
  const [portalRaw, setPortalRaw] = useState("");
  const [portal, setPortal] = useState<number | null>(termCheck?.portalGpa ?? null);
  const [error, setError] = useState("");
  const [guessIdx, setGuessIdx] = useState(0);
  const [found, setFound] = useState<string[]>([]);

  // Cumulative: the cumulative GPA before this term (entered on the dashboard)
  // plus this term's courses — official results where entered — against the
  // portal's new one. The numbers before the term can be corrected here.
  const hasBefore = cumulativeHours > 0;
  const [cumEdit, setCumEdit] = useState(!hasBefore);
  const [beforeRaw, setBeforeRaw] = useState(hasBefore ? String(cumulativeGpa) : "");
  const [hoursRaw, setHoursRaw] = useState(hasBefore ? String(cumulativeHours) : "");
  const previousDraft = useRef<{ gpa: string; hours: string } | null>(null);
  const [cumPortalRaw, setCumPortalRaw] = useState("");
  const [cumSaved, setCumSaved] = useState<CumulativeCheck | null>(null);
  const [cumReasonDone, setCumReasonDone] = useState(false);
  const [returnToCumulative, setReturnToCumulative] = useState(false);
  const [focusPriorHours, setFocusPriorHours] = useState(false);
  const cumOurs = useMemo(
    () => (hasBefore ? projectedCumulativeGpa(courses, cumulativeGpa, cumulativeHours, scheme, academic, cumulativeGpaSystem) : null),
    [hasBefore, courses, cumulativeGpa, cumulativeHours, cumulativeGpaSystem, scheme, academic]
  );

  // Draft official results: existing ones, else our estimate.
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      estCourses.map((c) => {
        const o = termCheck?.grades[c.id];
        if (scheme.percent) {
          const pct = courseCurrentPct(c);
          return [c.id, o?.mark != null ? String(o.mark) : pct != null ? String(Math.round(pct * 100) / 100) : ""];
        }
        return [c.id, o?.letter ?? estimatedLetter(c, scheme) ?? ""];
      })
    )
  );

  // Data the student never recorded (lib/gpaReadiness): shown beside the
  // reasons when the GPA still differs, and sent with the reason.
  const gaps = useMemo(
    () => gpaGaps({ academic, courses, cumulativeGpa, cumulativeHours, semesterEnd: semester.endDate, checkGrades: termEnded(semester) }),
    [academic, courses, cumulativeGpa, cumulativeHours, semester]
  );
  const termGaps = gaps.filter((g) => g.kind !== "cumulative");
  const missingKinds = (list: GpaGap[]) => list.map((g) => g.kind);

  const guesses = useMemo(
    () => (portal != null ? explainGap(estCourses, scheme, portal).slice(0, 2) : []),
    [estCourses, scheme, portal]
  );

  const university = academic.universityName || academic.universitySlug || "";
  const catalog = detectScheme(academic).catalog?.slug ?? null;
  const baseMeta = () => ({ university, catalog, scheme: scheme.id, ours: ours != null ? Number(fmt(ours)) : null, portal });
  const courseMeta = (grades: Record<string, OfficialGrade>) =>
    estCourses.map((c) => sharedCourse(c, scheme, grades[c.id]));

  const save = (patch: Partial<Omit<TermCheckData, "term">>) => {
    const prev = termCheck ? { ...termCheck } : { grades: {}, at: "" };
    const { term: _term, ...rest } = prev as TermCheckData;
    setTermCheck({ ...rest, grades: rest.grades ?? {}, ...patch, at: new Date().toISOString() });
  };
  const finish = (kind: Done) => {
    setDone(kind);
    setStep("done");
  };

  const gradesFromDraft = (): Record<string, OfficialGrade> => {
    const out: Record<string, OfficialGrade> = {};
    for (const c of estCourses) {
      const v = draft[c.id];
      if (!v) continue;
      if (scheme.percent) {
        const n = parseNumber(v);
        if (n >= 0 && n <= 100) out[c.id] = { mark: n };
      } else out[c.id] = { letter: v };
    }
    return out;
  };
  const draftGpa = useMemo(() => {
    const g = gradesFromDraft();
    return semesterGPA(
      estCourses.map((c) => (g[c.id] ? { ...c, official: g[c.id] } : c)),
      scheme
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, estCourses, scheme]);

  const cumMeta = (c: CumulativeCheck) => ({
    ...baseMeta(),
    ours: c.ours,
    portal: c.portal,
    before: c.before,
    hours: c.hours,
    result: c.result,
    comparison: c.comparison,
    beforeDecimals: c.beforeDecimals,
    courses: courseMeta(termCheck?.grades ?? {}),
  });

  const systemReviewNeeded = cumulativeHours > 0 && gpaSystemChanged(scheme, cumulativeGpaSystem);
  const wasReviewNeeded = useRef(systemReviewNeeded);
  useEffect(() => {
    if (wasReviewNeeded.current && !systemReviewNeeded) {
      setBeforeRaw(String(cumulativeGpa));
      setHoursRaw(String(cumulativeHours));
      setCumSaved(null);
      setStep((current) => current === "cumResult" ? "cum" : current);
    }
    wasReviewNeeded.current = systemReviewNeeded;
  }, [systemReviewNeeded, cumulativeGpa, cumulativeHours, start]);
  if (systemReviewNeeded && (step === "cum" || step === "cumResult")) return <><GpaPriorReview /><Footer><Ghost onClick={onClose}>{t("tc_notNow")}</Ghost></Footer></>;

  // ── cumulative GPA ──
  if (step === "cum") {
    const compareCum = () => {
      const before = cumEdit ? parseNumber(beforeRaw) : cumulativeGpa;
      const hours = cumEdit ? parseNumber(hoursRaw) : cumulativeHours;
      if (!(before >= 0 && before <= scheme.max) || !(hours >= 0 && hours <= 400)) {
        setError(t("tc_cumErrBefore", { max: scheme.max }));
        return;
      }
      const portalCum = parseNumber(cumPortalRaw);
      if (!(portalCum >= 0 && portalCum <= scheme.max)) {
        setError(t("tc_portalErr", { max: scheme.max }));
        return;
      }
      const o = projectedCumulativeGpa(courses, before, hours, scheme, academic);
      if (o == null) return;
      // Corrected numbers are the student's own: the dashboard uses them too.
      if (!confirmPreviousGpa(before, hours)) {
        setError(t("gpaPreviousConfirmError", { max: scheme.max }));
        return;
      }
      const beforeDecimals = priorGpaDecimals(toEnglishDigits(cumEdit ? beforeRaw : String(cumulativeGpa)));
      const comparison = compareCumulativeGpa(o, portalCum, before, hours, scheme.max, (prior) => projectedCumulativeGpa(courses, prior, hours, scheme, academic), beforeDecimals);
      const cum: CumulativeCheck = {
        comparison,
        beforeDecimals,
        before,
        hours,
        portal: portalCum,
        ours: o,
        result: comparison === "mismatch" ? "mismatch" : "match",
      };
      save({ cum, reviewShared: true });
      reportTermCheck("term_cum_checked", { ...cumMeta(cum), reviewShared: true });
      if (comparison === "match") {
        setConfirmedMatch(reviewSnapshot({ cumulative: reviewComparison(o, portalCum) }, {}));
      }
      setCumSaved(cum);
      setCumReasonDone(false);
      setStep("cumResult");
    };
    const compareForm = () => {
      if (required.validate([cumEdit && !beforeRaw.trim() && "prior-gpa", cumEdit && !hoursRaw.trim() && "prior-hours", !cumPortalRaw.trim() && "cumulative-portal"])) compareCum();
    };
    const numberField = (value: string, set: (v: string) => void, label: string, fieldKey: string, autoFocus = false, field?: string) => (
      <label className="block">
        <span className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-muted)" }}>
          {label}
        </span>
        <input
          {...required.props(fieldKey)}
          autoFocus={autoFocus}
          data-gpa-field={field}
          inputMode="decimal"
          dir="ltr"
          value={value}
          onChange={(e) => {
            set(e.target.value);
            setError("");
            if (e.target.value.trim()) required.clear(fieldKey);
          }}
          onKeyDown={(e) => e.key === "Enter" && compareForm()}
          className="w-28 max-w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)", ...required.style(fieldKey) }}
        />
        {required.message(fieldKey)}
      </label>
    );
    return (
      <>
        <MissingData gaps={gaps.filter((gap) => gap.kind === "grades")} onLeave={onClose} />
        {!cumEdit && cumOurs != null ? (
          <>
            <Intro text={t("tc_cumIntro")} />
            <p className="font-display text-4xl tabular-nums" style={{ color: "var(--color-ink)" }}>
              {fmt(cumOurs)}
              <span className="text-base ms-2" style={{ color: "var(--color-muted)" }}>
                {t("tc_outOf", { max: scheme.max })}
              </span>
            </p>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>
              {t("tc_cumFrom", { gpa: fmt(cumulativeGpa), hours: cumulativeHours })}{" "}
              <InteractionButton type="button" onClick={() => setCumEdit(true)} className="underline underline-offset-2" style={{ color: "var(--color-primary)" }}>
                {t("tc_cumEditBefore")}
              </InteractionButton>
            </p>
          </>
        ) : (
          <>
            <Intro text={t("tc_cumNeedBefore")} />
            <div className="flex flex-wrap gap-4">
              <label className="col-span-2 text-xs flex items-center gap-2"><input type="checkbox" checked={beforeRaw === "0" && hoursRaw === "0"} onChange={(e) => { if (e.target.checked) { previousDraft.current = { gpa: beforeRaw, hours: hoursRaw }; setBeforeRaw("0"); setHoursRaw("0"); required.clear("prior-gpa"); required.clear("prior-hours"); } else { setBeforeRaw(previousDraft.current?.gpa ?? ""); setHoursRaw(previousDraft.current?.hours ?? ""); } }} />{t("gpa_noPrevious")}</label>
              {numberField(beforeRaw, setBeforeRaw, t("tc_cumBeforeGpa"), "prior-gpa", !focusPriorHours)}
              {numberField(hoursRaw, setHoursRaw, t("tc_cumBeforeHours"), "prior-hours", focusPriorHours, "current-prior-hours")}
            </div>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>
              {t("tc_cumBeforeHint")}
            </p>
          </>
        )}
        <div className="mt-5">
          {numberField(cumPortalRaw, setCumPortalRaw, t("tc_cumPortalLabel"), "cumulative-portal", !cumEdit)}
        </div>
        <ReviewNotice />
        {error && <ErrorText>{error}</ErrorText>}
        <Footer>
          <Ghost onClick={onClose}>{t("tc_notNow")}</Ghost>
          <Primary onClick={compareForm}>{t("pt_compare")}</Primary>
        </Footer>
      </>
    );
  }

  if (step === "cumResult" && cumSaved) {
    const rounding = cumSaved.comparison === "rounding";
    const match = cumSaved.comparison ? cumSaved.comparison !== "mismatch" : sameDisplayedGpa(cumSaved.ours, cumSaved.portal);
    const pick = (reason: TermMismatchReason) => {
      const next = { ...cumSaved, reason };
      save({ cum: next, reviewShared: true });
      const missing = missingKinds(gaps);
      reportTermCheck("term_cum_reason", { ...cumMeta(next), reason, missing, reviewShared: true });
      setCumSaved(next);
      setCumReasonDone(true);
    };
    return (
      <>
        <div className="flex items-start gap-3">
          {match || cumReasonDone ? (
            <CheckCircle2 size={22} className="shrink-0 mt-0.5" style={{ color: "var(--color-success)" }} />
          ) : (
            <AlertCircle size={22} className="shrink-0 mt-0.5" style={{ color: "var(--color-warning)" }} />
          )}
          <div className="min-w-0">
            <p className="text-base font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
              {t(rounding ? "gpa_roundingTitle" : match ? "tc_cumMatchTitle" : "tc_differs")}
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>
              {match ? t(rounding ? "gpa_roundingBody" : "tc_cumMatchBody", {
                    ours: fmt(cumSaved.ours),
                    portal: fmt(cumSaved.portal),
                    diff: fmt(Math.abs(cumSaved.ours - cumSaved.portal)),
                  }) : <GpaReviewNumbers ours={fmt(cumSaved.ours)} portal={fmt(cumSaved.portal)} />}
            </p>
            {!match && (
              <>
                <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  {t("tc_cumFrom", { gpa: fmt(cumSaved.before), hours: cumSaved.hours })}{" "}
                </p>
                <GpaMismatchReview
                  snapshot={reviewSnapshot({ cumulative: reviewComparison(cumSaved.ours, cumSaved.portal) }, {
                    ...cumMeta(cumSaved), before: cumSaved.before, hours: cumSaved.hours, missing: missingKinds(gaps),
                    courseTable: courseTable(termCheck?.grades ?? {}), grading: scheme, prior: { gpa: cumSaved.before, hours: cumSaved.hours },
                  })}
                  destinations={{
                    hours: { field: "priorTotals" },
                    grade: { field: "grade", courses: courseOptions },
                    notCounted: { field: "notCounted", courses: courseOptions },
                    repeat: { field: "repeat", courses: courseOptions },
                  }}
                  onEdit={(field, courseId) => {
                    if (field === "priorTotals") {
                      setBeforeRaw(cumSaved.before.toFixed(cumSaved.beforeDecimals ?? 2));
                      setHoursRaw(String(cumSaved.hours));
                      setFocusPriorHours(true);
                      setCumEdit(true);
                      setStep("cum");
                      focusReviewField("current-prior-hours");
                    } else if (field === "grade") {
                      setReturnToCumulative(true);
                      setStep("grades");
                      focusReviewField(`current-grade:${courseId}`);
                    } else openCourseEditor(field, courseId);
                  }}
                  onReceived={(reason) => pick(legacyReviewReason(reason))}
                />
              </>
            )}
          </div>
        </div>
        {(match || cumReasonDone) && (
          <Footer>
            <Primary onClick={() => {
              if (match) {
                const adjustment = repeatAdjust(courses, scheme, academic);
                const priorHours = adjustment.hours > 0 && adjustment.hours <= cumSaved.hours
                  ? cumSaved.hours - adjustment.hours
                  : cumSaved.hours;
                const completedHours = priorHours + semesterGpaDetail(courses, scheme).credits;
                if (!confirmCumulativeForSemester(cumSaved.ours, completedHours)) {
                  setBeforeRaw(String(cumSaved.before));
                  setHoursRaw(String(cumSaved.hours));
                  setCumEdit(true);
                  setError(t("gpaConfirmationInvalid"));
                  setStep("cum");
                  return;
                }
              }
              onClose();
            }}>{t("tc_done")}</Primary>
          </Footer>
        )}
      </>
    );
  }

  // ── ask ──
  if (step === "ask") {
    if (ours == null) {
      return (
        <>
          <Intro text={t("tc_noGrades")} />
          <MissingData gaps={termGaps} onLeave={onClose} />
          <Footer>
            <Primary onClick={onClose}>{t("tc_done")}</Primary>
          </Footer>
        </>
      );
    }
    return (
      <>
        <Intro text={t("tc_askBody")} />
        <MissingData gaps={termGaps.filter((gap) => gap.kind === "grades")} onLeave={onClose} />
        <p className="font-display text-4xl tabular-nums" style={{ color: "var(--color-ink)" }}>
          {fmt(ours)}
          <span className="text-base ms-2" style={{ color: "var(--color-muted)" }}>
            {t("tc_outOf", { max: scheme.max })}
          </span>
        </p>
        <p className="text-sm mt-4" style={{ color: "var(--color-ink)" }}>
          {t("tc_askQuestion")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Primary
            onClick={() => {
              save({ answer: "match", snoozeUntil: undefined });
              // A yes/no match has no entered comparison details.
              reportTermCheck("term_gpa_match", { university, scheme: scheme.id });
              finish("match");
            }}
          >
            {t("tc_yes")}
          </Primary>
          <Secondary onClick={() => setStep("portal")}>{t("tc_no")}</Secondary>
          <Ghost
            onClick={() => {
              save({ snoozeUntil: snoozeDate() });
              finish("snoozed");
            }}
          >
            {t("tc_notYet")}
          </Ghost>
        </div>
      </>
    );
  }

  // ── portal GPA ──
  if (step === "portal") {
    const submit = () => {
      const v = parseNumber(portalRaw);
      if (!(v >= 0 && v <= scheme.max)) {
        setError(t("tc_portalErr", { max: scheme.max }));
        return;
      }
      setPortal(v);
      if (ours != null && sameGpa(ours, v, scheme)) {
        save({ answer: "match", portalGpa: v, snoozeUntil: undefined });
        reportTermCheck("term_gpa_match", { university, scheme: scheme.id });
        setConfirmedMatch(reviewSnapshot({ semester: reviewComparison(ours, v) }, {}));
        finish("close");
        return;
      }
      setStep("review");
    };
    const compareForm = () => { if (required.validate([!portalRaw.trim() && "semester-portal"])) submit(); };
    return (
      <>
        <label className="block">
          <span className="block text-sm font-medium mb-1" style={{ color: "var(--color-ink)" }}>
            {t("tc_portalLabel")}
          </span>
          <span className="block text-xs mb-2" style={{ color: "var(--color-muted)" }}>
            {t("tc_portalHint")}
          </span>
          <input
            autoFocus
            {...required.props("semester-portal")}
            inputMode="decimal"
            dir="ltr"
            value={portalRaw}
            onChange={(e) => {
              setPortalRaw(e.target.value);
              setError("");
              if (e.target.value.trim()) required.clear("semester-portal");
            }}
            onKeyDown={(e) => e.key === "Enter" && compareForm()}
            placeholder="0.00"
            className="w-32 rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)", ...required.style("semester-portal") }}
          />
          {required.message("semester-portal")}
        </label>
        {error && <ErrorText>{error}</ErrorText>}
        <Footer>
          <Ghost onClick={() => setStep("ask")}>{t("tc_back")}</Ghost>
          <Primary onClick={compareForm}>{t("tc_continue")}</Primary>
        </Footer>
      </>
    );
  }

  // ── diagnostic review ──
  if (step === "review" && portal != null && ours != null) {
    const next = () => {
      save({ answer: "mismatch", portalGpa: portal, reviewShared: true, snoozeUntil: undefined });
      reportTermCheck("term_gpa_mismatch", { ...baseMeta(), courses: courseMeta(termCheck?.grades ?? {}), reviewShared: true });
      setStep(guesses.length ? "guess" : "grades");
    };
    return (
      <>
        <p className="text-base font-semibold mb-1.5" style={{ color: "var(--color-ink)" }}>
          {t("tc_sorryTitle")}
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>
          <GpaReviewNumbers ours={fmt(ours)} portal={fmt(portal)} />
        </p>
        <ReviewNotice />
        <Footer>
          <Primary onClick={next}>{t("tc_continue")}</Primary>
        </Footer>
      </>
    );
  }

  // ── one targeted question ──
  if (step === "guess" && guesses[guessIdx]) {
    const g = guesses[guessIdx];
    const course = estCourses.find((c) => c.id === g.courseId)!;
    const yes = () => {
      const grades = { ...(termCheck?.grades ?? {}), [g.courseId]: { letter: g.letter } };
      save({ grades, answer: "match", reviewShared: true });
      reportTermCheck("term_grades_saved", { ...baseMeta(), via: "guess", courses: courseMeta(grades), reviewShared: true });
      if (portal != null && sameGpa(g.gpa, portal, scheme)) {
        setConfirmedMatch(reviewSnapshot({ semester: reviewComparison(g.gpa, portal) }, {}));
      }
      setFound([course.name]);
      finish("found");
    };
    const no = () => (guessIdx + 1 < guesses.length ? setGuessIdx(guessIdx + 1) : setStep("grades"));
    return (
      <>
        <p className="text-base font-semibold mb-1.5" style={{ color: "var(--color-ink)" }}>
          {t("tc_guessTitle")}
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>
          {t("tc_guessBody", { course: course.name, letter: isolate(g.letter), gpa: fmt(g.gpa) })}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Primary onClick={yes}>{t("tc_guessYes")}</Primary>
          <Secondary onClick={no}>{t("tc_guessNo")}</Secondary>
        </div>
        <InteractionButton
          type="button"
          onClick={() => setStep("grades")}
          className="mt-4 text-xs underline underline-offset-2"
          style={{ color: "var(--color-primary)" }}
        >
          {t("tc_enterAll")}
        </InteractionButton>
      </>
    );
  }

  // ── every course's official result ──
  if (step === "grades" || step === "guess" || step === "review") {
    const matches = portal != null && draftGpa != null && sameGpa(draftGpa, portal, scheme);
    const submit = () => {
      const grades = gradesFromDraft();
      if (!Object.keys(grades).length) {
        setError(t("tc_gradesErr"));
        return;
      }
      save({ grades, ...(matches && !returnToCumulative ? { answer: "match" as const } : {}), reviewShared: true });
      reportTermCheck("term_grades_saved", { ...baseMeta(), via: "list", courses: courseMeta(grades), reviewShared: true });
      if (returnToCumulative) {
        setReturnToCumulative(false);
        setStep("cum");
        return;
      }
      if (portal == null) return finish("saved");
      if (matches) {
        if (draftGpa != null && portal != null) {
          setConfirmedMatch(reviewSnapshot({ semester: reviewComparison(draftGpa, portal) }, {}));
        }
        setFound(
          estCourses
            .filter((c) => grades[c.id] && (grades[c.id].letter ?? String(grades[c.id].mark)) !== (estimatedLetter(c, scheme) ?? ""))
            .map((c) => c.name)
        );
        return finish("found");
      }
      setStep("reason");
    };
    return (
      <>
        <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--color-ink)" }}>
          {t(scheme.percent ? "tc_gradesBodyPct" : "tc_gradesBody")}
        </p>
        <div className="flex flex-col">
          {estCourses.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[minmax(0,1fr)_3.5rem_5.5rem] items-center gap-2 py-2 border-b text-sm"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span className="min-w-0" style={{ color: "var(--color-ink)" }}>
                <span className="block truncate">{c.name}</span>
                {c.gpaExcluded && (
                  <span className="block text-[11.5px]" style={{ color: "var(--color-muted)" }}>{t("pt_excludedBadge")}</span>
                )}
              </span>
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {t("tc_hours", { n: c.creditHours })}
              </span>
              {scheme.percent ? (
                <input
                  inputMode="decimal"
                  dir="ltr"
                  aria-label={c.name}
                  data-gpa-field={`current-grade:${c.id}`}
                  value={draft[c.id] ?? ""}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, [c.id]: e.target.value }));
                    setError("");
                  }}
                  className="min-w-0 max-w-full rounded-lg border px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
                />
              ) : (
                <select
                  dir="ltr"
                  aria-label={c.name}
                  data-gpa-field={`current-grade:${c.id}`}
                  value={draft[c.id] ?? ""}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, [c.id]: e.target.value }));
                    setError("");
                  }}
                  className="min-w-0 max-w-full rounded-lg border px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
                >
                  <option value="">—</option>
                  {scheme.bands.map((b) => (
                    <option key={b.letter} value={b.letter}>
                      {isolateOption(b.letter)}
                    </option>
                  ))}
                  {SPECIAL_RESULTS.map((l) => (
                    <option key={l} value={l}>
                      {t(l === DENIED ? "grade_DN" : "grade_W")}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
        {draftGpa != null && (
          <p className="text-sm mt-4 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: "var(--color-ink)" }}>
            <span>
              {t("tc_liveGpa")} <b className="tabular-nums">{fmt(draftGpa)}</b>
            </span>
            {portal != null && (
              <>
                <span style={{ color: "var(--color-muted)" }}>
                  {t("tc_portalShort")} <b className="tabular-nums">{fmt(portal)}</b>
                </span>
                <Pill ok={matches}>{t(matches ? "tc_matches" : "tc_differs")}</Pill>
              </>
            )}
          </p>
        )}
        <ReviewNotice />
        {error && <ErrorText>{error}</ErrorText>}
        <Footer>
          {start !== "grades" && <Ghost onClick={onClose}>{t("tc_notNow")}</Ghost>}
          <Primary onClick={submit}>{t("tc_save")}</Primary>
        </Footer>
      </>
    );
  }

  // ── still off after official results ──
  if (step === "reason" && (draftGpa == null || portal == null)) {
    return <>
      <Intro text={t("tc_noGrades")} />
      <MissingData gaps={termGaps} onLeave={onClose} />
      <Footer><Primary onClick={() => setStep("grades")}>{t("tc_back")}</Primary></Footer>
    </>;
  }
  if (step === "reason" && draftGpa != null && portal != null) {
    const pick = (reason: TermMismatchReason) => {
      save({ reason, reviewShared: true });
      reportTermCheck("term_mismatch_reason", { ...baseMeta(), reason, missing: missingKinds(termGaps), courses: courseMeta(gradesFromDraft()), reviewShared: true });
      setDone("reason");
    };
    return (
      <>
        <p className="text-base font-semibold mb-1.5" style={{ color: "var(--color-ink)" }}>
          {t("tc_reasonTitle")}
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>
          <GpaReviewNumbers ours={fmt(draftGpa)} portal={fmt(portal)} />
        </p>
        <GpaMismatchReview
          snapshot={reviewSnapshot({ semester: reviewComparison(draftGpa, portal) }, {
            ...baseMeta(), ours: draftGpa, courses: courseMeta(gradesFromDraft()), missing: missingKinds(termGaps),
            courseTable: courseTable(gradesFromDraft()), grading: scheme,
          })}
          destinations={{
            hours: { field: "courseHours", courses: courseOptions },
            grade: { field: "grade", courses: courseOptions },
            notCounted: { field: "notCounted", courses: courseOptions },
            repeat: { field: "repeat", courses: courseOptions },
          }}
          onEdit={(field, courseId) => {
            if (field === "grade") {
              setDone("match");
              setStep("grades");
              focusReviewField(`current-grade:${courseId}`);
            } else openCourseEditor(field, courseId);
          }}
          onReceived={(reason) => pick(legacyReviewReason(reason))}
        />
        {done === "reason" && (
          <Footer>
            <Secondary onClick={() => setStep("cum")}>{t("tc_cumOffer")}</Secondary>
            <Primary onClick={onClose}>{t("tc_done")}</Primary>
          </Footer>
        )}
      </>
    );
  }

  // ── done ──
  const doneText: Record<Done, { title: string; body: string; note?: string }> = {
    match: { title: t("tc_matchTitle"), body: t("tc_matchBody") },
    close: {
      title: t("tc_closeTitle"),
      body: t("tc_closeBody", { diff: portal != null && ours != null ? fmt(Math.abs(ours - portal)) : "0.00" }),
    },
    snoozed: { title: t("tc_snoozeTitle"), body: t("tc_snoozeBody") },
    found: {
      title: t("tc_foundTitle"),
      body: found.length ? t("tc_foundBody", { courses: found.join("، ") }) : t("tc_foundBodyNone"),
      note: t("tc_foundShared"),
    },
    saved: { title: t("tc_savedTitle"), body: t("tc_savedBody") },
    reason: {
      title: t("tc_thanksTitle"),
      body: t("tc_reasonDoneShared"),
      // A repeated course is something the student can tell us right away.
      note: termCheck?.reason === "repeat" ? t("tc_repeatHint") : undefined,
    },
  };
  const d = doneText[done];
  return (
    <>
      <div className="flex items-start gap-3">
        <CheckCircle2 size={22} className="shrink-0 mt-0.5" style={{ color: "var(--color-success)" }} />
        <div>
          <p className="text-base font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
            {d.title}
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>
            {d.body}
          </p>
          {d.note && (
            <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>
              {d.note}
            </p>
          )}
        </div>
      </div>
      <Footer>
        {done !== "snoozed" && <Secondary onClick={() => setStep("cum")}>{t("tc_cumOffer")}</Secondary>}
        <Primary onClick={onClose}>{t("tc_done")}</Primary>
      </Footer>
    </>
  );
}

/** Profile page "Check your GPA's accuracy": the cumulative GPA, this term's
 *  check, and past terms. */
export function GpaAccuracyCard({ onOpen = openTermCheck }: { onOpen?: (step: Start) => void } = {}) {
  const { t } = useT();
  const { semester, activeSemesterId } = useStore();
  const reviews = useStudentGpaReviews();
  const current = reviews.find((review) => review.source === "current" && review.termId === (semester.id ?? activeSemesterId));
  return (
    <>
      <p className="text-[13px] mb-5 -mt-1 leading-relaxed" style={{ color: "var(--color-muted)" }}>
        {t("acc_desc")}
      </p>
      <CumulativeProfileCard onOpen={onOpen} review={current} />
      <div className="mt-6 pt-5 border-t" style={{ borderColor: "var(--color-border)" }}>
        <TermCheckProfileCard onOpen={onOpen} review={current} />
      </div>
      <div className="mt-6 pt-5 border-t" style={{ borderColor: "var(--color-border)" }}>
        <PastTerms reviews={reviews} />
      </div>
    </>
  );
}

/** What the student never recorded, when the GPA still differs from the
 *  portal: each item links to where it is fixed (closing the window). */
function MissingData({ gaps, onLeave }: { gaps: GpaGap[]; onLeave: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const { setGpaMode } = useStore();
  if (!gaps.length) return null;
  const go = (gap: GpaGap, courseId?: string) => {
    onLeave();
    if (gap.kind === "university" || gap.kind === "table") router.push("/profile#academic-profile");
    else if (gap.kind === "cumulative") {
      setGpaMode("cumulative");
      router.push("/dashboard");
    } else router.push(`/courses${courseId ? `#${encodeURIComponent(courseId)}` : ""}`);
  };
  return (
    <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-primary-soft)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
        {t("tc_missingTitle")}
      </p>
      <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
        {t("tc_missingBody")}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
        {gaps.map((g) => (
          <li key={g.kind} className="ps-2.5 border-s-2" style={{ borderColor: "var(--color-warning)" }}>
            {g.courses ? (
              <>
                <span style={{ color: "var(--color-ink)" }}>{g.kind === "grades" ? t("gpaMissingGrades") : t(`haviGpa_${g.kind}`)}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {g.courses.map((c) => (
                    <InteractionButton
                      key={c.id}
                      type="button"
                      dir="auto"
                      onClick={() => go(g, c.id)}
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{ background: "var(--color-surface)", color: "var(--color-primary-dark)" }}
                    >
                      {g.kind === "grades" ? t("gpaCompleteCourse", { course: c.name }) : c.name}
                    </InteractionButton>
                  ))}
                </span>
              </>
            ) : (
              <InteractionButton
                type="button"
                onClick={() => go(g)}
                className="text-start underline underline-offset-2"
                style={{ color: "var(--color-ink)" }}
              >
                {t(`haviGpa_${g.kind}`)}
              </InteractionButton>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The cumulative GPA after this term against the portal's: open once the
 *  term is over; until then, a past term is where to try it. */
function CumulativeProfileCard({ onOpen, review }: { onOpen: (step: Start) => void; review?: ReviewStatus }) {
  const { t } = useT();
  const { semester, termCheck } = useStore();
  const ended = termEnded(semester);
  const cum = termCheck?.cum;
  return (
    <div className="flex items-start gap-3">
      <span
        className="shrink-0 inline-flex items-center justify-center rounded-xl"
        style={{ width: 34, height: 34, background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
      >
        <TrendingUp size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          {t("tc_cumProfileTitle")}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] mt-1 leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {cum
            ? cum.comparison === "rounding"
              ? t("gpa_roundingBody", { ours: cum.ours.toFixed(2), portal: cum.portal.toFixed(2) })
              : sameDisplayedGpa(cum.ours, cum.portal)
              ? t("tc_cumProfileMatched", { gpa: cum.portal.toFixed(2) })
              : t("tc_cumProfileMismatch", { ours: cum.ours.toFixed(2), portal: cum.portal.toFixed(2) })
            : ended
            ? t("tc_cumProfilePending")
            : t("tc_cumProfileNotEnded")}
          {cum && <GpaReviewStatusBadge review={review} kind="cumulative" soleKind={!termCheck?.answer} />}
        </p>
        {(ended || cum) && (
          <div className="mt-3">
            <Secondary onClick={() => onOpen("cum")}>{t(cum ? "tc_cumProfileAgain" : "tc_cumProfileCheck")}</Secondary>
          </div>
        )}
      </div>
    </div>
  );
}

/** This term: where the check stands, edit official results and explain diagnostic review. */
export function TermCheckProfileCard({ onOpen = openTermCheck, review }: { onOpen?: (step: Start) => void; review?: ReviewStatus } = {}) {
  const { t, lang } = useT();
  const { semester, termCheck } = useStore();
  const ended = termEnded(semester);
  const count = Object.keys(termCheck?.grades ?? {}).length;
  const answer = termCheck?.answer;
  const endLabel = semester.endDate
    ? new Date(`${semester.endDate}T00:00:00`).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA-u-ca-gregory", {
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    <div className="flex items-start gap-3">
      <span
        className="shrink-0 inline-flex items-center justify-center rounded-xl"
        style={{ width: 34, height: 34, background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
      >
        <Calculator size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          {t("tc_profileTitle")}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] mt-1 leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {answer === "match"
            ? t("tc_profileMatched")
            : answer === "mismatch"
            ? t("tc_profileMismatch")
            : ended
            ? t("tc_profilePending")
            : endLabel
            ? t("tc_profileNotEnded", { date: endLabel })
            : t("tc_profileNotEndedNoDate")}
          {answer && <GpaReviewStatusBadge review={review} kind="semester" soleKind={!termCheck?.cum} />}
          {count > 0 && <span>{t("tc_profileGrades", { n: count })}</span>}
        </p>
        {(ended || answer || count > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {!answer && ended && <Secondary onClick={() => onOpen("ask")}>{t("tc_profileCheck")}</Secondary>}
            {(answer || count > 0) && (
              <Secondary onClick={() => onOpen("grades")}>
                {t(count > 0 ? "tc_profileEdit" : "tc_profileEnter")}
              </Secondary>
            )}
          </div>
        )}
        <ReviewNotice />
      </div>
    </div>
  );
}

// ── Past terms ──────────────────────────────────────────────────────────────

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

const legacyReviewReason = (reason: ReviewReason): TermMismatchReason => reason === "grade" ? "unknown" : reason;

function pastReviewSnapshot(term: PastTerm, scheme: GradeScheme, university: string, matchingOnly: boolean, courseIds: string[] = []): ReviewSnapshot | null {
  const results: ReviewResults = {};
  if (!matchingOnly || sameDisplayedGpa(term.ours, term.portalGpa)) {
    results.semester = reviewComparison(term.ours, term.portalGpa);
  }
  if (term.cum && term.cum.comparison !== "rounding" &&
      (!matchingOnly || sameDisplayedGpa(term.cum.ours, term.cum.portal))) {
    results.cumulative = reviewComparison(term.cum.ours, term.cum.portal);
  }
  if (!Object.keys(results).length) return null;
  return {
    source: "past", termId: term.id, label: term.name, scheme: term.scheme, max: scheme.max, results,
    details: matchingOnly ? {} : {
      university, courses: term.courses, cumulative: term.cum, grading: scheme,
      courseTable: term.courses.map((course, i) => reviewCourse(courseIds[i] ?? String(i), course.name ?? "", course.hours,
        scheme, course, course.excludedFromGpa === true, course.pct)),
      ...(term.cum ? { prior: { gpa: term.cum.before, hours: term.cum.hours } } : {}),
    },
  };
}

/** Saved past terms (compact) + the button to check another one. */
function PastTerms({ reviews }: { reviews: ReviewStatus[] }) {
  const { t } = useT();
  const { pastTerms, setPastTerms, hydrated, historicalReadOnly } = useStore();
  const checked = useGpaChecked();
  const [editing, setEditing] = useState<PastTerm | "new" | null>(null);
  const [removed, setRemoved] = useState<{ term: PastTerm; index: number } | null>(null);
  const openPastReview = useCallback(() => { setRemoved(null); setEditing("new"); }, []);

  const remove = (term: PastTerm, index: number) => {
    setPastTerms(pastTerms.filter((p) => p.id !== term.id));
    setRemoved({ term, index });
  };
  const undo = () => {
    if (!removed) return;
    const next = [...pastTerms];
    next.splice(removed.index, 0, removed.term);
    setPastTerms(next);
    setRemoved(null);
  };

  return (
    <div className="flex items-start gap-3">
      <Suspense fallback={null}><GpaReviewLink kind="past" enabled={hydrated && !historicalReadOnly} onRequest={openPastReview} /></Suspense>
      <span
        className="shrink-0 inline-flex items-center justify-center rounded-xl"
        style={{ width: 34, height: 34, background: "var(--color-brass-soft)", color: "var(--color-brass)" }}
      >
        <History size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          {t("pt_title")}
        </p>
        <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {t("pt_desc")}
        </p>

        {pastTerms.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {pastTerms.map((p, i) => {
              const summary = pastTermSummary(p.courses);
              const hours = summary.enteredHours;
              const termComparison = savedGpaComparison(p.ours, p.portalGpa, undefined, p.result);
              const cumComparison = p.cum ? savedGpaComparison(p.cum.ours, p.cum.portal, p.cum.comparison, p.cum.result) : null;
              const review = reviews.find((item) => item.source === "past" && item.termId === p.id);
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]"
                  style={{ background: "var(--color-surface-alt)" }}
                >
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]" style={{ color: "var(--color-ink)" }}>
                    <b className="font-medium">{p.name || t("pt_unnamed")}</b>
                    <span style={{ color: "var(--color-muted)" }}>
                      {" · "}
                      {t("pt_summary", { n: p.courses.length, hours })}
                      {summary.excluded > 0 && <span className="block">{t("pt_summaryCounted", { n: summary.counted, hours: summary.countedHours })} · {t("pt_summaryExcluded", { n: summary.excluded, hours: summary.excludedHours })}</span>}
                    </span>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <Pill ok={termComparison === "match"}>
                          {t(p.cum ? (termComparison === "match" ? "pt_termPillMatch" : "pt_termPillDiffers") : termComparison === "match" ? "tc_matches" : "tc_differs")}
                        </Pill>
                        <GpaReviewStatusBadge review={review} kind="semester" soleKind={!p.cum} />
                      </span>
                      {p.cum && <span className="inline-flex flex-wrap items-center gap-1">
                        <Pill ok={cumComparison === "match" || cumComparison === "rounding"}>
                          {t(cumComparison === "rounding" ? "gpa_roundingTitle" : cumComparison === "match" ? "pt_cumPillMatch" : "pt_cumPillDiffers")}
                        </Pill>
                        <GpaReviewStatusBadge review={review} kind="cumulative" />
                      </span>}
                    </div>
                  </div>
                  <InteractionButton
                    type="button"
                    onClick={() => setEditing(p)}
                    aria-label={t("pt_edit")}
                    className="rounded-md p-1.5 hover:bg-black/5"
                    style={{ color: "var(--color-muted)" }}
                  >
                    <Pencil size={14} />
                  </InteractionButton>
                  <InteractionButton
                    type="button"
                    onClick={() => remove(p, i)}
                    aria-label={t("pt_delete")}
                    className="rounded-md p-1.5 hover:bg-black/5"
                    style={{ color: "var(--color-muted)" }}
                  >
                    <Trash2 size={14} />
                  </InteractionButton>
                </li>
              );
            })}
          </ul>
        )}
        {removed && (
          <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>
            {t("pt_deleted")}{" "}
            <InteractionButton type="button" onClick={undo} className="underline underline-offset-2" style={{ color: "var(--color-primary)" }}>
              {t("pt_undo")}
            </InteractionButton>
          </p>
        )}

        <div className="mt-3 relative inline-block">
          <Secondary
            onClick={() => {
              setRemoved(null);
              setEditing("new");
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus size={15} />
              {t("pt_add")}
            </span>
          </Secondary>
          {/* Same pulsing dot as the dashboard's, until the first check. */}
          {!checked && (
            <span
              className="absolute -top-1 -end-1 w-3 h-3 rounded-full animate-ping pointer-events-none"
              style={{ background: "var(--color-brass)" }}
            />
          )}
        </div>
      </div>
      {editing && (
        <PastTermModal term={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function PastTermInputSummary({ courses }: { courses: PastTermCourse[] }) {
  const { t } = useT();
  const totals = pastTermSummary(courses);
  return <div className="mt-4 rounded-xl p-3 text-xs leading-relaxed" style={{ background: "var(--color-surface-alt)", color: "var(--color-muted)" }}>
    <p>{t("pt_summary", { n: totals.entered, hours: totals.enteredHours })}</p>
    <p>{t("pt_summaryCounted", { n: totals.counted, hours: totals.countedHours })}</p>
    <p>{t("pt_summaryExcluded", { n: totals.excluded, hours: totals.excludedHours })}</p>
  </div>;
}

interface Row {
  key: string;
  name: string;
  hours: string;
  grade: string;
  pct: string;
  excludedFromGpa: boolean;
}
const blankRow = (): Row => ({ key: newId(), name: "", hours: "", grade: "", pct: "", excludedFromGpa: false });

function PastTermModal({ term: initialTerm, onClose }: { term: PastTerm | null; onClose: () => void }) {
  const { t } = useT();
  const required = useGpaRequiredFields();
  const { pastTerms, setPastTerms, reportTermCheck, academic } = useStore();
  const scheme = useScheme();
  const [createdTerm, setCreatedTerm] = useState<PastTerm | null>(null);
  const term = initialTerm ?? createdTerm;
  const [name, setName] = useState(term?.name ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    term
      ? term.courses.map((c) => ({
          key: newId(),
          name: c.name ?? "",
          hours: String(c.hours),
          grade: scheme.percent ? (c.mark != null ? String(c.mark) : "") : c.letter ?? "",
          pct: c.pct != null ? String(c.pct) : "",
          excludedFromGpa: c.excludedFromGpa === true,
        }))
      : [blankRow(), blankRow(), blankRow()]
  );
  const [portalRaw, setPortalRaw] = useState(term ? String(term.portalGpa) : "");
  // The cumulative GPA before and after this term (optional, same transcript).
  const [cumBeforeRaw, setCumBeforeRaw] = useState(term?.cum ? term.cum.before.toFixed(term.cum.beforeDecimals ?? 2) : "");
  const [cumHoursRaw, setCumHoursRaw] = useState(term?.cum ? String(term.cum.hours) : "");
  const previousDraft = useRef<{ gpa: string; hours: string } | null>(null);
  const [cumAfterRaw, setCumAfterRaw] = useState(term?.cum ? String(term.cum.portal) : "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<PastTerm | null>(null);
  const [reasonDone, setReasonDone] = useState(false);

  const setRow = (key: string, patch: Partial<Row>) => {
    setError("");
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const university = academic.universityName || academic.universitySlug || "";
  const catalog = detectScheme(academic).catalog?.slug ?? null;
  const confirmed = useMemo(() => saved && !reasonDone ? pastReviewSnapshot(saved, scheme, university, true) : null,
    [saved, reasonDone, scheme, university]);
  useGpaReviewMatch(confirmed);

  const compare = () => {
    const courses: PastTermCourse[] = [];
    for (const r of rows) {
      const blank = !r.excludedFromGpa && !r.hours.trim() && !r.grade.trim() && !r.name.trim() && !r.pct.trim();
      if (blank) continue;
      const hours = parseNumber(r.hours);
      if (!(hours >= 0 && hours <= 12) || (!r.excludedFromGpa && hours === 0)) return setError(t("pt_errHours"));
      let letter: string | undefined;
      let mark: number | undefined;
      if (scheme.percent && (r.grade.trim() || !r.excludedFromGpa)) {
        mark = parseNumber(r.grade);
        if (!(mark >= 0 && mark <= 100)) return setError(t("pt_errMark"));
      } else if (!scheme.percent) {
        if (!r.excludedFromGpa && !scheme.bands.some((b) => b.letter === r.grade) && !SPECIAL_RESULTS.some((letter) => letter === r.grade)) return setError(t("pt_errLetter"));
        letter = r.grade || undefined;
      }
      let pct: number | undefined;
      if (!scheme.percent && r.pct.trim()) {
        pct = parseNumber(r.pct);
        if (!(pct >= 0 && pct <= 100)) return setError(t("pt_errPct"));
      }
      courses.push({
        ...(r.excludedFromGpa ? { excludedFromGpa: true } : {}),
        ...(r.name.trim() ? { name: r.name.trim().slice(0, 60) } : {}),
        hours,
        ...(letter ? { letter } : {}),
        ...(mark != null ? { mark } : {}),
        ...(pct != null ? { pct } : {}),
      });
    }
    if (!courses.length) return setError(t("pt_errRows"));
    const ours = pastTermGpa(courses, scheme);
    if (ours == null) return setError(t("pt_noCounted"));
    const portal = parseNumber(portalRaw);
    if (!(portal >= 0 && portal <= scheme.max)) return setError(t("tc_portalErr", { max: scheme.max }));

    let cum: CumulativeCheck | undefined;
    if (cumBeforeRaw.trim() || cumHoursRaw.trim() || cumAfterRaw.trim()) {
      const before = parseNumber(cumBeforeRaw);
      const hours = parseNumber(cumHoursRaw);
      const after = parseNumber(cumAfterRaw);
      if (!(before >= 0 && before <= scheme.max) || !(hours >= 0 && hours <= 400) || !(after >= 0 && after <= scheme.max)) {
        return setError(t("pt_errCum", { max: scheme.max }));
      }
      const o = pastTermCumulative(courses, scheme, before, hours);
      if (o != null) {
        const beforeDecimals = priorGpaDecimals(toEnglishDigits(cumBeforeRaw));
        const comparison = compareCumulativeGpa(o, after, before, hours, scheme.max, (prior) => pastTermCumulative(courses, scheme, prior, hours), beforeDecimals);
        cum = {
          comparison,
          beforeDecimals,
          before,
          hours,
          portal: after,
          ours: o,
          result: comparison === "mismatch" ? "mismatch" : "match",
        };
      }
    }

    const result: PastTerm = {
      id: term?.id ?? newId(),
      name: name.trim().slice(0, 40),
      scheme: scheme.id,
      courses,
      portalGpa: portal,
      ours: ours,
      result: sameGpa(ours, portal, scheme) ? "match" : "mismatch",
      ...(cum ? { cum } : {}),
      ...(term?.consent !== undefined ? { consent: term.consent } : {}),
      reviewShared: true,
      at: new Date().toISOString(),
    };
    setPastTerms(term ? pastTerms.map((p) => (p.id === term.id ? result : p)) : [...pastTerms, result]);
    reportTermCheck(
      "past_term_checked",
      { reviewShared: true, result: result.result, university, catalog, scheme: scheme.id, name: result.name, ours: result.ours, portal, courses, ...(cum ? { cum } : {}) }
    );
    setSaved(result);
  };

  const compareForm = () => {
    const entered = rows.filter((r) => r.excludedFromGpa || [r.name, r.hours, r.grade, r.pct].some((value) => value.trim()));
    const requiredRows = entered.length ? entered : rows.slice(0, 1);
    const withCumulative = Boolean(cumBeforeRaw.trim() || cumHoursRaw.trim() || cumAfterRaw.trim());
    if (required.validate([
      ...requiredRows.flatMap((r) => [!r.hours.trim() && `hours:${r.key}`, !r.excludedFromGpa && !r.grade.trim() && `grade:${r.key}`]),
      !portalRaw.trim() && "portal",
      withCumulative && !cumBeforeRaw.trim() && "pt_cumBefore",
      withCumulative && !cumHoursRaw.trim() && "pt_cumHours",
      withCumulative && !cumAfterRaw.trim() && "pt_cumAfter",
    ])) compare();
  };

  const pickReason = (reason: TermMismatchReason) => {
    if (!saved) return;
    const next = { ...saved, reason };
    setPastTerms(pastTerms.map((p) => (p.id === saved.id ? next : p)));
    reportTermCheck("past_term_reason", { reviewShared: true, reason, university, catalog, scheme: saved.scheme, name: saved.name, result: saved.result, ours: saved.ours, portal: saved.portalGpa, courses: saved.courses, ...(saved.cum ? { cum: saved.cum } : {}) });
    setSaved(next);
    setReasonDone(true);
  };

  const field =
    "w-full rounded-lg border px-2 py-1.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";
  const fieldStyle: React.CSSProperties = {
    borderColor: "var(--color-border)",
    background: "var(--color-surface)",
    color: "var(--color-ink)",
  };
  const cols = scheme.percent
    ? "grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_1.75rem]"
    : "grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_3.75rem_1.75rem]";

  // ── result ──
  if (saved) {
    const reviewCourses = rows.flatMap((row, index) => row.hours.trim() ? [{
      id: row.key,
      name: row.name.trim() || `${t("pt_colCourse")} ${index + 1}`,
    }] : []);
    const termMatch = sameDisplayedGpa(saved.ours, saved.portalGpa);
    const rounding = saved.cum?.comparison === "rounding";
    const cumMatch = !saved.cum || (saved.cum.comparison ? saved.cum.comparison !== "mismatch" : sameDisplayedGpa(saved.cum.ours, saved.cum.portal));
    const match = termMatch && cumMatch;
    const diff = Math.abs(saved.ours - saved.portalGpa).toFixed(2);
    return (
      <Modal open onClose={onClose} title={t("pt_modalTitle")}>
        <div className="flex items-start gap-3">
          {match ? (
            <CheckCircle2 size={22} className="shrink-0 mt-0.5" style={{ color: "var(--color-success)" }} />
          ) : (
            <AlertCircle size={22} className="shrink-0 mt-0.5" style={{ color: "var(--color-warning)" }} />
          )}
          <div className="min-w-0">
            <p className="text-base font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
              {t(rounding && termMatch ? "gpa_roundingTitle" : match ? "pt_matchTitle" : "tc_sorryTitle")}
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>
              {termMatch ? t(saved.cum ? "pt_termLineMatch" : "pt_matchBody", {
                ours: saved.ours.toFixed(2),
                portal: saved.portalGpa.toFixed(2),
                diff,
              }) : <GpaReviewNumbers ours={saved.ours.toFixed(2)} portal={saved.portalGpa.toFixed(2)} kind={saved.cum ? "semester" : undefined} />}
            </p>
            {saved.cum && (
              <p className="text-sm leading-relaxed mt-2" style={{ color: "var(--color-ink)" }}>
                {cumMatch ? t(rounding ? "gpa_roundingBody" : "pt_cumLineMatch", {
                  ours: saved.cum.ours.toFixed(2),
                  portal: saved.cum.portal.toFixed(2),
                  diff: Math.abs(saved.cum.ours - saved.cum.portal).toFixed(2),
                }) : <GpaReviewNumbers ours={saved.cum.ours.toFixed(2)} portal={saved.cum.portal.toFixed(2)} kind="cumulative" />}
              </p>
            )}
            {!match && <GpaMismatchReview
              snapshot={pastReviewSnapshot(saved, scheme, university, false, reviewCourses.map((course) => course.id))!}
              destinations={{
                hours: termMatch ? { field: "priorTotals" } : { field: "courseHours", courses: reviewCourses },
                grade: { field: "grade", courses: reviewCourses },
                notCounted: { field: "notCounted", courses: reviewCourses },
                repeat: { field: "repeatNote", courses: reviewCourses },
              }}
              onEdit={(field, courseId) => {
                if (!initialTerm) setCreatedTerm(saved);
                setSaved(null);
                setReasonDone(false);
                if (field === "termLabel") required.validate(["term-name"]);
                else if (field === "courseLabel" && courseId) required.validate([`name:${courseId}`]);
                focusReviewField(field === "termLabel" ? "past-term-name" : field === "priorTotals" ? "past-prior-hours" : `${field}:${courseId}`);
              }}
              onReceived={(reason) => pickReason(legacyReviewReason(reason))}
            />}
            {match && (
              <p className="text-xs mt-3 leading-relaxed" style={{ color: "var(--color-muted)" }}>
                {t("pt_sharedMatch")}
              </p>
            )}
          </div>
        </div>
        <PastTermInputSummary courses={saved.courses} />
        {(match || reasonDone) && (
          <Footer>
            <Primary onClick={onClose}>{t("tc_done")}</Primary>
          </Footer>
        )}
      </Modal>
    );
  }

  // ── form ──
  return (
    <Modal open onClose={onClose} title={t("pt_modalTitle")}>
      <p className="text-[13px] leading-relaxed mb-4" style={{ color: "var(--color-muted)" }}>
        {t(scheme.percent ? "pt_formIntroPct" : "pt_formIntro")}
      </p>
      <label className="block mb-4">
        <span className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-muted)" }}>
          {t("pt_name")}
        </span>
        <input
          value={name}
          data-gpa-field="past-term-name"
          {...required.props("term-name")}
          onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) required.clear("term-name"); }}
          placeholder={t("pt_namePlaceholder")}
          maxLength={40}
          className={field}
          style={{ ...fieldStyle, ...required.style("term-name") }}
        />
        {required.message("term-name")}
      </label>

      <div className={`grid ${cols} gap-1.5 text-[11px] font-medium mb-1.5`} style={{ color: "var(--color-muted)" }}>
        <span>{t("pt_colCourse")}</span>
        <span>{t("pt_colHours")}</span>
        <span>{t(scheme.percent ? "pt_colMark" : "pt_colLetter")}</span>
        {!scheme.percent && <span>{t("pt_colPct")}</span>}
        <span />
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.key}>
          <div className={`grid ${cols} gap-1.5 items-start`}>
            <div className="min-w-0"><input
              value={r.name}
              data-gpa-field={`courseLabel:${r.key}`}
              {...required.props(`name:${r.key}`)}
              onChange={(e) => { setRow(r.key, { name: e.target.value }); if (e.target.value.trim()) required.clear(`name:${r.key}`); }}
              placeholder={t("pt_coursePlaceholder")}
              aria-label={t("pt_colCourse")}
              className={field}
              style={{ ...fieldStyle, ...required.style(`name:${r.key}`) }}
            />{required.message(`name:${r.key}`)}</div>
            <div className="min-w-0"><input
              value={r.hours}
              {...required.props(`hours:${r.key}`)}
              onChange={(e) => { setRow(r.key, { hours: e.target.value }); if (e.target.value.trim()) required.clear(`hours:${r.key}`); }}
              inputMode="decimal"
              dir="ltr"
              aria-label={t("pt_colHours")}
              data-gpa-field={`courseHours:${r.key}`}
              className={field}
              style={{ ...fieldStyle, ...required.style(`hours:${r.key}`) }}
            />{required.message(`hours:${r.key}`)}</div>
            <div className="min-w-0">{scheme.percent ? (
              <input
                value={r.grade}
                {...required.props(`grade:${r.key}`)}
                onChange={(e) => { setRow(r.key, { grade: e.target.value }); if (e.target.value.trim()) required.clear(`grade:${r.key}`); }}
                inputMode="decimal"
                dir="ltr"
                aria-label={t("pt_colMark")}
                data-gpa-field={`grade:${r.key}`}
                className={field}
                style={{ ...fieldStyle, ...required.style(`grade:${r.key}`) }}
              />
            ) : (
              <select
                value={r.grade}
                {...required.props(`grade:${r.key}`)}
                onChange={(e) => { setRow(r.key, { grade: e.target.value }); if (e.target.value.trim()) required.clear(`grade:${r.key}`); }}
                dir="ltr"
                aria-label={t("pt_colLetter")}
                data-gpa-field={`grade:${r.key}`}
                className={field}
                style={{ ...fieldStyle, ...required.style(`grade:${r.key}`) }}
              >
                <option value="">—</option>
                {scheme.bands.map((b) => (
                  <option key={b.letter} value={b.letter}>
                    {isolateOption(b.letter)}
                  </option>
                ))}
                {SPECIAL_RESULTS.map((l) => (
                  <option key={l} value={l}>
                    {t(l === DENIED ? "grade_DN" : "grade_W")}
                  </option>
                ))}
              </select>
            )}{required.message(`grade:${r.key}`)}</div>
            {!scheme.percent && (
              <input
                value={r.pct}
                onChange={(e) => setRow(r.key, { pct: e.target.value })}
                inputMode="decimal"
                dir="ltr"
                placeholder="—"
                aria-label={t("pt_colPct")}
                className={field}
                style={fieldStyle}
              />
            )}
            <InteractionButton
              type="button"
              onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))}
              aria-label={t("pt_removeRow")}
              className="inline-flex items-center justify-center rounded-md h-8 hover:bg-black/5"
              style={{ color: "var(--color-muted)" }}
            >
              <X size={14} />
            </InteractionButton>
          </div>
          <div className="mt-1.5 mb-2 text-[11.5px] leading-relaxed">
            <label className="inline-flex items-start gap-2 cursor-pointer" style={{ color: "var(--color-ink)" }}>
              <input type="checkbox" data-gpa-field={`notCounted:${r.key}`} checked={r.excludedFromGpa} onChange={(e) => { setRow(r.key, { excludedFromGpa: e.target.checked }); if (e.target.checked) required.clear(`grade:${r.key}`); }} className="mt-1" style={{ accentColor: "var(--color-primary)" }} />
              {t("pt_exclude")}
            </label>
            {r.excludedFromGpa && <span className="ms-2 rounded-md px-2 py-0.5" style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}>{t("pt_excludedBadge")}</span>}
          </div>
          </div>
        ))}
      </div>
      {rows.length < 20 && (
        <InteractionButton
          type="button"
          onClick={() => setRows((rs) => [...rs, blankRow()])}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: "var(--color-primary)" }}
        >
          <Plus size={13} />
          {t("pt_addRow")}
        </InteractionButton>
      )}
      {!scheme.percent && (
        <p className="text-[11.5px] mt-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {t("pt_pctHint")}
        </p>
      )}

      <p className="text-[11.5px] mt-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>{t("pt_excludeHint")}</p>
      <PastTermInputSummary courses={rows.filter((r) => r.excludedFromGpa || [r.name, r.hours, r.grade, r.pct].some((v) => v.trim())).map((r) => ({
        hours: Math.max(0, parseNumber(r.hours) || 0),
        excludedFromGpa: r.excludedFromGpa,
        ...(scheme.percent ? { mark: r.grade.trim() ? parseNumber(r.grade) : undefined } : { letter: r.grade }),
      }))} />
      <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>{t("pt_reviewSummary")}</p>

      <label className="block mt-5">
        <span className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-ink)" }}>
          {t("pt_portal")}
        </span>
        <input
          value={portalRaw}
          {...required.props("portal")}
          onChange={(e) => {
            setPortalRaw(e.target.value);
            setError("");
            if (e.target.value.trim()) required.clear("portal");
          }}
          inputMode="decimal"
          dir="ltr"
          placeholder="0.00"
          className={`${field} w-32`}
          style={{ ...fieldStyle, ...required.style("portal") }}
        />
        {required.message("portal")}
      </label>

      <div className="mt-5">
        <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
          {t("pt_cumTitle")}
        </p>
        <p className="text-[11.5px] mt-0.5 mb-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {t("pt_cumIntro")} {t("gpaHoursHint")}
        </p>
        <label className="text-xs flex items-center gap-2 mb-2"><input type="checkbox" checked={cumBeforeRaw === "0" && cumHoursRaw === "0"} onChange={(e) => { if (e.target.checked) { previousDraft.current = { gpa: cumBeforeRaw, hours: cumHoursRaw }; setCumBeforeRaw("0"); setCumHoursRaw("0"); required.clear("pt_cumBefore"); required.clear("pt_cumHours"); } else { setCumBeforeRaw(previousDraft.current?.gpa ?? ""); setCumHoursRaw(previousDraft.current?.hours ?? ""); } setError(""); }} />{t("gpa_noPrevious")}</label>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              [cumBeforeRaw, setCumBeforeRaw, "pt_cumBefore", "0.00"],
              [cumHoursRaw, setCumHoursRaw, "pt_cumHours", "0"],
              [cumAfterRaw, setCumAfterRaw, "pt_cumAfter", "0.00"],
            ] as const
          ).map(([value, set, label, ph]) => (
            <label key={label} className="block">
              <span className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-muted)" }}>
                {t(label)}
              </span>
              <input
                value={value}
                {...required.props(label)}
                onChange={(e) => {
                  set(e.target.value);
                  setError("");
                  if (e.target.value.trim()) required.clear(label);
                }}
                inputMode="decimal"
                dir="ltr"
                placeholder={ph}
                data-gpa-field={label === "pt_cumHours" ? "past-prior-hours" : undefined}
                className={field}
                style={{ ...fieldStyle, ...required.style(label) }}
              />
              {required.message(label)}
            </label>
          ))}
        </div>
      </div>

      <ReviewNotice />

      {error && <ErrorText>{error}</ErrorText>}
      <Footer>
        <Ghost onClick={onClose}>{t("tc_notNow")}</Ghost>
        <Primary onClick={compareForm}>{t("pt_compare")}</Primary>
      </Footer>
    </Modal>
  );
}

// ── small pieces ──

function ReviewNotice() {
  const { t } = useT();
  return <p className="text-xs mt-4 leading-relaxed" style={{ color: "var(--color-muted)" }}>{t("gpa_reviewNotice")}</p>;
}

function Intro({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <span
        className="shrink-0 inline-flex items-center justify-center rounded-xl"
        style={{ width: 38, height: 38, background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
      >
        <Calculator size={19} />
      </span>
      <p className="text-[14px] leading-relaxed pt-2" style={{ color: "var(--color-ink)" }}>
        {text}
      </p>
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex flex-wrap justify-end gap-2">{children}</div>;
}

function Primary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <InteractionButton type="button" onClick={onClick} className="haven-btn rounded-xl px-5 py-2 text-sm font-semibold">
      {children}
    </InteractionButton>
  );
}

function Secondary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <InteractionButton
      type="button"
      onClick={onClick}
      className="rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5"
      style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
    >
      {children}
    </InteractionButton>
  );
}

function Ghost({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <InteractionButton
      type="button"
      onClick={onClick}
      className="rounded-xl px-4 py-2 text-sm font-medium"
      style={{ color: "var(--color-muted)" }}
    >
      {children}
    </InteractionButton>
  );
}

function Pill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const c = ok ? "var(--color-success)" : "var(--color-warning)";
  return (
    <span
      className="rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}
    >
      {children}
    </span>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs mt-2" style={{ color: "var(--color-danger)" }}>
      {children}
    </p>
  );
}
