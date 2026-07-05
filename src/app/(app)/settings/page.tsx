"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Trash2, Check, Lock, LogOut } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { DateField } from "@/components/DateField";
import { signOut as clearSession } from "@/lib/auth";
import type { CalendarType, ThemeId } from "@/types";
import type { TranslationKey } from "@/i18n/translations/en";

interface ThemeMeta {
  id: ThemeId;
  nameKey: TranslationKey;
  free: boolean;
  /** preview swatches — mirror the CSS in globals.css */
  surface: string;
  sidebar: string;
  primary: string;
  brass: string;
}

// Testing flag: premium themes are selectable until payments go live.
// Flip to false to re-lock the premium themes behind the "coming soon" modal.
const UNLOCK_ALL_THEMES = true;

const THEMES: ThemeMeta[] = [
  { id: "haven", nameKey: "theme_haven", free: true, surface: "#fcfbf9", sidebar: "#0f3a40", primary: "#477680", brass: "#b8975a" },
  { id: "midnight", nameKey: "theme_midnight", free: true, surface: "#16242b", sidebar: "#0a141a", primary: "#5fa9b8", brass: "#cbaa6e" },
  { id: "rose", nameKey: "theme_rose", free: false, surface: "#fdfbfb", sidebar: "#46303a", primary: "#b3737f", brass: "#c08a72" },
  { id: "lavender", nameKey: "theme_lavender", free: false, surface: "#fdfcff", sidebar: "#322c4a", primary: "#7e6fb0", brass: "#b89a6a" },
  { id: "sand", nameKey: "theme_sand", free: false, surface: "#fdfbf8", sidebar: "#463729", primary: "#b07a52", brass: "#a98955" },
  { id: "forest", nameKey: "theme_forest", free: false, surface: "#fcfdfb", sidebar: "#1c3528", primary: "#3f7d5a", brass: "#b8975a" },
  { id: "ocean", nameKey: "theme_ocean", free: false, surface: "#fbfdfe", sidebar: "#14304a", primary: "#3a6ea5", brass: "#b8975a" },
  { id: "mono", nameKey: "theme_mono", free: false, surface: "#fdfdfd", sidebar: "#26282b", primary: "#4a4f54", brass: "#8f8f8f" },
];

const fieldClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="haven-label mb-4">{title}</h2>
      <Card padding="p-8">{children}</Card>
    </section>
  );
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

