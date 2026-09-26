"use client";

// The student's side of the university points-table catalogue:
//   • a table detected from the unverified catalogue is shown for the student
//     to confirm ("does it match your university's?");
//   • a "no", or a university we don't have at all, invites them — gently — to
//     enter their university's table, which then drives their GPA;
//   • every answer is reported to the admin activity feed so the catalogue can
//     be corrected for everyone at that university.
// Used in the Profile page's academic settings and in the SetupCheck window.

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { universityBySlug } from "@/lib/tools/universities";
import {
  detectScheme,
  gradeTableStatus,
  passMark,
  type GradeScheme,
  type SchemeDetection,
} from "@/lib/gradeSchemes";
import type { CustomSchemeData } from "@/types";

const COUNTRY_AR: Record<string, string> = {
  Azerbaijan: "أذربيجان", Armenia: "أرمينيا", Australia: "أستراليا", Germany: "ألمانيا", Indonesia: "إندونيسيا",
  "United Arab Emirates": "الإمارات", Bahrain: "البحرين", Syria: "سوريا", Denmark: "الدنمارك", Somalia: "الصومال",
  China: "الصين", Iraq: "العراق", Kuwait: "الكويت", Morocco: "المغرب", Jordan: "الأردن", "Saudi Arabia": "السعودية",
  "United Kingdom": "المملكة المتحدة", India: "الهند", "United States": "الولايات المتحدة", Japan: "اليابان",
  Brunei: "بروناي", Bangladesh: "بنغلادش", Thailand: "تايلاند", Taiwan: "تايوان", Turkey: "تركيا", Tunisia: "تونس",
  Egypt: "مصر", Georgia: "جورجيا", Oman: "عُمان", Singapore: "سنغافورة", France: "فرنسا", Palestine: "فلسطين",
  Qatar: "قطر", Canada: "كندا", "South Korea": "كوريا الجنوبية", Lebanon: "لبنان", Libya: "ليبيا",
  Malaysia: "ماليزيا", "New Zealand": "نيوزيلندا", Netherlands: "هولندا", "Hong Kong": "هونغ كونغ",
};

const fieldClass =
  "w-full rounded-lg border px-2.5 py-2 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";
const fieldStyle: React.CSSProperties = {
  borderColor: "var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-ink)",
};

/** Display name + country of the student's university, however it was set. */
function useUniversityLabel(d: SchemeDetection): { name: string; country: string } {
  const { academic } = useStore();
  const { lang } = useT();
  if (d.catalog) {
    const c = d.catalog.country;
    return { name: lang === "en" ? d.catalog.en : d.catalog.ar, country: lang === "en" ? c : COUNTRY_AR[c] ?? c };
  }
  const known = academic.universitySlug && academic.universitySlug !== "other" ? universityBySlug(academic.universitySlug) : undefined;
  return { name: known ? (lang === "en" ? known.nameEn : known.name) : academic.universityName.trim(), country: "" };
}

/** A scheme's full table as small chips, so the student can hold it next to
 *  their university's. Failing grades are muted. */
export function SchemeChips({ scheme, onSurface = false }: { scheme: GradeScheme; onSurface?: boolean }) {
  const pass = passMark(scheme);
  return (
    <div dir={scheme.percent ? undefined : "ltr"} className="mt-2 flex flex-wrap gap-1 justify-end">
      {scheme.bands.map((b, i) => (
        <span
          key={`${b.letter}-${i}`}
          className="rounded-md px-1.5 py-0.5 text-[11px] tabular-nums"
          style={{
            background: onSurface ? "var(--color-surface)" : "var(--color-canvas)",
            color: b.min >= pass ? "var(--color-ink)" : "var(--color-muted)",
          }}
        >
          {scheme.percent ? `${b.letter} ${b.min}–${i === 0 ? 100 : scheme.bands[i - 1].min}` : `${b.letter} ${b.points}`}
        </span>
      ))}
    </div>
  );
}

function Btn({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={primary ? "haven-btn rounded-xl px-4 py-2 text-sm font-semibold" : "rounded-xl px-4 py-2 text-sm font-medium border"}
      style={primary ? undefined : { borderColor: "var(--color-border)", color: "var(--color-ink)", background: "var(--color-surface)" }}
    >
      {children}
    </button>
  );
}

