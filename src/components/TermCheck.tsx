"use client";

// TermCheck — the end-of-term window: "does our semester GPA match your
// portal?". A mismatch gets an apology and an opt-in consent, then we work out
// which course most likely differs (lib/termCheck explainGap) and ask about just
// that one; entering every course's official letter is the fallback. Official
// results then replace the estimates everywhere. After it, the student can
// compare the cumulative GPA too (the one before the term plus this term's
// courses against the portal's new one). Also: TermCheckProfileCard (the
// Profile page line to edit results or withdraw consent) and TermCheckFlow (the
// window's contents, reused by the local test station).

import { WHATSNEW_SEEN_KEY } from "./WhatsNewModal";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Calculator, CheckCircle2, History, Pencil, Plus, Trash2, TrendingUp, X } from "lucide-react";
import { useStore, useScheme } from "@/store";
import { useT } from "@/i18n";
import { Modal } from "./Modal";
import { pendingSetupSteps } from "./SetupCheck";
import { courseCurrentPct, projectedCumulativeGpa, semesterGPA } from "@/lib/grades";
import { DENIED, SPECIAL_RESULTS, detectScheme } from "@/lib/gradeSchemes";
import {
  estimatedLetter,
  explainGap,
  pastTermCumulative,
  pastTermGpa,
  sameGpa,
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
      if (localStorage.getItem(WHATSNEW_SEEN_KEY) !== "1") return;
    } catch {
      return;
    }
    if (pendingSetupSteps(store).length || !termCheckDue(store)) return;
    const id = window.setTimeout(() => setStart("ask"), 1400);
    return () => window.clearTimeout(id);
    // Evaluated once the app is ready — not on every store change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, onboardingSeen]);

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

type Step = "ask" | "portal" | "consent" | "guess" | "grades" | "reason" | "done" | "cum" | "cumResult";
type Done = "match" | "close" | "snoozed" | "found" | "saved" | "reason";

const withoutOfficial = (courses: Course[]): Course[] => courses.map(({ official: _o, ...c }) => c);

/** Arabic-Indic digits and the Arabic decimal comma → a parseable number. */
function parseNumber(raw: string): number {
  const latin = raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٫,]/g, ".");
  return latin === "" ? NaN : Number(latin);
}

