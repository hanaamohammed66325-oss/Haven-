"use client";

import { useState } from "react";
import { InteractionButton } from "@/components/motion/Interaction";
import { SectionHeader, useC, useS } from "./_lib";

export interface GpaEmailContext { term: string; kind: string; resolution?: string; intent?: "follow-up" | "information" | "resolved"; }

const templates = [
  {
    id: "follow-up",
    label: "متابعة اختلاف المعدل",
    subject: "متابعة اختلاف المعدل في Haven",
    body: "مرحبًا،\n\nنعتذر عن اختلاف نتيجة التحقق من [نوع المعدل] في [الفصل]. نراجع تفاصيل المقارنة وسنوافيك بما نتوصل إليه في أقرب وقت ممكن. إذا تبيّن أن الفرق ناتج عن طريقة الاحتساب في Haven، فسنعمل على تصحيحه.\n\nفريق Haven",
  },
  {
    id: "information",
    label: "طلب معلومة من السجل",
    subject: "معلومة لاستكمال مراجعة المعدل",
    body: "مرحبًا،\n\nراجعنا مقارنة [نوع المعدل] في [الفصل]، ولا يزال الفرق قائمًا. هل يمكنك مشاركة [المعلومة المطلوبة] كما تظهر في سجلك الأكاديمي؟ تكفينا هذه المعلومة لاستكمال المراجعة، وسنوافيك بالنتيجة.\n\nفريق Haven",
  },
  {
    id: "resolved",
    label: "إبلاغ الطالب بحل الفرق",
    subject: "تم حل اختلاف المعدل في Haven",
    body: "مرحبًا،\n\nأعدنا مقارنة [نوع المعدل] في [الفصل]، وتطابقت النتيجة مع سجلك الأكاديمي. [خلاصة التصحيح]\n\nتظهر حالة «تم الحل» بجانب الطلب في الملف الشخصي. شكرًا لإتاحة الفرصة لمراجعة الحالة.\n\nفريق Haven",
  },
  {
    id: "recheck",
    label: "طلب إعادة التحقق",
    subject: "إعادة التحقق من المعدل في Haven",
    body: "مرحبًا،\n\nيمكنك إعادة مقارنة المعدل من الملف الشخصي. راجع ساعات المقررات والتقديرات، وحدد المقررات التي يستبعدها سجلك الأكاديمي من المعدل. إذا بقي الفرق، يمكنك إرسال المقارنة للمراجعة.\n\nفريق Haven",
  },
  {
    id: "prior",
    label: "تأكيد التراكمي السابق",
    subject: "مراجعة المعدل التراكمي السابق في Haven",
    body: "مرحبًا،\n\nنعتذر عن عدم تنبيهك عند تغيّر نظام التقديرات في حسابك. يُرجى مراجعة المعدل التراكمي السابق والساعات المحتسبة له وفق سجلك الأكاديمي، ثم تأكيد القيم أو تعديلها من الملف الشخصي.\n\nفريق Haven",
  },
];

const automated = [
  "بدء التجربة المجانية وانتهاؤها",
  "إيصال الدفع وتعذّر الدفع وإلغاء الاشتراك",
  "تغيير كلمة المرور وطلب تغيير البريد الإلكتروني",
  "تنشيط الحساب وإعلانات الميزات",
];

function draft(template: (typeof templates)[number], context?: GpaEmailContext) {
  return {
    subject: template.subject,
    body: template.body
      .replaceAll("[الفصل]", () => context?.term || "[الفصل]")
      .replaceAll("[نوع المعدل]", () => context?.kind || "[نوع المعدل]")
      .replaceAll("[خلاصة التصحيح]", () => context?.resolution || "[خلاصة التصحيح]"),
  };
}

export function EmailTemplatesSection({ context }: { context?: GpaEmailContext }) {
  const C = useC();
  const S = useS();
  const initial = templates.find((template) => template.id === context?.intent) ?? (context?.resolution ? templates[2] : templates[0]);
  const [selected, setSelected] = useState(initial.id);
  const [value, setValue] = useState(() => draft(initial, context));
  const [notice, setNotice] = useState("");
  const select = (template: (typeof templates)[number]) => {
    setSelected(template.id);
    setValue(draft(template, context));
    setNotice("");
  };
  const copy = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(ok);
    } catch {
      setNotice("يمكنك تحديد النص ونسخه يدويًا.");
    }
  };
  return (
    <section className="min-w-0 space-y-5">
      <SectionHeader title="Email Templates" />
      <div dir="rtl" className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-xl border p-3" style={{ background: C.panel, borderColor: C.border }}>
          <h2 className="mb-3 px-2 text-sm font-semibold" style={{ color: C.text }}>قوالب متابعة المعدل</h2>
          <div className="flex flex-wrap gap-2 lg:flex-col">
            {templates.map((template) => (
              <InteractionButton key={template.id} type="button" aria-pressed={selected === template.id}
                onClick={() => select(template)} className="min-h-9 rounded-lg px-3 py-2 text-start text-xs"
                style={{ background: selected === template.id ? C.panel2 : "transparent", color: C.text }}>
                {template.label}
              </InteractionButton>
            ))}
          </div>
        </div>
        <div className="min-w-0 space-y-4 rounded-xl border p-4 sm:p-5" style={{ background: C.panel, borderColor: C.border }}>
          <div>
            <label htmlFor="email-template-subject" className="block text-xs font-medium" style={{ color: C.text }}>عنوان الرسالة</label>
            <input id="email-template-subject" className="mt-2 block min-w-0" style={{ ...S.input, width: "100%" }}
              value={value.subject} onChange={(event) => { setNotice(""); setValue({ ...value, subject: event.target.value }); }} />
          </div>
          <div>
            <label htmlFor="email-template-body" className="block text-xs font-medium" style={{ color: C.text }}>نص الرسالة</label>
            <textarea id="email-template-body" rows={9} className="mt-2 block min-w-0 leading-relaxed" style={{ ...S.input, width: "100%", resize: "vertical" }}
              value={value.body} onChange={(event) => { setNotice(""); setValue({ ...value, body: event.target.value }); }} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <InteractionButton type="button" style={S.btnSec} onClick={() => void copy(value.subject, "تم نسخ العنوان.")}>نسخ العنوان</InteractionButton>
            <InteractionButton type="button" style={S.btnPrimary} onClick={() => void copy(value.body, "تم نسخ النص.")}>نسخ النص</InteractionButton>
            {notice && <span role="status" className="text-xs" style={{ color: C.textMuted }}>{notice}</span>}
          </div>
        </div>
      </div>
      <section dir="rtl" className="rounded-xl border p-4 text-sm" style={{ borderColor: C.border, color: C.textMuted }}>
        <h2 className="mb-2 font-semibold" style={{ color: C.text }}>قوالب الرسائل الآلية الحالية</h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-2">{automated.map((label) => <li key={label}>{label}</li>)}</ul>
      </section>
    </section>
  );
}
