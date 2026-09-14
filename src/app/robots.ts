import type { MetadataRoute } from "next";

// Static robots.txt (emitted at build — the site is output:"export"). Allows all
// crawlers and points them at the sitemap so new tool/landing pages get found
// fast. The authenticated app lives under paths that require sign-in and hold no
// indexable content, so they're disallowed to keep the crawl budget on the
// public marketing + tool pages that actually rank.
const SITE = "https://havenstudent.com";

// Required for output:"export" — emit robots.txt as a static file at build.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/courses/",
          "/attendance/",
          "/schedule/",
          "/assignments/",
          "/pomodoro/",
          "/profile/",
          "/settings/",
          "/premium/",
          "/checkout/",
          "/admin/",
          "/reset-password/",
          "/email-changed/",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
