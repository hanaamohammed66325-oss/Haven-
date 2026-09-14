import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { GpaCalculatorTool } from "@/components/tools/GpaCalculatorTool";

// PUBLIC, no-login GPA calculator — the flagship SEO landing page. This is a
// Server Component (unlike the older "use client" marketing pages) so it emits
// its OWN static <title>, description, canonical and Arabic body copy at build
// time — exactly what a crawler arriving from "حاسبة المعدل" needs to index.
// The interactive calculator + footer are client children.

const URL_PATH = "/tools/gpa-calculator/";
// The root layout's title template appends " · Haven", so don't repeat it here.
const TITLE = "حاسبة المعدل الجامعي — فصلي وتراكمي (نظام ٥ و٤)";
const DESCRIPTION =
  "احسب معدلك الجامعي الفصلي والتراكمي مجاناً وبدون تسجيل — نظام ٥.٠ و٤.٠. أضف موادك وساعاتك وتقديراتك واحصل على النتيجة فوراً.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL_PATH },
  keywords: [
    "حاسبة المعدل",
    "حساب المعدل التراكمي",
    "حاسبة المعدل الجامعي",
    "حساب المعدل الفصلي",
    "حاسبة المعدل نظام 5",
    "حاسبة المعدل نظام 4",
    "تحويل النسبة الى معدل",
    "GPA calculator",
  ],
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

