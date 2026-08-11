"use client";

import { PolicyPage } from "@/components/PolicyPage";
import { TERMS_META, TERMS_EN, TERMS_AR } from "@/lib/policies";

export default function TermsPage() {
  return (
    <PolicyPage
      titleEn="Terms of Service"
      titleAr="الشروط والأحكام"
      meta={TERMS_META}
      en={TERMS_EN}
      ar={TERMS_AR}
    />
  );
}
