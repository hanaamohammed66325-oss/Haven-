"use client";

import { useMemo, useState } from "react";
import { Plus, X, RotateCcw, CalendarDays, Check } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { DateField } from "./DateField";
import {
  resolveHolidaysForSemester,
  type ResolvedHoliday,
} from "@/lib/holidays";
import { formatShortDate, addDays, toISODate } from "@/lib/dates";
import { HolidayCountryNote } from "./HolidayCountryNote";
import type { CustomHoliday } from "@/types";
import { holidayCalendar, universityCountry } from "@/lib/universityCountry";
import { UNI_HOLIDAY_PREFIX } from "@/lib/universityFacts";
import { universityCalendar } from "@/lib/countryHolidays";

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
  const { semester, academic, setSemester, setAcademic } = useStore();

  const hasDates = Boolean(semester?.startDate && semester?.endDate);
  const calendar = holidayCalendar(academic);
  // A university outside Saudi Arabia: its students confirm its holidays, and
  // their answers (with what they removed or added) reach the admin page.
  const asksCheck = !!academic.universityName.trim() && universityCountry(academic) !== "SA";
  const checked = academic.holidayCheck?.calendar === calendar;
  // A calendar gathered from its students' reports isn't "official".
  const own = universityCalendar(calendar);
  const fromStudents = !!own && "source" in own && own.source === "students";
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
      calendar,
    });
  }, [hasDates, semester?.startDate, semester?.endDate, calendar]);

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
      <HolidayCountryNote className="mb-4" />

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
                  {fmtRange(h.startDate, h.endDate)} · {t(fromStudents ? "holidaySuggested" : "holidayOfficial")}
                  {h.estimated ? ` · ${t("holidayEstimated")}` : ""}
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
                {fmtRange(c.startDate, c.endDate)} · {t(c.id.startsWith(UNI_HOLIDAY_PREFIX) ? "holidayFromUniversity" : "holidayCustom")}
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

      {asksCheck &&
        (checked ? (
          <p className="mt-5 flex items-start gap-2 text-[13px]" style={{ color: "var(--color-muted)" }}>
            <Check size={15} className="mt-0.5 shrink-0" style={{ color: "var(--color-primary)" }} />
            {t("holidayCheckDone")}
          </p>
        ) : (
          <div className="mt-5 rounded-xl border p-4" style={rowStyle}>
            <div className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              {t("holidayCheckTitle")}
            </div>
            <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--color-muted)" }}>
              {t("holidayCheckBody")}
            </p>
            <button
              type="button"
              onClick={() => setAcademic({ holidayCheck: { calendar, at: new Date().toISOString() } })}
              className="inline-flex items-center gap-2 mt-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: "var(--color-primary)" }}
            >
              <Check size={16} />
              {t("holidayCheckBtn")}
            </button>
          </div>
        ))}
    </div>
  );
}