// Real, useful answers double as AEO content (so AI assistants can cite them)
// and power the FAQPage structured data below.
const FAQ: { q: string; a: string }[] = [
  {
    q: "كيف أحسب معدلي الفصلي؟",
    a: "المعدل الفصلي = مجموع (نقاط كل مادة × ساعاتها) ÷ مجموع الساعات. أدخل كل مادة بساعاتها وتقديرها في الحاسبة أعلاه ويظهر المعدل فوراً.",
  },
  {
    q: "ما الفرق بين نظام ٥.٠ و٤.٠؟",
    a: "في نظام الخمس نقاط يكون التقدير A+ يساوي ٥.٠، وفي نظام الأربع نقاط يساوي ٤.٠. الحاسبة تدعم النظامين — بدّل بينهما من الأعلى حسب جامعتك.",
  },
  {
    q: "كيف أحسب المعدل التراكمي؟",
    a: "افتح خيار «احسب المعدل التراكمي»، وأدخل معدلك التراكمي الحالي وعدد ساعاتك المكتسبة سابقاً، ثم أضف مواد الفصل الحالي — يظهر لك المعدل التراكمي المتوقّع تلقائياً.",
  },
  {
    q: "هل الحاسبة مجانية وتحتاج تسجيل؟",
    a: "الحاسبة مجانية تماماً وتشتغل بدون تسجيل دخول. لو حبيت تحفظ موادك وتتابع غيابك ومواعيد اختباراتك تلقائياً، تقدر تنشئ حساب Haven مجاني.",
  },
  {
    q: "كيف أحوّل النسبة المئوية إلى تقدير؟",
    a: "عادةً: ٩٥٪ فأكثر A+، ٩٠–٩٤ A، ٨٥–٨٩ B+، ٨٠–٨٤ B، ٧٥–٧٩ C+، ٧٠–٧٤ C، ٦٥–٦٩ D+، ٦٠–٦٤ D، وأقل من ٦٠ F. قد تختلف الحدود قليلاً بين الجامعات.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "حاسبة المعدل الجامعي من Haven",
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
        { "@type": "ListItem", position: 3, name: "حاسبة المعدل", item: `https://havenstudent.com${URL_PATH}` },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function GpaCalculatorPage() {
  return (
    <div dir="rtl" lang="ar" className="min-h-dvh flex flex-col">
      {/* Structured data for Google rich results + AI answer engines. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="mx-auto w-full max-w-[760px] px-5 flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={30} mono />
          <span className="font-display text-xl" style={{ color: "var(--color-ink)" }}>
            Haven
          </span>
        </Link>
        <Link
          href="/signup/"
          className="haven-btn inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold"
        >
          ابدأ مجاناً
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-5 flex-1 pb-16">
        <h1 className="font-display text-[32px] leading-tight mb-3" style={{ color: "var(--color-ink)" }}>
          حاسبة المعدل الجامعي
        </h1>
        <p className="text-[15px] leading-relaxed mb-7" style={{ color: "var(--color-muted)" }}>
          احسب معدلك الفصلي والتراكمي مجاناً وبدون تسجيل — يدعم نظام ٥.٠ و٤.٠.
          أضف موادك وساعاتها وتقديراتها ويظهر المعدل فوراً.
        </p>

        <section
          className="rounded-3xl p-5 sm:p-6 mb-10"
          style={{ background: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
        >
          <GpaCalculatorTool />
        </section>

        {/* How-to — content crawlers and AI can read + summarize. */}
        <section className="mb-10">
          <h2 className="font-display text-2xl mb-3" style={{ color: "var(--color-ink)" }}>
            طريقة حساب المعدل الجامعي
          </h2>
          <p className="text-[15px] leading-relaxed mb-3" style={{ color: "var(--color-muted)" }}>
            يُحسب المعدل الفصلي بضرب نقاط كل مادة في عدد ساعاتها، ثم قسمة مجموع
            الناتج على مجموع الساعات المعتمدة. مثال: مادة ٣ ساعات بتقدير A+ (٥.٠)
            ومادة ٣ ساعات بتقدير B (٤.٠) → المعدل = (٥×٣ + ٤×٣) ÷ ٦ = ٤.٥٠.
          </p>
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--color-muted)" }}>
            أما المعدل التراكمي فيدمج معدلك السابق وساعاتك المكتسبة مع مواد الفصل
            الحالي، والحاسبة أعلاه تحسبه لك تلقائياً عند إدخال بياناتك السابقة.
          </p>
        </section>

        {/* FAQ (mirrors the FAQPage structured data). */}
        <section className="mb-10">
          <h2 className="font-display text-2xl mb-4" style={{ color: "var(--color-ink)" }}>
            أسئلة شائعة
          </h2>
          <div className="flex flex-col gap-3">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="rounded-2xl border px-4 py-3"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
              >
                <summary className="cursor-pointer text-[15px] font-semibold" style={{ color: "var(--color-ink)" }}>
                  {f.q}
                </summary>
                <p className="text-[14px] leading-relaxed mt-2" style={{ color: "var(--color-muted)" }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Cross-link to the app's value + (future) sibling tools. */}
        <section
          className="rounded-3xl p-6 text-center"
          style={{ background: "var(--color-primary-soft)" }}
        >
          <h2 className="font-display text-2xl mb-2" style={{ color: "var(--color-ink)" }}>
            Haven ينظّم فصلك الدراسي كله
          </h2>
          <p className="text-[15px] leading-relaxed mb-5 mx-auto max-w-[520px]" style={{ color: "var(--color-muted)" }}>
            المعدل، الغياب قبل الحرمان، الجدول، ومواعيد الاختبارات والواجبات — في
            مكان واحد، مع تذكيرات تنبّهك قبل الموعد. مجاناً.
          </p>
          <Link
            href="/signup/"
            className="haven-btn inline-flex items-center justify-center rounded-2xl px-7 py-3.5 text-base font-semibold"
          >
            أنشئ حسابك المجاني
          </Link>
        </section>

        <p className="text-center text-sm mt-8">
          <Link href="/tools/absence-calculator/" className="hover:underline" style={{ color: "var(--color-primary)" }}>
            جرّب أيضاً: حاسبة الغياب والحرمان
          </Link>
          <span className="mx-2 opacity-50">·</span>
          <Link href="/tools/" className="hover:underline" style={{ color: "var(--color-primary)" }}>
            كل الأدوات
          </Link>
        </p>
      </main>

      <Footer />
    </div>
  );
}
