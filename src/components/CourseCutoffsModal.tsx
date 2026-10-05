"use client";

// The cutoffs of a course graded on the cohort average (lib/curves). Opens
// pre-filled with the university's table; the student changes the rows their
// instructor or department announced, can move every row at once, and ticks
// "I entered all the cutoffs" when the table is whole.

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Modal } from "./Modal";
import { useStore, type MutationResult } from "@/store";
import { useT } from "@/i18n";
import { bandForPct, type GradeScheme } from "@/lib/gradeSchemes";
import { courseCurrentPct } from "@/lib/grades";
import { cutoffProblem, makeCurve, shiftCutoffs } from "@/lib/curves";
import { toEnglishDigits } from "@/lib/dates";
import { isolate } from "@/lib/format";
import type { Course, CourseCurve } from "@/types";

interface Row {
  letter: string;
  /** the university's cutoff for this letter */
  base: number;
  /** what's in the box */
  value: string;
  /** the student set this row (typed, moved, or saved before) */
  entered: boolean;
}

/** English digits, with a decimal comma read as a point → a number (NaN when empty). */
const parse = (raw: string): number => {
  const latin = toEnglishDigits(raw.trim()).replace(",", ".");
  return latin === "" ? NaN : Number(latin);
};

const show = (n: number) => String(Math.round(n * 1e6) / 1e6);

