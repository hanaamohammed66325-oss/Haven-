import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { GpaCalculatorTool } from "@/components/tools/GpaCalculatorTool";
import { UNIVERSITIES, universityBySlug } from "@/lib/tools/universities";
import { ShareButton } from "@/components/tools/ShareButton";

// Programmatic per-university GPA pages. One static page per university targets
// "حاسبة معدل جامعة X" — long-tail, lower competition, many pages. Each presets
// the calculator to that university's common scale and states its حرمان limit,
// with an honesty note + official link so the pages carry real value (not thin
// duplicates). Server Component → build-time metadata per university.

// Required for output:"export": pre-render one page per known university.
export function generateStaticParams() {
  return UNIVERSITIES.map((u) => ({ university: u.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ university: string }>;
}): Promise<Metadata> {
  const { university } = await params;
  const uni = universityBySlug(university);
  if (!uni) return { title: "حاسبة المعدل" };
  const path = `/tools/gpa-calculator/${uni.slug}/`;
  const title = `حاسبة معدل ${uni.name} — فصلي وتراكمي (نظام ${uni.scale}.0)`;
  const description = `احسب معدلك في ${uni.name} مجاناً وبدون تسجيل — نظام ${uni.scale}.0، فصلي وتراكمي. أضف موادك وساعاتك وتقديراتك واحصل على النتيجة فوراً.`;
  return {
    title,
    description,
    alternates: { canonical: path },
    keywords: [
      `حاسبة معدل ${uni.name}`,
      `حساب المعدل ${uni.name}`,
      "حاسبة المعدل الجامعي",
      "حساب المعدل التراكمي",
    ],
    openGraph: { type: "website", locale: "ar_SA", url: path, siteName: "Haven", title, description },
    twitter: { card: "summary", title, description },
  };
}

export default async function UniversityGpaPage({
  params,
}: {
  params: Promise<{ university: string }>;
}) {
  const { university } = await params;
  const uni = universityBySlug(university);
  if (!uni) {
    return (
      <div dir="rtl" lang="ar" className="min-h-dvh flex items-center justify-center p-6 text-center">
        <div>
          <p style={{ color: "var(--color-ink)" }}>الجامعة غير موجودة.</p>
          <Link href="/tools/gpa-calculator/" className="hover:underline" style={{ color: "var(--color-primary)" }}>
            ← حاسبة المعدل العامة
          </Link>
        </div>
      </div>
    );
  }

  const path = `/tools/gpa-calculator/${uni.slug}/`;
  const title = `حاسبة معدل ${uni.name}`;
  const description = `احسب معدلك في ${uni.name} مجاناً وبدون تسجيل — نظام ${uni.scale}.0، فصلي وتراكمي.`;

  const FAQ: { q: string; a: string }[] = [
    {
      q: `ما نظام المعدل في ${uni.name}؟`,
      a: `تعتمد ${uni.name} غالباً نظام ${uni.scale}.0 لحساب المعدل. قد يختلف النظام بين الكليات، لذا تأكّد من لائحة كليتك الرسمية.`,
    },
    {
      q: "كيف أحسب معدلي الفصلي؟",
      a: "المعدل الفصلي = مجموع (نقاط كل مادة × ساعاتها) ÷ مجموع الساعات. أدخل موادك في الحاسبة أعلاه ويظهر المعدل فوراً.",
    },
    {
      q: "كيف أحسب المعدل التراكمي؟",
      a: "افتح خيار «احسب المعدل التراكمي» وأدخل معدلك الحالي وساعاتك المكتسبة، ثم أضف مواد الفصل — يظهر المعدل التراكمي المتوقّع تلقائياً.",
    },
    {
      q: `كم نسبة الحرمان في ${uni.name}؟`,
      a: `عادةً يكون الحرمان عند تجاوز ${uni.denialPct}٪ من محاضرات المادة. استخدم حاسبة الغياب لمعرفة عدد المحاضرات المسموح غيابها.`,
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: `حاسبة معدل ${uni.name} من Haven`,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        url: `https://havenstudent.com${path}`,
        inLanguage: "ar",
        offers: { "@type": "Offer", price: "0", priceCurrency: "SAR" },
        description,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Haven", item: "https://havenstudent.com/" },
          { "@type": "ListItem", position: 2, name: "الأدوات", item: "https://havenstudent.com/tools/" },
          { "@type": "ListItem", position: 3, name: "حاسبة المعدل", item: "https://havenstudent.com/tools/gpa-calculator/" },
          { "@type": "ListItem", position: 4, name: uni.name, item: `https://havenstudent.com${path}` },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };

  return (
    <div dir="rtl" lang="ar" className="min-h-dvh flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mx-auto w-full max-w-[760px] px-5 flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={30} mono />
          <span className="font-display text-xl" style={{ color: "var(--color-ink)" }}>Haven</span>
        </Link>
        <div className="flex items-center gap-2">
          <ShareButton title={title} path={path} />
          <Link href="/signup/" className="haven-btn inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold">
            ابدأ مجاناً
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-5 flex-1 pb-16">
        <h1 className="font-display text-[32px] leading-tight mb-3" style={{ color: "var(--color-ink)" }}>
          {title}
        </h1>
        <p className="text-[15px] leading-relaxed mb-5" style={{ color: "var(--color-muted)" }}>
          احسب معدلك في {uni.name} مجاناً وبدون تسجيل. الحاسبة مضبوطة على نظام{" "}
          <strong style={{ color: "var(--color-ink)" }}>{uni.scale}.0</strong> — تقدر تغيّره لو كليتك تختلف.
        </p>

        {/* Honesty note — keeps the page trustworthy + not a thin doorway. */}
        <p
          className="text-[13px] leading-relaxed mb-7 rounded-xl px-4 py-3"
          style={{ background: "var(--color-surface-alt)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}
        >
          ملاحظة: نظام المعدل ونسبة الحرمان قد يختلفان بين الكليات. تأكّد من لائحة{" "}
          {uni.site ? (
            <a href={uni.site} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--color-primary)" }}>
              {uni.name} الرسمية
            </a>
          ) : (
            <>{uni.name} الرسمية</>
          )}
          .
        </p>

        <section className="rounded-3xl p-5 sm:p-6 mb-10" style={{ background: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}>
          <GpaCalculatorTool defaultScale={uni.scale} />
        </section>

        <section className="mb-10">
          <h2 className="font-display text-2xl mb-3" style={{ color: "var(--color-ink)" }}>
            طريقة حساب المعدل في {uni.name}
          </h2>
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--color-muted)" }}>
            يُحسب المعدل الفصلي بضرب نقاط كل مادة في عدد ساعاتها، ثم قسمة المجموع
            على مجموع الساعات المعتمدة، وفق نظام {uni.scale}.0. أما التراكمي فيدمج
            معدلك السابق مع مواد الفصل الحالي، والحاسبة أعلاه تحسبه لك تلقائياً.
          </p>
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
            Haven ينظّم فصلك في {uni.name}
          </h2>
          <p className="text-[15px] leading-relaxed mb-5 mx-auto max-w-[520px]" style={{ color: "var(--color-muted)" }}>
            احفظ معدلك، وتابع غيابك قبل الحرمان، ومواعيد اختباراتك وواجباتك — في مكان واحد، مجاناً.
          </p>
          <Link href="/signup/" className="haven-btn inline-flex items-center justify-center rounded-2xl px-7 py-3.5 text-base font-semibold">
            أنشئ حسابك المجاني
          </Link>
        </section>

        <p className="text-center text-sm mt-8">
          <Link href="/tools/gpa-calculator/" className="hover:underline" style={{ color: "var(--color-primary)" }}>
            حاسبة المعدل العامة
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
