import type { Metadata } from "next";
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
