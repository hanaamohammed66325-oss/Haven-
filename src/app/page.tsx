"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
  TrendingUp,
  CalendarCheck,
  CalendarRange,
  Target,
  Globe,
  MousePointer2,
  GraduationCap,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { HeroDemo } from "@/components/HeroDemo";
import { DemoPlayer } from "@/components/DemoPlayer";
import { FeedbackForm } from "@/components/FeedbackForm";
import { useStore } from "@/store";
import { useT } from "@/i18n";

// TODO: swap the placeholder "#" hrefs for the real Instagram / WhatsApp / Email
// links once they exist.
const socialIcons = [
  {
    label: "Instagram",
    href: "#",
    svg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: "WhatsApp",
    href: "#",
    svg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.8c2.16 0 4.19.84 5.72 2.37a8.06 8.06 0 0 1 2.37 5.73c0 4.47-3.64 8.11-8.12 8.11a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.12.82.83-3.04-.19-.31a8.05 8.05 0 0 1-1.24-4.31c0-4.47 3.64-8.11 8.11-8.11zm4.67 10.35c-.25-.13-1.49-.73-1.72-.82-.23-.08-.4-.13-.56.13-.17.25-.64.82-.79.99-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.66-1.25-1.48-1.4-1.73-.14-.25-.02-.38.11-.51.11-.11.25-.29.38-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.09s.9 2.42 1.03 2.59c.13.17 1.77 2.71 4.3 3.8.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.49-.61 1.7-1.2.21-.59.21-1.09.15-1.2-.06-.11-.23-.17-.48-.29z" />
      </svg>
    ),
  },
  {
    label: "Email",
    href: "#",
    svg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
        <path d="M3 6.5l9 6 9-6" />
      </svg>
    ),
  },
];

