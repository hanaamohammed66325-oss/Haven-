"use client";

// The student's term dates against their university's calendar
// (lib/universityTerms), one card for every university:
//   official   — the term's dates were put on the semester automatically (in
//                SetupCheck): they're shown with "right" / "edit", and the
//                dates from before can be taken back;
//   incomplete — the term is on record only in part, or only suggested: the
//                student confirms or completes it;
//   unknown    — no calendar on record for the university: a clear note that
//                term dates differ between universities, to add their own.
// An answer about a university's calendar is a vote (crowd_votes) the admin
// sees; the student's semester follows what they chose either way. Shown until
// answered, once per university and term.

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarCheck } from "lucide-react";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { DateField } from "./DateField";
import { addDays, formatShortDate, toISODate } from "@/lib/dates";
import { universityCalendar } from "@/lib/countryHolidays";
import { universityBySlug } from "@/lib/tools/universities";
import { fetchUniversityFacts, type VerifiedFact } from "@/lib/universityFacts";
import { termCalendarKey, termDates, termPeriod, termPlan, type TermPlan } from "@/lib/universityTerms";
import { submitVote } from "@/lib/attendancePolicy";

const DAY_MS = 864e5;

const fieldClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";
const fieldStyle: React.CSSProperties = {
  borderColor: "var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-ink)",
};

/** The student's term plan now; undefined until it's known (a Saudi
 *  university's calendar is read from the facts engine first). */
export function useTermPlan(): TermPlan | null | undefined {
  const { hydrated, academic } = useStore();
  const cal = termCalendarKey(academic);
  const slug = cal?.saudi ? cal.key : null;
  const [facts, setFacts] = useState<{ slug: string; facts: VerifiedFact[] } | null>(null);
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    fetchUniversityFacts(slug).then((f) => {
      if (alive) setFacts({ slug, facts: f });
    });
    return () => {
      alive = false;
    };
  }, [slug]);
  if (!hydrated || (slug && facts?.slug !== slug)) return undefined;
  return termPlan(academic, slug ? facts!.facts : null, toISODate(new Date()));
}

