"use client";

import Link from "next/link";
import { Globe } from "lucide-react";
import { Logo } from "./Logo";
import { Markdown } from "./Markdown";
import { Footer } from "./Footer";
import { useStore } from "@/store";
import { useT } from "@/i18n";

// Shared shell for the three legal pages. Renders the brand + language switcher,
// then the active locale's title, the bilingual effective/updated meta, the
// policy body, and the site footer. Only ONE language's content is rendered,
// chosen from the active locale.
export function PolicyPage({
  titleEn,
  titleAr,
  meta,
  en,
  ar,
  notice,
}: {
  titleEn: string;
  titleAr: string;
  meta: string;
  en: string;
  ar: string;
  /** Optional highlighted callout shown above the meta (e.g. payments disabled). */
  notice?: { en: string; ar: string };
}) {
  const { t, lang } = useT();
  const { language, setLanguage } = useStore();
  const title = lang === "ar" ? titleAr : titleEn;
  const body = lang === "ar" ? ar : en;
  const noticeText = notice ? (lang === "ar" ? notice.ar : notice.en) : null;

  return (
    <div className="haven-safe-top min-h-dvh flex flex-col">
      <header className="mx-auto w-full max-w-[720px] px-5 flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={30} mono />
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
        <h1 className="font-display text-[32px] leading-tight mt-4 mb-4" style={{ color: "var(--color-ink)" }}>
          {title}
        </h1>
        {noticeText && (
          <div
            className="mb-6 rounded-2xl px-4 py-3.5 text-[14px] leading-relaxed"
            style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)", border: "1px solid var(--color-border)" }}
            role="note"
          >
            {noticeText}
          </div>
        )}
        <Markdown content={meta} className="mb-8 text-[13px]" />
        <Markdown content={body} />
      </main>

      <Footer />
    </div>
  );
}
