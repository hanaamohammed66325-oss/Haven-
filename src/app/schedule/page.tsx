"use client";

import { ComingSoon } from "@/components/ComingSoon";
import { useT } from "@/i18n";

export default function SchedulePage() {
  const { t } = useT();
  return <ComingSoon title={t("nav_schedule")} />;
}
