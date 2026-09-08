"use client";

import { Lock } from "lucide-react";
import { useT } from "@/i18n";

export function ComingSoon({ title, tag, desc }: { title: string; tag?: string; desc?: string }) {
  const { t } = useT();
  return (
    <div className="haven-fade-in flex flex-col items-center justify-center text-center py-24">
      <div
        className="flex items-center justify-center rounded-2xl mb-6"
        style={{
          width: 64,
          height: 64,
          background: "var(--color-primary-soft)",
          color: "var(--color-primary)",
        }}
      >
        <Lock size={26} />
      </div>
      <h1 className="font-display text-2xl" style={{ color: "var(--color-ink)" }}>
        {title}
      </h1>
      {tag && (
        <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
          {tag}
        </p>
      )}
      <p className="mt-3 max-w-sm text-[15px]" style={{ color: "var(--color-muted)" }}>
        {desc ?? t("comingSoonDesc")}
      </p>
    </div>
  );
}
