"use client";

import { useState } from "react";
import Link from "next/link";
import { Info, AlertTriangle, ScrollText } from "lucide-react";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { isPlaceholderSemester, requestSetup } from "./SetupCheck";
import { AttendanceRuleModal } from "./AttendanceRuleModal";
import { describePolicyAr, isStudentAlternative, policyKind, type AttendancePolicy } from "@/lib/attendancePolicy";

/** Where the absence figures come from, under them:
 *  • the university has a rule (approved, from its documents, or agreed by its
 *    students) the student hasn't confirmed → "this is how your university
 *    counts absence — right?", with any rule its students describe beside it
 *    to pick instead. No percentage is shown until they confirm (the full
 *    card, or one line linking to it when `compact`);
 *  • the university's rule is unknown → a gentle note that no percentage is
 *    shown, and an invitation to tell us the rule;
 *  • otherwise one quiet line: which rule is used, and that the portal is the
 *    official number. While the term's dates were never set, that line warns
 *    the figures can be well off, with a link to the setup window. */
export function AttendanceApproxNote({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { t, lang } = useT();
  const { semester, setupConfirmed, universityPolicy, policyOptions, ackAttendancePolicy } = useStore();
  const [formOpen, setFormOpen] = useState(false);
  const rule = semester.attendanceRule;
  const modal = <AttendanceRuleModal open={formOpen} onClose={() => setFormOpen(false)} />;
  const link = (text: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="font-semibold underline underline-offset-2">
      {text}
    </button>
  );
  const card = (children: React.ReactNode) => (
    <div className={`rounded-xl border px-4 py-3.5 text-sm leading-relaxed ${className}`} style={{ borderColor: "var(--color-border)", background: "var(--color-primary-soft)" }}>
      {children}
    </div>
  );

  // 1. A rule the student hasn't confirmed: no percentage until they do.
  const policy = universityPolicy;
  const rules = (p: AttendancePolicy) =>
    lang === "ar" ? (
      <ul className="list-disc ps-5 mb-2" style={{ color: "var(--color-ink)" }}>
        {describePolicyAr(p).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    ) : (
      <p className="mb-2" style={{ color: "var(--color-ink)" }}>
        {t("attLimitShort", { n: p.max_unexcused ?? p.max_absence ?? "—" })}
      </p>
    );
  if (rule?.pending && policy) {
    const kind = policyKind(policy);
    const others = policyOptions.filter((p) => p !== policy && isStudentAlternative(p));
    if (compact) {
      return (
        <p className={`flex items-start gap-1.5 text-[11.5px] leading-relaxed ${className}`} style={{ color: "var(--color-muted)" }}>
          <Info size={12} className="mt-[3px] shrink-0" aria-hidden />
          <span>
            {t("attRulePendingShort")}{" "}
            <Link href="/attendance" className="font-semibold underline underline-offset-2">
              {t("attRuleConfirmCta")}
            </Link>
          </span>
        </p>
      );
    }
    return (
      <>
        {card(
          <>
            <div className="flex items-center gap-2 font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
              <ScrollText size={16} aria-hidden style={{ color: "var(--color-primary)" }} />
              {t(kind === "official" ? "attRuleConfirmTitle" : kind === "document" ? "attRuleSuggestedTitle" : "attRuleStudentsTitle")}
            </div>
            <p className="mb-2" style={{ color: "var(--color-muted)" }}>
              {t(kind === "official" ? "attRuleConfirmBody" : kind === "document" ? "attRuleSuggestedBody" : "attRuleStudentsBody")}
            </p>
            {rules(policy)}
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" onClick={() => ackAttendancePolicy(policy)} className="rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white" style={{ background: "var(--color-primary)" }}>
                {t("attRuleYes")}
              </button>
              {!others.length && (
                <button type="button" onClick={() => setFormOpen(true)} className="rounded-lg px-3.5 py-1.5 text-sm font-medium border" style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}>
                  {t("attRuleNo")}
                </button>
              )}
            </div>
            {others.map((alt) => (
              <div key={alt.id} className="mt-4 pt-3 border-t" style={{ borderColor: "var(--color-border)" }}>
                <div className="font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
                  {t("attRuleAltTitle")}
                </div>
                <p className="mb-2" style={{ color: "var(--color-muted)" }}>
                  {t("attRuleAltBody")}
                </p>
                {rules(alt)}
                <button
                  type="button"
                  onClick={() => ackAttendancePolicy(alt)}
                  className="mt-1 rounded-lg px-3.5 py-1.5 text-sm font-semibold border"
                  style={{ borderColor: "var(--color-primary)", color: "var(--color-primary)" }}
                >
                  {t("attRuleAltYes")}
                </button>
              </div>
            ))}
            {others.length > 0 && (
              <button type="button" onClick={() => setFormOpen(true)} className="mt-3 text-xs font-semibold underline underline-offset-2" style={{ color: "var(--color-muted)" }}>
                {t("attRuleAltNeither")}
              </button>
            )}
            <p className="text-xs mt-3" style={{ color: "var(--color-muted)" }}>{t("attRuleUntilConfirmed")}</p>
            <p className="text-[11px] mt-2.5 leading-relaxed" style={{ color: "var(--color-muted)" }}>{t(others.length ? "attRuleResponsibilityPick" : "attRuleResponsibility")}</p>
          </>
        )}
        {modal}
      </>
    );
  }

  // 2. Unknown rule: no percentage anywhere until the student tells us.
  if (rule?.source === "none") {
    if (compact) {
      return (
        <>
          <p className={`flex items-start gap-1.5 text-[11.5px] leading-relaxed ${className}`} style={{ color: "var(--color-muted)" }}>
            <Info size={12} className="mt-[3px] shrink-0" aria-hidden />
            <span>
              {t("attRuleUnknownShort")} {link(t("attRuleShare"), () => setFormOpen(true))}
            </span>
          </p>
          {modal}
        </>
      );
    }
    return (
      <>
        {card(
          <>
            <div className="flex items-center gap-2 font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
              <ScrollText size={16} aria-hidden style={{ color: "var(--color-primary)" }} />
              {t("attRuleUnknownTitle")}
            </div>
            <p style={{ color: "var(--color-muted)" }}>{t("attRuleUnknownBody")}</p>
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="mt-3 rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white"
              style={{ background: "var(--color-primary)" }}
            >
              {t("attRuleShare")}
            </button>
          </>
        )}
        {modal}
      </>
    );
  }

  // 3. The term was never set up: the figures can be well off.
  if (!setupConfirmed.semester && isPlaceholderSemester(semester)) {
    return (
      <p className={`flex items-start gap-1.5 text-[11.5px] leading-relaxed ${className}`} style={{ color: "var(--color-warning)" }}>
        <AlertTriangle size={12} className="mt-[3px] shrink-0" aria-hidden />
        <span>
          {t("att_unconfirmedNote")} {link(t("att_confirmTerm"), requestSetup)}
        </span>
      </p>
    );
  }

  // 4. Which rule is used, and the portal as the official number.
  const whose =
    rule?.source === "personal" ? (
      <>
        {t("attRulePersonalLine")} {link(t("attRuleEdit"), () => setFormOpen(true))}.{" "}
      </>
    ) : rule?.source === "university" && policy ? (
      <>
        {t(policyKind(policy) === "official" ? "attRuleOfficialLine" : "attRuleConfirmedLine")}.{" "}
      </>
    ) : null;
  return (
    <>
      <p className={`flex items-start gap-1.5 text-[11.5px] leading-relaxed ${className}`} style={{ color: "var(--color-muted)" }}>
        <Info size={12} className="mt-[3px] shrink-0" aria-hidden />
        <span>
          {whose}
          {t("att_approxNote")}
        </span>
      </p>
      {modal}
    </>
  );
}
