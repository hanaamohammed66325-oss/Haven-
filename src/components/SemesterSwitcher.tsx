"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus } from "./motion/icons";
import { InteractionButton } from "./motion/Interaction";
import { Card } from "./Card";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { toISODate } from "@/lib/dates";
import { NewSemesterForm } from "./NewSemesterForm";
import { semestersWithoutRows } from "@/lib/db";
import { canPinSemester, duplicateSemesterCandidates, hiddenDuplicateSemesters } from "@/lib/semesterProgress";

function dateLabel(value: string | null, language: "ar" | "en") {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(language === "ar" ? "ar" : "en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function SemesterSwitcher() {
  const { t } = useT();
  const router = useRouter();
  const { language, semester, semesterOptions, activeSemesterId, currentSemesterManualId,
    openSemester, returnToActiveSemester, setCurrentSemester,
    useAutomaticCurrentSemester, authStatus, accountId } = useStore();
  const [open, setOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const selectedId = semester.id ?? "";

  useEffect(() => { setError(false); }, [accountId]);

  // An empty leftover copy of a term (the same dates as another term, nothing
  // in it) stays out of the list, so two terms never seem to hold different
  // holiday rules for one period. Nothing is deleted. Checked only while the
  // list is open, and only for the few terms that could be such a copy.
  useEffect(() => {
    if (!open) return;
    const ids = duplicateSemesterCandidates(semesterOptions, selectedId);
    if (!ids.length) { setHidden(new Set()); return; }
    let alive = true;
    semestersWithoutRows(ids)
      .then((empty) => { if (alive) setHidden(hiddenDuplicateSemesters(semesterOptions, empty, selectedId)); })
      .catch(() => { if (alive) setHidden(new Set()); });
    return () => { alive = false; };
  }, [open, semesterOptions, selectedId]);

  async function choose(id: string) {
    if (id === selectedId || busy) return;
    if (id === activeSemesterId) {
      returnToActiveSemester();
      return;
    }
    setBusy(true);
    setError(false);
    try {
      await openSemester(id);
      setOpen(false);
      router.push("/dashboard");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function makeCurrent(id: string) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await setCurrentSemester(id);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  async function useDates() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await useAutomaticCurrentSemester();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  if (authStatus !== "signedIn") return null;
  const visibleOptions = semesterOptions.filter((item) => !hidden.has(item.id));

  return (
    <Card id="semesters" className="mb-6" style={{ borderColor: "var(--color-border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-primary)" }}>
            {t("semesterSwitcherTitle")}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            {t("semesterSwitcherHint")}
          </p>
        </div>
        <InteractionButton
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"
          style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text)" }}
          aria-expanded={open}
        >
          {semester.name || t("semesterDefaultName")}
          <ChevronDown size={16} aria-hidden="true" />
        </InteractionButton>
      </div>

      {open && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="grid gap-2">
            {error && <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>{t("semesterActionError")}</p>}
            {visibleOptions.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("semesterSwitcherEmpty")}</p>
            ) : visibleOptions.map((item) => {
              const selected = item.id === selectedId;
              const current = item.id === activeSemesterId;
              const upcoming = !!item.startDate && item.startDate > toISODate(new Date());
              return (
                <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-2"
                  style={{
                    borderColor: selected ? "var(--color-primary)" : "var(--color-border)",
                    background: selected ? "color-mix(in srgb, var(--color-primary) 8%, transparent)" : "transparent",
                  }}
                >
                  <InteractionButton type="button" onClick={() => choose(item.id)} disabled={busy}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-1 text-start">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold" style={{ color: "var(--color-text)" }}>{item.name}</span>
                      <span className="mt-1 block text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {dateLabel(item.startDate, language)}{item.endDate ? ` — ${dateLabel(item.endDate, language)}` : ""}
                      </span>
                      {current && <span className="mt-1 block text-xs" style={{ color: "var(--color-primary)" }}>{t("semesterSwitcherCurrent")}</span>}
                      {upcoming && !current && <span className="mt-1 block text-xs" style={{ color: "var(--color-text-muted)" }}>{t("semesterSwitcherUpcoming")}</span>}
                    </span>
                    {selected && <Check size={17} className="shrink-0" style={{ color: "var(--color-primary)" }} aria-label={t("semesterSwitcherSelected")} />}
                  </InteractionButton>
                  {!current && canPinSemester(item, semesterOptions, toISODate(new Date())) && <InteractionButton type="button" onClick={() => void makeCurrent(item.id)} disabled={busy}
                    className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                    style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text)" }}>
                    {t("semesterSwitcherMakeCurrent")}
                  </InteractionButton>}
                </div>
              );
            })}
          </div>

          {currentSemesterManualId && <InteractionButton type="button" onClick={() => void useDates()} disabled={busy}
            className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ borderColor: "var(--color-border-strong)" }}>
            {t("semesterSwitcherUseDates")}
          </InteractionButton>}

          <div className="mt-4">
            {!newOpen ? (
              <InteractionButton
                type="button"
                onClick={() => setNewOpen(true)}
                className="inline-flex items-center gap-2 text-sm font-semibold"
                style={{ color: "var(--color-primary)" }}
              >
                <Plus size={16} aria-hidden="true" />
                {t("semesterSwitcherNew")}
              </InteractionButton>
            ) : (
              <NewSemesterForm onBack={() => setNewOpen(false)} ignoreIds={hidden} />
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
