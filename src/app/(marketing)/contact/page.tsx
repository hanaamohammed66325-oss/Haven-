"use client";

import Link from "next/link";
import { Globe, Mail } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { useStore } from "@/store";
import { useT } from "@/i18n";

const EMAIL = "support@havenstudent.com";

export default function ContactPage() {
  const { t, lang } = useT();
  const { language, setLanguage } = useStore();
  const ar = lang === "ar";

  const title = ar ? "تواصل معنا" : "Contact us";
  const body = ar
    ? "لأي استفسار أو طلب دعم، راسلنا على البريد الإلكتروني:"
    : "For any inquiry or support request, email us at:";
  const note = ar ? "نستجيب عادةً خلال ٤٨ ساعة." : "We usually respond within 48 hours.";

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="mx-auto w-full max-w-[720px] px-5 flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={30} tile />
          <span className="font-display text-xl" style={{ color: "var(--color-ink)" }}>
            {t("appName")}
          </span>
        </Link>
        <button
          onClick={() => setLanguage(language === "en" ? "ar" : "en")}
          className="surface-card inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium"
          style={{ color: "var(--color-ink)" }}
        >
          <Globe size={15} />
          <span className="hidden sm:inline">
            {lang === "en" ? t("switchToArabic") : t("switchToEnglish")}
          </span>
        </button>
      </header>

      <main className="mx-auto w-full max-w-[720px] px-5 flex-1 pb-16">
        <h1 className="font-display text-[32px] leading-tight mt-6 mb-4" style={{ color: "var(--color-ink)" }}>
          {title}
        </h1>
        <p className="text-[15px] leading-relaxed mb-6" style={{ color: "var(--color-muted)" }}>
          {body}
        </p>

        <a
          href={`mailto:${EMAIL}`}
          className="haven-btn inline-flex items-center gap-2.5 rounded-2xl px-6 py-4 text-base font-semibold"
          style={{ direction: "ltr" }}
        >
          <Mail size={18} />
          {EMAIL}
        </a>

        <p className="text-[13px] mt-6" style={{ color: "var(--color-muted)" }}>
          {note}
        </p>
      </main>

      <Footer />
    </div>
  );
}
