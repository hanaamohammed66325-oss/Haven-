import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { SemesterPlannerTool } from "@/components/tools/SemesterPlannerTool";
import { ShareButton } from "@/components/tools/ShareButton";

// PUBLIC, no-login semester planner — a simplified public version of the in-app
// Planner. Server Component for build-time Arabic metadata + static body.

const URL_PATH = "/tools/planner/";
// Root layout's title template appends " · Haven" — don't repeat it here.
const TITLE = "مخطط الفصل الدراسي — نظّم اختباراتك وواجباتك أسبوعياً";
const DESCRIPTION =
  "مخطط الفصل الدراسي مجاناً وبدون تسجيل — رتّب اختباراتك الكبيرة والقصيرة وواجباتك ومواعيد التسليم على أسابيع الفصل، ويُحفظ في متصفّحك. من Haven.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL_PATH },
  keywords: [
    "مخطط الفصل الدراسي",
    "جدول الفصل الدراسي",
    "منظم دراسي",
    "مخطط دراسي",
    "تنظيم المذاكرة",
    "جدول الاختبارات",
    "منظم المهام الجامعية",
  ],
  openGraph: { type: "website", locale: "ar_SA", url: URL_PATH, siteName: "Haven", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "كيف أنظّم فصلي الدراسي؟",
    a: "اختر نوع العنصر (اختبار، اختبار قصير، واجب، تسليم، إجازة) ثم أضفه للأسبوع المناسب. يظهر لك مخطط كامل لأسابيع الفصل مع تمييز كل نوع بلون.",
  },
  {
    q: "هل يُحفظ مخططي؟",
    a: "يُحفظ مخططك في متصفّحك على هذا الجهاز تلقائياً. ولو حبيت تحفظه على كل أجهزتك ويوصلك تنبيه قبل كل اختبار وتسليم، أنشئ حساب Haven مجاني.",
  },
  {
    q: "هل الأداة مجانية وتحتاج تسجيل؟",
    a: "مجانية تماماً وتشتغل بدون تسجيل. التسجيل فقط لحفظ المخطط عبر الأجهزة وتفعيل التنبيهات.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "مخطط الفصل الدراسي من Haven",
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      url: `https://havenstudent.com${URL_PATH}`,
      inLanguage: "ar",
      offers: { "@type": "Offer", price: "0", priceCurrency: "SAR" },
      description: DESCRIPTION,
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Haven", item: "https://havenstudent.com/" },
        { "@type": "ListItem", position: 2, name: "الأدوات", item: "https://havenstudent.com/tools/" },
        { "@type": "ListItem", position: 3, name: "مخطط الفصل الدراسي", item: `https://havenstudent.com${URL_PATH}` },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ],
};

export default function PlannerPage() {
  return (
    <div dir="rtl" lang="ar" className="min-h-dvh flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mx-auto w-full max-w-[980px] px-5 flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={30} mono />
          <span className="font-display text-xl" style={{ color: "var(--color-ink)" }}>Haven</span>
        </Link>
        <div className="flex items-center gap-2">
          <ShareButton title={TITLE} path={URL_PATH} />
          <Link href="/signup/" className="haven-btn inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold">
            ابدأ مجاناً
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[980px] px-5 flex-1 pb-16">
        <h1 className="font-display text-[32px] leading-tight mb-3" style={{ color: "var(--color-ink)" }}>
          مخطط الفصل الدراسي
        </h1>
        <p className="text-[15px] leading-relaxed mb-7" style={{ color: "var(--color-muted)" }}>
          رتّب اختباراتك الكبيرة والقصيرة وواجباتك ومواعيد التسليم على أسابيع الفصل —
          مجاناً وبدون تسجيل، ويُحفظ تلقائياً في متصفّحك.
        </p>

        <section className="rounded-3xl p-5 sm:p-6 mb-10" style={{ background: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}>
          <SemesterPlannerTool />
        </section>

        <section className="mb-10">
          <h2 className="font-display text-2xl mb-4" style={{ color: "var(--color-ink)" }}>أسئلة شائعة</h2>
          <div className="flex flex-col gap-3">
            {FAQ.map((f) => (
              <details key={f.q} className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
                <summary className="cursor-pointer text-[15px] font-semibold" style={{ color: "var(--color-ink)" }}>{f.q}</summary>
                <p className="text-[14px] leading-relaxed mt-2" style={{ color: "var(--color-muted)" }}>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-3xl p-6 text-center" style={{ background: "var(--color-primary-soft)" }}>
          <h2 className="font-display text-2xl mb-2" style={{ color: "var(--color-ink)" }}>
            Haven ينظّم فصلك الدراسي كله
          </h2>
          <p className="text-[15px] leading-relaxed mb-5 mx-auto max-w-[520px]" style={{ color: "var(--color-muted)" }}>
            مخططك مع تنبيه قبل كل اختبار وتسليم، ومعدلك وغيابك وجدولك — في مكان واحد، مجاناً.
          </p>
          <Link href="/signup/" className="haven-btn inline-flex items-center justify-center rounded-2xl px-7 py-3.5 text-base font-semibold">
            أنشئ حسابك المجاني
          </Link>
        </section>

        <p className="text-center text-sm mt-8">
          <Link href="/tools/" className="hover:underline" style={{ color: "var(--color-primary)" }}>
            ← كل الأدوات المجانية
          </Link>
        </p>
      </main>

      <Footer />
    </div>
  );
}
