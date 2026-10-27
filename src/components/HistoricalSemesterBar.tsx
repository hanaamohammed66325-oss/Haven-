"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { InteractionButton } from "./motion/Interaction";

export function HistoricalSemesterBar() {
  const { t } = useT();
  const { historicalSemesterId, historicalReadOnly, semester, setHistoricalEditing, returnToActiveSemester } = useStore();
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const onBlocked = () => setBlocked(true);
    window.addEventListener("haven-history-write-blocked", onBlocked);
    return () => window.removeEventListener("haven-history-write-blocked", onBlocked);
  }, []);
  useEffect(() => { setBlocked(false); }, [historicalSemesterId, historicalReadOnly]);
  if (!historicalSemesterId) return null;

  return <div role="status" className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 sm:px-6 md:px-10"
    style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}>
    <div className="min-w-0">
      <p className="text-sm font-semibold">{semester.name}</p>
      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        {t(historicalReadOnly ? "semesterHistoryViewOnly" : "semesterHistoryEditing")}
      </p>
      {blocked && <p role="alert" className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>
        {t("semesterHistoryWriteBlocked")}
      </p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <InteractionButton type="button" onClick={() => setHistoricalEditing(historicalReadOnly)}
        className="rounded-lg border px-3 py-2 text-sm font-semibold"
        style={{ borderColor: "var(--color-border-strong)" }}>
        {t(historicalReadOnly ? "semesterHistoryEnableEdit" : "semesterHistoryStopEdit")}
      </InteractionButton>
      <InteractionButton type="button" onClick={returnToActiveSemester}
        className="rounded-lg px-3 py-2 text-sm font-semibold text-white"
        style={{ background: "var(--color-primary)" }}>
        {t("semesterHistoryReturn")}
      </InteractionButton>
    </div>
  </div>;
}
