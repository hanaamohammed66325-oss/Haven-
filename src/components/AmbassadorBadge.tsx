"use client";

import { useId } from "react";
import { useT } from "@/i18n";
import { InfoPopover } from "@/components/InfoPopover";
import { AMBASSADOR_BADGES } from "@/lib/ambassadorRewards";
import { highestEarnedReferralBadge } from "@/lib/referralRewards";
import { useReferralProgram } from "./useReferralProgram";

export function AmbassadorBadge({ id, size = 48 }: { id: string; size?: number }) {
  const instance = useId().replace(/:/g, "");
  const badge = AMBASSADOR_BADGES.find(b => b.id === id);
  if (!badge) return null;
  const svg = badge.svg.replace(/id="(am\d+)"/g, `id="$1-${instance}"`).replace(/url\(#(am\d+)\)/g, `url(#$1-${instance})`);
  return <span aria-hidden className="inline-flex shrink-0 [&>svg]:h-full [&>svg]:w-full" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Account identity never shows an unearned or unavailable badge. */
export function AmbassadorIdentityBadge() {
  const { lang } = useT();
  const program = useReferralProgram();
  const id = highestEarnedReferralBadge(program.profile);
  const ar = lang === "ar", badge = id ? AMBASSADOR_BADGES.find(b => b.id === id) : null;
  if (!badge) return null;
  const label = ar ? badge.ar : badge.en;
  return (
    <InfoPopover label={label} trigger={
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-[var(--color-primary-soft)]">
        <AmbassadorBadge id={badge.id} size={28} />
      </span>
    }>
      <span className="block font-semibold mb-1">{label}</span>
      {ar ? "أعلى شارة مكتسبة في برنامج السفير." : "Your highest earned ambassador badge."}
    </InfoPopover>
  );
}