function Panel({ tone, children }: { tone: "primary" | "warning"; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-3.5 py-3"
      style={{
        background:
          tone === "primary"
            ? "var(--color-primary-soft)"
            : "color-mix(in srgb, var(--color-warning) 12%, transparent)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * The status card for the student's points table. Renders nothing when there
 * is nothing to ask or say (a verified university, or a system picked by hand).
 * `inSetup` = inside the SetupCheck window (fuller wording, no "change" link).
 */
export function GradeTableStatusCard({ onEdit, inSetup = false }: { onEdit: () => void; inSetup?: boolean }) {
  const { t } = useT();
  const { academic, setAcademic, reportGradeTable } = useStore();
  const d = detectScheme(academic);
  const status = gradeTableStatus(academic);
  const { name, country } = useUniversityLabel(d);

  const tableMeta = () => ({
    university: name,
    country: d.catalog?.country ?? "",
    catalogSlug: d.catalog?.slug ?? null,
    table: d.scheme.bands.map((b) => [b.letter, d.scheme.percent ? b.min : b.points]),
  });
  const answer = (yes: boolean) => {
    if (!d.catalog) return;
    setAcademic({ gradeCheck: { key: d.catalog.slug, answer: yes ? "yes" : "no", at: new Date().toISOString() } });
    reportGradeTable(yes ? "grade_table_confirmed" : "grade_table_rejected", tableMeta());
  };

  if (status === "confirm") {
    return (
      <Panel tone="primary">
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          {t("gt_foundTitle", { uni: country ? `${name} (${country})` : name })}
        </p>
        <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--color-ink)" }}>
          {t(d.scheme.percent ? "gt_percentBody" : "gt_foundBody")}
        </p>
        <SchemeChips scheme={d.scheme} onSurface />
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn primary onClick={() => answer(true)}>{t("gt_yes")}</Btn>
          <Btn onClick={() => answer(false)}>{t("gt_no")}</Btn>
        </div>
        <p className="text-[11.5px] mt-2.5" style={{ color: "var(--color-muted)" }}>
          {t("gt_sourceNote")}
        </p>
      </Panel>
    );
  }

  if (status === "rejected") {
    return (
      <Panel tone="warning">
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          {t("gt_rejectedTitle")}
        </p>
        <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--color-ink)" }}>
          {t(inSetup ? "gt_rejectedBody" : "gt_rejectedStill")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn primary onClick={onEdit}>{t("gt_enterTable")}</Btn>
        </div>
      </Panel>
    );
  }

  if (status === "unknown") {
    return (
      <Panel tone="warning">
        <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          {t("gt_unknownTitle", { uni: name })}
        </p>
        <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--color-ink)" }}>
          {t("gt_unknownBody")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={onEdit}>{t("gt_enterTable")}</Btn>
        </div>
      </Panel>
    );
  }

  if (d.source === "custom") {
    return (
      <p className="text-xs flex flex-wrap items-center gap-x-2" style={{ color: "var(--color-muted)" }}>
        <span>{t("gt_customActive", { max: d.scheme.max })}</span>
        <button type="button" onClick={onEdit} className="font-medium underline underline-offset-2" style={{ color: "var(--color-primary)" }}>
          {t("gt_editTable")}
        </button>
      </p>
    );
  }

  if (d.source === "catalog" && !inSetup) {
    // Confirmed: a quiet line, with a way back if they answered by mistake.
    return (
      <p className="text-xs flex flex-wrap items-center gap-x-2" style={{ color: "var(--color-success)" }}>
        <span>{t("gt_confirmed")}</span>
        <button
          type="button"
          onClick={() => setAcademic({ gradeCheck: undefined })}
          className="font-medium underline underline-offset-2"
          style={{ color: "var(--color-muted)" }}
        >
          {t("gt_change")}
        </button>
      </p>
    );
  }
  if (d.source === "catalog") {
    return (
      <p className="text-[13px]" style={{ color: "var(--color-success)" }}>
        {t("gt_confirmed")}
      </p>
    );
  }
  return null;
}

interface Row {
  letter: string;
  points: string;
  min: string;
}

const toRows = (s: GradeScheme): Row[] =>
  s.bands.map((b, i) => ({
    letter: b.letter,
    points: s.percent ? "" : String(b.points),
    // Estimated cutoffs are never offered as if they were the university's.
    min: i === s.bands.length - 1 || (s.approxCutoffs && !s.percent) ? "" : String(b.min),
  }));

/**
 * Enter (or correct) the university's points table. Prefilled from the table
 * in use, so a student whose table is almost right only fixes what differs.
 */
export function GradeTableForm({ onDone }: { onDone: (saved: boolean) => void }) {
  const { t } = useT();
  const { academic, setAcademic, reportGradeTable } = useStore();
  const d = detectScheme(academic);
  const { name } = useUniversityLabel(d);
  const percent = !!d.scheme.percent;
  const [max, setMax] = useState(String(d.scheme.max));
  const [rows, setRows] = useState<Row[]>(() => toRows(d.scheme));
  const [error, setError] = useState("");

  const edit = (i: number, patch: Partial<Row>) => {
    setError("");
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

  const save = () => {
    const filled = rows.filter((r) => r.letter.trim());
    if (filled.length < 2) return setError(t("gt_formErrRows"));
    const top = percent ? 100 : num(max);
    if (top === null || !(top > 0) || top > 1000) return setError(t("gt_formErrMax"));
    const points = filled.map((r) => (percent ? 0 : num(r.points)));
    if (points.some((p) => p === null || !(p >= 0) || p > top)) return setError(t("gt_formErrPoints", { max: top }));
    const mins = filled.map((r, i) => (i === filled.length - 1 ? 0 : num(r.min)));
    const given = mins.slice(0, -1);
    const anyMin = given.some((m) => m !== null);
    if (percent || anyMin) {
      const ok = given.every((m, i) => m !== null && m > 0 && m <= 100 && (i === 0 || m < given[i - 1]!));
      if (!ok) return setError(t("gt_formErrMin"));
    }
    const data: CustomSchemeData = {
      max: top,
      ...(percent ? { percent: true } : {}),
      bands: filled.map((r, i) => ({
        letter: r.letter.trim().slice(0, 24),
        points: points[i]!,
        min: percent || anyMin ? mins[i] : null,
      })),
    };
    setAcademic({
      gpaSchemeId: "custom",
      customScheme: data,
      ...(d.catalog ? { gradeCheck: { key: d.catalog.slug, answer: "no" as const, at: new Date().toISOString() } } : {}),
    });
    reportGradeTable("grade_table_submitted", {
      university: name,
      country: d.catalog?.country ?? "",
      catalogSlug: d.catalog?.slug ?? null,
      previous: d.scheme.bands.map((b) => [b.letter, percent ? b.min : b.points]),
      table: data,
    });
    onDone(true);
  };

  const cols = percent ? "grid-cols-[1fr_5.5rem_2rem]" : "grid-cols-[1fr_4rem_4rem_2rem]";
  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
        {t("gt_formTitle")}
        {name ? ` · ${name}` : ""}
      </p>
      <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--color-muted)" }}>
        {t("gt_formIntro")}
      </p>

      {!percent && (
        <label className="mt-3 flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
            {t("gt_formMax")}
          </span>
          <input
            type="text"
            inputMode="decimal"
            className={fieldClass}
            style={{ ...fieldStyle, width: "5rem" }}
            value={max}
            onChange={(e) => {
              setError("");
              setMax(e.target.value);
            }}
          />
        </label>
      )}

      <div className={`mt-3 grid ${cols} gap-1.5 text-[11px] font-medium`} style={{ color: "var(--color-muted)" }}>
        <span>{t("gt_formLetter")}</span>
        {!percent && <span>{t("gt_formPoints")}</span>}
        <span>{t("gt_formMin")}</span>
        <span />
      </div>
      <div className="mt-1 flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <div key={i} className={`grid ${cols} gap-1.5 items-center`}>
            <input
              type="text"
              maxLength={24}
              dir="auto"
              className={fieldClass}
              style={fieldStyle}
              value={r.letter}
              onChange={(e) => edit(i, { letter: e.target.value })}
              aria-label={t("gt_formLetter")}
            />
            {!percent && (
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                className={fieldClass}
                style={fieldStyle}
                value={r.points}
                onChange={(e) => edit(i, { points: e.target.value })}
                aria-label={t("gt_formPoints")}
              />
            )}
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              className={fieldClass}
              style={{ ...fieldStyle, opacity: i === rows.length - 1 ? 0.5 : 1 }}
              value={i === rows.length - 1 ? "0" : r.min}
              disabled={i === rows.length - 1}
              onChange={(e) => edit(i, { min: e.target.value })}
              aria-label={t("gt_formMin")}
            />
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              className="inline-flex items-center justify-center rounded-lg h-8 w-8"
              style={{ color: "var(--color-muted)" }}
              aria-label={t("gt_formRemove")}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRows((rs) => [...rs, { letter: "", points: "", min: "" }])}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
        style={{ color: "var(--color-primary)" }}
      >
        <Plus size={14} />
        {t("gt_formAddRow")}
      </button>

      <p className="text-[11.5px] mt-3" style={{ color: "var(--color-muted)" }}>
        {t("gt_formShareNote")}
      </p>
      {error && (
        <p className="text-xs mt-2" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Btn onClick={() => onDone(false)}>{t("gt_formCancel")}</Btn>
        <Btn primary onClick={save}>{t("gt_formSave")}</Btn>
      </div>
    </div>
  );
}

/** The status card, swapping to the table form while the student edits it and
 *  thanking them once a table is saved. */
export function GradeTableSection({
  inSetup = false,
  editing,
  setEditing,
}: {
  inSetup?: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
}) {
  const { t } = useT();
  const [saved, setSaved] = useState(false);
  if (editing) {
    return (
      <GradeTableForm
        onDone={(ok) => {
          setSaved(ok);
          setEditing(false);
        }}
      />
    );
  }
  return (
    <>
      {saved && (
        <p className="text-[13px] font-medium" style={{ color: "var(--color-success)" }}>
          {t("gt_saved")}
        </p>
      )}
      <GradeTableStatusCard inSetup={inSetup} onEdit={() => setEditing(true)} />
    </>
  );
}
