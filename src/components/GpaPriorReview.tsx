"use client";

import { useStore, useScheme } from "@/store";
import { useT } from "@/i18n";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { priorGpaReview } from "@/lib/gpaSystem";
import { InteractionButton } from "./motion/Interaction";
import { Modal } from "./Modal";

/** Every cumulative result explains why an incompatible prior record is held. */
export function GpaReviewLink({ enabled, onRequest, kind = "prior" }: { enabled: boolean; onRequest: () => void; kind?: "prior" | "past" }) {
  const params = useSearchParams();
  const consumed = useRef(false);
  const requested = params.get("review") === kind;
  useEffect(() => {
    if (!requested) { consumed.current = false; return; }
    if (!enabled || consumed.current) return;
    consumed.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("review");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    onRequest();
  }, [requested, enabled, onRequest]);
  return null;
}

export function GpaPriorReview({ enableDeepLink = false }: { enableDeepLink?: boolean }) {
  const { cumulativeGpa, cumulativeHours, cumulativeGpaSystem, gpaMode, hydrated, historicalReadOnly, confirmPreviousGpa, recordPriorGpaReviewShown } = useStore();
  const scheme = useScheme();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const confirming = useRef(false);
  const [editing, setEditing] = useState(false);
  const [gpa, setGpa] = useState("");
  const [hours, setHours] = useState("");
  const [error, setError] = useState(false);
  const reason = priorGpaReview(cumulativeGpa, cumulativeHours, scheme, cumulativeGpaSystem);
  const visibleReason = reason === "invalid" && gpaMode !== "cumulative" ? null : reason;
  const review = useCallback(() => {
    confirming.current = false;
    setGpa(String(cumulativeGpa));
    setHours(String(cumulativeHours));
    setEditing(false);
    setError(false);
    setOpen(true);
  }, [cumulativeGpa, cumulativeHours]);
  const requestReview = useCallback(() => { setRequested(true); review(); }, [review]);
  useEffect(() => {
    if (hydrated && (visibleReason || (requested && open))) recordPriorGpaReviewShown(reason ?? "requested");
  }, [hydrated, visibleReason, requested, open, scheme, cumulativeGpaSystem, recordPriorGpaReviewShown]);
  const confirm = () => {
    if (confirming.current) return;
    confirming.current = true;
    if (!gpa.trim() || !hours.trim() || !confirmPreviousGpa(Number(gpa), Number(hours), true)) {
      confirming.current = false;
      setEditing(true);
      setError(true);
      return;
    }
    setOpen(false);
    setRequested(false);
  };
  return (
    <>
      {enableDeepLink && <Suspense fallback={null}><GpaReviewLink enabled={hydrated && !historicalReadOnly} onRequest={requestReview} /></Suspense>}
      {visibleReason && <div role="status" className="mt-3 text-xs leading-relaxed" style={{ color: "var(--color-warning)" }}>
        <p>{t(reason === "systemChanged" ? "gpaSystemChanged" : "gpaPriorReview", { gpa: cumulativeGpa, max: scheme.max })}</p>
        <InteractionButton type="button" onClick={review} className="mt-1 underline underline-offset-2">
          {t("gpaReviewData")}
        </InteractionButton>
      </div>}
      <Modal open={open} onClose={() => { setOpen(false); setRequested(false); }} title={t("gpaReviewData")} footer={
        <div className="flex justify-between gap-3">
          <InteractionButton type="button" onClick={() => { setEditing(true); setError(false); }} className="px-4 py-2 rounded-xl text-sm border" style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}>
            {t("gpaEditData")}
          </InteractionButton>
          <InteractionButton type="button" onClick={confirm} className="haven-btn px-5 py-2 rounded-xl text-sm">
            {t("gpaConfirmData")}
          </InteractionButton>
        </div>
      }>
        <p className="text-sm mb-4" style={{ color: "var(--color-muted)" }}>{t("gpaReviewDataIntro")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs" style={{ color: "var(--color-muted)" }}>{t("cumPrevGpa")}
            <input type="number" min="0" max={scheme.max} step="any" inputMode="decimal" readOnly={!editing} value={gpa} onChange={(e) => { setGpa(e.target.value); setError(false); }} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }} />
          </label>
          <label className="text-xs" style={{ color: "var(--color-muted)" }}>{t("cumCompletedHours")}
            <input type="number" min="0" step="any" inputMode="decimal" readOnly={!editing} value={hours} onChange={(e) => { setHours(e.target.value); setError(false); }} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }} />
          </label>
        </div>
        {error && <p role="alert" className="mt-3 text-xs" style={{ color: "var(--color-danger)" }}>{t("gpaPreviousConfirmError", { max: scheme.max })}</p>}
      </Modal>
    </>
  );
}
