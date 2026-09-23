"use client";

import { useEffect, useState } from "react";
import { useStore, useScheme } from "@/store";
import { useT } from "@/i18n";
import { UNIVERSITIES } from "@/lib/tools/universities";
import { normalizeArabicDigits } from "@/lib/dates";
import type { TranslationKey } from "@/i18n/translations/en";

const fieldClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";
const fieldStyle: React.CSSProperties = {
  borderColor: "var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-ink)",
};

const LEVELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

// A "level" (مستوى) is a study term; even the longest programmes worldwide
// (6-year medicine/pharmacy counted by semester, plus a preparatory year) stay
// well under this. It only guards the free-typed custom box against nonsense
// like 99 or 500 — text levels ("تمهيدي"، "امتياز") are left alone.
const LEVEL_MAX = 20;
const LEVEL_TEXT_MAX = 24;

/** Sanitise a hand-typed custom level: a pure number (Arabic or ASCII digits)
 *  is clamped into a sane range so absurd values can't be saved; anything else
 *  is treated as free text and just length-capped. An empty string passes
 *  through so the field can be cleared while editing. */
function sanitizeLevel(raw: string): string {
  const s = normalizeArabicDigits(raw.trim()); // Arabic-Indic → ASCII
  // A value with any letter is a named level ("تمهيدي"، "امتياز") — leave it be.
  if (/\p{L}/u.test(s)) return raw.slice(0, LEVEL_TEXT_MAX);
  // Otherwise it's meant to be a number: keep digits only (dropping any sign,
  // dot or space), so negatives and decimals can't slip through, then clamp.
  const digits = s.replace(/\D/g, "");
  if (digits === "") return "";
  const n = Math.min(LEVEL_MAX, Math.max(1, parseInt(digits, 10)));
  return String(n);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-4 first:pt-0 last:pb-0">
      <label className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
        {label}
      </label>
      <div className="sm:w-64">{children}</div>
    </div>
  );
}

/** Editor for the student's academic profile (university / major / level).
 *  Persists through the store, which also applies a known university's حرمان
 *  limit to the semester. */
export function AcademicSettings() {
  const { t, lang } = useT();
  const { academic, setAcademic } = useStore();

  // "other" keeps the university free-typed; a known slug is selected from the list.
  const isOtherUni = academic.universitySlug === "other";
  // A numeric stored level maps onto the dropdown; anything else is "custom".
  const isCustomLevel = academic.level.trim() !== "" && !LEVELS.includes(academic.level.trim());
  // "" is ambiguous (nothing chosen vs. custom-but-empty), so a local flag keeps
  // the custom text box open after the user picks "custom" but before they type.
  const [levelCustomMode, setLevelCustomMode] = useState(isCustomLevel);
  useEffect(() => {
    // Only ever turn custom mode ON here (a stored custom-text value on load).
    // Turning it OFF is the select's job — otherwise typing a 1–10 number into
    // the box would flip isCustomLevel false and collapse the field mid-edit,
    // so a two-digit level like "11" could never be typed past its first digit.
    if (isCustomLevel) setLevelCustomMode(true);
  }, [isCustomLevel]);
  const showCustomLevel = levelCustomMode || isCustomLevel;
  const levelSelectValue = showCustomLevel ? "custom" : academic.level;

  // The GPA system: "auto" (default) is detected from the university; the rest
  // force a scheme. Show the auto-detected result so the choice is transparent.
  const schemeValue = academic.gpaSchemeId ?? "auto";
  const detected = useScheme();

  return (
    <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
      {/* University */}
      <Row label={t("universityLabel")}>
        <div className="flex flex-col gap-2">
          <select
            className={fieldClass}
            style={fieldStyle}
            value={academic.universitySlug ?? ""}
            onChange={(e) => {
              const slug = e.target.value;
              if (slug === "") {
                setAcademic({ universitySlug: null, universityName: "" });
              } else if (slug === "other") {
                setAcademic({ universitySlug: "other", universityName: "" });
              } else {
                const uni = UNIVERSITIES.find((u) => u.slug === slug);
                setAcademic({ universitySlug: slug, universityName: uni?.name ?? "" });
              }
            }}
          >
            <option value="">{t("universitySelectPlaceholder")}</option>
            {UNIVERSITIES.map((u) => (
              <option key={u.slug} value={u.slug}>
                {lang === "en" ? u.nameEn : u.name}
              </option>
            ))}
            <option value="other">{t("universityOther")}</option>
          </select>
          {isOtherUni && (
            <input
              type="text"
              className={fieldClass}
              style={fieldStyle}
              placeholder={t("universityCustomPlaceholder")}
              value={academic.universityName}
              onChange={(e) => setAcademic({ universityName: e.target.value })}
            />
          )}
        </div>
      </Row>

      {/* GPA system — auto-detected from the university, overridable */}
      <Row label={t("gpaSchemeLabel")}>
        <div className="flex flex-col gap-2">
          <select
            className={fieldClass}
            style={fieldStyle}
            value={schemeValue}
            onChange={(e) =>
              setAcademic({
                gpaSchemeId: e.target.value as
                  | "auto"
                  | "saudi5"
                  | "saudi4"
                  | "percentage"
                  | "plusminus4",
              })
            }
          >
            <option value="auto">{t("gpaSchemeAuto")}</option>
            <option value="saudi5">{t("gradeScheme5")}</option>
            <option value="saudi4">{t("gradeScheme4")}</option>
            <option value="plusminus4">{t("gradeSchemePlusMinus")}</option>
            <option value="percentage">{t("gradeSchemePercent")}</option>
          </select>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            {schemeValue === "auto"
              ? t("gpaSchemeDetected", { scheme: t(detected.labelKey as TranslationKey) })
              : t("gpaSchemeHint")}
          </p>
        </div>
      </Row>

      {/* Major */}
      <Row label={t("majorLabel")}>
        <input
          type="text"
          className={fieldClass}
          style={fieldStyle}
          placeholder={t("majorPlaceholder")}
          value={academic.major}
          onChange={(e) => setAcademic({ major: e.target.value })}
        />
      </Row>

      {/* Level */}
      <Row label={t("levelLabel")}>
        <div className="flex flex-col gap-2">
          <select
            className={fieldClass}
            style={fieldStyle}
            value={levelSelectValue}
            onChange={(e) => {
              const v = e.target.value;
              // Custom opens the text box (starting empty); anything else stores
              // the picked value and leaves custom mode.
              setLevelCustomMode(v === "custom");
              setAcademic({ level: v === "custom" ? "" : v });
            }}
          >
            <option value="">{t("levelSelectPlaceholder")}</option>
            {LEVELS.map((n) => (
              <option key={n} value={n}>
                {t("levelOption", { n })}
              </option>
            ))}
            <option value="custom">{t("levelCustom")}</option>
          </select>
          {showCustomLevel && (
            <input
              type="text"
              inputMode="numeric"
              maxLength={LEVEL_TEXT_MAX}
              className={fieldClass}
              style={fieldStyle}
              placeholder={t("levelCustomPlaceholder")}
              value={academic.level}
              onChange={(e) => setAcademic({ level: sanitizeLevel(e.target.value) })}
            />
          )}
        </div>
      </Row>
    </div>
  );
}
