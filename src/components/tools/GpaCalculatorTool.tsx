"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, GraduationCap, ArrowLeft } from "lucide-react";

// Standalone, no-login GPA calculator for the public /tools/gpa-calculator page.
// Deliberately self-contained (no store, no i18n) so it renders instantly for a
// visitor arriving cold from search — the whole point of the SEO funnel. Arabic
// UI, RTL, themed with the app's CSS variables so it still matches Haven.
//
// The 5.0 letter→points map is IDENTICAL to src/lib/grades.ts SCALE, so a number
// computed here matches what the signed-in app shows. The 4.0 map is the common
// Saudi 4-point equivalent.

type Scale = "5" | "4";

interface GradeOption {
  letter: string;
  p5: number;
  p4: number;
}

// A+ … F, matching grades.ts SCALE for the 5.0 column.
const GRADES: GradeOption[] = [
  { letter: "A+", p5: 5.0, p4: 4.0 },
  { letter: "A", p5: 4.75, p4: 3.75 },
  { letter: "B+", p5: 4.5, p4: 3.5 },
  { letter: "B", p5: 4.0, p4: 3.0 },
  { letter: "C+", p5: 3.5, p4: 2.5 },
  { letter: "C", p5: 3.0, p4: 2.0 },
  { letter: "D+", p5: 2.5, p4: 1.5 },
  { letter: "D", p5: 2.0, p4: 1.0 },
  { letter: "F", p5: 1.0, p4: 0.0 },
];

const pointsFor = (letter: string, scale: Scale): number => {
  const g = GRADES.find((x) => x.letter === letter)!;
  return scale === "5" ? g.p5 : g.p4;
};

interface Row {
  id: number;
  name: string;
  credits: string; // kept as string so the field can be cleared while typing
  grade: string;
}

let nextId = 4;
const makeRow = (): Row => ({ id: nextId++, name: "", credits: "3", grade: "A" });

