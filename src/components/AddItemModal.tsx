"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useT } from "@/i18n";
import type { ComponentType, GradeComponent, WeightUnit } from "@/types";

const COMPONENT_TYPES: ComponentType[] = ["quiz", "midterm", "final", "project", "assignment"];

const field =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

interface AddItemModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (component: Omit<GradeComponent, "id">) => void;
}

export function AddItemModal({ open, onClose, onSubmit }: AddItemModalProps) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [type, setType] = useState<ComponentType>("quiz");
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState<WeightUnit>("percent");
  const [total, setTotal] = useState("");
  const [dateMode, setDateMode] = useState<"none" | "specific">("none");
  const [date, setDate] = useState("");
  const [score, setScore] = useState("");

  const border = { borderColor: "var(--color-border)" };

  function reset() {
    setName("");
    setType("quiz");
    setWeight("");
    setUnit("percent");
    setTotal("");
    setDateMode("none");
    setDate("");
    setScore("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const w = Number(weight);
    const tot = Number(total);
    if (!name.trim() || !w || w <= 0 || !tot || tot <= 0) return;
    onSubmit({
      name: name.trim(),
      type,
      weight: w,
      unit,
      total: tot,
      score: score.trim() === "" ? null : Number(score),
      date: dateMode === "specific" && date ? date : null,
    });
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t("addItem")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("itemName")}</label>
          <input className={field} style={border} value={name} placeholder={t("itemNamePlaceholder")} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        {/* Type */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("itemType")}</label>
          <select className={field} style={border} value={type} onChange={(e) => setType(e.target.value as ComponentType)}>
            {COMPONENT_TYPES.map((ty) => (
              <option key={ty} value={ty}>{t(`type_${ty}` as const)}</option>
            ))}
          </select>
        </div>

        {/* Weight + unit */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("itemWeight")}</label>
          <div className="flex gap-2">
            <input className={field} style={border} type="number" min="0" step="any" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <div className="inline-flex rounded-xl p-1 shrink-0" style={{ background: "var(--color-primary-soft)" }}>
              {(["percent", "points"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className="rounded-lg px-3 py-1 text-sm font-medium transition-colors"
                  style={unit === u ? { background: "#fff", color: "var(--color-primary)" } : { color: "var(--color-muted)" }}
                >
                  {u === "percent" ? t("unitPercent") : t("unitPoints")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Out of (total) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("itemOutOf")}</label>
          <input className={field} style={border} type="number" min="0" step="any" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>

        {/* Date */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("itemDate")}</label>
          <div className="inline-flex rounded-xl p-1" style={{ background: "var(--color-primary-soft)" }}>
            {(["none", "specific"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDateMode(m)}
                className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                style={dateMode === m ? { background: "#fff", color: "var(--color-primary)" } : { color: "var(--color-muted)" }}
              >
                {m === "none" ? t("dateNotSpecified") : t("dateSpecific")}
              </button>
            ))}
          </div>
          {dateMode === "specific" && (
            <input className={`${field} mt-1`} style={border} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          )}
        </div>

        {/* Score (optional) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
            {t("itemScore")} <span style={{ opacity: 0.7 }}>({t("optional")})</span>
          </label>
          <input className={field} style={border} type="number" min="0" step="any" value={score} onChange={(e) => setScore(e.target.value)} />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}>
            {t("cancel")}
          </button>
          <button type="submit" className="haven-btn px-5 py-2 rounded-xl text-sm font-medium">
            {t("addItem")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
