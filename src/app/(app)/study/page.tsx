"use client";
import { useGroupStudyEnabled } from "@/components/useGroupStudyEnabled";

// Group study («مذاكرة جماعية»): the groups list at /study/, one group's page at
// /study/?g=<id>. Behind groupsAvailable until the feature is done; the
// server also keeps it closed to all but the trial accounts.

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useT, usePageTitle } from "@/i18n";
import { openingDateLabel } from "@/lib/featureFlags";
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
  const groupsAvailable = useGroupStudyEnabled();
  const { t, lang } = useT();
  usePageTitle("study_title");
  const g = useSearchParams().get("g");
  if (!groupsAvailable) return <ComingSoon title={t("study_title")} desc={t("study_soonBody", { date: openingDateLabel(lang) })} />;
  return g && UUID.test(g) ? <GroupPage key={g} groupId={g} /> : <StudyGroups />;
}
