"use client";

/**
 * HaviCompanions — mounts the roaming pets the student has chosen to keep.
 * A thin client wrapper so the (server) app layout can stay a server component:
 * it reads `haviCompanions` from the store and renders one HaviCompanion per
 * enabled kind. The student can keep the fox, the tiger, both, or none — set on
 * the Profile page (Ambassador panel).
 */
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { canUseReferralReward } from "@/lib/referralRewards";
import HaviCompanion from "@/components/HaviCompanion";

export default function HaviCompanions() {
  const { haviCompanions, referralProgram } = useStore();
  const { t } = useT();
  const kinds = (haviCompanions || []).filter(id => canUseReferralReward(referralProgram?.profile, "companion", id));
  return (
    <>
      {kinds.includes("fox") && <HaviCompanion kind="fox" corner="left" size={44} interactionLabel={t("haviPet_foxInteract")} />}
      {kinds.includes("tiger") && <HaviCompanion kind="tiger" corner="right" size={48} interactionLabel={t("haviPet_tigerInteract")} />}
    </>
  );
}
