"use client";
import { InteractionButton } from "@/components/motion/Interaction";

import { useState } from "react";
import { ClipboardList } from "@/components/motion/icons";
import { useT } from "@/i18n";
import { AttendanceContributeModal } from "./AttendanceContributeModal";

/** While the attendance calculation is suspended (featureFlags): says so, and
 *  invites the student (optionally) to send their portal's absence record so the
 *  calculation can be improved before it returns. `courseId` preselects the
 *  course when opened from a course's details. */
export function AttendanceSuspendedNote({
  className = "",
  compact = false,
  courseId,
}: {
  className?: string;
  compact?: boolean;
  courseId?: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const cta = (
    <InteractionButton type="button" onClick={() => setOpen(true)} className="font-semibold underline underline-offset-2" style={{ color: "var(--color-primary)" }}>
      {t("attContrib_cta")}
    </InteractionButton>
  );
  const modal = <AttendanceContributeModal open={open} onClose={() => setOpen(false)} courseId={courseId} />;

  if (compact) {
    return (
      <>
        <p className={`flex items-start gap-1.5 text-[11.5px] leading-relaxed ${className}`} style={{ color: "var(--color-muted)" }}>
          <ClipboardList size={12} className="mt-[3px] shrink-0" aria-hidden />
          <span>
            {t("attSuspended_paused")} {cta}
          </span>
        </p>
        {modal}
      </>
    );
  }
  return (
    <>
      <div className={`rounded-xl border px-4 py-3.5 text-sm leading-relaxed ${className}`} style={{ borderColor: "var(--color-border)", background: "var(--color-primary-soft)" }}>
        <p className="font-semibold flex items-center gap-1.5 mb-1" style={{ color: "var(--color-ink)" }}>
          <ClipboardList size={15} aria-hidden />
          {t("attSuspended_title")}
        </p>
        <p className="mb-1" style={{ color: "var(--color-ink)" }}>{t("attSuspended_paused")}</p>
        <p className="mb-2" style={{ color: "var(--color-muted)" }}>{t("attSuspended_body")}</p>
        {cta}
      </div>
      {modal}
    </>
  );
}