export default function SettingsPage() {
  const { t, lang } = useT();
  const router = useRouter();
  const store = useStore();
  const { hydrated, language, setLanguage, theme, setTheme, semester, setSemester, reminderDays, setReminderDays, loadDemo, resetData } = store;
  const [confirmReset, setConfirmReset] = useState(false);
  const [demoDone, setDemoDone] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);

  const pickTheme = (tm: ThemeMeta) => {
    if (tm.free || UNLOCK_ALL_THEMES) setTheme(tm.id);
    else setPremiumOpen(true);
  };

  // Sign out, then return to the public homepage. Ending the Supabase session
  // fires onAuthStateChange("SIGNED_OUT"), which clears the in-memory store and
  // every Haven localStorage key (see StoreProvider) so the next account that
  // signs in on this device never inherits this account's data.
  const signOut = async () => {
    await clearSession();
    router.replace("/");
  };

  if (!hydrated) return <div className="h-40" />;

  const divider = { borderColor: "var(--color-border)" };
  // Total weeks = the values the user enters: teaching + finals (not derived from dates).
  const teachingWeeks = Number(semester.weeks) || 0;
  const finalsWeeks = Number(semester.finalsWeeks) || 0;
  const totalWeeks = teachingWeeks + finalsWeeks;

  return (
    <div className="max-w-2xl">
      <div className="haven-stagger">
      <h1 className="font-display text-[34px] leading-tight" style={{ color: "var(--color-ink)" }}>
        {t("settingsTitle")}
      </h1>
      <p className="text-[15px] mt-3 mb-12" style={{ color: "var(--color-muted)" }}>
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
        </div>
      </Section>

      {/* Theme */}
      <Section title={t("sectionTheme")}>
        <p className="text-[13px] mb-5 -mt-1" style={{ color: "var(--color-muted)" }}>
          {t("themeSectionDesc")}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {THEMES.map((tm) => (
            <ThemeCard key={tm.id} theme={tm} active={theme === tm.id} onSelect={() => pickTheme(tm)} />
          ))}
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
            <DateField
              calendar={semester.calendarType}
              className={fieldClass}
              style={divider}
              value={semester.startDate}
              onChange={(v) => setSemester({ startDate: v })}
            />
          </Row>
          <Row label={t("endDate")}>
            <DateField
              calendar={semester.calendarType}
              className={fieldClass}
              style={divider}
              value={semester.endDate}
              onChange={(v) => setSemester({ endDate: v })}
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

      {/* Attendance */}
      <Section title={t("sectionAttendance")}>
        <div className="divide-y" style={divider}>
          <Row label={t("withdrawalLimitLabel")}>
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              className={fieldClass}
              style={divider}
              value={semester.withdrawalLimit}
              onChange={(e) => setSemester({ withdrawalLimit: Number(e.target.value) || 0 })}
            />
          </Row>
          <Row label={t("finalsWeeksLabel")}>
            <input
              type="number"
              min="0"
              max="10"
              step="1"
              className={fieldClass}
              style={divider}
              value={semester.finalsWeeks}
              onChange={(e) => setSemester({ finalsWeeks: Number(e.target.value) || 0 })}
            />
          </Row>
          <Row label={t("semesterWeeksLabel")}>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {[13, 15].map((w) => (
                  <button
                    key={w}
                    onClick={() => setSemester({ weeks: w })}
                    className="rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
                    style={
                      semester.weeks === w
                        ? { background: "var(--color-primary)", color: "#fff" }
                        : { background: "var(--color-primary-soft)", color: "var(--color-primary)" }
                    }
                  >
                    {w}
                  </button>
                ))}
                <input
                  type="number"
                  min="1"
                  max="40"
                  step="1"
                  aria-label={t("weeksCustom")}
                  placeholder={t("weeksCustom")}
                  className={`${fieldClass} flex-1`}
                  style={divider}
                  value={semester.weeks}
                  onChange={(e) => setSemester({ weeks: Number(e.target.value) || 0 })}
                />
              </div>
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {t("weeksSuggestion", { teaching: teachingWeeks, total: totalWeeks, finals: finalsWeeks })}
              </span>
            </div>
          </Row>
        </div>
      </Section>

      {/* Reminders */}
      <Section title={t("sectionReminders")}>
        <div className="divide-y" style={divider}>
          <Row label={t("reminderDaysLabel")}>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setReminderDays(n)}
                  className="rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
                  style={
                    reminderDays === n
                      ? { background: "var(--color-primary)", color: "#fff" }
                      : { background: "var(--color-primary-soft)", color: "var(--color-primary)" }
                  }
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                aria-label={t("weeksCustom")}
                placeholder={t("weeksCustom")}
                className={`${fieldClass} flex-1`}
                style={divider}
                value={reminderDays}
                onChange={(e) => setReminderDays(Number(e.target.value) || 1)}
              />
            </div>
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

      {/* Sign out */}
      <div className="mt-12 pt-8 border-t" style={{ borderColor: "var(--color-border)" }}>
        <button
          onClick={signOut}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-primary-soft)] sm:w-auto"
          style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
        >
          <LogOut size={16} className="rtl:rotate-180" />
          {t("signOut")}
        </button>
      </div>
      </div>

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

      <Modal open={premiumOpen} onClose={() => setPremiumOpen(false)} title={t("premiumSoonTitle")}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {t("premiumSoonDesc")}
        </p>
        <div className="flex justify-end mt-6">
          <button onClick={() => setPremiumOpen(false)} className="haven-btn px-5 py-2 rounded-xl text-sm font-medium">
            {t("close")}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function ThemeCard({ theme, active, onSelect }: { theme: ThemeMeta; active: boolean; onSelect: () => void }) {
  const { t } = useT();
  const isPremium = !theme.free;
  const locked = isPremium && !UNLOCK_ALL_THEMES;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className="group relative text-start rounded-2xl border p-2.5 transition-all hover:-translate-y-0.5"
      style={{
        borderColor: active ? "var(--color-primary)" : "var(--color-border)",
        boxShadow: active ? "0 0 0 2px var(--color-primary)" : "var(--shadow-card)",
        background: "var(--color-surface)",
      }}
    >
      {/* mini app preview */}
      <div
        className="relative h-16 rounded-xl overflow-hidden flex"
        style={{ background: theme.surface, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)" }}
      >
        <div style={{ width: 26, background: theme.sidebar }} />
        <div className="flex-1 flex items-center gap-1.5 px-2.5">
          <span className="h-5 w-5 rounded-full shrink-0" style={{ background: theme.primary }} />
          <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ background: theme.brass }} />
          <span className="flex-1 h-2 rounded-full" style={{ background: theme.primary, opacity: 0.2 }} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2.5">
        <span className="text-sm font-medium truncate" style={{ color: "var(--color-ink)" }}>{t(theme.nameKey)}</span>
        {active ? (
          <span className="flex items-center justify-center h-5 w-5 rounded-full shrink-0" style={{ background: "var(--color-primary)", color: "#fff" }}>
            <Check size={12} strokeWidth={3} />
          </span>
        ) : locked ? (
          <Lock size={13} className="shrink-0" style={{ color: "var(--color-brass)" }} />
        ) : null}
      </div>
      <span
        className="text-[11px] font-medium"
        style={{ color: isPremium ? "var(--color-brass)" : "var(--color-muted)" }}
      >
        {isPremium ? t("themePremium") : t("themeFree")}
      </span>
    </button>
  );
}
