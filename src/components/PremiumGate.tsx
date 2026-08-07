"use client";

import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useT } from "@/i18n";
import { Modal } from "./Modal";

export type PremiumFeature = "course" | "theme" | "havi" | "generic";

// Copy per feature, in the active locale. Gender-neutral phrasing throughout
// (no feminine-only verb forms). "Haven"/"Havi" always stay in Latin script.
const COPY: Record<PremiumFeature, { ar: { title: string; body: string }; en: { title: string; body: string } }> = {
  course: {
    ar: { title: "الحد المجاني للكورسات", body: "الاشتراك يفتح كورسات غير محدودة، وHavi، وكل الثيمات." },
    en: { title: "Free course limit reached", body: "Subscribe to unlock unlimited courses, Havi, and all themes." },
  },
  theme: {
    ar: { title: "ثيم مميّز", body: "هذا الثيم متاح مع الاشتراك." },
    en: { title: "Premium theme", body: "This theme is available with a subscription." },
  },
  havi: {
    ar: { title: "Havi يجي مع الاشتراك", body: "شات Havi متاح للمشتركين." },
    en: { title: "Havi is a subscriber feature", body: "The Havi chat is available with a subscription." },
  },
  generic: {
    ar: { title: "ميزة الاشتراك", body: "هذه الميزة تحتاج اشتراكاً." },
    en: { title: "Subscriber feature", body: "This feature requires a subscription." },
  },
};

// Brand accent used for the primary CTA.
const BRAND = "#2b3648";

/**
 * Single reusable "this is behind Premium" modal, used everywhere a premium
 * feature is blocked. Primary CTA routes to /premium; secondary closes.
 */
export function PremiumGate({
  open,
  onClose,
  feature,
}: {
  open: boolean;
  onClose: () => void;
  feature: PremiumFeature;
}) {
  const { lang } = useT();
  const router = useRouter();
  const copy = COPY[feature][lang];
  const seePlans = lang === "ar" ? "عرض الخطط" : "See plans";
  const close = lang === "ar" ? "إغلاق" : "Close";

  const goToPlans = () => {
    onClose();
    router.push("/premium");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copy.title}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium border"
            style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
          >
            {close}
          </button>
          <button
            type="button"
            onClick={goToPlans}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
            style={{ background: BRAND }}
          >
            <Sparkles size={16} />
            {seePlans}
          </button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
        {copy.body}
      </p>
    </Modal>
  );
}
