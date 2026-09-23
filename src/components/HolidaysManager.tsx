"use client";

import { useMemo, useState } from "react";
import { Plus, X, RotateCcw, CalendarDays } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { DateField } from "./DateField";
import {
  resolveHolidaysForSemester,
  type ResolvedHoliday,
} from "@/lib/holidays";
import { formatShortDate, addDays, toISODate } from "@/lib/dates";
import type { CustomHoliday } from "@/types";

const fieldClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

/**
 * Holidays manager — the student's control over which breaks apply to their
 * حرمان math, so the app can match a university's real, recently published
 * calendar instead of a single fixed list.
 *   • Built-in (official) holidays for the term can be dismissed / restored.
 *   • Custom holidays (any range, incl. a whole week) can be added / deleted.
 * All of it persists per-account in preferences via setSemester — no DB column.
 */
export function HolidaysManager() {
  const { t, lang } = useT();
  const { semester, academic, setSemester } = useStore();

  const hasDates = Boolean(semester?.startDate && semester?.endDate);
  const dismissed = useMemo(
    () => semester?.dismissedHolidays ?? [],
    [semester?.dismissedHolidays]
  );
  const custom = useMemo(
    () => semester?.customHolidays ?? [],
    [semester?.customHolidays]
  );

  // Every built-in holiday for this term regardless of dismiss state, so a
  // dismissed one can still be listed (greyed) with a restore control.
  const builtins = useMemo<ResolvedHoliday[]>(() => {
    if (!hasDates) return [];
    return resolveHolidaysForSemester(semester.startDate, semester.endDate, {
      universitySlug: academic?.universitySlug,
    });
  }, [hasDates, semester?.startDate, semester?.endDate, academic?.universitySlug]);

  const cal = semester?.calendarType ?? "gregorian";
  const fmtRange = (start: string, end: string) =>
    start === end
      ? formatShortDate(start, lang, cal)
      : `${formatShortDate(start, lang, cal)} – ${formatShortDate(end, lang, cal)}`;

  const dismiss = (id: string) =>
    setSemester({ dismissedHolidays: [...new Set([...dismissed, id])] });
  const restore = (id: string) =>
    setSemester({ dismissedHolidays: dismissed.filter((x) => x !== id) });
  const deleteCustom = (id: string) =>
    setSemester({
      customHolidays: custom.filter((c) => c.id !== id),
      // A custom holiday can also carry a dismiss flag; drop it on delete so a
      // recycled id can't stay hidden.
      dismissedHolidays: dismissed.filter((x) => x !== id),
    });

  // ── add form ──────────────────────────────────────────────────────────────
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState(semester?.startDate ?? "");
  const [end, setEnd] = useState(semester?.startDate ?? "");
  const [err, setErr] = useState("");

  const wholeWeek = () => {
    if (!start) return;
    setEnd(toISODate(addDays(new Date(`${start}T00:00:00`), 6)));
  };

  const submit = () => {
    const nm = name.trim();
    if (!nm) {
      setErr(t("holidayErrName"));
      return;
    }
    if (!start || !end) {
      setErr(t("holidayErrDates"));
      return;
    }
    if (end < start) {
      setErr(t("holidayErrOrder"));
      return;
    }
    const entry: CustomHoliday = {
      id: `custom-${Date.now()}`,
      name: nm,
      startDate: start,
      endDate: end,
    };
    setSemester({ customHolidays: [...custom, entry] });
    setName("");
    setErr("");
    setAdding(false);
  };

  if (!hasDates) {
    return (
      <p className="text-[13px]" style={{ color: "var(--color-muted)" }}>
        {t("holidaysNeedDates")}
      </p>
    );
  }

  const rowStyle = { borderColor: "var(--color-border)" };

  return (
    <div>
      <p className="text-[13px] mb-4 -mt-1" style={{ color: "var(--color-muted)" }}>
        {t("holidaysDesc")}
      </p>

      <ul className="divide-y" style={rowStyle}>
        {builtins.map((h) => {
          const off = dismissed.includes(h.id);
          return (
            <li key={h.id} className="flex items-center gap-3 py-3 first:pt-0">
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-medium truncate"
                  style={{
                    color: off ? "var(--color-muted)" : "var(--color-ink)",
                    textDecoration: off ? "line-through" : undefined,
                  }}
                >
                  {lang === "ar" ? h.nameAr : h.nameEn}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                  {fmtRange(h.startDate, h.endDate)} · {t("holidayOfficial")}
                </div>
              </div>
              {off ? (
                <button
                  type="button"
                  onClick={() => restore(h.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shrink-0 transition-colors"
                  style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
                >
                  <RotateCcw size={13} />
                  {t("holidayRestore")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => dismiss(h.id)}
                  aria-label={t("holidayRemove")}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shrink-0 transition-colors"
                  style={{ background: "#FDEAEA", color: "var(--color-danger)" }}
                >
                  <X size={13} />
                  {t("holidayRemove")}
                </button>
              )}
            </li>
          );
        })}

        {custom.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-3 first:pt-0">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: "var(--color-ink)" }}>
                {c.name}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                {fmtRange(c.startDate, c.endDate)} · {t("holidayCustom")}
              </div>
            </div>
            <button
              type="button"
              onClick={() => deleteCustom(c.id)}
              aria-label={t("holidayDelete")}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shrink-0 transition-colors"
              style={{ background: "#FDEAEA", color: "var(--color-danger)" }}
            >
              <X size={13} />
              {t("holidayDelete")}
            </button>
          </li>
        ))}

        {!builtins.length && !custom.length && (
          <li className="py-3 text-[13px]" style={{ color: "var(--color-muted)" }}>
            {t("holidaysEmpty")}
          </li>
        )}
      </ul>

      {/* Add a custom holiday */}
      {adding ? (
        <div className="mt-4 rounded-xl border p-4" style={rowStyle}>
          <input
            className={fieldClass}
            style={rowStyle}
            value={name}
            placeholder={t("holidayNamePlaceholder")}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--color-muted)" }}>
                {t("holidayStart")}
              </label>
              <DateField
                calendar={cal}
                className={fieldClass}
                style={rowStyle}
                value={start}
                onChange={(v) => {
                  setStart(v);
                  if (!end || end < v) setEnd(v);
                }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--color-muted)" }}>
                {t("holidayEnd")}
              </label>
              <DateField
                calendar={cal}
                className={fieldClass}
                style={rowStyle}
                value={end}
                onChange={setEnd}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={wholeWeek}
            className="inline-flex items-center gap-1.5 mt-3 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
          >
            <CalendarDays size={13} />
            {t("holidayWholeWeek")}
          </button>
          {err && (
            <p className="text-xs mt-3" style={{ color: "var(--color-danger)" }}>
              {err}
            </p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setErr("");
                setName("");
              }}
              className="px-4 py-2 rounded-xl text-sm font-medium border"
              style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={submit}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white"
              style={{ background: "var(--color-primary)" }}
            >
              {t("holidayAdd")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setStart(semester.startDate);
            setEnd(semester.startDate);
            setAdding(true);
          }}
          className="inline-flex items-center gap-2 mt-4 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
          style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
        >
          <Plus size={16} />
          {t("holidayAddBtn")}
        </button>
      )}
    </div>
  );
}
