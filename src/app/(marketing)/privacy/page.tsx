"use client";

import { PolicyPage } from "@/components/PolicyPage";
import { PRIVACY_META, PRIVACY_EN, PRIVACY_AR } from "@/lib/policies";

export default function PrivacyPage() {
  return (
    <PolicyPage
      titleEn="Privacy Policy"
      titleAr="سياسة الخصوصية"
      meta={PRIVACY_META}
      en={PRIVACY_EN}
      ar={PRIVACY_AR}
    />
  );
}
