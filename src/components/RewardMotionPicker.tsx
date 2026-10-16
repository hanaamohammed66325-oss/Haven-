"use client";
import { InteractionButton } from "@/components/motion/Interaction";

import { useState } from "react";
import { Check } from "@/components/motion/icons";
import { useT } from "@/i18n";
import { REWARD_MOTIONS } from "@/lib/rewardMotions";
import { RewardThemeMotion } from "./RewardThemeMotion";
import type { RewardMotionId, RewardMotionTheme } from "@/types";

export function RewardMotionPicker({ theme, selected, onSelect }: { theme: RewardMotionTheme; selected: RewardMotionId; onSelect: (motion: RewardMotionId) => void }) {
  const { t } = useT();
  return (
    <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--color-border)" }}>
      <h3 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{t("theme_motion_label")}</h3>
      <p className="mt-1 mb-3 text-xs" style={{ color: "var(--color-muted)" }}>{t("theme_motion_hint")}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {REWARD_MOTIONS[theme].map(choice => <MotionChoice key={choice.id} theme={theme} motion={choice.id} name={t(choice.nameKey)} selected={selected === choice.id} onSelect={() => onSelect(choice.id)} />)}
      </div>
    </div>
  );
}

function MotionChoice({ theme, motion, name, selected, onSelect }: { theme: RewardMotionTheme; motion: RewardMotionId; name: string; selected: boolean; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <InteractionButton type="button" onClick={onSelect} aria-pressed={selected} className="relative rounded-xl border p-2.5 text-start"
      onPointerEnter={event => { if (event.pointerType !== "touch") setHovered(true); }} onPointerLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)} onTouchEnd={() => setHovered(false)} onTouchCancel={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ background: "var(--color-surface)", borderColor: selected ? "var(--color-primary)" : "var(--color-border)", boxShadow: selected ? "0 0 0 1px var(--color-primary)" : undefined }}>
      <div className="relative h-20 overflow-hidden rounded-lg" style={{ background: theme === "aurora" ? "linear-gradient(155deg,#d6dfe6,#b7c5d1,#e8edf1)" : theme === "coral" ? "linear-gradient(155deg,#4b5377,#665574,#88586d)" : "linear-gradient(155deg,#242019,#14110c)" }}>
        <RewardThemeMotion theme={theme} motion={motion} preview active={hovered || focused} />
      </div>
      <span className="mt-2 flex items-center justify-between gap-2 text-xs font-medium" style={{ color: "var(--color-ink)" }}>{name}{selected && <Check aria-hidden size={14} className="shrink-0" />}</span>
    </InteractionButton>
  );
}
