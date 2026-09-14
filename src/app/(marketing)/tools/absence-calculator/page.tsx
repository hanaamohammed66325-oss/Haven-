import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { AbsenceCalculatorTool } from "@/components/tools/AbsenceCalculatorTool";

// PUBLIC, no-login absence / حرمان calculator. Server Component so it emits its
// own Arabic metadata + static body at build time for search + AI engines.

const URL_PATH = "/tools/absence-calculator/";
// Root layout's title template appends " · Haven" — don't repeat it here.
const TITLE = "حاسبة الغياب والحرمان — كم غياب باقٍ قبل الحرمان";
const DESCRIPTION =
  "احسب نسبة غيابك وكم محاضرة تقدر تغيبها قبل الحرمان من المادة — مجاناً وبدون تسجيل. يدعم نسبة حرمان ٢٥٪ و٢٠٪ وأي نسبة.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL_PATH },
  keywords: [
    "حاسبة الغياب",
    "نسبة الغياب",
    "حاسبة الحرمان",
    "كم غياب قبل الحرمان",
    "حساب نسبة الغياب الجامعة",
    "نسبة الحرمان",
    "حاسبة نسبة الحضور",
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

const FAQ: { q: string; a: string }[] = [
  {
    q: "كم نسبة الغياب المسموحة قبل الحرمان؟",
    a: "في أغلب الجامعات السعودية الحرمان عند تجاوز ٢٥٪ من محاضرات المادة، وبعضها ٢٠٪. اختر نسبة جامعتك في الحاسبة أعلاه لتعرف عدد المحاضرات المسموح غيابها.",
  },
  {
    q: "كيف أحسب نسبة غيابي؟",
    a: "نسبة الغياب = (عدد الغيابات ÷ إجمالي محاضرات المادة) × ١٠٠. إجمالي المحاضرات = عدد المحاضرات الأسبوعية × عدد أسابيع الفصل.",
  },
  {
    q: "كم محاضرة أقدر أغيب في مادة ٣ ساعات؟",
    a: "لو المادة ٣ محاضرات أسبوعياً على ١٥ أسبوعاً = ٤٥ محاضرة، ونسبة الحرمان ٢٥٪، فالمسموح غيابه أقل من ١١ محاضرة (أي ١١ فأكثر قد يعرّضك للحرمان). الحاسبة تحسبها لك بدقة.",
  },
  {
    q: "هل الغياب بعذر يحتسب؟",
    a: "الغياب بعذر مقبول عادةً لا يُحتسب ضمن نسبة الحرمان، لكن الأنظمة تختلف بين الجامعات — راجع لائحة جامعتك. في الحاسبة أدخل الغيابات التي تُحتسب عليك فقط.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "حاسبة الغياب والحرمان من Haven",
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
        { "@type": "ListItem", position: 3, name: "حاسبة الغياب", item: `https://havenstudent.com${URL_PATH}` },
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

export default function AbsenceCalculatorPage() {
  return (
    <div dir="rtl" lang="ar" className="min-h-dvh flex flex-col">
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
        <Link href="/signup/" className="haven-btn inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold">
          ابدأ مجاناً
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-5 flex-1 pb-16">
        <h1 className="font-display text-[32px] leading-tight mb-3" style={{ color: "var(--color-ink)" }}>
          حاسبة الغياب والحرمان
        </h1>
        <p className="text-[15px] leading-relaxed mb-7" style={{ color: "var(--color-muted)" }}>
          اعرف كم محاضرة تقدر تغيبها قبل الحرمان من المادة، ونسبة غيابك الحالية —
          مجاناً وبدون تسجيل. يدعم نسبة حرمان ٢٥٪ و٢٠٪ وأي نسبة.
        </p>

        <section
          className="rounded-3xl p-5 sm:p-6 mb-10"
          style={{ background: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
        >
          <AbsenceCalculatorTool />
        </section>

        <section className="mb-10">
          <h2 className="font-display text-2xl mb-3" style={{ color: "var(--color-ink)" }}>
            طريقة حساب نسبة الغياب والحرمان
          </h2>
          <p className="text-[15px] leading-relaxed mb-3" style={{ color: "var(--color-muted)" }}>
            إجمالي محاضرات المادة = عدد المحاضرات الأسبوعية × عدد أسابيع الفصل.
            نسبة غيابك = (غياباتك ÷ الإجمالي) × ١٠٠. إذا وصلت نسبتك إلى حد الحرمان
            (٢٥٪ في أغلب الجامعات) تُحرم من دخول الاختبار النهائي للمادة.
          </p>
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--color-muted)" }}>
            مثال: مادة ٣ محاضرات أسبوعياً × ١٥ أسبوع = ٤٥ محاضرة، وبنسبة حرمان ٢٥٪
            يكون المسموح غيابه أقل من ١١ محاضرة.
          </p>
        </section>

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

        <section className="rounded-3xl p-6 text-center" style={{ background: "var(--color-primary-soft)" }}>
          <h2 className="font-display text-2xl mb-2" style={{ color: "var(--color-ink)" }}>
            لا تترك غيابك للحظ
          </h2>
          <p className="text-[15px] leading-relaxed mb-5 mx-auto max-w-[520px]" style={{ color: "var(--color-muted)" }}>
            Haven يتابع غياب كل مادة تلقائياً وينبّهك قبل ما تقرب من الحرمان، مع
            معدلك وجدولك ومواعيدك في مكان واحد. مجاناً.
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
