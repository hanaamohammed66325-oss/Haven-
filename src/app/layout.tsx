import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/Providers";
import HaviMascot from "@/components/HaviMascot";
import { SubscriptionProvider } from "@/lib/subscription";

// Homepage/default SEO (Arabic — the site's primary locale). Per-page browser
// titles are set client-side per the active locale (see usePageTitle); this
// static metadata is what crawlers and link-preview bots (Google, WhatsApp,
// Twitter) read, so it uses the "%s · Haven" template + the Arabic defaults.
const SITE_TITLE = "Haven — نظّم فصلك الدراسي";
const SITE_DESCRIPTION =
  "Haven يساعد طلاب الجامعات على تتبّع المعدل والدرجات والحضور والمواعيد في مكان واحد.";
const OG_IMAGE = "/icons/icon-512.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://havenstudent.com"),
  title: {
    default: SITE_TITLE,
    template: "%s · Haven",
  },
  description: SITE_DESCRIPTION,
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    locale: "ar_SA",
    siteName: "Haven",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 512, height: 512, alt: "Haven" }],
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* Pre-paint boot script — runs synchronously BEFORE the body paints to
            apply the correct theme + language and avoid a flash (FOUC). It reads
            the same localStorage cache the store writes (haven-boot). Logged-out
            users always get the default theme; logged-in users get their saved
            theme instantly. Wrapped in try/catch so storage errors never block
            rendering. beforeInteractive injects it into <head> before hydration.
            Keep the keys in sync with src/store/index.tsx. */}
        <Script id="haven-theme-boot" strategy="beforeInteractive">
          {`(function(){try{var d=document.documentElement;var boot={};try{boot=JSON.parse(localStorage.getItem("haven-boot")||"{}")||{};}catch(e){}var loggedIn=false;try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf("sb-")===0&&k.indexOf("-auth-token")>0){var v=localStorage.getItem(k);if(v&&v!=="null"&&v!=="undefined"){loggedIn=true;break;}}}}catch(e){}var theme=(loggedIn&&boot.theme)?boot.theme:"haven";d.setAttribute("data-theme",theme);var lang=(boot.lang==="ar"||boot.lang==="en")?boot.lang:"en";d.setAttribute("lang",lang);d.setAttribute("dir",lang==="ar"?"rtl":"ltr");}catch(e){}})();`}
        </Script>
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
      </body>
    </html>
  );
}