export function TermCheckFlow({ start = "ask", onClose }: { start?: Start; onClose: () => void }) {
  const { t } = useT();
  const { courses, academic, termCheck, setTermCheck, reportTermCheck, cumulativeGpa, cumulativeHours, setCumulativeGpa, setCumulativeHours } =
    useStore();
  const scheme = useScheme();

  const estCourses = useMemo(() => withoutOfficial(courses), [courses]);
  const ours = useMemo(() => semesterGPA(estCourses, scheme), [estCourses, scheme]);
  const fmt = (g: number) => g.toFixed(2);

  const [step, setStep] = useState<Step>(start);
  const [done, setDone] = useState<Done>("match");
  const [portalRaw, setPortalRaw] = useState("");
  const [portal, setPortal] = useState<number | null>(termCheck?.portalGpa ?? null);
  const [consent, setConsent] = useState<boolean>(termCheck?.consent ?? false);
  const [consentTick, setConsentTick] = useState(false);
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
  const [cumPortalRaw, setCumPortalRaw] = useState("");
  const [cumSaved, setCumSaved] = useState<CumulativeCheck | null>(null);
  const [cumConsent, setCumConsent] = useState(false);
  const [cumReasonDone, setCumReasonDone] = useState(false);
  const cumOurs = useMemo(
    () => (hasBefore ? projectedCumulativeGpa(courses, cumulativeGpa, cumulativeHours, scheme, academic) : null),
    [hasBefore, courses, cumulativeGpa, cumulativeHours, scheme, academic]
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

  const guesses = useMemo(
    () => (portal != null ? explainGap(estCourses, scheme, portal).slice(0, 2) : []),
    [estCourses, scheme, portal]
  );

  const university = academic.universityName || academic.universitySlug || "";
  const catalog = detectScheme(academic).catalog?.slug ?? null;
  const baseMeta = () => ({ university, catalog, scheme: scheme.id, ours: ours != null ? Number(fmt(ours)) : null, portal });
  const courseMeta = (grades: Record<string, OfficialGrade>) =>
    estCourses.map((c) => {
      const pct = courseCurrentPct(c);
      return {
        name: c.name,
        hours: c.creditHours,
        pct: pct != null ? Math.round(pct * 100) / 100 : null,
        estimated: estimatedLetter(c, scheme),
        official: grades[c.id]?.letter ?? grades[c.id]?.mark ?? null,
      };
    });

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
    courses: courseMeta(termCheck?.grades ?? {}),
  });

  // ── cumulative GPA ──
  if (step === "cum") {
    const compareCum = () => {
      const before = cumEdit ? parseNumber(beforeRaw) : cumulativeGpa;
      const hours = cumEdit ? Math.round(parseNumber(hoursRaw)) : cumulativeHours;
      if (!(before >= 0 && before <= scheme.max) || !(hours >= 1 && hours <= 400)) {
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
      if (before !== cumulativeGpa) setCumulativeGpa(before);
      if (hours !== cumulativeHours) setCumulativeHours(hours);
      const cum: CumulativeCheck = {
        before,
        hours,
        portal: portalCum,
        ours: Math.round(o * 1000) / 1000,
        result: sameGpa(o, portalCum, scheme) ? "match" : "mismatch",
      };
      save({ cum });
      // Without consent, only whether it matched.
      reportTermCheck("term_cum_checked", termCheck?.consent ? { ...cumMeta(cum), consent: true } : { result: cum.result, scheme: scheme.id });
      setCumSaved(cum);
      setCumConsent(termCheck?.consent ?? false);
      setCumReasonDone(false);
      setStep("cumResult");
    };
    const numberField = (value: string, set: (v: string) => void, label: string, autoFocus = false) => (
      <label className="block">
        <span className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-muted)" }}>
          {label}
        </span>
        <input
          autoFocus={autoFocus}
          inputMode="decimal"
          dir="ltr"
          value={value}
          onChange={(e) => {
            set(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && compareCum()}
          className="w-28 rounded-xl border px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
        />
      </label>
    );
    return (
      <>
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
              <button type="button" onClick={() => setCumEdit(true)} className="underline underline-offset-2" style={{ color: "var(--color-primary)" }}>
                {t("tc_cumEditBefore")}
              </button>
            </p>
          </>
        ) : (
          <>
            <Intro text={t("tc_cumNeedBefore")} />
            <div className="flex flex-wrap gap-4">
              {numberField(beforeRaw, setBeforeRaw, t("tc_cumBeforeGpa"), true)}
              {numberField(hoursRaw, setHoursRaw, t("tc_cumBeforeHours"))}
            </div>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>
              {t("tc_cumBeforeHint")}
            </p>
          </>
        )}
        <div className="mt-5">
          {numberField(cumPortalRaw, setCumPortalRaw, t("tc_cumPortalLabel"), !cumEdit)}
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <Footer>
          <Ghost onClick={onClose}>{t("tc_notNow")}</Ghost>
          <Primary onClick={compareCum}>{t("pt_compare")}</Primary>
        </Footer>
      </>
    );
  }

  if (step === "cumResult" && cumSaved) {
    const match = cumSaved.result === "match";
    const pick = (reason: TermMismatchReason) => {
      const next = { ...cumSaved, reason };
      const shared = cumConsent || termCheck?.consent === true;
      save({ cum: next, ...(shared ? { consent: true } : {}) });
      reportTermCheck("term_cum_reason", shared ? { ...cumMeta(next), reason, consent: true } : { reason, consent: false });
      setCumSaved(next);
      setCumReasonDone(true);
    };
    const shared = cumConsent || termCheck?.consent === true;
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
              {t(match ? "tc_cumMatchTitle" : cumReasonDone ? "tc_thanksTitle" : "tc_sorryTitle")}
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>
              {cumReasonDone
                ? t(shared ? "tc_reasonDoneShared" : "tc_cumReasonDone")
                : t(match ? "tc_cumMatchBody" : "tc_cumMismatchBody", {
                    ours: fmt(cumSaved.ours),
                    portal: fmt(cumSaved.portal),
                    diff: fmt(Math.abs(cumSaved.ours - cumSaved.portal)),
                  })}
            </p>
            {cumReasonDone && cumSaved.reason === "repeat" && (
              <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>
                {t("tc_repeatHint")}
              </p>
            )}
            {!match && !cumReasonDone && (
              <>
                <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  {t("tc_cumFrom", { gpa: fmt(cumSaved.before), hours: cumSaved.hours })}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setBeforeRaw(String(cumSaved.before));
                      setHoursRaw(String(cumSaved.hours));
                      setCumEdit(true);
                      setStep("cum");
                    }}
                    className="underline underline-offset-2"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {t("tc_cumCheckBefore")}
                  </button>
                </p>
                {!termCheck?.consent && (
                  <label className="mt-4 flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cumConsent}
                      onChange={(e) => setCumConsent(e.target.checked)}
                      className="mt-1"
                      style={{ accentColor: "var(--color-primary)" }}
                    />
                    <span className="text-[13px] leading-relaxed" style={{ color: "var(--color-ink)" }}>
                      {t("tc_cumConsentLabel")}
                      <span className="block text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                        {t("tc_cumConsentNote")}
                      </span>
                    </span>
                  </label>
                )}
                <p className="text-sm mt-4" style={{ color: "var(--color-ink)" }}>
                  {t("pt_reasonQuestion")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["repeat", "notCounted", "unknown"] as TermMismatchReason[]).map((r) => (
                    <Secondary key={r} onClick={() => pick(r)}>
                      {t(`tc_reason_${r}` as const)}
                    </Secondary>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        {(match || cumReasonDone) && (
          <Footer>
            <Primary onClick={onClose}>{t("tc_done")}</Primary>
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
          <Footer>
            <Primary onClick={onClose}>{t("tc_done")}</Primary>
          </Footer>
        </>
      );
    }
    return (
      <>
        <Intro text={t("tc_askBody")} />
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
              // No consent asked here, so only which university/system matched.
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
        finish("close");
        return;
      }
      setStep("consent");
    };
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
            inputMode="decimal"
            dir="ltr"
            value={portalRaw}
            onChange={(e) => {
              setPortalRaw(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="0.00"
            className="w-32 rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
          />
        </label>
        {error && <ErrorText>{error}</ErrorText>}
        <Footer>
          <Ghost onClick={() => setStep("ask")}>{t("tc_back")}</Ghost>
          <Primary onClick={submit}>{t("tc_continue")}</Primary>
        </Footer>
      </>
    );
  }

  // ── apology + consent ──
  if (step === "consent" && portal != null && ours != null) {
    const next = (agreed: boolean) => {
      setConsent(agreed);
      save({ answer: "mismatch", portalGpa: portal, consent: agreed, snoozeUntil: undefined });
      reportTermCheck("term_gpa_mismatch", agreed ? { ...baseMeta(), consent: true } : { consent: false });
      setStep(guesses.length ? "guess" : "grades");
    };
    return (
      <>
        <p className="text-base font-semibold mb-1.5" style={{ color: "var(--color-ink)" }}>
          {t("tc_sorryTitle")}
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>
          {t("tc_sorryBody", { dir: t(ours > portal ? "tc_higher" : "tc_lower"), diff: fmt(Math.abs(ours - portal)) })}
        </p>
        <label className="mt-5 flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={consentTick}
            onChange={(e) => {
              setConsentTick(e.target.checked);
              setError("");
            }}
            className="mt-1"
            style={{ accentColor: "var(--color-primary)" }}
          />
          <span className="text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>
            {t("tc_consentLabel")}
          </span>
        </label>
        <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {t("tc_consentNote")}
        </p>
        {error && <ErrorText>{error}</ErrorText>}
        <Footer>
          <Ghost onClick={() => next(false)}>{t("tc_noThanks")}</Ghost>
          <Primary onClick={() => (consentTick ? next(true) : setError(t("tc_consentErr")))}>{t("tc_continue")}</Primary>
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
      save({ grades });
      if (consent) reportTermCheck("term_grades_saved", { ...baseMeta(), via: "guess", courses: courseMeta(grades) });
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
          {t("tc_guessBody", { course: course.name, letter: g.letter, gpa: fmt(g.gpa) })}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Primary onClick={yes}>{t("tc_guessYes")}</Primary>
          <Secondary onClick={no}>{t("tc_guessNo")}</Secondary>
        </div>
        <button
          type="button"
          onClick={() => setStep("grades")}
          className="mt-4 text-xs underline underline-offset-2"
          style={{ color: "var(--color-primary)" }}
        >
          {t("tc_enterAll")}
        </button>
      </>
    );
  }

  // ── every course's official result ──
  if (step === "grades" || step === "guess" || step === "consent") {
    const matches = portal != null && draftGpa != null && sameGpa(draftGpa, portal, scheme);
    const submit = () => {
      const grades = gradesFromDraft();
      if (!Object.keys(grades).length) {
        setError(t("tc_gradesErr"));
        return;
      }
      save({ grades });
      if (consent) reportTermCheck("term_grades_saved", { ...baseMeta(), via: "list", courses: courseMeta(grades) });
      if (portal == null) return finish("saved");
      if (matches) {
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
              <span className="truncate" style={{ color: "var(--color-ink)" }}>
                {c.name}
              </span>
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {t("tc_hours", { n: c.creditHours })}
              </span>
              {scheme.percent ? (
                <input
                  inputMode="decimal"
                  dir="ltr"
                  aria-label={c.name}
                  value={draft[c.id] ?? ""}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, [c.id]: e.target.value }));
                    setError("");
                  }}
                  className="rounded-lg border px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
                />
              ) : (
                <select
                  dir="ltr"
                  aria-label={c.name}
                  value={draft[c.id] ?? ""}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, [c.id]: e.target.value }));
                    setError("");
                  }}
                  className="rounded-lg border px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
                >
                  <option value="">—</option>
                  {scheme.bands.map((b) => (
                    <option key={b.letter} value={b.letter}>
                      {b.letter}
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
        {error && <ErrorText>{error}</ErrorText>}
        <Footer>
          {start !== "grades" && <Ghost onClick={onClose}>{t("tc_notNow")}</Ghost>}
          <Primary onClick={submit}>{t("tc_save")}</Primary>
        </Footer>
      </>
    );
  }

  // ── still off after official results ──
  if (step === "reason") {
    const pick = (reason: TermMismatchReason) => {
      save({ reason });
      if (consent) reportTermCheck("term_mismatch_reason", { ...baseMeta(), reason, courses: courseMeta(gradesFromDraft()) });
      finish("reason");
    };
    const reasons: TermMismatchReason[] = ["repeat", "notCounted", "hours", "unknown"];
    return (
      <>
        <p className="text-base font-semibold mb-1.5" style={{ color: "var(--color-ink)" }}>
          {t("tc_reasonTitle")}
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>
          {t("tc_reasonBody")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {reasons.map((r) => (
            <Secondary key={r} onClick={() => pick(r)}>
              {t(`tc_reason_${r}` as const)}
            </Secondary>
          ))}
        </div>
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
      note: t(consent ? "tc_foundShared" : "tc_foundPrivate"),
    },
    saved: { title: t("tc_savedTitle"), body: t("tc_savedBody") },
    reason: {
      title: t("tc_thanksTitle"),
      body: t(consent ? "tc_reasonDoneShared" : "tc_reasonDone"),
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
  return (
    <>
      <p className="text-[13px] mb-5 -mt-1 leading-relaxed" style={{ color: "var(--color-muted)" }}>
        {t("acc_desc")}
      </p>
      <CumulativeProfileCard onOpen={onOpen} />
      <div className="mt-6 pt-5 border-t" style={{ borderColor: "var(--color-border)" }}>
        <TermCheckProfileCard onOpen={onOpen} />
      </div>
      <div className="mt-6 pt-5 border-t" style={{ borderColor: "var(--color-border)" }}>
        <PastTerms />
      </div>
    </>
  );
}

/** The cumulative GPA after this term against the portal's: open once the
 *  term is over; until then, a past term is where to try it. */
function CumulativeProfileCard({ onOpen }: { onOpen: (step: Start) => void }) {
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
        <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {cum
            ? cum.result === "match"
              ? t("tc_cumProfileMatched", { gpa: cum.portal.toFixed(2) })
              : t("tc_cumProfileMismatch", { ours: cum.ours.toFixed(2), portal: cum.portal.toFixed(2) })
            : ended
            ? t("tc_cumProfilePending")
            : t("tc_cumProfileNotEnded")}
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

/** This term: where the check stands, edit official results, withdraw consent. */
export function TermCheckProfileCard({ onOpen = openTermCheck }: { onOpen?: (step: Start) => void } = {}) {
  const { t, lang } = useT();
  const { semester, termCheck, setTermCheck, reportTermCheck } = useStore();
  const [withdrawn, setWithdrawn] = useState(false);
  const ended = termEnded(semester);
  const count = Object.keys(termCheck?.grades ?? {}).length;
  const answer = termCheck?.answer;
  const endLabel = semester.endDate
    ? new Date(`${semester.endDate}T00:00:00`).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA-u-ca-gregory", {
        day: "numeric",
        month: "long",
      })
    : null;

  const withdraw = () => {
    if (!termCheck) return;
    const { term: _term, ...rest } = termCheck;
    setTermCheck({ ...rest, consent: false, at: new Date().toISOString() });
    reportTermCheck("term_consent_withdrawn");
    setWithdrawn(true);
  };

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
        <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {answer === "match"
            ? t("tc_profileMatched")
            : answer === "mismatch"
            ? t("tc_profileMismatch")
            : ended
            ? t("tc_profilePending")
            : endLabel
            ? t("tc_profileNotEnded", { date: endLabel })
            : t("tc_profileNotEndedNoDate")}
          {count > 0 && <> {t("tc_profileGrades", { n: count })}</>}
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
        {termCheck?.consent && (
          <div className="mt-4 rounded-xl px-3.5 py-3" style={{ background: "var(--color-surface-alt)" }}>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-ink)" }}>
              {t("tc_profileConsent")}
            </p>
            <button
              type="button"
              onClick={withdraw}
              className="mt-2 text-xs font-medium underline underline-offset-2"
              style={{ color: "var(--color-danger)" }}
            >
              {t("tc_profileWithdraw")}
            </button>
          </div>
        )}
        {withdrawn && !termCheck?.consent && (
          <p className="text-xs mt-3" style={{ color: "var(--color-muted)" }}>
            {t("tc_profileWithdrawn")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Past terms ──────────────────────────────────────────────────────────────

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

/** Saved past terms (compact) + the button to check another one. */
function PastTerms() {
  const { t } = useT();
  const { pastTerms, setPastTerms } = useStore();
  const [editing, setEditing] = useState<PastTerm | "new" | null>(null);
  const [removed, setRemoved] = useState<{ term: PastTerm; index: number } | null>(null);

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
              const hours = p.courses.reduce((s, c) => s + c.hours, 0);
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]"
                  style={{ background: "var(--color-surface-alt)" }}
                >
                  <span className="min-w-0 flex-1 truncate" style={{ color: "var(--color-ink)" }}>
                    <b className="font-medium">{p.name || t("pt_unnamed")}</b>
                    <span style={{ color: "var(--color-muted)" }}>
                      {" · "}
                      {t("pt_summary", { n: p.courses.length, hours })}
                    </span>
                  </span>
                  <Pill ok={p.result === "match"}>
                    {t(p.cum ? (p.result === "match" ? "pt_termPillMatch" : "pt_termPillDiffers") : p.result === "match" ? "tc_matches" : "tc_differs")}
                  </Pill>
                  {p.cum && (
                    <Pill ok={p.cum.result === "match"}>
                      {t(p.cum.result === "match" ? "pt_cumPillMatch" : "pt_cumPillDiffers")}
                    </Pill>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    aria-label={t("pt_edit")}
                    className="rounded-md p-1.5 hover:bg-black/5"
                    style={{ color: "var(--color-muted)" }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p, i)}
                    aria-label={t("pt_delete")}
                    className="rounded-md p-1.5 hover:bg-black/5"
                    style={{ color: "var(--color-muted)" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {removed && (
          <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>
            {t("pt_deleted")}{" "}
            <button type="button" onClick={undo} className="underline underline-offset-2" style={{ color: "var(--color-primary)" }}>
              {t("pt_undo")}
            </button>
          </p>
        )}

        <div className="mt-3">
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
        </div>
      </div>
      {editing && (
        <PastTermModal term={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

interface Row {
  key: string;
  name: string;
  hours: string;
  grade: string;
  pct: string;
}
const blankRow = (): Row => ({ key: newId(), name: "", hours: "", grade: "", pct: "" });

function PastTermModal({ term, onClose }: { term: PastTerm | null; onClose: () => void }) {
  const { t } = useT();
  const { pastTerms, setPastTerms, reportTermCheck, academic } = useStore();
  const scheme = useScheme();
  const [name, setName] = useState(term?.name ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    term
      ? term.courses.map((c) => ({
          key: newId(),
          name: c.name ?? "",
          hours: String(c.hours),
          grade: scheme.percent ? (c.mark != null ? String(c.mark) : "") : c.letter ?? "",
          pct: c.pct != null ? String(c.pct) : "",
        }))
      : [blankRow(), blankRow(), blankRow()]
  );
  const [portalRaw, setPortalRaw] = useState(term ? String(term.portalGpa) : "");
  // The cumulative GPA before and after this term (optional, same transcript).
  const [cumBeforeRaw, setCumBeforeRaw] = useState(term?.cum ? String(term.cum.before) : "");
  const [cumHoursRaw, setCumHoursRaw] = useState(term?.cum ? String(term.cum.hours) : "");
  const [cumAfterRaw, setCumAfterRaw] = useState(term?.cum ? String(term.cum.portal) : "");
  const [consent, setConsent] = useState(term?.consent ?? false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<PastTerm | null>(null);
  const [reasonDone, setReasonDone] = useState(false);

  const setRow = (key: string, patch: Partial<Row>) => {
    setError("");
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const university = academic.universityName || academic.universitySlug || "";
  const catalog = detectScheme(academic).catalog?.slug ?? null;

  const compare = () => {
    const courses: PastTermCourse[] = [];
    for (const r of rows) {
      const blank = !r.hours.trim() && !r.grade.trim() && !r.name.trim() && !r.pct.trim();
      if (blank) continue;
      const hours = parseNumber(r.hours);
      if (!(hours > 0 && hours <= 12)) return setError(t("pt_errHours"));
      let letter: string | undefined;
      let mark: number | undefined;
      if (scheme.percent) {
        mark = parseNumber(r.grade);
        if (!(mark >= 0 && mark <= 100)) return setError(t("pt_errMark"));
      } else {
        if (!r.grade) return setError(t("pt_errLetter"));
        letter = r.grade;
      }
      let pct: number | undefined;
      if (!scheme.percent && r.pct.trim()) {
        pct = parseNumber(r.pct);
        if (!(pct >= 0 && pct <= 100)) return setError(t("pt_errPct"));
      }
      courses.push({
        ...(r.name.trim() ? { name: r.name.trim().slice(0, 60) } : {}),
        hours,
        ...(letter ? { letter } : {}),
        ...(mark != null ? { mark } : {}),
        ...(pct != null ? { pct } : {}),
      });
    }
    if (!courses.length) return setError(t("pt_errRows"));
    const portal = parseNumber(portalRaw);
    if (!(portal >= 0 && portal <= scheme.max)) return setError(t("tc_portalErr", { max: scheme.max }));
    const ours = pastTermGpa(courses, scheme);
    if (ours == null) return setError(t("pt_errRows"));

    let cum: CumulativeCheck | undefined;
    if (cumBeforeRaw.trim() || cumHoursRaw.trim() || cumAfterRaw.trim()) {
      const before = parseNumber(cumBeforeRaw);
      const hours = Math.round(parseNumber(cumHoursRaw));
      const after = parseNumber(cumAfterRaw);
      if (!(before >= 0 && before <= scheme.max) || !(hours >= 0 && hours <= 400) || !(after >= 0 && after <= scheme.max)) {
        return setError(t("pt_errCum", { max: scheme.max }));
      }
      const o = pastTermCumulative(courses, scheme, before, hours);
      if (o != null) {
        cum = {
          before,
          hours,
          portal: after,
          ours: Math.round(o * 1000) / 1000,
          result: sameGpa(o, after, scheme) ? "match" : "mismatch",
        };
      }
    }

    const result: PastTerm = {
      id: term?.id ?? newId(),
      name: name.trim().slice(0, 40),
      scheme: scheme.id,
      courses,
      portalGpa: portal,
      ours: Math.round(ours * 1000) / 1000,
      result: sameGpa(ours, portal, scheme) ? "match" : "mismatch",
      ...(cum ? { cum } : {}),
      consent,
      at: new Date().toISOString(),
    };
    setPastTerms(term ? pastTerms.map((p) => (p.id === term.id ? result : p)) : [...pastTerms, result]);
    reportTermCheck(
      "past_term_checked",
      consent
        ? { result: result.result, university, catalog, scheme: scheme.id, name: result.name, ours: result.ours, portal, courses, ...(cum ? { cum } : {}) }
        : { result: result.result, scheme: scheme.id, ...(cum ? { cum_result: cum.result } : {}) }
    );
    setSaved(result);
  };

  const pickReason = (reason: TermMismatchReason) => {
    if (!saved) return;
    const next = { ...saved, reason };
    setPastTerms(pastTerms.map((p) => (p.id === saved.id ? next : p)));
    if (saved.consent)
      reportTermCheck("past_term_reason", { reason, university, scheme: scheme.id, name: saved.name, result: saved.result, ...(saved.cum ? { cum: saved.cum } : {}) });
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
    const termMatch = saved.result === "match";
    const cumMatch = !saved.cum || saved.cum.result === "match";
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
              {t(match ? "pt_matchTitle" : "tc_sorryTitle")}
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>
              {t(termMatch ? (saved.cum ? "pt_termLineMatch" : "pt_matchBody") : "pt_mismatchBody", {
                ours: saved.ours.toFixed(2),
                portal: saved.portalGpa.toFixed(2),
                diff,
              })}
            </p>
            {saved.cum && (
              <p className="text-sm leading-relaxed mt-2" style={{ color: "var(--color-ink)" }}>
                {t(cumMatch ? "pt_cumLineMatch" : "pt_cumLineMismatch", {
                  ours: saved.cum.ours.toFixed(2),
                  portal: saved.cum.portal.toFixed(2),
                  diff: Math.abs(saved.cum.ours - saved.cum.portal).toFixed(2),
                })}
              </p>
            )}
            {!match && !reasonDone && (
              <>
                <p className="text-sm mt-4" style={{ color: "var(--color-ink)" }}>
                  {t("pt_reasonQuestion")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["repeat", "notCounted", "hours", "unknown"] as TermMismatchReason[]).map((r) => (
                    <Secondary key={r} onClick={() => pickReason(r)}>
                      {t(`tc_reason_${r}` as const)}
                    </Secondary>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSaved(null)}
                  className="mt-4 text-xs underline underline-offset-2"
                  style={{ color: "var(--color-primary)" }}
                >
                  {t("pt_backToEdit")}
                </button>
              </>
            )}
            {(match || reasonDone) && (
              <p className="text-xs mt-3 leading-relaxed" style={{ color: "var(--color-muted)" }}>
                {t(saved.consent ? (match ? "pt_sharedMatch" : "tc_reasonDoneShared") : "pt_private")}
              </p>
            )}
          </div>
        </div>
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
          onChange={(e) => setName(e.target.value)}
          placeholder={t("pt_namePlaceholder")}
          maxLength={40}
          className={field}
          style={fieldStyle}
        />
      </label>

      <div className={`grid ${cols} gap-1.5 text-[11px] font-medium mb-1.5`} style={{ color: "var(--color-muted)" }}>
        <span>{t("pt_colCourse")}</span>
        <span>{t("pt_colHours")}</span>
        <span>{t(scheme.percent ? "pt_colMark" : "pt_colLetter")}</span>
        {!scheme.percent && <span>{t("pt_colPct")}</span>}
        <span />
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <div key={r.key} className={`grid ${cols} gap-1.5 items-center`}>
            <input
              value={r.name}
              onChange={(e) => setRow(r.key, { name: e.target.value })}
              placeholder={t("pt_coursePlaceholder", { n: i + 1 })}
              aria-label={t("pt_colCourse")}
              className={field}
              style={fieldStyle}
            />
            <input
              value={r.hours}
              onChange={(e) => setRow(r.key, { hours: e.target.value })}
              inputMode="decimal"
              dir="ltr"
              aria-label={t("pt_colHours")}
              className={field}
              style={fieldStyle}
            />
            {scheme.percent ? (
              <input
                value={r.grade}
                onChange={(e) => setRow(r.key, { grade: e.target.value })}
                inputMode="decimal"
                dir="ltr"
                aria-label={t("pt_colMark")}
                className={field}
                style={fieldStyle}
              />
            ) : (
              <select
                value={r.grade}
                onChange={(e) => setRow(r.key, { grade: e.target.value })}
                dir="ltr"
                aria-label={t("pt_colLetter")}
                className={field}
                style={fieldStyle}
              >
                <option value="">—</option>
                {scheme.bands.map((b) => (
                  <option key={b.letter} value={b.letter}>
                    {b.letter}
                  </option>
                ))}
                {SPECIAL_RESULTS.map((l) => (
                  <option key={l} value={l}>
                    {t(l === DENIED ? "grade_DN" : "grade_W")}
                  </option>
                ))}
              </select>
            )}
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
            <button
              type="button"
              onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))}
              aria-label={t("pt_removeRow")}
              className="inline-flex items-center justify-center rounded-md h-8 hover:bg-black/5"
              style={{ color: "var(--color-muted)" }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      {rows.length < 20 && (
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, blankRow()])}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: "var(--color-primary)" }}
        >
          <Plus size={13} />
          {t("pt_addRow")}
        </button>
      )}
      {!scheme.percent && (
        <p className="text-[11.5px] mt-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {t("pt_pctHint")}
        </p>
      )}

      <label className="block mt-5">
        <span className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-ink)" }}>
          {t("pt_portal")}
        </span>
        <input
          value={portalRaw}
          onChange={(e) => {
            setPortalRaw(e.target.value);
            setError("");
          }}
          inputMode="decimal"
          dir="ltr"
          placeholder="0.00"
          className={`${field} w-32`}
          style={fieldStyle}
        />
      </label>

      <div className="mt-5">
        <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
          {t("pt_cumTitle")}
        </p>
        <p className="text-[11.5px] mt-0.5 mb-2 leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {t("pt_cumIntro")}
        </p>
        <div className="grid grid-cols-3 gap-2 max-w-sm">
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
                onChange={(e) => {
                  set(e.target.value);
                  setError("");
                }}
                inputMode="decimal"
                dir="ltr"
                placeholder={ph}
                className={field}
                style={fieldStyle}
              />
            </label>
          ))}
        </div>
      </div>

      <label className="mt-5 flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1"
          style={{ accentColor: "var(--color-primary)" }}
        />
        <span className="text-[13px] leading-relaxed" style={{ color: "var(--color-ink)" }}>
          {t("pt_consent")}
          <span className="block text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            {t("pt_consentNote")}
          </span>
        </span>
      </label>

      {error && <ErrorText>{error}</ErrorText>}
      <Footer>
        <Ghost onClick={onClose}>{t("tc_notNow")}</Ghost>
        <Primary onClick={compare}>{t("pt_compare")}</Primary>
      </Footer>
    </Modal>
  );
}

// ── small pieces ──

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
    <button type="button" onClick={onClick} className="haven-btn rounded-xl px-5 py-2 text-sm font-semibold">
      {children}
    </button>
  );
}

function Secondary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5"
      style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
    >
      {children}
    </button>
  );
}

function Ghost({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl px-4 py-2 text-sm font-medium"
      style={{ color: "var(--color-muted)" }}
    >
      {children}
    </button>
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
