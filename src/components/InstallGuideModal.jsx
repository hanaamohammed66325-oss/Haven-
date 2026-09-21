"use client";

/**
 * InstallGuideModal — a one-time, first-visit popup that teaches every visitor
 * how to install Haven as an app on iPhone/iPad and Android.
 *
 * Why this exists (beyond the small floating InstallPrompt pill): most people
 * never notice the little "ثبّت Haven" button pinned to the edge of the screen,
 * so they miss that Haven installs like a real app (icon on the home screen,
 * push notifications, works offline). This modal surfaces the how-to proactively
 * the first time someone lands on the site, then never nags again.
 *
 * Behaviour:
 *   - Shows once per device (localStorage flag). Dismissing sets it permanently.
 *   - Never shows when Haven is already running as an installed app (standalone).
 *   - Bilingual: reads <html lang> so it matches the visitor's language.
 *   - Two tabs (iOS / Android) with illustrated steps; auto-selects the tab that
 *     matches the detected device, but the visitor can switch to see the other.
 *
 * Self-contained on purpose (own platform detection + inline styles) so it can
 * mount at <body> level on every route, including logged-out marketing pages
 * that sit outside the app store/providers.
 */

import { useEffect, useState, useCallback } from "react";

const SEEN_KEY = "haven_install_guide_seen";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/** iPadOS reports itself as a Mac, so touch points are the reliable signal. */
function detectPlatform() {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIPad) return "ipad";
  if (/iPhone|iPod/.test(ua)) return "iphone";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

// --- copy -------------------------------------------------------------------
const COPY = {
  ar: {
    dir: "rtl",
    title: "ثبّت Haven على جهازك",
    subtitle: "خلّي Haven تطبيق كامل على شاشتك — أسرع، ويوصلك تنبيهات مواعيدك.",
    tabApple: "آيفون / آيباد",
    tabAndroid: "أندرويد",
    benefitIcon: "أيقونة على الشاشة الرئيسية",
    benefitNotif: "تنبيهات بالمواعيد والاختبارات",
    apple: [
      { b: "افتح Haven في المتصفح", h: "من Safari أو Chrome على جهازك" },
      { b: "اضغط زر المشاركة", h: "الأيقونة اللي فيها سهم للأعلى — فوق في الآيباد، تحت في الآيفون", glyph: "share" },
      { b: "اختر «إضافة إلى الشاشة الرئيسية»", h: "انزل شوي في القائمة لين تلقاها", glyph: "plus" },
      { b: "اضغط «إضافة»", h: "بيصير Haven أيقونة على شاشتك مثل أي تطبيق" },
    ],
    android: [
      { b: "افتح Haven في Chrome", h: "أو أي متصفح يدعم التطبيقات" },
      { b: "اضغط قائمة المتصفح", h: "النقاط الثلاث فوق يمين الشاشة", glyph: "dots" },
      { b: "اختر «تثبيت التطبيق»", h: "أو «إضافة إلى الشاشة الرئيسية»", glyph: "download" },
      { b: "اضغط «تثبيت»", h: "بيصير Haven أيقونة على شاشتك مثل أي تطبيق" },
    ],
    later: "لاحقًا",
    got: "تمام، فهمت",
    hintOtherApple: "على الآيفون أو الآيباد؟ بدّل للتبويب الثاني",
    hintOtherAndroid: "على أندرويد؟ بدّل للتبويب الثاني",
  },
  en: {
    dir: "ltr",
    title: "Install Haven on your device",
    subtitle: "Make Haven a real app on your home screen — faster, and sends you deadline reminders.",
    tabApple: "iPhone / iPad",
    tabAndroid: "Android",
    benefitIcon: "Icon on your home screen",
    benefitNotif: "Reminders for deadlines & exams",
    apple: [
      { b: "Open Haven in your browser", h: "Safari or Chrome on your device" },
      { b: "Tap the Share button", h: "The icon with an up arrow — top on iPad, bottom on iPhone", glyph: "share" },
      { b: "Choose “Add to Home Screen”", h: "Scroll down the menu a little to find it", glyph: "plus" },
      { b: "Tap “Add”", h: "Haven becomes an app icon on your screen" },
    ],
    android: [
      { b: "Open Haven in Chrome", h: "Or any browser that supports apps" },
      { b: "Open the browser menu", h: "The three dots at the top-right", glyph: "dots" },
      { b: "Choose “Install app”", h: "Or “Add to Home screen”", glyph: "download" },
      { b: "Tap “Install”", h: "Haven becomes an app icon on your screen" },
    ],
    later: "Later",
    got: "Got it",
    hintOtherApple: "On iPhone or iPad? Switch to the other tab",
    hintOtherAndroid: "On Android? Switch to the other tab",
  },
};

