"use client";

// SetupCheck — the windows that follow the onboarding tour, in this order:
//   1. "Complete your academic profile" — university, major, level.
//   2. "Your university's GPA system" — only when the university's points table
//      came from the unverified catalogue (confirm it) or we have none (pick a
//      system or enter the table). See GradeTableCheck.
//   3. "Your core settings" — term dates, weeks and official breaks (the حرمان
//      rule comes from the university's verified attendance policy instead),
//      PREFILLED from the university's verified official facts
//      (lib/universityFacts) and tagged with where each value came from.
//      The student saves as-is or corrects anything that differs.
// Each window shows only while its data is missing, never on top of the tour or
// the What's-New popup. "Later" hides it until the app is next opened. Answers
// go through the store, so they persist per account like every other setting.

import { useEffect, useRef, useState } from "react";
import { GraduationCap, CalendarRange, AlertTriangle, Calculator } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Modal } from "./Modal";
import { AcademicSettings, SchemePicker } from "./AcademicSettings";
import { GradeTableSection } from "./GradeTableCheck";
import { gradeTableStatus } from "@/lib/gradeSchemes";
import { DateField } from "./DateField";
import { universityBySlug } from "@/lib/tools/universities";
import {
  applyOfficialHolidays,
  defaultsFromFacts,
  fetchUniversityFacts,
  type UniversityDefaults,
} from "@/lib/universityFacts";
import { termToApply, termToRelease } from "@/lib/universityTerms";
import { useTermPlan } from "./TermCheckCard";
import { WHATSNEW_SEEN_KEY } from "./WhatsNewModal";
import type { AcademicInfo, Semester, SetupConfirmed } from "@/types";

export type SetupStep = "profile" | "grades" | "basics";

/** Set for the rest of the app session when the student picks "Later". */
const SESSION_SKIP_KEY = "haven-setup-session-skip";
/** Set (in sessionStorage) to open the window on the next app load even after
 *  "Later" — e.g. by a link that sends the student here to finish setup. */
export const SETUP_OPEN_KEY = "haven-setup-open";

const DAY_MS = 864e5;

/** Fired (e.g. by the "confirm your term" link under absence figures) to open
 *  the setup window now, even after "Later". */
export const OPEN_SETUP_EVENT = "haven:open-setup";
export const requestSetup = () => window.dispatchEvent(new Event(OPEN_SETUP_EVENT));

/** The placeholder term ensureActiveSemester() seeds on sign-up: 13 teaching +
 *  2 finals weeks starting on the sign-up day — or no dates at all. */
export function isPlaceholderSemester(sem: Semester): boolean {
  if (!sem.startDate || !sem.endDate) return true;
  const span = Math.round((+new Date(sem.endDate) - +new Date(sem.startDate)) / DAY_MS);
  return Number(sem.weeks) === 13 && Number(sem.finalsWeeks) === 2 && span === 105;
}

function profileComplete(a: AcademicInfo): boolean {
  const hasUniversity =
    (!!a.universitySlug && a.universitySlug !== "other") || a.universityName.trim() !== "";
  return hasUniversity && a.major.trim() !== "" && a.level.trim() !== "";
}

/** Every setup window still needed for this student, in the order shown. */
export function pendingSetupSteps(s: {
  academic: AcademicInfo;
  semester: Semester;
  setupConfirmed: SetupConfirmed;
}): SetupStep[] {
  const steps: SetupStep[] = [];
  if (!profileComplete(s.academic)) steps.push("profile");
  const table = gradeTableStatus(s.academic);
  if (table === "confirm" || table === "unknown") steps.push("grades");
  if (!s.setupConfirmed.semester && isPlaceholderSemester(s.semester)) steps.push("basics");
  return steps;
}

