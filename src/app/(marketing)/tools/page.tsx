import type { Metadata } from "next";
import Link from "next/link";
import { Calculator, CalendarX2, Percent, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";

// Public hub for the free tools — the internal-linking anchor for the SEO
// funnel and the target of /tools/ in the sitemap. Server Component so it emits
// its own Arabic metadata + static body at build time.

const URL_PATH = "/tools/";
// The root layout's title template appends " · Haven", so don't repeat it here.
const TITLE = "أدوات الطلاب المجانية — حاسبة المعدل والغياب";
const DESCRIPTION =
  "أدوات مجانية لطلاب الجامعات بدون تسجيل: حاسبة المعدل الجامعي، حاسبة الغياب قبل الحرمان، وتحويل الدرجات. من Haven.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL_PATH },
  openGraph: {
    type: "website",
    locale: "ar_SA",
    url: URL_PATH,
    siteName: "Haven",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

interface Tool {
  href: string | null; // null = coming soon
  icon: React.ReactNode;
  title: string;
  desc: string;
}

const TOOLS: Tool[] = [
  {
    href: "/tools/gpa-calculator/",
    icon: <Calculator size={22} />,
    title: "حاسبة المعدل الجامعي",
    desc: "احسب معدلك الفصلي والتراكمي — نظام ٥.٠ و٤.٠.",
  },
  {
    href: "/tools/absence-calculator/",
    icon: <CalendarX2 size={22} />,
    title: "حاسبة الغياب والحرمان",
    desc: "اعرف كم غياب باقٍ لك قبل الحرمان من المادة.",
  },
  {
    href: null,
    icon: <Percent size={22} />,
    title: "تحويل النسبة إلى تقدير",
    desc: "حوّل نسبتك المئوية إلى تقدير ونقاط. قريباً.",
  },
];

export default function ToolsHubPage() {
  return (
    <div dir="rtl" lang="ar" className="min-h-dvh flex flex-col">
      <header className="mx-auto w-full max-w-[760px] px-5 flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={30} mono />
          <span className="font-display text-xl" style={{ color: "var(--color-ink)" }}>
            Haven
          </span>
        </Link>
        <Link href="/signup/" className="haven-btn inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold">
          ابدأ مجاناً
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-5 flex-1 pb-16">
        <h1 className="font-display text-[32px] leading-tight mb-3" style={{ color: "var(--color-ink)" }}>
          أدوات الطلاب المجانية
        </h1>
        <p className="text-[15px] leading-relaxed mb-8" style={{ color: "var(--color-muted)" }}>
          أدوات سريعة تشتغل بدون تسجيل. ولو حبيت تحفظ نتائجك وتتابع فصلك كامل،
          Haven يجمعها لك في مكان واحد.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((tool) => {
            const inner = (
              <>
                <span
                  className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
                >
                  {tool.icon}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] flex items-center gap-1.5" style={{ color: "var(--color-ink)" }}>
                    {tool.title}
                    {tool.href && <ArrowLeft size={14} style={{ color: "var(--color-primary)" }} />}
                  </div>
                  <div className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--color-muted)" }}>
                    {tool.desc}
                  </div>
                </div>
              </>
            );
            const cls = "flex items-start gap-3.5 rounded-2xl p-4 border";
            const style = {
              borderColor: "var(--color-border)",
              background: "var(--color-surface)",
              opacity: tool.href ? 1 : 0.6,
            };
            return tool.href ? (
              <Link key={tool.title} href={tool.href} className={`${cls} transition-colors hover:border-[var(--color-primary)]`} style={style}>
                {inner}
              </Link>
            ) : (
              <div key={tool.title} className={cls} style={style}>
                {inner}
              </div>
            );
          })}
        </div>
      </main>

      <Footer />
    </div>
  );
}