export default function InstallGuideModal() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState("ar");
  const [tab, setTab] = useState("apple"); // "apple" | "android"

  useEffect(() => {
    // Language from the <html lang> the boot script set (default "ar").
    try {
      const l = document.documentElement.getAttribute("lang");
      if (l === "en" || l === "ar") setLang(l);
    } catch (e) {}

    if (isStandalone()) return; // already an installed app — nothing to teach

    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch (e) {}
    if (seen) return;

    const platform = detectPlatform();
    setTab(platform === "android" ? "android" : "apple");

    // Small delay so the page paints first — the popup feels like a welcome,
    // not a blocking wall, and avoids competing with first paint.
    const id = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(id);
  }, []);

  // Allow other components (e.g. the dashboard notifications nudge) to reopen
  // the guide on demand — ignores the "seen" flag so it always shows here.
  useEffect(() => {
    const reopen = () => {
      const platform = detectPlatform();
      setTab(platform === "android" ? "android" : "apple");
      setOpen(true);
    };
    window.addEventListener("haven:install-guide", reopen);
    return () => window.removeEventListener("haven:install-guide", reopen);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch (e) {}
  }, []);

  if (!open) return null;

  const c = COPY[lang];
  const steps = tab === "apple" ? c.apple : c.android;

  return (
    <div className="haven-install-backdrop" style={S.backdrop} onClick={close} dir={c.dir} role="dialog" aria-modal="true" aria-label={c.title}>
      <div className="haven-install-card" style={S.card} onClick={(e) => e.stopPropagation()}>
        {/* header: app icon + title */}
        <div style={S.head}>
          <img src="/icons/icon-192.png" alt="Haven" width={52} height={52} style={S.appIcon} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={S.title}>{c.title}</h2>
            <p style={S.subtitle}>{c.subtitle}</p>
          </div>
          <button onClick={close} style={S.x} aria-label={c.later}>✕</button>
        </div>

        {/* benefit chips */}
        <div style={S.benefits}>
          <Benefit icon={<HomeGlyph />} label={c.benefitIcon} />
          <Benefit icon={<BellGlyph />} label={c.benefitNotif} />
        </div>

        {/* tabs */}
        <div style={S.tabs}>
          <button
            onClick={() => setTab("apple")}
            style={{ ...S.tab, ...(tab === "apple" ? S.tabActive : {}) }}
          >
            <AppleGlyph /> {c.tabApple}
          </button>
          <button
            onClick={() => setTab("android")}
            style={{ ...S.tab, ...(tab === "android" ? S.tabActive : {}) }}
          >
            <AndroidGlyph /> {c.tabAndroid}
          </button>
        </div>

        {/* steps */}
        <ol style={S.steps}>
          {steps.map((s, i) => (
            <li key={i} style={S.step}>
              <span style={S.num}>{i + 1}</span>
              <span style={S.stepBody}>
                <span style={S.stepTitle}>
                  {s.b}
                  {s.glyph ? <StepGlyph name={s.glyph} /> : null}
                </span>
                <span style={S.stepHint}>{s.h}</span>
              </span>
            </li>
          ))}
        </ol>

        <button onClick={close} style={S.cta}>{c.got}</button>
      </div>
    </div>
  );
}