export function TermCheckCard({ className = "" }: { className?: string }) {
  const { t, lang } = useT();
  const { academic, semester, setupConfirmed, confirmSetup, setSemester } = useStore();
  const plan = useTermPlan();
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState("");
  const [finals, setFinals] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");

  if (!plan || setupConfirmed.termAnswered === plan.id) return null;
  // The official term shows once it's on the semester (SetupCheck puts it there).
  if (plan.status === "official" && setupConfirmed.termApplied !== plan.id) return null;

  const en = lang === "en";
  const known = plan.key ? universityBySlug(plan.key) : undefined;
  const cal = plan.key ? universityCalendar(plan.key) : undefined;
  const uni =
    (known ? (en ? known.nameEn : known.name) : cal ? (en ? cal.nameEn : cal.nameAr) : academic.universityName?.trim()) || t("termYourUni");
  const term = plan.status === "unknown" ? null : plan.term;
  const prev = setupConfirmed.termPrev;
  const canRestore = plan.status === "official" && !!prev && (prev.startDate !== plan.term.start || prev.endDate !== plan.term.end);

  // The semester's own finals day: its start plus the teaching weeks.
  const semStart = semester.startDate;
  const semFinals = semStart ? toISODate(addDays(new Date(`${semStart}T00:00:00`), Math.round(Number(semester.weeks)) * 7)) : "";
  const shown =
    term ?? { start: semStart || undefined, finalsStart: semFinals || undefined, end: semester.endDate || undefined };

  const answer = (agrees: boolean, dates: { start: string; finals_start: string; end: string }, keptOwn = false) => {
    confirmSetup({ termAnswered: plan.id, ...(plan.status === "incomplete" ? { calendar: plan.id } : {}) });
    if (!term || !plan.key) return; // no university calendar to report on
    void submitVote({
      subject: "calendar",
      universitySlug: plan.key,
      period: termPeriod(term),
      agrees,
      answer: { ...dates, ...(keptOwn ? { kept_own: true } : {}) },
    }).catch(() => {
      /* the student's dates are saved either way */
    });
  };

  const complete = !!term?.start && !!term.finalsStart && !!term.end;
  const confirm = () => {
    if (!term?.start || !term.finalsStart || !term.end) return;
    // The student may have changed the dates in Settings since; "right" means the ones shown.
    if (semester.startDate !== term.start || semester.endDate !== term.end) setSemester(termDates({ start: term.start, finalsStart: term.finalsStart, end: term.end }));
    answer(true, { start: term.start, finals_start: term.finalsStart, end: term.end });
  };

  const keepMine = () => confirmSetup({ termAnswered: plan.id });

  const restore = () => {
    if (!prev) return;
    setSemester(prev);
    const finalsStart = toISODate(addDays(new Date(`${prev.startDate}T00:00:00`), Math.round(prev.weeks) * 7));
    answer(false, { start: prev.startDate, finals_start: finalsStart, end: prev.endDate }, true);
  };

  const openForm = () => {
    setStart(shown.start ?? semStart ?? "");
    setFinals(shown.finalsStart ?? semFinals ?? "");
    setEnd(shown.end ?? semester.endDate ?? "");
    setError("");
    setEditing(true);
  };

  const save = () => {
    if (!start || !finals || !end || !(start < finals && finals <= end)) {
      setError(t("termCheckErr"));
      return;
    }
    const weeks = Math.max(1, Math.round((+new Date(finals) - +new Date(start)) / (7 * DAY_MS)));
    const finalsWeeks = Math.max(1, Math.ceil(((+new Date(end) - +new Date(finals)) / DAY_MS + 1) / 7));
    setSemester({ startDate: start, endDate: end, weeks, finalsWeeks });
    // Agrees when every date on record is the one the student gave.
    const same = !!term && (!term.start || start === term.start) && (!term.finalsStart || finals === term.finalsStart) && (!term.end || end === term.end);
    answer(same, { start, finals_start: finals, end });
  };

  const fmt = (iso?: string) => (iso ? formatShortDate(`${iso}T00:00:00`, lang, semester.calendarType) : t("termAskMissing"));
  const warn = plan.status === "unknown";
  const title =
    plan.status === "official" ? t("termCheckTitle", { uni }) : plan.status === "incomplete" ? t("termAskTitle", { uni }) : t("termUnknownTitle");
  const body =
    plan.status === "official" ? t("termCheckBody") : plan.status === "incomplete" ? t("termAskBody") : t("termUnknownBody", { uni });

  return (
    <div
      className={`rounded-2xl border px-5 py-4 text-sm leading-relaxed ${className}`}
      style={
        warn
          ? { borderColor: "var(--color-warning)", background: "color-mix(in srgb, var(--color-warning) 10%, var(--color-surface))" }
          : { borderColor: "var(--color-border)", background: "var(--color-primary-soft)" }
      }
    >
      <div className="flex items-center gap-2 font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
        {warn ? (
          <AlertTriangle size={17} aria-hidden style={{ color: "var(--color-warning)" }} />
        ) : (
          <CalendarCheck size={17} aria-hidden style={{ color: "var(--color-primary)" }} />
        )}
        {title}
      </div>
      <p className="mb-3" style={{ color: "var(--color-muted)" }}>
        {body}
      </p>

      {!editing ? (
        <>
          {warn && (
            <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>
              {t("termUnknownNow")}
            </p>
          )}
          <ul className="flex flex-col gap-1 mb-3" style={{ color: "var(--color-ink)" }}>
            <li>
              {t("calCheckStart")}: <span className="font-semibold tabular-nums">{fmt(shown.start)}</span>
            </li>
            <li>
              {t("calCheckFinals")}: <span className="font-semibold tabular-nums">{fmt(shown.finalsStart)}</span>
            </li>
            <li>
              {t("termCheckEnd")}: <span className="font-semibold tabular-nums">{fmt(shown.end)}</span>
            </li>
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            {warn ? (
              <>
                <button
                  type="button"
                  onClick={openForm}
                  className="rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white"
                  style={{ background: "var(--color-primary)" }}
                >
                  {t("termUnknownAdd")}
                </button>
                <button
                  type="button"
                  onClick={keepMine}
                  className="rounded-lg px-3.5 py-1.5 text-sm font-medium border"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
                >
                  {t("termUnknownKeep")}
                </button>
              </>
            ) : complete ? (
              <>
                <button
                  type="button"
                  onClick={confirm}
                  className="rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white"
                  style={{ background: "var(--color-primary)" }}
                >
                  {t("termCheckYes")}
                </button>
                <button
                  type="button"
                  onClick={openForm}
                  className="rounded-lg px-3.5 py-1.5 text-sm font-medium border"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
                >
                  {t("calCheckEdit")}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={openForm}
                className="rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white"
                style={{ background: "var(--color-primary)" }}
              >
                {t("termAskComplete")}
              </button>
            )}
            {canRestore && (
              <button type="button" onClick={restore} className="text-xs underline underline-offset-2 ms-1" style={{ color: "var(--color-muted)" }}>
                {t("termCheckRestore")}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            {(
              [
                [t("calCheckStart"), start, setStart],
                [t("calCheckFinals"), finals, setFinals],
                [t("termCheckEnd"), end, setEnd],
              ] as const
            ).map(([label, value, set]) => (
              <label key={label}>
                <span className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-muted)" }}>
                  {label}
                </span>
                <DateField
                  calendar={semester.calendarType}
                  className={fieldClass}
                  style={fieldStyle}
                  value={value}
                  onChange={(v) => {
                    if (!v) return;
                    setError("");
                    set(v);
                  }}
                />
              </label>
            ))}
          </div>
          {error && (
            <p className="text-xs mb-2" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={save} className="rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white" style={{ background: "var(--color-primary)" }}>
              {t("calCheckSave")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-3.5 py-1.5 text-sm font-medium border"
              style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
            >
              {t("cancel")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
