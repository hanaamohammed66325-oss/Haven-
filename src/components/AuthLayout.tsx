"use client";

import Link from "next/link";
import { Globe } from "lucide-react";
import { Logo } from "./Logo";
import { Footer } from "./Footer";
import { useStore } from "@/store";
import { useT } from "@/i18n";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const { t, lang } = useT();
  const { language, setLanguage } = useStore();

  return (
    <div className="relative min-h-dvh flex flex-col px-5">
      {/* Language toggle */}
      <button
        onClick={() => setLanguage(language === "en" ? "ar" : "en")}
        className="surface-card absolute top-5 end-5 inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium z-10"
        style={{ color: "var(--color-ink)" }}
      >
        <Globe size={15} />
        <span className="hidden sm:inline">{lang === "en" ? t("switchToArabic") : t("switchToEnglish")}</span>
      </button>

      {/* Centered brand + card */}
      <div className="flex flex-1 flex-col items-center justify-center py-12">
        <Link href="/" className="haven-fade-up flex items-center gap-3 mb-8">
          <Logo size={40} mono />
          <span className="font-display text-3xl" style={{ color: "var(--color-ink)" }}>{t("appName")}</span>
        </Link>

        <div
          className="haven-fade-up surface-card w-full max-w-md rounded-3xl p-8 sm:p-10"
          style={{ animationDelay: "0.05s", boxShadow: "var(--shadow-card-hover)" }}
        >
          <h1 className="font-display text-[26px] leading-tight" style={{ color: "var(--color-ink)" }}>
            {title}
          </h1>
          <p className="text-[14px] mt-2 mb-7" style={{ color: "var(--color-muted)" }}>
            {subtitle}
          </p>
          {children}
        </div>
      </div>

      <Footer />
    </div>
  );
}
