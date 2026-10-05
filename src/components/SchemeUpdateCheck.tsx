"use client";

// The pop-up shown once to a student whose university's GPA system was
// corrected to match its official regulation (lib/schemeUpdates). Gentle by
// design: it says what changed and asks whether he agrees — yes puts him on the
// university's official table, no keeps the system he has (an automatic student
// goes back to the one he had), and "my own table" opens the existing table form. The answer is stored on his profile and reported to the
// admin feed; per AGENTS.md a student's answer never approves an official rule,
// it only tells us how the change landed.

import { useState } from "react";
import { Calculator } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Modal } from "./Modal";
import { GradeTableForm, SchemeChips } from "./GradeTableCheck";
import { schemeById } from "@/lib/gradeSchemes";
import { universityBySlug } from "@/lib/tools/universities";
import type { SchemeUpdate } from "@/lib/schemeUpdates";

type Answer = "yes" | "no" | "custom";

const btn = "rounded-xl px-4 py-2.5 text-sm font-semibold";
const ghost: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  color: "var(--color-ink)",
  background: "var(--color-surface)",
};

export function SchemeUpdateBody({ update, onDone }: { update: SchemeUpdate; onDone: () => void }) {
  const { t, lang } = useT();
  const { academic, setAcademic, reportGradeTable } = useStore();
  const [editing, setEditing] = useState(false);
  // A student who picked a system by hand compares against that one; an automatic
  // student against what the automatic system gave him before the update.
  const manual = academic.gpaSchemeId && academic.gpaSchemeId !== "auto" ? schemeById(academic.gpaSchemeId) : undefined;
  const before = manual ?? schemeById(update.previous);
  const after = schemeById(update.next);
  const uni = universityBySlug(update.slug);
  const name = uni ? (lang === "en" ? uni.nameEn : uni.name) : academic.universityName;
  if (!before || !after) return null;

  const record = (answer: Answer) => {
    reportGradeTable("scheme_update_answered", {
      university: name,
      updateId: update.id,
      answer,
      from: update.previous,
      to: update.next,
    });
    return { id: update.id, answer, at: new Date().toISOString() };
  };
  const answer = (a: "yes" | "no") => {
    const schemeUpdate = record(a);
    // "No" keeps the system he has: an automatic student's old system becomes his
    // own choice, so the correction no longer follows him. "Yes" puts everyone on
    // the university's table (automatic).
    if (a === "yes") setAcademic({ schemeUpdate, gpaSchemeId: "auto" });
    else setAcademic(manual ? { schemeUpdate } : { schemeUpdate, gpaSchemeId: update.previous });
    onDone();
  };

  if (editing) {
    return (
      <GradeTableForm
        onDone={(saved) => {
          if (saved) {
            setAcademic({ schemeUpdate: record("custom") });
            onDone();
          } else setEditing(false);
        }}
      />
    );
  }

  return (
    <>
      <div className="flex items-start gap-3 mb-4">
        <span
          className="shrink-0 inline-flex items-center justify-center rounded-xl"
          style={{ width: 38, height: 38, background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
        >
          <Calculator size={19} />
        </span>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-ink)" }}>
          {t(before.max === after.max ? "su_bodySame" : "su_body", { uni: name, from: before.max, to: after.max })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl px-3.5 py-3" style={{ background: "var(--color-canvas)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--color-muted)" }}>{t(manual ? "su_current" : "su_was")}</p>
          <SchemeChips scheme={before} onSurface />
        </div>
        <div className="rounded-xl px-3.5 py-3" style={{ background: "var(--color-primary-soft)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--color-primary)" }}>{t("su_now")}</p>
          <SchemeChips scheme={after} onSurface />
        </div>
      </div>
      <p className="text-xs mt-3 leading-relaxed" style={{ color: "var(--color-muted)" }}>{t("su_changeNote")}</p>

      <p className="text-sm font-semibold mt-5" style={{ color: "var(--color-ink)" }}>{t("su_question")}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" className={`haven-btn ${btn}`} onClick={() => answer("yes")}>{t("su_yes")}</button>
        <button type="button" className={btn} style={ghost} onClick={() => answer("no")}>{t("su_no")}</button>
        <button type="button" className={btn} style={ghost} onClick={() => setEditing(true)}>{t("su_custom")}</button>
      </div>
      <p className="text-[11.5px] mt-3" style={{ color: "var(--color-muted)" }}>{t("su_note")}</p>
    </>
  );
}

/** Stand-alone pop-up (the setup flow renders the body as one of its steps). */
export function SchemeUpdateModal({ update, onClose }: { update: SchemeUpdate; onClose: () => void }) {
  const { t } = useT();
  return (
    <Modal open onClose={onClose} title={t("su_title")}>
      <SchemeUpdateBody update={update} onDone={onClose} />
    </Modal>
  );
}
