"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useT } from "@/i18n";
import { useScheme, useStore, type MutationResult } from "@/store";
import { normalizeArabicDigits } from "@/lib/dates";
import { DENIED, detectScheme, isSaudiUniversity } from "@/lib/gradeSchemes";
import { courseRule, hasOwnLimit } from "@/lib/grades";
import { fmtPct } from "@/lib/format";
import type { Course, RepeatInfo, RepeatPolicy } from "@/types";

const field =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

interface AddCourseModalProps {
  open: boolean;
  onClose: () => void;
  // May be async and report failure: on add it's the store's addCourse
  // (Promise<MutationResult>); on edit it's a plain optimistic update (void).
  onSubmit: (course: {
    name: string;
    creditHours: number;
    /** the student's own limit for this course, or 0 = the term's rule */
    attendanceLimit: number;
    /** the earlier attempt when the course is being repeated, else null */
    repeat: RepeatInfo | null;
  }) => void | Promise<MutationResult | void>;
  /** when provided, the modal edits an existing course (prefilled) */
  initial?: { name: string; creditHours: number; attendanceLimit?: number; ownLimit?: boolean; repeat?: RepeatInfo };
}

type Kind = NonNullable<RepeatInfo["kind"]>;

export function AddCourseModal({ open, onClose, onSubmit, initial }: AddCourseModalProps) {
  const { t } = useT();
  const isEdit = initial != null;
  const { semester } = useStore();
  // The field holds only a limit the student chose; empty = the term's rule.
  const own = { attendanceLimit: initial?.attendanceLimit, ownLimit: initial?.ownLimit } as Course;
  const initialLimit = hasOwnLimit(own, semester) ? initial!.attendanceLimit! : "";
  const termRule = courseRule({ attendanceLimit: 0 } as Course, semester);
  const termLimit = termRule.total ?? termRule.unexcused;
  const [name, setName] = useState(initial?.name ?? "");
  const [credits, setCredits] = useState(String(initial?.creditHours ?? 3));
  const [limit, setLimit] = useState(String(initialLimit));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const border = { borderColor: "var(--color-border)" };

  // Repeated course (lib/repeats). At a Saudi university the regulations decide
  // how it counts, so we ask why it's repeated; elsewhere we ask once how the
  // university counts it (saved to the academic profile).
  const { academic, setAcademic, cumulativeHours, reportTermCheck } = useStore();
  const scheme = useScheme();
  const saudi = isSaudiUniversity(academic) === true;
  const oldOf = (r?: RepeatInfo) => r?.letter ?? (r?.mark != null ? String(r.mark) : "");
  // A usual graduation minimum to start from: "مقبول" (2.00 of 5, 1.00 of 4).
  // 0 means the student cleared it (their regulations set no ceiling).
  const gradMinOf = () =>
    academic.gradMinGpa != null
      ? academic.gradMinGpa > 0
        ? String(academic.gradMinGpa)
        : ""
      : scheme.max === 5
      ? "2"
      : scheme.max === 4
      ? "1"
      : "";
  const [repeated, setRepeated] = useState(!!initial?.repeat);
  const [kind, setKind] = useState<Kind | undefined>(initial?.repeat?.kind);
  const [policy, setPolicy] = useState<RepeatPolicy | undefined>(academic.repeatPolicy);
  const [askPolicy, setAskPolicy] = useState(!academic.repeatPolicy);
  const [oldGrade, setOldGrade] = useState(oldOf(initial?.repeat));
  const [gradMin, setGradMin] = useState(gradMinOf);
  const [note, setNote] = useState(academic.repeatPolicyNote ?? "");

  // Sync the form whenever the modal opens (prefill for edit, reset for add).
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setCredits(String(initial?.creditHours ?? 3));
      setLimit(String(initialLimit));
      setError("");
      setSaving(false);
      setRepeated(!!initial?.repeat);
      setKind(initial?.repeat?.kind);
      setPolicy(academic.repeatPolicy);
      setAskPolicy(!academic.repeatPolicy);
      setOldGrade(oldOf(initial?.repeat));
      setGradMin(gradMinOf());
      setNote(academic.repeatPolicyNote ?? "");
    }
    // Only on open: re-syncing mid-edit would wipe what the student picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.name, initial?.creditHours, initialLimit]);

  // The earlier grade matters only when an attempt is dropped.
  const needOld = saudi ? kind === "raise" : policy === "higher" || policy === "latest";

  /** The repeat to save, or an error message. */
  const buildRepeat = (): RepeatInfo | string => {
    const info: RepeatInfo = {};
    if (saudi) {
      if (!kind) return t("rep_errKind");
      info.kind = kind;
    } else if (!policy) return t("rep_errPolicy");
    else if (policy === "other" && !note.trim()) return t("rep_errOther");
    if (needOld) {
      if (scheme.percent) {
        const mark = Number(normalizeArabicDigits(oldGrade.trim()).replace(",", "."));
        if (oldGrade.trim() === "" || !(mark >= 0 && mark <= 100)) return t("rep_errMark");
        info.mark = mark;
      } else {
        if (oldGrade !== DENIED && !scheme.bands.some((b) => b.letter === oldGrade)) return t("rep_errLetter");
        info.letter = oldGrade;
      }
    }
    return info;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cr = Number(credits);
    if (!name.trim() || !cr || cr <= 0) return;
    // Empty = follow the term's rule; otherwise a sane 1..100.
    const rawLim = normalizeArabicDigits(limit.trim()).replace(",", ".");
    const lim = rawLim === "" ? 0 : Number(rawLim);
    if (rawLim !== "" && !(lim >= 1 && lim <= 100)) return setError(t("ruleFormErrLimit"));
    const attendanceLimit = lim;
    let repeat: RepeatInfo | null = null;
    if (repeated) {
      const built = buildRepeat();
      if (typeof built === "string") return setError(built);
      repeat = built;
      if (saudi && kind === "raise") {
        const raw = normalizeArabicDigits(gradMin.trim()).replace(",", ".");
        const min = raw === "" ? undefined : Number(raw);
        if (min !== undefined && !(min > 0 && min <= scheme.max)) return setError(t("rep_errGradMin", { max: scheme.max }));
        // 0 = "no minimum" (an absent key wouldn't clear a saved one).
        if ((min ?? 0) !== (academic.gradMinGpa ?? 0)) setAcademic({ gradMinGpa: min ?? 0 });
      }
      if (!saudi) {
        const text = policy === "other" ? note.trim().slice(0, 300) : "";
        if (policy !== academic.repeatPolicy || text !== (academic.repeatPolicyNote ?? "")) {
          setAcademic({ repeatPolicy: policy, repeatPolicyNote: text });
          // A rule we don't offer yet: send it to the admin to add.
          if (text) {
            reportTermCheck("repeat_policy_other", {
              note: text,
              university: academic.universityName || academic.universitySlug || "",
              catalog: detectScheme(academic).catalog?.slug ?? null,
            });
          }
        }
      }
    }
    setError("");
    setSaving(true);
    // Await the save. Only close once the store actually has the row; if it
    // failed, keep the modal open and show why (was: closed silently regardless).
    const res = await onSubmit({ name: name.trim(), creditHours: cr, attendanceLimit, repeat });
    setSaving(false);
    if (res && res.ok === false) {
      setError(t("saveError"));
      return;
    }
    onClose();
  }

  const clear = <T,>(set: (v: T) => void) => (v: T) => {
    setError("");
    set(v);
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? t("editCourse") : t("newCourse")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("courseName")}</label>
          <input data-tour="course-name" className={field} style={border} value={name} placeholder={t("courseNamePlaceholder")} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("creditHours")}</label>
          <input data-tour="course-credits" className={field} style={border} type="number" min="1" step="1" value={credits} onChange={(e) => setCredits(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("courseLimitLabel")}</label>
          <input
            className={field}
            style={border}
            type="number"
            min="1"
            max="100"
            step="any"
            inputMode="decimal"
            value={limit}
            placeholder={termLimit ? `${fmtPct(termLimit)}` : ""}
            onChange={(e) => {
              setError("");
              setLimit(e.target.value);
            }}
          />
          <span className="text-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>
            {termLimit
              ? t(termRule.source === "university" ? "courseLimitHintUniversity" : termRule.source === "personal" ? "courseLimitHintPersonal" : "courseLimitHintDefault", { n: fmtPct(termLimit) })
              : t("courseLimitHintUnknown")}
          </span>
        </div>
        <RepeatFields
          repeated={repeated}
          setRepeated={clear(setRepeated)}
          saudi={saudi}
          kind={kind}
          setKind={clear(setKind)}
          policy={policy}
          setPolicy={clear(setPolicy)}
          askPolicy={askPolicy}
          onChangePolicy={() => setAskPolicy(true)}
          needOld={needOld}
          oldGrade={oldGrade}
          setOldGrade={clear(setOldGrade)}
          gradMin={gradMin}
          setGradMin={clear(setGradMin)}
          note={note}
          setNote={clear(setNote)}
          letters={scheme.percent ? null : scheme.bands.map((b) => b.letter)}
          noCumulative={!(cumulativeHours > 0)}
        />
        {error && (
          <span className="text-xs" style={{ color: "var(--color-danger)" }}>{error}</span>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}>
            {t("cancel")}
          </button>
          <button type="submit" data-tour="course-save" disabled={saving} className="haven-btn px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-60">
            {saving ? t("saving") : isEdit ? t("save") : t("addCourse")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** One radio card: a title and a line under it. */
function Choice({ on, onClick, label, desc }: { on: boolean; onClick: () => void; label: string; desc: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className="text-start rounded-xl border px-3 py-2.5 transition-colors"
      style={{
        borderColor: on ? "var(--color-primary)" : "var(--color-border)",
        background: on ? "var(--color-primary-soft)" : "var(--color-surface)",
      }}
    >
      <span className="block text-sm font-medium" style={{ color: "var(--color-ink)" }}>
        {label}
      </span>
      <span className="block text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
        {desc}
      </span>
    </button>
  );
}

/** "Repeated course": the checkbox; then why it's repeated (Saudi) or how the
 *  university counts it (elsewhere, asked once); then the earlier grade when
 *  an attempt is dropped. */
function RepeatFields({
  repeated,
  setRepeated,
  saudi,
  kind,
  setKind,
  policy,
  setPolicy,
  askPolicy,
  onChangePolicy,
  needOld,
  oldGrade,
  setOldGrade,
  gradMin,
  setGradMin,
  note,
  setNote,
  letters,
  noCumulative,
}: {
  repeated: boolean;
  setRepeated: (v: boolean) => void;
  saudi: boolean;
  kind: Kind | undefined;
  setKind: (k: Kind) => void;
  policy: RepeatPolicy | undefined;
  setPolicy: (p: RepeatPolicy) => void;
  askPolicy: boolean;
  onChangePolicy: () => void;
  needOld: boolean;
  oldGrade: string;
  setOldGrade: (g: string) => void;
  gradMin: string;
  setGradMin: (g: string) => void;
  /** the student's own description when their rule is "other" */
  note: string;
  setNote: (n: string) => void;
  /** the scheme's letters, or null for a percentage scheme (a mark is typed) */
  letters: string[] | null;
  noCumulative: boolean;
}) {
  const { t } = useT();
  const border = { borderColor: "var(--color-border)" };
  const muted = { color: "var(--color-muted)" };
  const policies: { id: RepeatPolicy; label: string; desc: string }[] = [
    { id: "higher", label: t("rep_higher"), desc: t("rep_higherDesc") },
    { id: "latest", label: t("rep_latest"), desc: t("rep_latestDesc") },
    { id: "both", label: t("rep_both"), desc: t("rep_bothDesc") },
    { id: "other", label: t("rep_other"), desc: t("rep_otherDesc") },
  ];
  const policyLabel = policy === "other" ? note : policies.find((p) => p.id === policy)?.label ?? "";
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2.5 text-sm cursor-pointer" style={{ color: "var(--color-ink)" }}>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--color-primary)]"
          checked={repeated}
          onChange={(e) => setRepeated(e.target.checked)}
        />
        {t("rep_toggle")}
      </label>
      {repeated && (
        <div className="flex flex-col gap-3 rounded-xl border p-3.5" style={border}>
          {saudi ? (
            <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("rep_whyQ")}>
              <p className="text-xs font-medium" style={muted}>
                {t("rep_whyQ")}
              </p>
              <Choice on={kind === "failed"} onClick={() => setKind("failed")} label={t("rep_failed")} desc={t("rep_failedDesc")} />
              <Choice on={kind === "raise"} onClick={() => setKind("raise")} label={t("rep_raise")} desc={t("rep_raiseDesc")} />
            </div>
          ) : askPolicy ? (
            <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("rep_policyQ")}>
              <p className="text-xs font-medium" style={muted}>
                {t("rep_policyQ")}
              </p>
              {policies.map((o) => (
                <Choice key={o.id} on={policy === o.id} onClick={() => setPolicy(o.id)} label={o.label} desc={o.desc} />
              ))}
              {policy === "other" && (
                <div className="flex flex-col gap-1.5 mt-1">
                  <label className="text-xs font-medium" style={muted}>
                    {t("rep_otherLabel")}
                  </label>
                  <textarea
                    className={field}
                    style={border}
                    rows={2}
                    maxLength={300}
                    dir="auto"
                    placeholder={t("rep_otherPlaceholder")}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              )}
              <p className="text-[11.5px] leading-relaxed" style={muted}>
                {t("rep_policyHint")}
              </p>
            </div>
          ) : (
            <p className="text-xs flex flex-wrap items-center gap-x-2" style={muted}>
              <span dir="auto">{t("rep_policyIs", { policy: policyLabel })}</span>
              <button
                type="button"
                onClick={onChangePolicy}
                className="font-medium underline underline-offset-2"
                style={{ color: "var(--color-primary)" }}
              >
                {t("rep_change")}
              </button>
            </p>
          )}

          {needOld && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={muted}>
                {t(letters ? "rep_oldLetter" : "rep_oldMark")}
              </label>
              {letters ? (
                <select className={field} style={border} value={oldGrade} onChange={(e) => setOldGrade(e.target.value)}>
                  <option value="">{t("rep_pick")}</option>
                  {/* A course passed and retaken to raise the GPA had a passing grade:
                      no failing letter, no DN. */}
                  {(saudi && kind === "raise" ? letters.slice(0, -1) : letters).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                  {!(saudi && kind === "raise") && <option value={DENIED}>{t("grade_DN")}</option>}
                </select>
              ) : (
                <input
                  className={field}
                  style={border}
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  value={oldGrade}
                  onChange={(e) => setOldGrade(e.target.value)}
                />
              )}
            </div>
          )}

          {saudi && kind === "raise" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={muted}>
                {t("rep_gradMin")}
              </label>
              <input
                className={field}
                style={border}
                type="text"
                inputMode="decimal"
                dir="ltr"
                value={gradMin}
                onChange={(e) => setGradMin(e.target.value)}
              />
              <p className="text-[11.5px] leading-relaxed" style={muted}>
                {t("rep_gradMinHint")}
              </p>
            </div>
          )}

          {!saudi && policy === "other" && (
            <p className="text-[11.5px] leading-relaxed" style={muted}>
              {t("rep_otherNote")}
            </p>
          )}

          {needOld && noCumulative && (
            <p className="text-[11.5px] leading-relaxed" style={muted}>
              {t("rep_needCumulative")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