export function CourseCutoffsModal({
  open,
  onClose,
  course,
  scheme,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  course: Course;
  /** the student's own table (not the course's): the rows and their base cutoffs */
  scheme: GradeScheme;
  onSave: (curve: CourseCurve) => Promise<MutationResult>;
}) {
  const { t, lang } = useT();
  const { academic } = useStore();
  const [rows, setRows] = useState<Row[]>([]);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [badRow, setBadRow] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Fill from the saved entry when it fits this table, else the university's.
  useEffect(() => {
    if (!open) return;
    const saved = course.curve?.cutoffs ?? {};
    setRows(
      scheme.bands.slice(0, -1).map((b) => {
        const own = Object.prototype.hasOwnProperty.call(saved, b.letter);
        return { letter: b.letter, base: b.min, value: show(own ? saved[b.letter] : b.min), entered: own };
      })
    );
    setComplete(!!course.curve?.complete && !course.curve.stale);
    setError("");
    setBadRow(null);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mins = rows.map((r) => parse(r.value));
  const last = scheme.bands[scheme.bands.length - 1];
  const pct = courseCurrentPct(course);

  // The letter the course's % gets with these cutoffs, when they work.
  const preview = useMemo(() => {
    if (pct == null || !rows.length || cutoffProblem(mins)) return null;
    const table: GradeScheme = { ...scheme, bands: scheme.bands.map((b, i) => ({ ...b, min: i < mins.length ? mins[i] : 0 })) };
    return bandForPct(table, pct).letter;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, pct, scheme]);

  // A letter inside a sentence keeps its own order ("B+", not "+B").
  const iso = isolate;

  const problemText = (p: NonNullable<ReturnType<typeof cutoffProblem>>) => {
    const letter = iso(rows[p.index].letter);
    if (p.kind === "range") return t("curve_errRange", { letter });
    if (p.kind === "pass") return t("curve_errPass", { letter });
    return t("curve_errOrder", { letter, above: iso(rows[p.index - 1].letter) });
  };

  const edit = (i: number, value: string) => {
    setError("");
    setBadRow(null);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, value, entered: true } : r)));
  };

  const shift = (by: number) => {
    setError("");
    setBadRow(null);
    const bad = cutoffProblem(mins);
    if (bad && bad.kind === "range") {
      setBadRow(bad.index);
      return setError(problemText(bad));
    }
    const res = shiftCutoffs(mins, by);
    if ("blocked" in res) {
      setBadRow(res.blocked);
      return setError(t("curve_shiftOut", { letter: iso(rows[res.blocked].letter) }));
    }
    setRows((rs) => rs.map((r, i) => ({ ...r, value: show(res.mins[i]), entered: true })));
  };

  const reset = () => {
    setError("");
    setBadRow(null);
    setComplete(false);
    setRows((rs) => rs.map((r) => ({ ...r, value: show(r.base), entered: false })));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const bad = cutoffProblem(mins);
    if (bad) {
      setBadRow(bad.index);
      return setError(problemText(bad));
    }
    setSaving(true);
    const curve = makeCurve(
      scheme,
      academic,
      rows.map((r, i) => ({ letter: r.letter, min: mins[i], entered: r.entered })),
      complete
    );
    const res = await onSave(curve);
    setSaving(false);
    if (!res.ok) return setError(t("saveError"));
    onClose();
  };

  const border = (i: number) => ({
    borderColor: badRow === i ? "var(--color-danger)" : rows[i]?.entered ? "var(--color-primary)" : "var(--color-border)",
  });
  const muted = { color: "var(--color-muted)" };

  return (
    <Modal open={open} onClose={onClose} title={t("curve_modalTitle", { name: course.name })}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed" style={muted}>
          {t("curve_modalIntro")}
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          {rows.map((r, i) => (
            <label key={r.letter} className="flex items-center gap-2 rounded-xl border px-3 py-2" style={border(i)}>
              <span dir="auto" className="w-9 shrink-0 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                {r.letter}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <input
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  value={r.value}
                  onChange={(e) => edit(i, e.target.value)}
                  aria-label={r.letter}
                  className="w-full bg-transparent text-sm outline-none"
                  // next to its letter on either side (the number itself reads left to right)
                  style={{ color: "var(--color-ink)", textAlign: lang === "ar" ? "right" : "left" }}
                />
                {!r.entered && (
                  <span className="text-[10px] leading-none" style={muted}>
                    {t("curve_fromUni")}
                  </span>
                )}
              </span>
            </label>
          ))}
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm" style={muted}>
            <span dir="auto" className="w-9 shrink-0 font-semibold">{last.letter}</span>
            <span>{t("curve_last", { min: Number.isFinite(mins[mins.length - 1]) ? show(mins[mins.length - 1]) : "—" })}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-ink)" }}>
            <span>{t("curve_shift")}</span>
            <button type="button" onClick={() => shift(-1)} aria-label={t("curve_shiftDown")} title={t("curve_shiftDown")} className="rounded-lg border p-1.5 transition-colors hover:bg-black/5" style={{ borderColor: "var(--color-border)" }}>
              <Minus size={14} />
            </button>
            <button type="button" onClick={() => shift(1)} aria-label={t("curve_shiftUp")} title={t("curve_shiftUp")} className="rounded-lg border p-1.5 transition-colors hover:bg-black/5" style={{ borderColor: "var(--color-border)" }}>
              <Plus size={14} />
            </button>
          </div>
          <button type="button" onClick={reset} className="text-xs font-medium underline underline-offset-2" style={muted}>
            {t("curve_reset")}
          </button>
        </div>

        <label className="flex items-start gap-2.5 text-sm cursor-pointer" style={{ color: "var(--color-ink)" }}>
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
            checked={complete}
            onChange={(e) => {
              setError("");
              setComplete(e.target.checked);
            }}
          />
          <span>
            <span className="block font-medium">{t("curve_complete")}</span>
            <span className="block text-xs mt-0.5" style={muted}>{t("curve_completeDesc")}</span>
          </span>
        </label>

        {pct != null && preview && (
          <div className="rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--color-primary-soft)", color: "var(--color-ink)" }}>
            {t("curve_preview", { pct: show(Math.round(pct * 100) / 100), letter: iso(preview) })}
          </div>
        )}

        <p className="text-xs leading-relaxed" style={muted}>
          {t("curve_note")}
        </p>

        {error && (
          <span className="text-xs" style={{ color: "var(--color-danger)" }}>{error}</span>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={saving} className="haven-btn px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-60">
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