function readFlag(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function skipForThisSession() {
  try {
    sessionStorage.setItem(SESSION_SKIP_KEY, "1");
  } catch {
    /* ignore */
  }
}

const fieldClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";
const fieldStyle: React.CSSProperties = {
  borderColor: "var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-ink)",
};

export function SetupCheck() {
  const store = useStore();
  const { hydrated, onboardingSeen } = store;
  const { t, lang } = useT();
  // Frozen when the window opens, so filling the profile doesn't reshuffle the
  // steps mid-edit; each step has its own button to move on.
  const [steps, setSteps] = useState<SetupStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const storeRef = useRef(store);
  storeRef.current = store;

  // Asked for from elsewhere (the "confirm your term" link): open with
  // whatever is still missing, "Later" or not.
  useEffect(() => {
    const onRequest = () => {
      const pending = pendingSetupSteps(storeRef.current);
      if (pending.length) {
        setIndex(0);
        setSteps(pending);
      }
    };
    window.addEventListener(OPEN_SETUP_EVENT, onRequest);
    return () => window.removeEventListener(OPEN_SETUP_EVENT, onRequest);
  }, []);

  // Every university's term dates (lib/universityTerms): a complete official
  // term goes on the semester automatically — again whenever the student moves
  // to another university or a new term starts — with the university's
  // official breaks; TermCheckCard then asks whether it's right. Moving to a
  // university without one takes the other university's dates back off (when
  // untouched), so the card's note to add their own dates is about their dates.
  const plan = useTermPlan();
  const planId = plan === undefined ? undefined : (plan?.id ?? null);
  useEffect(() => {
    if (plan === undefined) return;
    const s = storeRef.current;
    const c = s.setupConfirmed;
    const state = { applied: c.termApplied, appliedDates: c.termAppliedDates, prev: c.termPrev, placeholder: isPlaceholderSemester(s.semester) };
    const next = termToApply(plan, s.semester, state);
    if (next) {
      const breaks = plan?.status === "official" && plan.term.holidays ? applyOfficialHolidays(plan.term.holidays, s.semester, lang === "en" ? "en" : "ar") : null;
      s.setSemester({ ...next.dates, ...(breaks ?? {}) });
      s.confirmSetup({ termApplied: next.id, termAppliedDates: next.appliedDates, termPrev: next.prev ?? undefined });
      return;
    }
    const release = termToRelease(plan, s.semester, state);
    if (!release) return;
    if (release.restore) s.setSemester(release.restore);
    s.confirmSetup({ termApplied: undefined, termAppliedDates: undefined, termPrev: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, store.setupConfirmed.termApplied]);

  useEffect(() => {
    if (!hydrated || !onboardingSeen || steps) return;
    const requested = readFlag("session", SETUP_OPEN_KEY) === "1";
    if (!requested && readFlag("session", SESSION_SKIP_KEY) === "1") return;

    const open = () => {
      try {
        sessionStorage.removeItem(SETUP_OPEN_KEY);
      } catch {
        /* ignore */
      }
      const pending = pendingSetupSteps(store);
      if (pending.length) {
        setIndex(0);
        setSteps(pending);
      }
    };
    // Wait for the What's-New popup to be dismissed so the two never stack.
    if (readFlag("local", WHATSNEW_SEEN_KEY) !== "1") {
      window.addEventListener("haven:whatsnew-closed", open, { once: true });
      return () => window.removeEventListener("haven:whatsnew-closed", open);
    }
    const id = window.setTimeout(open, 900);
    return () => window.clearTimeout(id);
    // Evaluated when the app is ready (and right after the tour ends) — not on
    // every store change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, onboardingSeen]);

  if (!steps) return null;
  const step = steps[index];

  const close = () => setSteps(null);
  const later = () => {
    skipForThisSession();
    close();
  };
  const next = () => {
    // The profile step can change what follows (a university whose points table
    // needs a check), so the remaining steps are worked out again after it.
    const done = steps.slice(0, index + 1);
    const upcoming =
      step === "profile" ? [...done, ...pendingSetupSteps(store).filter((s) => !done.includes(s))] : steps;
    if (upcoming !== steps) setSteps(upcoming);
    if (index + 1 < upcoming.length) setIndex(index + 1);
    else close();
  };
  const isLast = index + 1 >= steps.length;

  return (
    <Modal
      open
      onClose={later}
      title={t(step === "profile" ? "setup_profileTitle" : step === "grades" ? "setup_gradesTitle" : "setup_basicsTitle")}
    >
      {steps.length > 1 && (
        <p className="text-xs font-medium mb-3" style={{ color: "var(--color-muted)" }}>
          {t("setup_stepOf", { n: index + 1, total: steps.length })}
        </p>
      )}
      {step === "profile" && <ProfileStep onNext={next} onLater={later} isLast={isLast} />}
      {step === "grades" && <GradesStep onNext={next} onLater={later} isLast={isLast} />}
      {step === "basics" && <BasicsStep onNext={next} onLater={later} />}
    </Modal>
  );
}

function Intro({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <span
        className="shrink-0 inline-flex items-center justify-center rounded-xl"
        style={{ width: 38, height: 38, background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
      >
        {icon}
      </span>
      <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-ink)" }}>
        {text}
      </p>
    </div>
  );
}

function Actions({
  onLater,
  onPrimary,
  primaryLabel,
  disabled,
}: {
  onLater: () => void;
  onPrimary: () => void;
  primaryLabel: string;
  disabled?: boolean;
}) {
  const { t } = useT();
  return (
    <div className="mt-6 flex justify-end gap-3">
      <button
        type="button"
        onClick={onLater}
        className="rounded-xl px-4 py-2 text-sm font-medium"
        style={{ color: "var(--color-muted)" }}
      >
        {t("setup_later")}
      </button>
      <button
        type="button"
        onClick={onPrimary}
        disabled={disabled}
        className="haven-btn rounded-xl px-5 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {primaryLabel}
      </button>
    </div>
  );
}

function ProfileStep({ onNext, onLater, isLast }: { onNext: () => void; onLater: () => void; isLast: boolean }) {
  const { t } = useT();
  const { academic } = useStore();
  const done = profileComplete(academic);
  return (
    <>
      <Intro icon={<GraduationCap size={19} />} text={t("setup_profileBody")} />
      <AcademicSettings showScheme={false} />
      {!done && (
        <p className="text-xs mt-3" style={{ color: "var(--color-muted)" }}>
          {t("setup_profileMissing")}
        </p>
      )}
      <Actions
        onLater={onLater}
        onPrimary={onNext}
        primaryLabel={t(isLast ? "setup_save" : "setup_next")}
        disabled={!done}
      />
    </>
  );
}

export function GradesStep({ onNext, onLater, isLast }: { onNext: () => void; onLater: () => void; isLast: boolean }) {
  const { t } = useT();
  const { academic } = useStore();
  const [editing, setEditing] = useState(false);
  const status = gradeTableStatus(academic);
  // Frozen when the step opens, so the picker stays once a system is chosen.
  const [showPicker] = useState(status === "unknown");
  const done = status === "ok" || status === "rejected";
  return (
    <>
      <Intro icon={<Calculator size={19} />} text={t("setup_gradesBody")} />
      <div className="flex flex-col gap-4">
        <GradeTableSection inSetup editing={editing} setEditing={setEditing} />
        {showPicker && !editing && <SchemePicker onCustom={() => setEditing(true)} />}
      </div>
      {!editing && (
        <Actions
          onLater={onLater}
          onPrimary={onNext}
          primaryLabel={t(isLast ? "setup_save" : "setup_next")}
          disabled={!done}
        />
      )}
    </>
  );
}

type Tag = "official" | "students" | "suggested" | "typical" | "fromDates" | "enter" | "check";

function TagChip({ tag }: { tag: Tag }) {
  const { t } = useT();
  const official = tag === "official" || tag === "students" || tag === "fromDates";
  const label = {
    official: t("setup_tagOfficial"),
    students: t("setup_tagStudents"),
    suggested: t("setup_tagSuggested"),
    typical: t("setup_tagTypical"),
    fromDates: t("setup_tagFromDates"),
    enter: t("setup_tagEnter"),
    check: t("setup_tagCheck"),
  }[tag];
  return (
    <span
      className="inline-block mt-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={{
        background: official ? "color-mix(in srgb, var(--color-success) 14%, transparent)" : "var(--color-brass-soft)",
        color: official ? "var(--color-success)" : "var(--color-brass)",
      }}
    >
      {label}
    </span>
  );
}

interface Draft {
  startDate: string;
  endDate: string;
  weeks: string;
  finalsWeeks: string;
}

function BasicsStep({ onNext, onLater }: { onNext: () => void; onLater: () => void }) {
  const { t, lang } = useT();
  const { semester, academic, setSemester, confirmSetup } = useStore();
  const slug = academic.universitySlug && academic.universitySlug !== "other" ? academic.universitySlug : null;
  const uni = slug ? universityBySlug(slug) : undefined;
  const uniName = uni ? (lang === "en" ? uni.nameEn : uni.name) : academic.universityName.trim();

  const [defaults, setDefaults] = useState<UniversityDefaults | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [touched, setTouched] = useState<Set<keyof Draft>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (slug ? fetchUniversityFacts(slug) : Promise.resolve([])).then((facts) => {
      if (!alive) return;
      const d = defaultsFromFacts(facts, slug);
      const placeholder = isPlaceholderSemester(semester);
      setDefaults(d);
      setDraft({
        // Never offer the sign-up placeholder dates as if they were real.
        startDate: d.startDate ?? (placeholder ? "" : semester.startDate),
        endDate: d.endDate ?? (placeholder ? "" : semester.endDate),
        weeks: String(d.weeks ?? semester.weeks),
        finalsWeeks: String(d.finalsWeeks ?? semester.finalsWeeks),
      });
    });
    return () => {
      alive = false;
    };
    // Loaded once per window; the student's edits live in the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!draft || !defaults) {
    return (
      <p className="py-8 text-center text-sm" style={{ color: "var(--color-muted)" }}>
        {t("setup_loading")}
      </p>
    );
  }

  const kind = defaults.term ? defaults.kind : null;
  const official = kind === "official" || kind === "students";
  const dateTag: Tag = kind === "suggested" ? "suggested" : kind === "students" ? "students" : "official";
  const tagFor = (field: keyof Draft): Tag | null => {
    if (touched.has(field)) return null;
    switch (field) {
      case "startDate":
        return kind && defaults.startDate ? dateTag : "enter";
      case "endDate":
        return kind && defaults.endDate ? dateTag : "enter";
      case "weeks":
        return official && defaults.weeks ? "fromDates" : "check";
      case "finalsWeeks":
        return official && defaults.finalsWeeks ? "fromDates" : "check";
    }
  };

  const set = (patch: Partial<Draft>) => {
    setError("");
    setTouched((prev) => new Set([...prev, ...(Object.keys(patch) as (keyof Draft)[])]));
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      // Finals known but no start date: the teaching weeks follow the start the student enters.
      if (patch.startDate && defaults.finalsStart && !touched.has("weeks") && defaults.finalsStart > patch.startDate) {
        next.weeks = String(Math.max(1, Math.round((+new Date(defaults.finalsStart) - +new Date(patch.startDate)) / (7 * DAY_MS))));
      }
      return next;
    });
  };

  const spanWeeks =
    draft.startDate && draft.endDate && draft.endDate > draft.startDate
      ? Math.round((+new Date(draft.endDate) - +new Date(draft.startDate)) / (7 * DAY_MS))
      : null;

  const save = () => {
    if (!draft.startDate || !draft.endDate || draft.endDate <= draft.startDate) {
      setError(t("setup_semErrDates"));
      return;
    }
    const weeks = Math.round(Number(draft.weeks));
    const finalsWeeks = Math.round(Number(draft.finalsWeeks));
    const ok = weeks >= 1 && weeks <= 40 && finalsWeeks >= 0 && finalsWeeks <= 10;
    if (!ok) {
      setError(t("setup_semErrNumbers"));
      return;
    }
    setSemester({
      startDate: draft.startDate,
      endDate: draft.endDate,
      weeks,
      finalsWeeks,
      ...(applyOfficialHolidays(defaults.holidays, semester, lang === "en" ? "en" : "ar") ?? {}),
    });
    confirmSetup({ semester: true });
    onNext();
  };

  const label = (text: string) => (
    <span className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-muted)" }}>
      {text}
    </span>
  );
  const tag = (field: keyof Draft) => {
    const tg = tagFor(field);
    return tg ? <TagChip tag={tg} /> : null;
  };
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA-u-ca-gregory", {
      day: "numeric",
      month: "short",
    });

  return (
    <>
      <div
        className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 mb-4"
        style={{ background: "color-mix(in srgb, var(--color-warning) 12%, transparent)" }}
      >
        <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--color-warning)" }} />
        <p className="text-[13px] leading-relaxed font-medium" style={{ color: "var(--color-ink)" }}>
          {t("setup_basicsImportant")}
        </p>
      </div>
      <Intro
        icon={<CalendarRange size={19} />}
        text={
          kind === "official"
            ? t("setup_basicsFromUni", { uni: uniName })
            : kind === "students"
              ? t("setup_basicsFromStudents", { uni: uniName })
              : kind === "suggested"
                ? t("setup_basicsSuggested", { uni: uniName })
                : uniName
                  ? t("setup_basicsNoCalendar", { uni: uniName })
                  : t("setup_basicsNoUni")
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 sm:col-span-1">
          {label(t("startDate"))}
          <DateField
            calendar={semester.calendarType}
            className={fieldClass}
            style={fieldStyle}
            value={draft.startDate}
            onChange={(v) => v && set({ startDate: v })}
          />
          {tag("startDate")}
        </label>
        <label className="col-span-2 sm:col-span-1">
          {label(t("endDate"))}
          <DateField
            calendar={semester.calendarType}
            className={fieldClass}
            style={fieldStyle}
            value={draft.endDate}
            onChange={(v) => v && set({ endDate: v })}
          />
          {tag("endDate")}
        </label>
        <label>
          {label(t("setup_semTeachingWeeks"))}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={40}
            className={fieldClass}
            style={fieldStyle}
            value={draft.weeks}
            onChange={(e) => set({ weeks: e.target.value })}
          />
          {tag("weeks")}
        </label>
        <label>
          {label(t("setup_semFinalsWeeks"))}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={10}
            className={fieldClass}
            style={fieldStyle}
            value={draft.finalsWeeks}
            onChange={(e) => set({ finalsWeeks: e.target.value })}
          />
          {tag("finalsWeeks")}
        </label>
      </div>
      {spanWeeks !== null && (
        <p className="text-xs mt-3" style={{ color: "var(--color-muted)" }}>
          {t("setup_semSpan", { n: spanWeeks })}
        </p>
      )}
      <p className="text-[11.5px] mt-1.5 leading-relaxed" style={{ color: "var(--color-muted)" }}>
        {t("weeksHint")}
      </p>

      {defaults.holidays.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-medium mb-2" style={{ color: "var(--color-muted)" }}>
            {t("setup_holidaysTitle")}
          </p>
          <ul className="flex flex-col gap-1.5">
            {defaults.holidays.map((h) => (
              <li
                key={h.startDate}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[13px]"
                style={{ background: "var(--color-surface-alt)", color: "var(--color-ink)" }}
              >
                <span className="truncate">{lang === "en" ? h.nameEn : h.nameAr}</span>
                <span className="shrink-0 tabular-nums" style={{ color: "var(--color-muted)" }}>
                  {fmt(h.startDate)} – {fmt(h.endDate)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11.5px] mt-2" style={{ color: "var(--color-muted)" }}>
            {t("setup_holidaysNote")}
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs mt-3" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
      <Actions onLater={onLater} onPrimary={save} primaryLabel={t("setup_save")} />
    </>
  );
}
