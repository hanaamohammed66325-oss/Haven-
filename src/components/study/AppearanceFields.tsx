"use client";
import { InteractionButton } from "@/components/motion/Interaction";

// What the other members of a group see of a member, and nothing else: the
// name, Havi's name, Havi's colour and the flower colour of their pads.

import { useT } from "@/i18n";
import type { StudyAppearance } from "@/lib/study/types";

export const field =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";
export const fieldStyle = { borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" };

/** Havi's colours to pick from (his own green first), and the flowers'. */
const HAVI_COLORS = ["#a8d98a", "#83c9ba", "#88b5d1", "#b8acd9", "#e3a2b3", "#d8c38a", "#dda899", "#bbd09c"];
const FLOWER_COLORS = ["#edb7c8", "#eebc6d", "#a4c9ed", "#cfabea", "#e5a88a", "#b9d09b", "#ebcf86", "#eb9cba"];

/** The server's limits (study.clean_name): a member's name and a group's name 40, Havi's name 20. */
export const NAME_MAX = 40;
export const HAVI_NAME_MAX = 20;

/** 1 to max characters once trimmed (the server also refuses control and direction characters). */
export const nameOk = (s: string, max = NAME_MAX) => s.trim().length > 0 && s.trim().length <= max;

export function appearanceValid(a: StudyAppearance): boolean {
  return nameOk(a.displayName) && nameOk(a.haviName, HAVI_NAME_MAX);
}

export function AppearanceFields({ value, onChange }: { value: StudyAppearance; onChange: (a: StudyAppearance) => void }) {
  const { t } = useT();
  const set = (p: Partial<StudyAppearance>) => onChange({ ...value, ...p });
  const label = "text-xs font-medium";
  const muted = { color: "var(--color-muted)" };
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold">{t("study_appearanceTitle")}</legend>
      <p className="-mt-1 text-xs" style={muted}>{t("study_appearanceHint")}</p>
      <label className="flex flex-col gap-1.5">
        <span className={label} style={muted}>{t("study_yourName")}</span>
        <input className={field} style={fieldStyle} value={value.displayName} maxLength={NAME_MAX}
          onChange={(e) => set({ displayName: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={label} style={muted}>{t("study_haviName")}</span>
        <input className={field} style={fieldStyle} value={value.haviName} maxLength={HAVI_NAME_MAX}
          onChange={(e) => set({ haviName: e.target.value })} />
      </label>
      <Swatches label={t("study_haviColor")} colors={HAVI_COLORS} value={value.haviColor} onChange={(c) => set({ haviColor: c })} />
      <Swatches label={t("study_flowerColor")} colors={FLOWER_COLORS} value={value.flowerColor} onChange={(c) => set({ flowerColor: c })} />
    </fieldset>
  );
}

function Swatches({ label, colors, value, onChange }: { label: string; colors: string[]; value: string; onChange: (c: string) => void }) {
  const { t } = useT();
  const custom = !colors.includes(value);
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={label}>
      <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{label}</span>
      <div className="flex flex-wrap gap-2">
        <div className="contents" role="radiogroup" aria-label={label}>
        {colors.map((c) => (
          <InteractionButton key={c} type="button" role="radio" aria-checked={value === c} aria-label={`${label} ${c}`}
            onClick={() => onChange(c)}
            className="h-8 w-8 rounded-full transition-transform hover:scale-105"
            style={{ background: c, outline: value === c ? "2.5px solid var(--color-primary)" : "1px solid var(--color-border)", outlineOffset: 2 }} />
        ))}
        </div>
        <label title={t("plannerCustomColor")}
          className="relative h-8 w-8 shrink-0 cursor-pointer rounded-full transition-transform hover:scale-105 focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:ring-offset-2"
          style={{ background: "conic-gradient(#d9534f, #e89b4a, #f2d94e, #5fa98c, #477680, #8a6fb0, #d9534f)", outline: custom ? "2.5px solid var(--color-primary)" : "1px solid var(--color-border)", outlineOffset: 2 }}>
          {custom && <span className="pointer-events-none absolute inset-2 rounded-full border border-white/70" style={{ background: value }} />}
          <input type="color" value={value} aria-label={`${label}: ${t("plannerCustomColor")}`}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
      </div>
    </div>
  );
}
