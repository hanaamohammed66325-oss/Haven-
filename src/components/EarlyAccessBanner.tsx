"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useT } from "@/i18n";

const DISMISSED_KEY = "haven-early-access-dismissed";

export function EarlyAccessBanner() {
  const { t } = useT();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="mb-6 flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm"
      style={{ background: "var(--color-surface-alt)", color: "var(--color-muted)" }}
      role="status"
    >
      <span className="flex-1 min-w-0">
        {t("earlyAccess")}
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-full p-1 transition-colors hover:bg-black/5"
      >
        <X size={15} style={{ color: "var(--color-muted)" }} />
      </button>
    </div>
  );
}
