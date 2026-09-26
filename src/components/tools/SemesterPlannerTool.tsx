"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trash2, ClipboardList, ArrowLeft } from "lucide-react";

// Standalone, no-login semester planner for /tools/planner — a public, simplified
// version of the in-app Planner (المخطط). Weeks + tagged items (exam / quiz /
// assignment / deadline / holiday), saved to localStorage so it survives a reload
// without an account. Arabic, RTL, themed. The sign-in CTA is for cloud sync +
// reminders. Tag colours mirror the app's planner tags.

const TAGS = [
  { key: "exam", label: "اختبار", color: "#d9534f" },
  { key: "quiz", label: "اختبار قصير", color: "#e89b4a" },
  { key: "assignment", label: "واجب", color: "#477680" },
  { key: "deadline", label: "تسليم", color: "#b8975a" },
  { key: "holiday", label: "إجازة", color: "#5fa98c" },
] as const;

type TagKey = (typeof TAGS)[number]["key"];
const colorOf = (k: TagKey) => TAGS.find((t) => t.key === k)!.color;
const labelOf = (k: TagKey) => TAGS.find((t) => t.key === k)!.label;

const STORAGE_KEY = "haven-tool-planner";
const DEFAULT_WEEKS = 15;

interface Item {
  id: number;
  week: number;
  tag: TagKey;
  text: string;
}

let nextId = 1;

export function SemesterPlannerTool() {
  const [items, setItems] = useState<Item[]>([]);
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS);
  const [activeTag, setActiveTag] = useState<TagKey>("exam");
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { items?: Item[]; weeks?: number };
        if (Array.isArray(saved.items) && saved.items.length) {
          setItems(saved.items);
          nextId = Math.max(...saved.items.map((s) => s.id)) + 1;
        }
        if (typeof saved.weeks === "number" && saved.weeks > 0) setWeeks(saved.weeks);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, weeks }));
    } catch {
      /* ignore */
    }
  }, [items, weeks]);

  const addItem = (week: number) => {
    const text = (drafts[week] ?? "").trim();
    if (!text) return;
    setItems((xs) => [...xs, { id: nextId++, week, tag: activeTag, text }]);
    setDrafts((d) => ({ ...d, [week]: "" }));
  };

  const remove = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));

  const byWeek = useMemo(() => {
    const map: Record<number, Item[]> = {};
    for (const it of items) (map[it.week] ??= []).push(it);
    return map;
  }, [items]);

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      {/* Active tag picker + weeks count */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>النوع:</span>
          {TAGS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTag(t.key)}
              aria-pressed={activeTag === t.key}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all"
              style={{
                background: activeTag === t.key ? `${t.color}1a` : "var(--color-surface)",
                color: activeTag === t.key ? t.color : "var(--color-muted)",
                border: `1px solid ${activeTag === t.key ? t.color : "var(--color-border)"}`,
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm ms-auto" style={{ color: "var(--color-muted)" }}>
          عدد الأسابيع
          <input
            type="number"
            min="1"
            max="20"
            inputMode="numeric"
            value={weeks}
            onChange={(e) => setWeeks(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="w-16 rounded-xl border px-2 py-1.5 text-sm text-center outline-none focus:border-[var(--color-primary)]"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
          />
        </label>
      </div>

      {/* Weeks grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: weeks }).map((_, i) => {
          const week = i + 1;
          const list = byWeek[week] ?? [];
          return (
            <div key={week} className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              <div className="font-display text-sm" style={{ color: "var(--color-ink)" }}>الأسبوع {week}</div>
              <div className="flex flex-col gap-1.5">
                {list.map((it) => (
                  <div key={it.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: `${colorOf(it.tag)}12` }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorOf(it.tag) }} />
                    <span className="text-[13px] flex-1 min-w-0 truncate" style={{ color: "var(--color-ink)" }} title={it.text}>
                      {it.text}
                    </span>
                    <span className="text-[10px] shrink-0" style={{ color: colorOf(it.tag) }}>{labelOf(it.tag)}</span>
                    <button
                      type="button"
                      onClick={() => remove(it.id)}
                      aria-label="حذف"
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      style={{ color: "var(--color-muted)" }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <input
                type="text"
                value={drafts[week] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [week]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addItem(week)}
                placeholder="أضف…"
                className="rounded-lg border px-2.5 py-1.5 text-[13px] outline-none transition-colors focus:border-[var(--color-primary)]"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface-alt)", color: "var(--color-ink)" }}
              />
            </div>
          );
        })}
      </div>

      {/* Conversion CTA */}
      <div className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
            <ClipboardList size={20} />
          </span>
          <div>
            <div className="font-semibold text-sm" style={{ color: "var(--color-ink)" }}>
              احفظ مخططك على كل أجهزتك
            </div>
            <div className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
              مع Haven يوصلك تنبيه قبل كل اختبار وتسليم، مع معدلك وغيابك وجدولك — مجاناً.
            </div>
          </div>
        </div>
        <Link href="/signup/" className="haven-btn shrink-0 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold">
          ابدأ مجاناً
          <ArrowLeft size={16} />
        </Link>
      </div>
    </div>
  );
}
