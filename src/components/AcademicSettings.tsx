"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { UNIVERSITIES } from "@/lib/tools/universities";
import { normalizeArabicDigits } from "@/lib/dates";
import { detectScheme, gradeTableStatus, schemeById } from "@/lib/gradeSchemes";
import { typedUniversityNames, universityChoices } from "@/lib/universityCountry";
import { COUNTRY_LABEL, withCountry } from "@/lib/universityPick";
import { GradeTableSection, SchemeChips } from "./GradeTableCheck";
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
export function AcademicSettings({ showScheme = true }: { showScheme?: boolean } = {}) {
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

  const [editingTable, setEditingTable] = useState(false);

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
              list="haven-university-catalog"
              value={academic.universityName}
              onChange={(e) => setAcademic({ universityName: e.target.value })}
            />
          )}
          {isOtherUni && <UniversityCatalogList />}
          {isOtherUni && <SameNameChoice />}
          {/* Until the name is recognised: the table (and so the GPA) comes
              from matching it, so ask for the full, correct name. */}
          {isOtherUni && detectScheme(academic).source === "default" && (
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>
              {t("universityNameHint")}
            </p>
          )}
        </div>
      </Row>

      {/* GPA system — auto-detected from the university, overridable */}
      {showScheme && (
        <div className="py-4 flex flex-col gap-3">
          <GradeTableSection editing={editingTable} setEditing={setEditingTable} />
          <SchemePicker onCustom={() => setEditingTable(true)} />
        </div>
      )}

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

/** Suggestions for the typed university name: every catalogue university, in
 *  both languages, so picking one gives an exact match. */
function UniversityCatalogList() {
  const names = useMemo(() => [...new Set(typedUniversityNames())], []);
  return (
    <datalist id="haven-university-catalog">
      {names.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  );
}

/** A typed name that universities in different countries share: each one with
 *  its country, to pick from (saved with the country, lib/universityPick). */
function SameNameChoice() {
  const { t, lang } = useT();
  const { academic, setAcademic } = useStore();
  const choices = useMemo(() => universityChoices(academic.universityName), [academic.universityName]);
  if (!choices) return null;
  return (
    <div
      className="rounded-xl border p-3 flex flex-col gap-2"
      style={{ borderColor: "var(--color-warning)", background: "var(--color-surface)" }}
      role="group"
      aria-label={t("uniSameNameTitle")}
    >
      <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
        {t("uniSameNameTitle")}
      </p>
      <p className="text-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>
        {t("uniSameNameBody")}
      </p>
      <div className="flex flex-col gap-1.5">
        {choices.map((c) => {
          const name = lang === "en" ? c.en : c.ar;
          const country = COUNTRY_LABEL[c.country]?.[lang] ?? c.country;
          return (
            <button
              key={`${c.ar}|${c.country}`}
              type="button"
              onClick={() => setAcademic({ universityName: withCountry(name, c.country, lang) })}
              className="text-start rounded-lg border px-3 py-2 text-sm transition-colors hover:border-[var(--color-primary)]"
              style={{ borderColor: "var(--color-border)", color: "var(--color-ink)", background: "transparent" }}
            >
              <span className="font-medium">{name}</span>
              <span style={{ color: "var(--color-muted)" }}> · {t("uniSameNameIn", { country })}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The GPA-system picker: a family (auto / 5 / 4 / % / the student's own
 *  table), with the points table in use and a way to correct it. */
export function SchemePicker({ onCustom }: { onCustom: () => void }) {
  const { t, lang } = useT();
  const { academic, setAcademic } = useStore();
  const { scheme: detected, source, catalog } = detectScheme(academic);
  // A table matched from the student's university is named after it: the same
  // table can be shared (Abu Dhabi University's equals Qatar University's), and
  // "Detected: Qatar University" would read as the wrong university.
  const detectedName = catalog ? (lang === "en" ? catalog.en : catalog.ar) : t(detected.labelKey as TranslationKey);
  const schemeValue = academic.gpaSchemeId ?? "auto";
  const familyValue = schemeValue === "auto" ? "auto" : schemeValue === "custom" ? "custom" : detected.family;
  const status = gradeTableStatus(academic);
  const unknown = status === "unknown";

  return (
    <div>
      <Row label={t("gpaSchemeLabel")}>
        <div className="flex flex-col gap-2">
          <select
            className={fieldClass}
            style={fieldStyle}
            value={familyValue}
            onChange={(e) => {
              const f = e.target.value;
              if (f === "auto") setAcademic({ gpaSchemeId: "auto" });
              else if (f === "5") setAcademic({ gpaSchemeId: "saudi5" });
              else if (f === "percent") setAcademic({ gpaSchemeId: "percentage" });
              else if (f === "custom") {
                if (academic.customScheme) setAcademic({ gpaSchemeId: "custom" });
                else onCustom();
              }
              // "Out of 4" tables differ between universities (the catalogue
              // has 91 of them), so keep the detected one when it is a 4.0
              // system and otherwise start on the most common; the chips below
              // show it and "edit the table" fixes whatever differs.
              else setAcademic({ gpaSchemeId: schemeById(detected.id)?.family === "4" ? schemeById(detected.id)!.id : "plusminus4" });
            }}
          >
            <option value="auto">{t("gpaSchemeAuto")}</option>
            <option value="5">{t("gradeScheme5")}</option>
            <option value="4">{t("gpaFamily4")}</option>
            <option value="percent">{t("gradeSchemePercent")}</option>
            <option value="custom">{t("gpaFamilyCustom")}</option>
          </select>
          <p className="text-xs" style={{ color: unknown ? "var(--color-warning)" : "var(--color-muted)" }}>
            {unknown
              ? t("gpaSchemeUnknown")
              : schemeValue === "auto"
              ? t("gpaSchemeDetected", { scheme: detectedName })
              : t("gpaSchemeHint")}
          </p>
          {/* The table in use, so the student can hold it next to their
              university's. A table still awaiting confirmation shows it in the
              status card above. */}
          {!unknown && status !== "confirm" && (
            <div>
              <SchemeChips scheme={detected} />
              {source !== "custom" && (
                <p className="mt-1.5 text-xs flex flex-wrap items-center gap-x-2" style={{ color: "var(--color-muted)" }}>
                  <span>{t("gpaSchemeTableDiffers")}</span>
                  <button type="button" onClick={onCustom} className="font-medium underline underline-offset-2" style={{ color: "var(--color-primary)" }}>
                    {t("gt_editTable")}
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
      </Row>

      {detected.approxCutoffs && (
        <p className="mt-2 text-xs" style={{ color: "var(--color-muted)" }}>
          {t(source === "catalog" || source === "custom" ? "gpaSchemeApproxCatalog" : "gpaSchemeApprox")}
        </p>
      )}
      {detected.learnedCutoffs && (
        <p className="mt-2 text-xs" style={{ color: "var(--color-muted)" }}>
          {t("gpaSchemeLearned")}
        </p>
      )}
    </div>
  );
}
