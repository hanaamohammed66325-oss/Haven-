"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trophy, X } from "lucide-react";
import { useT } from "@/i18n";
import { BADGES } from "@/lib/gamification";
import { BadgeCrest } from "@/components/BadgeCrest";
import type { TranslationKey } from "@/i18n/translations/en";

interface AchievementEvent {
  newBadges: string[];
  tierAdvanced: boolean;
  newTier: number;
}

const AUTO_DISMISS_MS = 6000;
const TIER_ICONS = ["", "🥉", "🥈", "🥇", "💎"];

export function AchievementToast() {
  const { t } = useT();
  const [items, setItems] = useState<AchievementEvent[]>([]);
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AchievementEvent>).detail;
      setItems((prev) => [...prev, detail]);
    };
    window.addEventListener("haven-achievement", handler);
    return () => window.removeEventListener("haven-achievement", handler);
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setItems([]), AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [items]);

  if (!mounted || items.length === 0) return null;

  const latest = items[items.length - 1];
  const badgeDefs = latest.newBadges
    .map((id) => BADGES.find((b) => b.id === id))
    .filter(Boolean);

  const close = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setItems([]);
  };

  return createPortal(
    <div
      role="status"
      aria-live="assertive"
      className="fixed bottom-5 start-5 z-[80] w-[320px] max-w-[calc(100vw-2.5rem)] rounded-2xl p-4 animate-[slideUp_0.4s_ease-out]"
      style={{
        background: latest.tierAdvanced
          ? "linear-gradient(135deg, var(--color-brass), var(--color-primary))"
          : "var(--card-bg)",
        boxShadow: "var(--shadow-card-hover)",
        border: latest.tierAdvanced ? "none" : "1px solid var(--color-border)",
        color: latest.tierAdvanced ? "#fff" : "var(--color-ink)",
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Trophy
            size={16}
            style={{ color: latest.tierAdvanced ? "#fff" : "var(--color-brass)" }}
          />
          <span className="text-sm font-semibold">
            {latest.tierAdvanced
              ? t("gam_achievementTierUp")
              : latest.newBadges.length > 1
                ? t("gam_achievementBadges", { n: latest.newBadges.length })
                : t("gam_achievementBadge")}
          </span>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={t("close")}
          className="rounded-lg p-1 -m-1 transition-colors hover:bg-black/10"
        >
          <X size={15} style={{ opacity: 0.7 }} />
        </button>
      </div>

      {latest.tierAdvanced && (
        <p className="text-sm mb-2" style={{ opacity: 0.9 }}>
          {t("gam_achievementTierUpDesc", {
            tier: `${TIER_ICONS[latest.newTier] || ""} ${t(`gam_tierLabel_${latest.newTier}` as TranslationKey)}`,
          })}
        </p>
      )}

      {badgeDefs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {badgeDefs.map((badge) => {
            const key = badge!.id.replace(/-([a-z])/g, (_, c: string) =>
              c.toUpperCase()
            );
            return (
              <div
                key={badge!.id}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
                style={{
                  background: latest.tierAdvanced
                    ? "rgba(255,255,255,0.2)"
                    : "var(--color-surface-alt)",
                }}
              >
                <BadgeCrest id={badge!.id} tier={latest.newTier} size={22} />
                <span className="font-medium">
                  {t(`gam_badge_${key}` as TranslationKey)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>,
    document.body
  );
}
