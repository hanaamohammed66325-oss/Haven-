"use client";

import { Lock } from "lucide-react";
import { useT } from "@/i18n";

export function ComingSoon({ title }: { title: string }) {
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
      <h1 className="font-display text-2xl mb-3" style={{ color: "var(--color-ink)" }}>
        {title}
      </h1>
      <p className="max-w-sm text-[15px]" style={{ color: "var(--color-muted)" }}>
        {t("comingSoonDesc")}
      </p>
    </div>
  );
}
