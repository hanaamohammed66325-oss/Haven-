"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Trash2, Check, Lock, LogOut } from "lucide-react";
import { useStore } from "@/store";
import { useT, usePageTitle } from "@/i18n";
import { Card } from "@/components/Card";
import { CollapseBody, CollapseToggle, expandCard, useCardCollapse } from "@/components/Collapsible";
import { Modal } from "@/components/Modal";
import { DateField } from "@/components/DateField";
import { DemoPlayer } from "@/components/DemoPlayer";
import { NotificationsSettings } from "@/components/NotificationsSettings";
import { RemindersSettings, Toggle } from "@/components/RemindersSettings";
import { AttendanceRuleModal } from "@/components/AttendanceRuleModal";
import { HolidaysManager } from "@/components/HolidaysManager";
import { signOut as clearSession } from "@/lib/auth";
import { useDeleteAccount } from "@/lib/useDeleteAccount";
import { PremiumGate } from "@/components/PremiumGate";
import { useSubscription } from "@/lib/subscription";
import { canUseTheme } from "@/lib/premium";
import { SUPPORT_EMAIL, contactChannels } from "@/lib/contact";
import { policyKind } from "@/lib/attendancePolicy";
import { DEFAULT_SEMESTER_NAME } from "@/lib/db";
import { TermCheckCard } from "@/components/TermCheckCard";
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

// Theme access is decided by premium.js (canUseTheme). While ENFORCE_PREMIUM is
// off, canUseTheme returns true for every theme, so all themes stay selectable.

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

/**
 * A number field that only ever COMMITS a value inside [min, max].
 *
 * `min`/`max` on a plain <input type="number"> are decorative for typed input —
 * they gate the steppers and native form validation, not `onChange`. Saving
 * straight from `onChange` meant that simply backspacing the field to retype it
 * persisted 0, which downstream code then silently replaced with a made-up 15;
 * and typing 999 persisted 999, dividing attendance by a 999-week term so every
 * student appeared to have ~0% absence.
 *
 * The draft is local while typing (so the field stays usable), and the clamped
 * value is committed on blur / Enter. Re-syncs when the stored value changes
 * elsewhere.
 */
