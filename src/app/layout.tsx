import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/Providers";
import HaviMascot from "@/components/HaviMascot";
import RegisterSW from "@/components/RegisterSW";
import InstallPrompt from "@/components/InstallPrompt";
import { SubscriptionProvider } from "@/lib/subscription";

// This is a STATIC site (next.config: output "export"), so the SSR <title>,
// <html lang/dir>, and meta description are ONE fixed value for every visitor —
// there's no server to render them per-user. To avoid a flash they must match
// the app's runtime default locale, which is English (store default). Per-user
// theme/language are then applied client-side before paint (see the boot script
// below + usePageTitle). Open Graph / Twitter stay Arabic for social previews,
// which are read once by bots and never flash.
const SITE_TITLE = "Haven — organize your semester";
const SITE_DESCRIPTION =
  "Haven helps university students track their GPA, grades, attendance, and deadlines in one place.";
const OG_TITLE = "Haven — نظّم فصلك الدراسي";
const OG_DESCRIPTION =
  "Haven يساعد طلاب الجامعات على تتبّع المعدل والدرجات والحضور والمواعيد في مكان واحد.";
// The Haven house/book logo — kept as the social-preview image. The PWA icon
// set (/icons/icon-*.png) is the Havi sprite on brand navy, which is right for
// a home-screen icon but would change every existing share card.
const OG_IMAGE = "/icons/og-haven-logo.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://havenstudent.com"),
  title: {
    default: SITE_TITLE,
    template: "%s · Haven",
  },
  description: SITE_DESCRIPTION,
  // Installable PWA: the manifest declares the icons, name and start_url.
  manifest: "/manifest.json",
  // CRITICAL for iPad/iPhone: without `capable`, Safari opens the home-screen
  // shortcut as a normal browser tab — no app chrome, and no notifications
  // (web push on iOS/iPadOS only works from an installed instance).
  appleWebApp: {
    capable: true,
    title: "Haven",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon.svg" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "ar_SA",
    siteName: "Haven",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 512, height: 512, alt: "Haven" }],
  },
  twitter: {
    card: "summary",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

// `viewportFit: "cover"` lets the installed app paint into the iPad/iPhone safe
// areas instead of leaving letterbox bars; themeColor tints the status bar.
export const viewport: Viewport = {
  themeColor: "#2b3648",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        {/* Pre-paint boot script — runs synchronously BEFORE the body paints so
            the correct THEME and LANGUAGE are applied on first paint, avoiding a
            flash (FOUC). The server can't do this: the site is static and the
            values are per-user. It reads the localStorage cache the store writes
            (haven-boot): logged-out users always get the default theme; logged-in
            users get their saved theme instantly; the saved locale sets lang/dir
            and the brand tab title. Wrapped in try/catch so a storage error never
            blocks rendering. Keep the keys in sync with src/store/index.tsx. */}
        <Script id="haven-theme-boot" strategy="beforeInteractive">
          {`(function(){try{var d=document.documentElement;var boot={};try{boot=JSON.parse(localStorage.getItem("haven-boot")||"{}")||{};}catch(e){}var loggedIn=false;try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf("sb-")===0&&k.indexOf("-auth-token")>0){var v=localStorage.getItem(k);if(v&&v!=="null"&&v!=="undefined"){loggedIn=true;break;}}}}catch(e){}var theme=(loggedIn&&boot.theme)?boot.theme:"haven";d.setAttribute("data-theme",theme);var lang=(boot.lang==="ar"||boot.lang==="en")?boot.lang:"en";d.setAttribute("lang",lang);d.setAttribute("dir",lang==="ar"?"rtl":"ltr");var T={ar:"Haven — نظّم فصلك الدراسي",en:"Haven — organize your semester"};document.title=T[lang]||T.en;}catch(e){}})();`}
        </Script>
        {/* Next 16 renders `appleWebApp.capable` as `mobile-web-app-capable`
            only — it no longer emits the apple-prefixed tag. iPadOS/iOS Safari
            still reads THIS one to decide whether a home-screen launch runs as
            a real app (full screen, and eligible for notifications), so it is
            declared explicitly rather than left to the framework. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=Tajawal:wght@400;500;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* One subscription read near the top, shared by the app AND the global
            Havi mascot (which lives outside Providers) so every premium gate
            evaluates the same source. */}
        <SubscriptionProvider>
          <Providers>{children}</Providers>
          <HaviMascot />
        </SubscriptionProvider>
        {/* PWA: register the worker (production only) and offer the install
            flow. Mounted once here so they exist on every route. */}
        <RegisterSW />
        <InstallPrompt />
      </body>
    </html>
  );
}
