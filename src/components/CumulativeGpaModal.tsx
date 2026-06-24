"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "./Modal";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { SCALE, courseCurrentPct, pctToGrade } from "@/lib/grades";

const field =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";
const cellInput =
  "rounded-lg border px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

const pointsFor = (letter: string) => SCALE.find((s) => s.letter === letter)?.points ?? 0;
const rid = () => Math.random().toString(36).slice(2);

type Mode = "current" | "manual";
interface ManualRow {
  id: string;
  name: string;
  credits: string;
  letter: string;
}
const blankRow = (): ManualRow => ({ id: rid(), name: "", credits: "", letter: "A" });

interface CumulativeGpaModalProps {
  open: boolean;
  onClose: () => void;
}

export function CumulativeGpaModal({ open, onClose }: CumulativeGpaModalProps) {
  const { t } = useT();
  const { courses } = useStore();

  const [mode, setMode] = useState<Mode>("current");
  const [prevGpa, setPrevGpa] = useState("");
  const [prevHours, setPrevHours] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<ManualRow[]>(() => [blankRow(), blankRow(), blankRow()]);

  // Fresh simulation each time it opens: back to the current-courses tab and
  // reflect the latest projected grades. (Previous Record + manual rows persist.)
  useEffect(() => {
    if (open) {
      setMode("current");
      setOverrides({});
    }
  }, [open]);

  const border = { borderColor: "var(--color-border)" };

  // ---- Tab 1: auto-pulled courses ----
  const currentRows = useMemo(
    () =>
      courses.map((c) => {
        const pct = courseCurrentPct(c);
        const graded = pct != null;
        const projected = graded ? pctToGrade(pct).letter : null;
        const letter = overrides[c.id] ?? projected;
        return {
          id: c.id,
          name: c.name,
          credits: Number(c.creditHours) || 0,
          graded,
          letter,
          points: letter ? pointsFor(letter) : null,
        };
      }),
    [courses, overrides]
  );

  // ---- semester totals for the active tab ----
  const { semesterCredits, semesterPoints } = useMemo(() => {
    if (mode === "current") {
      const g = currentRows.filter((r) => r.graded && r.points != null);
      return {
        semesterCredits: g.reduce((s, r) => s + r.credits, 0),
        semesterPoints: g.reduce((s, r) => s + r.points! * r.credits, 0),
      };
    }
    const g = manual.filter((r) => (Number(r.credits) || 0) > 0);
    return {
      semesterCredits: g.reduce((s, r) => s + (Number(r.credits) || 0), 0),
      semesterPoints: g.reduce((s, r) => s + pointsFor(r.letter) * (Number(r.credits) || 0), 0),
    };
  }, [mode, currentRows, manual]);

  const semGpa = semesterCredits > 0 ? semesterPoints / semesterCredits : null;
  const pGpa = Math.min(5, Math.max(0, Number(prevGpa) || 0));
  const pHours = Math.max(0, Number(prevHours) || 0);
  const hasPrev = pHours > 0;
  const totalCredits = pHours + semesterCredits;
  const newGpa = totalCredits > 0 ? Math.min(5, (pGpa * pHours + semesterPoints) / totalCredits) : null;

  const fmt = (n: number | null) => (n == null ? "—" : n.toFixed(2));

  // manual row helpers
  const addRow = () => setManual((rows) => [...rows, blankRow()]);
  const clearRows = () => setManual([blankRow()]);
  const deleteRow = (id: string) => setManual((rows) => rows.filter((r) => r.id !== id));
  const updateRow = (id: string, patch: Partial<ManualRow>) =>
    setManual((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const reset = () => {
    setPrevGpa("");
    setPrevHours("");
  };

  const tabs: { key: Mode; label: string }[] = [
    { key: "current", label: t("cumTabCurrent") },
    { key: "manual", label: t("cumTabManual") },
  ];

  const gradeOptions = SCALE.map((s) => (
    <option key={s.letter} value={s.letter}>
      {s.letter} · {s.points.toFixed(2)}
    </option>
  ));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("cumGpaTitle")}
      footer={
        <div className="flex justify-between gap-3">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-xl text-sm font-medium border"
            style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
          >
            {t("reset")}
          </button>
          <button type="button" onClick={onClose} className="haven-btn px-5 py-2 rounded-xl text-sm font-medium">
            {t("close")}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Tabs */}
        <div className="flex w-full rounded-xl p-1" style={{ background: "var(--color-primary-soft)" }}>
          {tabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              onClick={() => setMode(tb.key)}
              aria-pressed={mode === tb.key}
              className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={
                mode === tb.key
                  ? { background: "var(--color-surface)", color: "var(--color-primary)", boxShadow: "var(--shadow-card)" }
                  : { color: "var(--color-muted)" }
              }
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Previous record (shared) */}
        <section>
          <h3 className="haven-label mb-3" style={{ color: "var(--color-ink)" }}>{t("cumPrevSection")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("cumPrevGpa")}</label>
              <input
                className={field}
                style={border}
                type="number"
                min="0"
                max="5"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={prevGpa}
                onChange={(e) => setPrevGpa(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("cumCompletedHours")}</label>
              <input
                className={field}
                style={border}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="60"
                value={prevHours}
                onChange={(e) => setPrevHours(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Tab content */}
        {mode === "current" ? (
          <section>
            {currentRows.length === 0 ? (
              <p className="text-sm py-2" style={{ color: "var(--color-muted)" }}>{t("cumNoCourses")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {currentRows.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5"
                    style={{ borderColor: "var(--color-border)", opacity: r.graded ? 1 : 0.55 }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--color-ink)" }}>{r.name}</div>
                      <div className="text-xs" style={{ color: "var(--color-muted)" }}>{t("creditsShort", { n: r.credits })}</div>
                    </div>
                    {r.graded ? (
                      <select
                        aria-label={r.name}
                        value={r.letter ?? ""}
                        onChange={(e) => setOverrides((o) => ({ ...o, [r.id]: e.target.value }))}
                        className="rounded-lg border px-2.5 py-1.5 text-sm font-semibold outline-none transition-colors focus:border-[var(--color-primary)]"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                      >
                        {gradeOptions}
                      </select>
                    ) : (
                      <span className="text-xs italic shrink-0" style={{ color: "var(--color-muted)" }}>{t("cumNoGradeYet")}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section>
            <div className="flex flex-col gap-2">
              {manual.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <input
                    className={`${cellInput} flex-1 min-w-0`}
                    style={border}
                    placeholder={t("cumCourseName")}
                    value={r.name}
                    onChange={(e) => updateRow(r.id, { name: e.target.value })}
                  />
                  <input
                    className={`${cellInput} w-16 text-center`}
                    style={border}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    aria-label={t("cumRowCredits")}
                    placeholder={t("cumRowCredits")}
                    value={r.credits}
                    onChange={(e) => updateRow(r.id, { credits: e.target.value })}
                  />
                  <select
                    aria-label={t("cumGrade")}
                    value={r.letter}
                    onChange={(e) => updateRow(r.id, { letter: e.target.value })}
                    className={`${cellInput} font-semibold shrink-0`}
                    style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                  >
                    {gradeOptions}
                  </select>
                  <button
                    type="button"
                    onClick={() => deleteRow(r.id)}
                    aria-label={t("delete")}
                    className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-black/5"
                  >
                    <Trash2 size={15} style={{ color: "var(--color-muted)" }} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 text-sm font-medium"
                style={{ color: "var(--color-primary)" }}
              >
                <Plus size={15} />
                {t("cumAddRow")}
              </button>
              <button
                type="button"
                onClick={clearRows}
                className="text-sm font-medium"
                style={{ color: "var(--color-muted)" }}
              >
                {t("cumClearAll")}
              </button>
            </div>
          </section>
        )}

        {/* Result (shared) */}
        <section className="rounded-2xl p-6 text-center" style={{ background: "var(--color-primary-soft)" }}>
          <div className="haven-label" style={{ color: "var(--color-primary)" }}>{t("cumResultLabel")}</div>
          <div className="mt-2.5 leading-none">
            <span className="font-display text-[44px]" style={{ color: "var(--color-brass)" }}>{fmt(newGpa)}</span>
            <span className="text-base ms-1.5" style={{ color: "var(--color-muted)" }}>/ 5.0</span>
          </div>
          <p className="text-xs mt-4 leading-relaxed" style={{ color: "var(--color-muted)" }}>
            {t("cumBreakdown", { sem: fmt(semGpa), prev: hasPrev ? fmt(pGpa) : "—", next: fmt(newGpa) })}
          </p>
        </section>

        <p className="text-[11px] text-center -mt-1" style={{ color: "var(--color-muted)" }}>{t("cumNote")}</p>
      </div>
    </Modal>
  );
}