export function GpaCalculatorTool({ defaultScale = "5" }: { defaultScale?: Scale }) {
  const [scale, setScale] = useState<Scale>(defaultScale);
  const [rows, setRows] = useState<Row[]>([
    { id: 1, name: "", credits: "3", grade: "A+" },
    { id: 2, name: "", credits: "3", grade: "A" },
    { id: 3, name: "", credits: "3", grade: "B+" },
  ]);
  // Optional cumulative projection.
  const [prevGpa, setPrevGpa] = useState("");
  const [prevHours, setPrevHours] = useState("");

  const max = scale === "5" ? 5 : 4;

  const { semesterGpa, semesterCredits, cumulativeGpa } = useMemo(() => {
    let qp = 0;
    let cr = 0;
    for (const r of rows) {
      const c = Number(r.credits);
      if (!Number.isFinite(c) || c <= 0) continue;
      qp += pointsFor(r.grade, scale) * c;
      cr += c;
    }
    const sem = cr > 0 ? qp / cr : null;

    const pg = Number(prevGpa);
    const ph = Number(prevHours);
    let cum: number | null = null;
    if (Number.isFinite(pg) && pg > 0 && Number.isFinite(ph) && ph > 0 && cr > 0) {
      cum = (pg * ph + qp) / (ph + cr);
    }
    return { semesterGpa: sem, semesterCredits: cr, cumulativeGpa: cum };
  }, [rows, scale, prevGpa, prevHours]);

  const updateRow = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));

  const fmt = (n: number) => n.toFixed(2);

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      {/* Scale toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>
          نظام المعدل:
        </span>
        <div className="inline-flex rounded-xl p-1" style={{ background: "var(--color-primary-soft)" }}>
          {(["5", "4"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScale(s)}
              aria-pressed={scale === s}
              className="rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors"
              style={
                scale === s
                  ? { background: "var(--color-surface)", color: "var(--color-primary)", boxShadow: "var(--shadow-card)" }
                  : { color: "var(--color-muted)" }
              }
            >
              من {s}.0
            </button>
          ))}
        </div>
      </div>

      {/* Course rows */}
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-1 text-xs" style={{ color: "var(--color-muted)" }}>
          <span>المادة (اختياري)</span>
          <span className="w-20 text-center">الساعات</span>
          <span className="w-24 text-center">التقدير</span>
          <span className="w-9" />
        </div>
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
            <input
              type="text"
              value={r.name}
              onChange={(e) => updateRow(r.id, { name: e.target.value })}
              placeholder="اسم المادة"
              className="rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
            />
            <input
              type="number"
              min="1"
              max="12"
              inputMode="numeric"
              value={r.credits}
              onChange={(e) => updateRow(r.id, { credits: e.target.value })}
              aria-label="عدد الساعات"
              className="w-20 rounded-xl border px-3 py-2.5 text-sm text-center outline-none transition-colors focus:border-[var(--color-primary)]"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
            />
            <select
              value={r.grade}
              onChange={(e) => updateRow(r.id, { grade: e.target.value })}
              aria-label="التقدير"
              className="w-24 rounded-xl border px-2 py-2.5 text-sm text-center outline-none transition-colors focus:border-[var(--color-primary)]"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
            >
              {GRADES.map((g) => (
                <option key={g.letter} value={g.letter}>
                  {g.letter} ({scale === "5" ? g.p5.toFixed(2) : g.p4.toFixed(2)})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeRow(r.id)}
              aria-label="حذف المادة"
              disabled={rows.length <= 1}
              className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors disabled:opacity-30 hover:bg-[var(--color-primary-soft)]"
              style={{ color: "var(--color-muted)" }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, makeRow()])}
          className="inline-flex items-center gap-2 self-start rounded-xl px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-primary-soft)]"
          style={{ color: "var(--color-primary)", border: "1px dashed var(--color-border)" }}
        >
          <Plus size={16} />
          أضف مادة
        </button>
      </div>

      {/* Optional cumulative inputs */}
      <details className="rounded-xl border" style={{ borderColor: "var(--color-border)" }}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium" style={{ color: "var(--color-ink)" }}>
          احسب المعدل التراكمي (اختياري)
        </summary>
        <div className="flex flex-wrap gap-3 px-4 pb-4">
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
            معدلك التراكمي الحالي
            <input
              type="number"
              min="0"
              max={max}
              step="0.01"
              inputMode="decimal"
              value={prevGpa}
              onChange={(e) => setPrevGpa(e.target.value)}
              placeholder="0.00"
              className="w-32 rounded-xl border px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
            الساعات المحسوبة في المعدل
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={prevHours}
              onChange={(e) => setPrevHours(e.target.value)}
              placeholder="0"
              className="w-32 rounded-xl border px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
            />
          </label>
        </div>
        <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>
          انسخها من سجلك الأكاديمي: الساعات التي يُحسب عليها معدلك، ومنها ساعات المواد التي رسبت فيها، وليست الساعات المكتسبة.
        </p>
      </details>

      {/* Results */}
      <div
        className="rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4"
        style={{ background: "var(--color-primary-soft)" }}
      >
        <div>
          <div className="text-sm" style={{ color: "var(--color-muted)" }}>
            المعدل الفصلي
          </div>
          <div className="font-display text-4xl leading-none mt-1" style={{ color: "var(--color-primary)" }}>
            {semesterGpa == null ? "—" : fmt(semesterGpa)}
            <span className="text-lg" style={{ color: "var(--color-muted)" }}>
              {" "}/ {max}.0
            </span>
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
            {semesterCredits > 0 ? `${semesterCredits} ساعة معتمدة` : "أدخل موادك"}
          </div>
        </div>
        {cumulativeGpa != null && (
          <div>
            <div className="text-sm" style={{ color: "var(--color-muted)" }}>
              المعدل التراكمي المتوقّع
            </div>
            <div className="font-display text-4xl leading-none mt-1" style={{ color: "var(--color-brass)" }}>
              {fmt(cumulativeGpa)}
              <span className="text-lg" style={{ color: "var(--color-muted)" }}>
                {" "}/ {max}.0
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Conversion CTA — the tool is free; signing in SAVES it and unlocks tracking. */}
      <div
        className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <div className="flex items-start gap-3">
          <span
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
          >
            <GraduationCap size={20} />
          </span>
          <div>
            <div className="font-semibold text-sm" style={{ color: "var(--color-ink)" }}>
              احفظ موادك وتابع كل شي في مكان واحد
            </div>
            <div className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
              مع Haven تحفظ معدلك، وتتابع غيابك قبل الحرمان، ومواعيد اختباراتك وواجباتك — مجاناً.
            </div>
          </div>
        </div>
        <Link
          href="/signup/"
          className="haven-btn shrink-0 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
        >
          ابدأ مجاناً
          <ArrowLeft size={16} />
        </Link>
      </div>
    </div>
  );
}
