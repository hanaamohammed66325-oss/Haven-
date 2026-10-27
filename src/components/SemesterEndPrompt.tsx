"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { semesterEndPromptDue } from "@/lib/semesterProgress";
import { isPlaceholderSemester } from "./SetupCheck";
import { useWhatsNewReady } from "./useWhatsNewReady";
import { Modal } from "./Modal";
import { NewSemesterForm } from "./NewSemesterForm";
import { InteractionButton } from "./motion/Interaction";

export function SemesterEndPrompt() {
  const store = useStore();
  const { t } = useT();
  const whatsNewReady = useWhatsNewReady(store.accountId, store.whatsNewSeen ?? {});
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const current = new Date();
      setNow(current);
      const nextDay = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
      timer = setTimeout(refresh, nextDay.getTime() - current.getTime() + 100);
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const due = store.hydrated && store.authStatus === "signedIn" && !!store.accountId &&
    store.onboardingSeen && whatsNewReady &&
    semesterEndPromptDue(store.semester, now, store.semesterEndPromptDismissed,
      !!store.setupConfirmed.semester || !isPlaceholderSemester(store.semester));

  useEffect(() => {
    if (!due || open) return;
    // Setup, GPA verification, and release dialogs open first. Wait until the
    // current dialog closes so two overlays never compete for focus.
    let timer: ReturnType<typeof setTimeout>;
    const tryOpen = () => {
      if (!document.querySelector('[role="dialog"]')) {
        setOpen(true);
      } else {
        timer = setTimeout(tryOpen, 750);
      }
    };
    timer = setTimeout(tryOpen, 1800);
    return () => clearTimeout(timer);
  }, [due, open]);

  useEffect(() => {
    setOpen(false);
    setNaming(false);
    setError(false);
  }, [store.accountId, store.semester.id]);

  async function later() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await store.dismissSemesterEndPrompt();
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (!open || !due) return null;
  return <Modal open onClose={() => void later()} title={t("semesterEndTitle")}>
    <div className="space-y-4">
      <p className="text-sm leading-7" style={{ color: "var(--color-text)" }}>
        {t("semesterEndBody", { name: store.semester.name || t("semesterDefaultName") })}
      </p>
      <p className="text-sm leading-7" style={{ color: "var(--color-text-muted)" }}>
        {t("semesterEndProfileHint")}
      </p>
      {naming && <NewSemesterForm onBack={() => setNaming(false)} />}
      {error && <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
        {t("semesterEndSaveError")}
      </p>}
      <div className="flex flex-wrap justify-end gap-2">
        <InteractionButton type="button" onClick={() => void later()} disabled={busy}
          className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ borderColor: "var(--color-border-strong)" }}>
          {t("semesterEndLater")}
        </InteractionButton>
        {!naming && <InteractionButton type="button" onClick={() => setNaming(true)} disabled={busy}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-primary)" }}>
          {t("semesterSwitcherNew")}
        </InteractionButton>}
      </div>
    </div>
  </Modal>;
}
