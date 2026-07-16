import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import HaviMascot from "@/components/HaviMascot";

export const metadata: Metadata = {
  title: "Haven | GPA calculator, grade tracking & attendance for university students",
  description:
    "Plan your semester with Haven — calculate your GPA, track grades and attendance, and see your withdrawal risk before it's too late. Everything in one calm dashboard.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
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
        <Providers>{children}</Providers>
        <HaviMascot />
      </body>
    </html>
  );
}