function ClampedNumberField({
  value, min, max, onCommit, className, style, ariaLabel, placeholder,
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = () => {
    const parsed = Math.round(Number(draft));
    // An empty or unparseable field reverts to the stored value — never 0.
    const next = Number.isFinite(parsed) && draft.trim() !== ""
      ? Math.max(min, Math.min(max, parsed))
      : value;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step="1"
      inputMode="numeric"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={className}
      style={style}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function Section({ id, title, children, anchor }: { id: string; title: string; children: React.ReactNode; anchor?: string }) {
  const { open, toggle } = useCardCollapse(`settings-${id}`, `settings-${id}`);
  return (
    <section
      id={`settings-${id}`}
      className="scroll-mt-24"
      style={{ marginBottom: open ? "3rem" : "1.25rem", transition: "margin-bottom 0.35s cubic-bezier(0.22,1,0.36,1)" }}
      {...(anchor ? { "data-tour": anchor } : {})}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="haven-label">{title}</h2>
        <CollapseToggle open={open} onToggle={toggle} label={title} />
      </div>
      <CollapseBody open={open}>
        <Card padding="p-5 sm:p-8">{children}</Card>
      </CollapseBody>
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
  usePageTitle("nav_settings");
  const router = useRouter();
  const store = useStore();
  const { hydrated, language, setLanguage, theme, setTheme, semester, setSemester, resetData, haviName, setHaviName, attendanceEnabled, setAttendanceEnabled, universityPolicy } = store;
  const [ruleOpen, setRuleOpen] = useState(false);
  const ruleSource = semester.attendanceRule?.source ?? "none";
  // Which of the two semester date fields was last rejected for inverting the
  // range (null = no problem). Drives the inline explanation under the fields.
  const [dateError, setDateError] = useState<"start" | "end" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const { sub, profile } = useSubscription();
  const { deleteAccount, loading: deleting, error: deleteError, reset: resetDeleteError } = useDeleteAccount();

  // Arriving from the dashboard notifications nudge → scroll straight to the
  // Notifications enable button (one-shot flag set by NotifNudge before
  // navigating). The section briefly renders a "checking" spinner with no anchor,
  // so we poll until the real section mounts before scrolling — and only clear
  // the flag once we've actually landed, so a trailing-slash remount can't drop it.
  useEffect(() => {
    if (!hydrated) return;
    let flagged = false;
    try {
      flagged = sessionStorage.getItem("haven-focus-notif") === "1";
    } catch {
      /* ignore */
    }
    // Also honor an external deep-link: the win-back "turn on notifications"
    // email points at /settings?focus=notif. Those users arrive with no in-app
    // sessionStorage flag, so detect the query param and strip it once landed,
    // so a refresh doesn't re-trigger the scroll.
    let fromParam = false;
    try {
      if (new URLSearchParams(window.location.search).get("focus") === "notif") {
        fromParam = true;
        flagged = true;
      }
    } catch {
      /* ignore */
    }
    if (!flagged) return;

    const clearFlags = () => {
      try {
        sessionStorage.removeItem("haven-focus-notif");
      } catch {
        /* ignore */
      }
      if (!fromParam) return;
      try {
        const p = new URLSearchParams(window.location.search);
        p.delete("focus");
        const qs = p.toString();
        window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
      } catch {
        /* ignore */
      }
    };

    let tries = 0;
    const timer = window.setInterval(() => {
      expandCard("settings-notifications");
      const el = document.querySelector('[data-tour="notif-section"]');
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Draw the eye to the enable control for a moment.
        el.classList.add("haven-target");
        window.setTimeout(() => el.classList.remove("haven-target"), 1800);
        clearFlags();
        window.clearInterval(timer);
      } else if (++tries > 50) {
        // Give up after ~5s (element never appeared).
        clearFlags();
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [hydrated]);

  const closeDelete = () => {
    if (deleting) return; // don't let a click-away cancel a deletion in progress
    setConfirmDelete(false);
    resetDeleteError();
  };

  const pickTheme = (tm: ThemeMeta) => {
    if (canUseTheme(profile, sub, tm.id)) setTheme(tm.id);
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
  // Counted weeks from the term's own dates: whole weeks start → end, minus
  // finals. Offered as a one-tap suggestion (the end date may sit a few days
  // past the last exam, so it's never applied silently).
  const datesWeeks =
    semester.startDate && semester.endDate && semester.endDate > semester.startDate
      ? Math.max(
          1,
          Math.round((+new Date(semester.endDate) - +new Date(semester.startDate) + 864e5) / (7 * 864e5)) - finalsWeeks
        )
      : null;

  return (
    <div className="max-w-2xl">
      <div className="haven-stagger">
      <h1 className="font-display text-[34px] leading-tight" style={{ color: "var(--color-ink)" }}>
        {t("settingsTitle")}
      </h1>
      <p className="text-[15px] mt-3 mb-8" style={{ color: "var(--color-muted)" }}>
        {t("settingsSubtitle")}
      </p>

      {/* User guide — reopen the first-run onboarding tour anytime. */}
      <Section id="guide" title={t("ob_settings_t")}>
        <p className="text-[13px] mb-4 -mt-1" style={{ color: "var(--color-muted)" }}>
          {t("ob_settings_desc")}
        </p>
        <button
          type="button"
          data-tour="set-guide"
          onClick={() => window.dispatchEvent(new Event("haven:onboarding"))}
          className="haven-btn rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          {t("ob_settings_btn")}
        </button>
      </Section>

      {/* Preferences */}
      <Section id="preferences" title={t("sectionPreferences")}>
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
          <Row label={t("haviNameLabel")}>
            <input
              data-tour="set-haviname"
              className={fieldClass}
              style={divider}
              value={haviName}
              placeholder={t("haviNamePlaceholder")}
              maxLength={20}
              onChange={(e) => setHaviName(e.target.value)}
            />
          </Row>
        </div>
      </Section>

      {/* Theme */}
      <Section id="theme" title={t("sectionTheme")}>
        <p className="text-[13px] mb-5 -mt-1" style={{ color: "var(--color-muted)" }}>
          {t("themeSectionDesc")}
        </p>
        <div data-tour="set-theme" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {THEMES.map((tm) => (
            <ThemeCard key={tm.id} theme={tm} active={theme === tm.id} locked={!canUseTheme(profile, sub, tm.id)} onSelect={() => pickTheme(tm)} />
          ))}
        </div>
      </Section>

      {/* Semester */}
      <Section id="semester" title={t("sectionSemester")} anchor="set-dates">
        <TermCheckCard className="mb-5" />
        <div className="divide-y" style={divider}>
          <Row label={t("semesterName")}>
            <input
              className={fieldClass}
              style={divider}
              value={semester.name === DEFAULT_SEMESTER_NAME ? t("semesterDefaultName") : semester.name}
              onChange={(e) => setSemester({ name: e.target.value })}
            />
          </Row>
          {/* Start/end are cross-validated: an end date on or before the start
              produces a zero/negative span, which used to collapse the whole app
              to "Week 1 of 1", show 0% progress forever, and make the planner
              render a single week regardless of the configured 18+2. The guards
              below simply refuse the invalid value and the notice explains why. */}
          <Row label={t("startDate")}>
            <DateField
              calendar={semester.calendarType}
              className={fieldClass}
              style={divider}
              value={semester.startDate}
              onChange={(v) => {
                if (!v) return;
                if (semester.endDate && v >= semester.endDate) {
                  setDateError("start");
                  return;
                }
                setDateError(null);
                setSemester({ startDate: v });
              }}
            />
          </Row>
          <Row label={t("endDate")}>
            <DateField
              calendar={semester.calendarType}
              className={fieldClass}
              style={divider}
              value={semester.endDate}
              onChange={(v) => {
                if (!v) return;
                if (semester.startDate && v <= semester.startDate) {
                  setDateError("end");
                  return;
                }
                setDateError(null);
                setSemester({ endDate: v });
              }}
            />
          </Row>
          {dateError && (
            <div className="px-1 py-2">
              <p className="text-xs" style={{ color: "var(--color-danger, #c0392b)" }}>
                {dateError === "end" ? t("errEndBeforeStart") : t("errStartAfterEnd")}
              </p>
            </div>
          )}
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
      <Section id="attendance" title={t("sectionAttendance")} anchor="set-attendance">
        <div className="divide-y" style={divider}>
          <Row label={t("attSystemToggle")}>
            <div className="flex flex-col gap-2 sm:items-end">
              <Toggle checked={attendanceEnabled} onChange={setAttendanceEnabled} label={t("attSystemToggle")} />
              <span className="text-xs leading-relaxed sm:text-end" style={{ color: "var(--color-muted)" }}>
                {t("attSystemToggleHint")}
              </span>
            </div>
          </Row>
          {attendanceEnabled && (
            <Row label={t("attSystemRule")}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm" style={{ color: "var(--color-ink)" }}>
                  {t(
                    semester.attendanceRule?.pending
                      ? "attSystemRulePending"
                      : ruleSource === "university"
                        ? universityPolicy && policyKind(universityPolicy) === "official"
                          ? "attSystemRuleUniversity"
                          : "attSystemRuleConfirmed"
                        : ruleSource === "personal"
                          ? "attSystemRulePersonal"
                          : "attSystemRuleNone"
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setRuleOpen(true)}
                  className="rounded-lg px-3.5 py-2 text-sm font-medium shrink-0"
                  style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
                >
                  {t("attSystemChange")}
                </button>
              </div>
              <AttendanceRuleModal open={ruleOpen} onClose={() => setRuleOpen(false)} />
            </Row>
          )}
          <Row label={t("finalsWeeksLabel")}>
            <ClampedNumberField
              value={semester.finalsWeeks}
              min={0}
              max={10}
              onCommit={(n) => setSemester({ finalsWeeks: n })}
              className={fieldClass}
              style={divider}
            />
          </Row>
          <Row label={t("semesterWeeksLabel")}>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {datesWeeks != null && datesWeeks <= 40 && (
                  <button
                    onClick={() => setSemester({ weeks: datesWeeks })}
                    title={t("weeksFromDates", { n: datesWeeks })}
                    className="rounded-lg px-3.5 py-2 text-sm font-medium transition-colors shrink-0"
                    style={
                      semester.weeks === datesWeeks
                        ? { background: "var(--color-primary)", color: "#fff" }
                        : { background: "var(--color-primary-soft)", color: "var(--color-primary)" }
                    }
                  >
                    {t("weeksFromDates", { n: datesWeeks })}
                  </button>
                )}
                <ClampedNumberField
                  value={semester.weeks}
                  min={1}
                  max={40}
                  onCommit={(n) => setSemester({ weeks: n })}
                  ariaLabel={t("weeksCustom")}
                  placeholder={t("weeksCustom")}
                  className={`${fieldClass} flex-1`}
                  style={divider}
                />
              </div>
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {t("weeksSuggestion", { teaching: teachingWeeks, total: totalWeeks, finals: finalsWeeks })}
              </span>
              <span className="text-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>
                {t("weeksHint")}
              </span>
            </div>
          </Row>
        </div>
      </Section>

      {/* Holidays — student-managed calendar so absence math matches their own
          university's real breaks (built-in dismiss/restore + custom add). */}
      <Section id="holidays" title={t("sectionHolidays")} anchor="set-holidays">
        <HolidaysManager />
      </Section>

      {/* Reminders — customizable notification preferences (notifPrefs) */}
      <Section id="reminders" title={t("sectionReminders")} anchor="set-reminders">
        <RemindersSettings />
      </Section>

      {/* Notifications (free for all users — no premium gating) */}
      <Section id="notifications" title={t("sectionNotifications")}>
        <NotificationsSettings />
      </Section>

      {/* Data */}
      <Section id="data" title={t("sectionData")} anchor="set-data">
        <div className="divide-y" style={divider}>
          <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{t("demoTitle")}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{t("demoDesc")}</div>
            </div>
            <button
              onClick={() => setDemoOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium shrink-0 transition-colors"
              style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
            >
              <Sparkles size={16} />
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

      {/* Contact us — same channels as the /contact page (single source in
          @/lib/contact). Email and Instagram are live; WhatsApp is
          temporarily disabled. */}
      <Section id="contact" title={t("sectionContact")}>
        <p className="text-[13px] mb-5 -mt-1" style={{ color: "var(--color-muted)" }}>
          {t("contactIntro")}
        </p>
        <div className="flex flex-wrap gap-2.5">
          {contactChannels.map((c) => {
            const isEmail = c.label === "Email";
            return (
              <a
                key={c.label}
                href={c.href}
                aria-label={c.label}
                {...(isEmail ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                className="inline-flex min-h-11 items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:border-[var(--color-primary)] hover:text-[color:var(--color-primary)]"
                style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
              >
                <span className="shrink-0">{c.svg}</span>
                <span dir={isEmail ? "ltr" : undefined}>{isEmail ? SUPPORT_EMAIL : c.label}</span>
              </a>
            );
          })}
        </div>
      </Section>

      {/* Sign out / Delete account */}
      <div className="mt-12 pt-8 border-t flex flex-col gap-3 sm:flex-row sm:items-center" style={{ borderColor: "var(--color-border)" }}>
        <button
          onClick={signOut}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-primary-soft)] sm:w-auto"
          style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
        >
          <LogOut size={16} className="rtl:rotate-180" />
          {t("signOut")}
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors sm:w-auto"
          style={{ background: "#FDEAEA", color: "var(--color-danger)" }}
        >
          <Trash2 size={16} />
          {t("deleteAccount")}
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

      <Modal open={confirmDelete} onClose={closeDelete} title={t("deleteAccountTitle")}>
        <p className="text-sm mb-6" style={{ color: "var(--color-muted)" }}>
          {t("deleteAccountBody")}
        </p>
        {deleteError && (
          <p className="text-sm mb-4" style={{ color: "var(--color-danger)" }}>
            {t("deleteAccountError")}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={closeDelete}
            disabled={deleting}
            className="px-4 py-2 rounded-xl text-sm font-medium border disabled:opacity-60"
            style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
          >
            {t("cancel")}
          </button>
          <button
            onClick={deleteAccount}
            disabled={deleting}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-70"
            style={{ background: "var(--color-danger)" }}
          >
            {deleting ? t("deleteAccountLoading") : t("deleteAccountConfirm")}
          </button>
        </div>
      </Modal>

      <DemoPlayer open={demoOpen} onClose={() => setDemoOpen(false)} />

      <PremiumGate open={premiumOpen} onClose={() => setPremiumOpen(false)} feature="theme" />
    </div>
  );
}

function ThemeCard({ theme, active, locked, onSelect }: { theme: ThemeMeta; active: boolean; locked: boolean; onSelect: () => void }) {
  const { t } = useT();
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
      {/* No free/premium text label. Users with active access are never `locked`
          (canUseTheme → true for all), so they see nothing. Users without access
          get the 🔒 above on premium (locked) themes and nothing on free ones. */}
    </button>
  );
}
