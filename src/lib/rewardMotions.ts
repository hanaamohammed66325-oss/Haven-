import type { RewardMotionChoices, RewardMotionId, RewardMotionTheme } from "@/types";

export const REWARD_MOTIONS = {
  aurora: [
    { id: "glass", nameKey: "theme_motion_glass" },
    { id: "liquid-silver", nameKey: "theme_motion_liquid_silver" },
    { id: "silver-ribbon", nameKey: "theme_motion_silver_ribbon" },
  ],
  coral: [
    { id: "petals", nameKey: "theme_motion_petals" },
    { id: "silk", nameKey: "theme_motion_silk" },
    { id: "lotus", nameKey: "theme_motion_lotus" },
  ],
  ambassador: [
    { id: "fireflies", nameKey: "theme_motion_fireflies" },
    { id: "river", nameKey: "theme_motion_river" },
    { id: "gilded-stars", nameKey: "theme_motion_gilded_stars" },
  ],
} as const;

export const DEFAULT_REWARD_MOTIONS: RewardMotionChoices = { aurora: "glass", coral: "petals", ambassador: "fireflies" };
export const isRewardTheme = (id: string) => id === "aurora" || id === "coral" || id === "ambassador";
export const hasRewardMotions = (theme: string): theme is RewardMotionTheme => isRewardTheme(theme);

export function isAllowedRewardMotion(theme: string, id: unknown): id is RewardMotionId {
  return hasRewardMotions(theme) && REWARD_MOTIONS[theme].some(choice => choice.id === id);
}

export function normalizeRewardMotions(raw: unknown): RewardMotionChoices {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    aurora: isAllowedRewardMotion("aurora", value.aurora) ? value.aurora : DEFAULT_REWARD_MOTIONS.aurora,
    coral: isAllowedRewardMotion("coral", value.coral) ? value.coral : DEFAULT_REWARD_MOTIONS.coral,
    ambassador: isAllowedRewardMotion("ambassador", value.ambassador) ? value.ambassador : DEFAULT_REWARD_MOTIONS.ambassador,
  };
}

export function selectedRewardMotion(theme: string, choices?: RewardMotionChoices): RewardMotionId | null {
  return hasRewardMotions(theme) ? normalizeRewardMotions(choices)[theme] : null;
}
