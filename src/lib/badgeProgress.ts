import type { GamificationState } from "./gamification";

/** Earned progress survives an older device snapshot; tiers have separate badges. */
export function preserveEarnedBadges(
  saved: GamificationState,
  incoming: GamificationState,
): GamificationState {
  if (incoming.badgeTier < saved.badgeTier) {
    return { ...incoming, badgeTier: saved.badgeTier, badges: saved.badges };
  }
  if (incoming.badgeTier > saved.badgeTier) return incoming;
  const badges = [...new Set([...saved.badges, ...incoming.badges])];
  return { ...incoming, badges };
}
