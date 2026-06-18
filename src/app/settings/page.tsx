"use client";

import { useState } from "react";
import { Sparkles, Trash2, Check } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import type { CalendarType } from "@/types";

const fieldClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-muted)" }}>
        {title}
      </h2>
      <Card>{children}</Card>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-3 first:pt-0 last:pb-0">
      <label className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
        {label}
      </label>
      <div className="sm:w-64">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useT();
  const store = useStore();
  const { hydrated, language, setLanguage, profileName, setProfileName, semester, setSemester, loadDemo, resetData } = store;
  const [confirmReset, setConfirmReset] = useState(false);
  const [demoDone, setDemoDone] = useState(false);

  if (!hydrated) return <div className="h-40" />;

  const divider = { borderColor: "var(--color-border)" };

  return (
    <div className="haven-fade-in max-w-2xl">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--color-ink)" }}>
        {t("settingsTitle")}
      </h1>
      <p className="text-sm mt-1 mb-8" style={{ color: "var(--color-muted)" }}>
        {t("settingsSubtitle")}
      </p>

      {/* Preferences */}
      <Section title={t("sectionPreferences")}>
        <div className="divide-y" style={divider}>
          <Row label={t("languageLabel")}>
            <div className="inline-flex rounded-xl p-1 w-full" style={{ background: "var(--color-primary-soft)" }}>
              {(["en", "ar"] as const).map((lng) => (
                <button
                  key={lng}
                  onClick={() => setLanguage(lng)}
                  className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                  style={
                    language === lng
                      ? { background: "var(--color-surface)", color: "var(--color-primary)", boxShadow: "var(--shadow-card)" }
                      : { color: "var(--color-muted)" }
                  }
                >
                  {lng === "en" ? t("english") : t("arabic")}
                </button>
              ))}
            </div>
          </Row>
          <Row label={t("profileLabel")}>
            <input
              className={fieldClass}
              style={divider}
              value={profileName}
              placeholder={t("profilePlaceholder")}
              onChange={(e) => setProfileName(e.target.value)}
            />
          </Row>
        </div>
      </Section>

      {/* Semester */}
      <Section title={t("sectionSemester")}>
        <div className="divide-y" style={divider}>
          <Row label={t("semesterName")}>
            <input
              className={fieldClass}
              style={divider}
              value={semester.name}
              onChange={(e) => setSemester({ name: e.target.value })}
            />
          </Row>
          <Row label={t("startDate")}>
            <input
              type="date"
              className={fieldClass}
              style={divider}
              value={semester.startDate}
              onChange={(e) => setSemester({ startDate: e.target.value })}
            />
          </Row>
          <Row label={t("endDate")}>
            <input
              type="date"
              className={fieldClass}
              style={divider}
              value={semester.endDate}
              onChange={(e) => setSemester({ endDate: e.target.value })}
            />
          </Row>
          <Row label={t("calendarLabel")}>
            <select
              className={fieldClass}
              style={divider}
              value={semester.calendarType}
              onChange={(e) => setSemester({ calendarType: e.target.value as CalendarType })}
            >
              <option value="gregorian">{t("gregorian")}</option>
              <option value="hijri">{t("hijri")}</option>
            </select>
          </Row>
        </div>
      </Section>

      {/* Data */}
      <Section title={t("sectionData")}>
        <div className="divide-y" style={divider}>
          <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{t("demoTitle")}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{t("demoDesc")}</div>
            </div>
            <button
              onClick={() => { loadDemo(); setDemoDone(true); setTimeout(() => setDemoDone(false), 2000); }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium shrink-0 transition-colors"
              style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
            >
              {demoDone ? <Check size={16} /> : <Sparkles size={16} />}
              {t("loadDemo")}
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{t("resetTitle")}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{t("resetDesc")}</div>
            </div>
            <button
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium shrink-0 transition-colors"
              style={{ background: "#FDEAEA", color: "var(--color-danger)" }}
            >
              <Trash2 size={16} />
              {t("resetData")}
            </button>
          </div>
        </div>
      </Section>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title={t("resetData")}>
        <p className="text-sm mb-6" style={{ color: "var(--color-muted)" }}>
          {t("resetConfirm")}
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setConfirmReset(false)}
            className="px-4 py-2 rounded-xl text-sm font-medium border"
            style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
          >
            {t("cancel")}
          </button>
          <button
            onClick={() => { resetData(); setConfirmReset(false); }}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white"
            style={{ background: "var(--color-danger)" }}
          >
            {t("resetData")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