export default function LandingPage() {
  const { t, lang } = useT();
  const { language, setLanguage } = useStore();
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      {/* Social strip */}
      <div className="hidden xl:flex flex-col items-center gap-5 fixed top-1/2 -translate-y-1/2 end-7 z-20">
        {socialIcons.map((s) => (
          <a
            key={s.label}
            href={s.href}
            className="transition-colors hover:text-[color:var(--color-primary)]"
            style={{ color: "var(--color-muted)" }}
            aria-label={s.label}
          >
            {s.svg}
          </a>
        ))}
        <span className="w-px h-16" style={{ background: "var(--color-border)" }} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 md:px-10 lg:px-16">
        {/* Nav */}
        <header className="flex items-center justify-between gap-6 py-7">
          <div className="flex items-center gap-3">
            <Logo size={38} tile />
            <span className="font-display text-2xl" style={{ color: "var(--color-ink)" }}>
              {t("appName")}
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-10 text-sm font-medium" style={{ color: "var(--color-muted)" }}>
            <a href="#top" className="transition-colors hover:text-[color:var(--color-ink)]">{t("land_navHome")}</a>
            <a href="#features" className="transition-colors hover:text-[color:var(--color-ink)]">{t("land_navFeatures")}</a>
            <a href="#cta" className="transition-colors hover:text-[color:var(--color-ink)]">{t("land_navHow")}</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setLanguage(language === "en" ? "ar" : "en")}
              className="surface-card inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
              style={{ color: "var(--color-ink)" }}
            >
              <Globe size={16} />
              <span className="hidden sm:inline">
                {lang === "en" ? t("switchToArabic") : t("switchToEnglish")}
              </span>
            </button>
            <Link
              href="/dashboard"
              className="haven-btn inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium"
            >
              {t("land_open")}
              <ArrowRight size={16} className="rtl:rotate-180" />
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section id="top" className="relative grid lg:grid-cols-2 gap-16 items-center pt-12 lg:pt-20 pb-32">
          {/* Left */}
          <div className="relative z-10">
            <div
              className="haven-fade-up surface-card inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium mb-8"
              style={{ color: "var(--color-primary)" }}
            >
              <Sparkles size={15} />
              {t("land_badge")}
            </div>

            <h1
              className="haven-fade-up font-display text-5xl md:text-6xl lg:text-7xl leading-[1.05]"
              style={{ color: "var(--color-ink)", animationDelay: "0.05s" }}
            >
              {t("land_title1")}
              <br />
              <span className="italic" style={{ color: "var(--color-brass)" }}>
                {t("land_title2")}
              </span>
            </h1>

            <p
              className="haven-fade-up mt-8 max-w-lg text-lg leading-relaxed"
              style={{ color: "var(--color-muted)", animationDelay: "0.1s" }}
            >
              {t("land_subtitle")}
            </p>

            <div className="haven-fade-up mt-10 flex flex-wrap items-center gap-4" style={{ animationDelay: "0.15s" }}>
              <Link
                href="/signup"
                className="haven-btn inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-medium"
              >
                {t("land_getStarted")}
                <ArrowRight size={18} className="rtl:rotate-180" />
              </Link>
              <button
                onClick={() => setDemoOpen(true)}
                className="surface-card inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-medium transition-transform hover:-translate-y-0.5"
                style={{ color: "var(--color-ink)" }}
              >
                <Sparkles size={17} style={{ color: "var(--color-brass)" }} />
                {t("land_seeDemo")}
              </button>
            </div>

            {/* Stat */}
            <div className="haven-fade-up mt-14 flex items-center gap-6" style={{ animationDelay: "0.2s" }}>
              <div className="flex items-baseline gap-2">
                <TrendingUp size={24} style={{ color: "var(--color-success)" }} />
                <span className="font-display text-5xl" style={{ color: "var(--color-brass)" }}>{t("land_statValue")}</span>
                <span className="haven-label">{t("land_statLabel")}</span>
              </div>
              <span className="w-px h-12" style={{ background: "var(--color-border)" }} />
              <p className="max-w-xs text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                {t("land_statText")}
              </p>
            </div>
          </div>

          {/* Right — auto-playing feature demo */}
          <div className="relative z-10 flex justify-center lg:justify-end">
            <HeroDemo />
          </div>

          {/* Watermark */}
          <div
            className="pointer-events-none select-none absolute -bottom-6 inset-x-0 text-center font-display leading-none"
            style={{
              fontSize: "clamp(5rem, 18vw, 16rem)",
              color: "var(--color-ink)",
              opacity: 0.035,
            }}
            aria-hidden="true"
          >
            HAVEN
          </div>
        </section>

        {/* Scroll hint */}
        <div className="flex flex-col items-center gap-2 -mt-12 mb-28" style={{ color: "var(--color-muted)" }}>
          <MousePointer2 size={16} />
          <span className="text-xs">{t("land_scroll")}</span>
        </div>

        {/* Features */}
        <section id="features" className="pb-32">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-display text-3xl md:text-4xl" style={{ color: "var(--color-ink)" }}>
              {t("land_featuresTitle")}
            </h2>
            <p className="mt-5 text-lg" style={{ color: "var(--color-muted)" }}>
              {t("land_featuresSubtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <FeatureCard icon={<TrendingUp size={22} />} title={t("land_f1Title")} desc={t("land_f1Desc")} />
            <FeatureCard icon={<CalendarCheck size={22} />} title={t("land_f2Title")} desc={t("land_f2Desc")} />
            <FeatureCard icon={<Target size={22} />} title={t("land_f3Title")} desc={t("land_f3Desc")} />
            <FeatureCard icon={<CalendarRange size={22} />} title={t("land_f4Title")} desc={t("land_f4Desc")} />
          </div>
        </section>

        {/* CTA */}
        <section id="cta" className="pb-28">
          <div className="surface-card rounded-3xl px-8 py-16 md:px-16 text-center relative overflow-hidden">
            <div
              className="mx-auto mb-7 flex items-center justify-center rounded-2xl"
              style={{ width: 64, height: 64, background: "var(--grad-primary)", color: "#fff" }}
            >
              <GraduationCap size={30} />
            </div>
            <h2 className="font-display text-3xl md:text-4xl" style={{ color: "var(--color-ink)" }}>
              {t("land_ctaTitle")}
            </h2>
            <p className="mt-5 text-lg max-w-xl mx-auto" style={{ color: "var(--color-muted)" }}>
              {t("land_ctaText")}
            </p>
            <Link
              href="/signup"
              className="haven-btn mt-9 inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-medium"
            >
              {t("land_ctaBtn")}
              <ArrowRight size={18} className="rtl:rotate-180" />
            </Link>
          </div>
        </section>

        {/* Feedback (public, no account — submits to Supabase) */}
        <section id="feedback" className="pb-28">
          <div className="surface-card rounded-3xl px-6 py-12 md:px-12 max-w-2xl mx-auto">
            <h2 className="font-display text-2xl md:text-3xl text-center" style={{ color: "var(--color-ink)" }}>
              {t("feedbackTitle")}
            </h2>
            <p className="mt-4 mb-8 text-center text-[15px]" style={{ color: "var(--color-muted)" }}>
              {t("feedbackSubtitle")}
            </p>
            <FeedbackForm />
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col sm:flex-row items-center justify-between gap-4 py-12 border-t" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-2.5">
            <Logo size={26} tile />
            <span className="font-display text-lg" style={{ color: "var(--color-ink)" }}>{t("appName")}</span>
          </div>
          {/* Social: Instagram · WhatsApp · Email */}
          <div className="flex items-center gap-5 order-first sm:order-none">
            {socialIcons.map((s) => (
              <a
                key={s.label}
                href={s.href}
                className="transition-colors hover:text-[color:var(--color-primary)]"
                style={{ color: "var(--color-muted)" }}
                aria-label={s.label}
              >
                {s.svg}
              </a>
            ))}
          </div>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>{t("land_footer")}</p>
        </footer>
      </div>

      <DemoPlayer open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="surface-card haven-card haven-card--hover rounded-3xl p-9">
      <div
        className="flex items-center justify-center rounded-2xl mb-6"
        style={{ width: 54, height: 54, background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
      >
        {icon}
      </div>
      <h3 className="font-display text-xl mb-3" style={{ color: "var(--color-ink)" }}>{title}</h3>
      <p className="text-[15px] leading-relaxed" style={{ color: "var(--color-muted)" }}>{desc}</p>
    </div>
  );
}

