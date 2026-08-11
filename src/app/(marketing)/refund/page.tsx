"use client";

import { PolicyPage } from "@/components/PolicyPage";
import { REFUND_META, REFUND_EN, REFUND_AR } from "@/lib/policies";

export default function RefundPage() {
  return (
    <PolicyPage
      titleEn="Refund Policy"
      titleAr="سياسة الاسترجاع"
      meta={REFUND_META}
      en={REFUND_EN}
      ar={REFUND_AR}
    />
  );
}
