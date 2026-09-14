import type { MetadataRoute } from "next";
import { UNIVERSITIES } from "@/lib/tools/universities";

// Static sitemap (emitted at build — output:"export"). Lists the PUBLIC,
// indexable pages only: the landing page, the free tool pages (top of the SEO
// funnel), and the auth + policy pages. The signed-in app routes are excluded
// (see robots.ts) — they need auth and carry no indexable content.
//
// trailingSlash is enabled in next.config, so every URL here ends with "/" to
// match the emitted static paths exactly (avoids a redirect hop for crawlers).
const SITE = "https://havenstudent.com";

// Required for output:"export" — emit sitemap.xml as a static file at build.
export const dynamic = "force-static";

// Higher-intent tool pages get a higher priority + a weekly cadence hint; the
// evergreen policy pages sit lower. lastModified is set at build time.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (
    path: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] = "monthly",
  ): MetadataRoute.Sitemap[number] => ({
    url: `${SITE}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  });

  return [
    page("/", 1.0, "weekly"),
    // Free tools — the search-acquisition funnel.
    page("/tools/", 0.9, "weekly"),
    page("/tools/gpa-calculator/", 0.9, "weekly"),
    page("/tools/absence-calculator/", 0.9, "weekly"),
    page("/tools/planner/", 0.9, "weekly"),
    // Programmatic per-university GPA pages (long-tail search reach).
    ...UNIVERSITIES.map((u) => page(`/tools/gpa-calculator/${u.slug}/`, 0.7, "monthly")),
    // Auth entry points.
    page("/signup/", 0.7, "monthly"),
    page("/signin/", 0.5, "monthly"),
    // Policies.
    page("/privacy/", 0.3, "yearly"),
    page("/terms/", 0.3, "yearly"),
    page("/refund/", 0.3, "yearly"),
    page("/contact/", 0.4, "yearly"),
  ];
}