function Benefit({ icon, label }) {
  return (
    <div style={S.benefit}>
      <span style={S.benefitIcon}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

/* --- inline glyphs (drawn so they match on every device) ------------------ */
function StepGlyph({ name }) {
  const box = { width: 18, height: 18, verticalAlign: "-4px", margin: "0 5px", flexShrink: 0 };
  if (name === "share")
    return (
      <svg viewBox="0 0 24 24" style={box} aria-hidden="true">
        <path d="M12 3l4 4h-3v9h-2V7H8l4-4z" fill="currentColor" />
        <path d="M5 11v9h14v-9h-2v7H7v-7H5z" fill="currentColor" />
      </svg>
    );
  if (name === "plus")
    return (
      <svg viewBox="0 0 24 24" style={box} aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (name === "dots")
    return (
      <svg viewBox="0 0 24 24" style={box} aria-hidden="true">
        <circle cx="12" cy="5" r="1.7" fill="currentColor" />
        <circle cx="12" cy="12" r="1.7" fill="currentColor" />
        <circle cx="12" cy="19" r="1.7" fill="currentColor" />
      </svg>
    );
  if (name === "download")
    return (
      <svg viewBox="0 0 24 24" style={box} aria-hidden="true">
        <path d="M12 3v10m0 0l-4-4m4 4l4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  return null;
}

function HomeGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M4 11l8-6 8 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9h12v-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BellGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M6 16V10a6 6 0 1112 0v6l2 2H4l2-2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 20a2 2 0 004 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" style={{ verticalAlign: "-2px", marginInlineEnd: 6 }} aria-hidden="true">
      <path
        d="M16.4 12.6c0-2 1.6-2.9 1.7-3-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7 1 1.4 2 2.4 2 1 0 1.3-.6 2.5-.6s1.5.6 2.5.6 1.7-1 2.3-2c.7-1.1 1-2.2 1-2.3-.1 0-2.1-.8-2.1-3.1zM14.5 6.3c.5-.7.9-1.6.8-2.5-.8 0-1.7.5-2.3 1.2-.5.6-.9 1.5-.8 2.4.9.1 1.8-.4 2.3-1.1z"
        fill="currentColor"
      />
    </svg>
  );
}
function AndroidGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" style={{ verticalAlign: "-2px", marginInlineEnd: 6 }} aria-hidden="true">
      <path
        d="M6 9v7a1 1 0 001 1h1v3a1 1 0 002 0v-3h4v3a1 1 0 002 0v-3h1a1 1 0 001-1V9H6zM3.5 9a1 1 0 00-1 1v5a1 1 0 002 0v-5a1 1 0 00-1-1zm17 0a1 1 0 00-1 1v5a1 1 0 002 0v-5a1 1 0 00-1-1zM8 4.5l-.9-1.6a.3.3 0 01.5-.3l1 1.7A6.5 6.5 0 0112 3.7c.9 0 1.7.2 2.4.6l1-1.7a.3.3 0 01.5.3L15 4.5A5 5 0 0118 8H6a5 5 0 012-3.5zM9.5 6.2a.6.6 0 100-1.2.6.6 0 000 1.2zm5 0a.6.6 0 100-1.2.6.6 0 000 1.2z"
        fill="currentColor"
      />
    </svg>
  );
}

/* --- styles --------------------------------------------------------------- */
const NAVY = "#2b3648";
const S = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,20,28,.55)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    zIndex: 80,
    display: "flex",
    justifyContent: "center",
    // vertical alignment (centered on desktop, bottom-sheet on phones) and the
    // entrance animation live in globals.css under .haven-install-backdrop.
  },
  card: {
    background: "#fff",
    color: "#1e2733",
    width: "100%",
    maxWidth: 460,
    padding: "20px 20px calc(18px + env(safe-area-inset-bottom))",
    boxShadow: "0 18px 60px rgba(0,0,0,.30)",
    maxHeight: "92dvh",
    overflowY: "auto",
    // border-radius (all corners on desktop, top-only on the mobile sheet) and
    // the entrance animation live in globals.css under .haven-install-card.
  },
  head: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  appIcon: { borderRadius: 13, boxShadow: "0 4px 14px rgba(43,54,72,.28)", flexShrink: 0 },
  title: { margin: "2px 0 4px", fontSize: 18, fontWeight: 700, lineHeight: 1.25 },
  subtitle: { margin: 0, fontSize: 13, color: "#69747f", lineHeight: 1.5 },
  x: {
    background: "#eef1f5",
    border: "none",
    color: "#69747f",
    borderRadius: 999,
    width: 28,
    height: 28,
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
    flexShrink: 0,
  },
  benefits: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  benefit: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "#f4f6f9",
    color: "#3a4757",
    borderRadius: 999,
    padding: "6px 11px",
    fontSize: 12,
    fontWeight: 500,
  },
  benefitIcon: { display: "inline-flex", color: NAVY },
  tabs: {
    display: "flex",
    gap: 6,
    background: "#f0f2f6",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    background: "none",
    border: "none",
    borderRadius: 9,
    padding: "9px 6px",
    fontSize: 13.5,
    fontWeight: 600,
    color: "#69747f",
    cursor: "pointer",
    transition: "background .15s, color .15s",
  },
  tabActive: {
    background: "#fff",
    color: NAVY,
    boxShadow: "0 2px 8px rgba(43,54,72,.12)",
  },
  steps: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 },
  step: { display: "flex", alignItems: "flex-start", gap: 12 },
  num: {
    flexShrink: 0,
    width: 26,
    height: 26,
    borderRadius: 999,
    background: NAVY,
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    marginTop: 1,
  },
  stepBody: { display: "flex", flexDirection: "column", gap: 1 },
  stepTitle: { fontSize: 14.5, fontWeight: 600, display: "flex", alignItems: "center", flexWrap: "wrap", color: "#1e2733" },
  stepHint: { fontSize: 12.5, color: "#7a848f", lineHeight: 1.5 },
  cta: {
    marginTop: 18,
    width: "100%",
    background: NAVY,
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "13px 0",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
};
