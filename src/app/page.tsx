"use client";

import { useEffect, useState } from "react";
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
import { Footer } from "@/components/Footer";
import { useStore } from "@/store";
import { useT, usePageTitle } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { PLANS } from "@/lib/premium";
import type { TranslationKey } from "@/i18n/translations/en";

export default function LandingPage() {
  const { t, lang } = useT();
  usePageTitle("metaTitle", { absolute: true }); // homepage brand title (no "· Haven" suffix)
  const { language, setLanguage } = useStore();
  const [demoOpen, setDemoOpen] = useState(false);

  // "Start free" on a pricing card: signed-in users go straight to checkout for
  // the chosen plan; signed-out visitors sign in first (same intent as the hero
  // CTA). Session is resolved client-side so this stays a static export.
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setLoggedIn(!!data.session);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const startFreeHref = (cycle: string) =>
    loggedIn ? `/checkout?plan=${cycle}` : "/signin";

  return (
    <div className="relative min-h-dvh overflow-x-hidden">

      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 md:px-10 lg:px-16">
        {/* Nav */}
        <header className="flex items-center justify-between gap-6 py-7">
          <div className="flex items-center gap-3">
            <Logo size={38} mono />
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
            <div className="haven-fade-up mt-14 flex flex-wrap items-center gap-6" style={{ animationDelay: "0.2s" }}>
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

        {/* Pricing */}
        <section id="pricing" className="pb-32">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="font-display text-3xl md:text-4xl" style={{ color: "var(--color-ink)" }}>
              {t("land_pricingTitle")}
            </h2>
            <p className="mt-5 text-lg" style={{ color: "var(--color-muted)" }}>
              {t("land_pricingSubtitle")}
            </p>
          </div>

          {/* Free-trial highlight */}
          <div className="max-w-xl mx-auto mb-12">
            <div
              className="surface-card flex items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5 text-center text-[15px] font-medium"
              style={{ color: "var(--color-primary)" }}
            >
              <Sparkles size={17} style={{ color: "var(--color-brass)" }} />
              {t("land_pricingFreeHighlight")}
            </div>
          </div>

          {/* Plan cards (labels/prices from PLANS — single source of truth) */}
          <div className="grid md:grid-cols-3 gap-8 items-stretch">
            {PLANS.map((p) => {
              const recommended = p.id === "12"; // Full year / Best value
              return (
                <div
                  key={p.id}
                  className="surface-card haven-card haven-card--hover rounded-3xl p-8 flex flex-col"
                  style={
                    recommended
                      ? { outline: "2px solid var(--color-primary)", outlineOffset: 2 }
                      : undefined
                  }
                >
                  {/* Badge row (fixed height so plan names align across cards) */}
                  <div className="h-6 mb-3">
                    {p.tagKey && (
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{ background: "var(--color-brass)", color: "#1a1410" }}
                      >
                        {t(p.tagKey as TranslationKey)}
                      </span>
                    )}
                  </div>

                  <div className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>
                    {t(p.labelKey as TranslationKey)}
                  </div>
                  <div className="mt-2 font-display text-4xl leading-none" style={{ color: "var(--color-ink)" }}>
                    {t(p.priceKey as TranslationKey)}
                  </div>
                  <div className="mt-1.5 text-[13px]" style={{ color: "var(--color-muted)" }}>
                    {t(p.perMonthKey as TranslationKey)}
                  </div>

                  <Link
                    href={startFreeHref(p.cycle)}
                    className="haven-btn mt-8 inline-flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium"
                  >
                    <Sparkles size={16} />
                    {t("land_pricingStartFree")}
                  </Link>
                </div>
              );
            })}
          </div>

          {/* What's included — matches the real premium gate set (courses, themes, Havi) */}
          <p
            className="mt-10 text-center text-[15px] max-w-2xl mx-auto leading-relaxed"
            style={{ color: "var(--color-muted)" }}
          >
            {t("land_pricingIncluded")}
          </p>
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
            <Logo size={26} mono />
            <span className="font-display text-lg" style={{ color: "var(--color-ink)" }}>{t("appName")}</span>
          </div>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>{t("land_footer")}</p>
        </footer>
      </div>

      <Footer />

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

