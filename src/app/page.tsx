"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useStore } from "@/store";
import { useT } from "@/i18n";

const socialIcons = [
  {
    label: "Instagram",
    svg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: "Facebook",
    svg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M14 8.5h2.2V5.3C15.8 5.1 14.8 5 13.7 5 11.4 5 9.9 6.4 9.9 9v2H7v3.3h2.9V22h3.4v-7.7h2.7l.4-3.3h-3.1V9.3c0-.5.3-.8 1-.8z" />
      </svg>
    ),
  },
  {
    label: "X",
    svg: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.7 3h3.3l-7.2 8.2L22 21h-6.6l-5.2-6.8L4.3 21H1l7.7-8.8L2 3h6.8l4.7 6.2L17.7 3zm-1.2 16h1.8L7.6 4.8H5.7L16.5 19z" />
      </svg>
    ),
  },
];

export default function LandingPage() {
  const { t, lang } = useT();
  const { language, setLanguage, loadDemo } = useStore();
  const router = useRouter();

  const startDemo = () => {
    loadDemo();
    router.push("/dashboard");
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      {/* Social strip */}
      <div className="hidden xl:flex flex-col items-center gap-5 fixed top-1/2 -translate-y-1/2 end-7 z-20">
        {socialIcons.map((s) => (
          <a
            key={s.label}
            href="#"
            className="transition-colors"
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
                href="/dashboard"
                className="haven-btn inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-medium"
              >
                {t("land_getStarted")}
                <ArrowRight size={18} className="rtl:rotate-180" />
              </Link>
              <button
                onClick={startDemo}
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
              href="/dashboard"
              className="haven-btn mt-9 inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-medium"
            >
              {t("land_ctaBtn")}
              <ArrowRight size={18} className="rtl:rotate-180" />
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col sm:flex-row items-center justify-between gap-4 py-12 border-t" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-2.5">
            <Logo size={26} tile />
            <span className="font-display text-lg" style={{ color: "var(--color-ink)" }}>{t("appName")}</span>
          </div>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>{t("land_footer")}</p>
        </footer>
      </div>
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

