"use client";

// Group study («مذاكرة جماعية»): the groups list at /study/, one group's page at
// /study/?g=<id>. Behind GROUP_STUDY_ENABLED until the feature is done; the
// server also keeps it closed to all but the trial accounts.

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useT, usePageTitle } from "@/i18n";
import { GROUP_STUDY_ENABLED, openingDateLabel } from "@/lib/featureFlags";
import { ComingSoon } from "@/components/ComingSoon";
import { StudyGroups } from "@/components/study/StudyGroups";
import { UUID } from "@/lib/study/parse";
import { GroupPage } from "@/components/study/GroupPage";


export default function StudyPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <StudyInner />
    </Suspense>
  );
}

function StudyInner() {
  const { t, lang } = useT();
  usePageTitle("study_title");
  const g = useSearchParams().get("g");
  if (!GROUP_STUDY_ENABLED) return <ComingSoon title={t("study_title")} desc={t("study_soonBody", { date: openingDateLabel(lang) })} />;
  return g && UUID.test(g) ? <GroupPage key={g} groupId={g} /> : <StudyGroups />;
}
