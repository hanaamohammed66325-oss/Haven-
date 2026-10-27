"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { DateField } from "./DateField";
import { InteractionButton } from "./motion/Interaction";
import { toISODate } from "@/lib/dates";
import { canPinSemester, nextSemesterDates, semesterDatesProblem } from "@/lib/semesterProgress";

const fieldClass = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const fieldStyle = { borderColor: "var(--color-border-strong)", background: "var(--color-surface)" };

/** Name and dates of a new term, typed by the student: the dates are never
 *  worked out for them (they start as the day after the current term). The
 *  term may not share a day with another one. Then it is created and made the
 *  current term (only when it can be: see canPinSemester), or the current term
 *  stays and the new one is opened from the list for viewing. */
export function NewSemesterForm({ onBack, ignoreIds }: {
  onBack: () => void;
  /** terms left out of the overlap check (empty copies hidden from the list) */
  ignoreIds?: ReadonlySet<string>;
}) {
  const { t } = useT();
  const { semester, semesterOptions, createSemester } = useStore();
  const current = semesterOptions.find((term) => term.isActive);
  const [name, setName] = useState("");
  const [dates, setDates] = useState(() => nextSemesterDates(current?.endDate ?? semester.endDate));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const problem = useMemo(
    () => semesterDatesProblem(dates.startDate, dates.endDate,
      semesterOptions.filter((term) => !ignoreIds?.has(term.id))),
    [dates, semesterOptions, ignoreIds]
  );
  const ready = !!name.trim() && !problem && !busy;
  // A term that has not begun (or has ended) cannot be made current while another
  // one runs: every reminder follows the current term. It becomes current by its dates.
  const canSwitch = !!problem || canPinSemester(
    { id: "", startDate: dates.startDate, endDate: dates.endDate },
    semesterOptions.filter((term) => !ignoreIds?.has(term.id)),
    toISODate(new Date())
  );

  async function create(switchNow: boolean) {
    if (!ready) return;
    setBusy(true);
    setFailed(false);
    try {
      await createSemester({ name: name.trim(), ...dates, switchNow });
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  const message = problem
    ? t(problem.kind === "overlap" ? "semesterDatesOverlap" : problem.kind === "order" ? "semesterDatesOrder" : "semesterDatesRequired",
        problem.kind === "overlap" ? { name: problem.name } : undefined)
    : failed ? t("semesterActionError") : "";

  return (
    <div className="grid gap-3">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoFocus
        maxLength={120}
        placeholder={t("semesterSwitcherNewName")}
        aria-label={t("semesterSwitcherNewName")}
        className={fieldClass}
        style={fieldStyle}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          {t("semesterNewStart")}
          <DateField value={dates.startDate} calendar={semester.calendarType}
            onChange={(startDate) => setDates((value) => ({ ...value, startDate }))}
            className={fieldClass} style={fieldStyle} />
        </label>
        <label className="grid gap-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          {t("semesterNewEnd")}
          <DateField value={dates.endDate} calendar={semester.calendarType}
            onChange={(endDate) => setDates((value) => ({ ...value, endDate }))}
            className={fieldClass} style={fieldStyle} />
        </label>
      </div>
      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{t("semesterNewHint")}</p>
      {!canSwitch && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{t("semesterCreateSwitchUnavailable")}</p>}
      {message && <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>{message}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <InteractionButton type="button" onClick={onBack} disabled={busy}
          className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text)" }}>
          {t("semesterNewBack")}
        </InteractionButton>
        <InteractionButton type="button" onClick={() => void create(false)} disabled={!ready}
          className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text)" }}>
          {t("semesterCreateStay")}
        </InteractionButton>
        {canSwitch && <InteractionButton type="button" onClick={() => void create(true)} disabled={!ready}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-primary)" }}>
          {busy ? t("semesterSwitcherSwitching") : t("semesterCreateSwitch")}
        </InteractionButton>}
      </div>
    </div>
  );
}
