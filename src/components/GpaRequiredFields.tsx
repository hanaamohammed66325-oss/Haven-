"use client";

import { useId, useState } from "react";
import { useT } from "@/i18n";

export function useGpaRequiredFields() {
  const id = useId();
  const { lang } = useT();
  const [missing, setMissing] = useState<string[]>([]);
  const key = (field: string) => `${id}-${field}`;

  const validate = (fields: Array<string | false>) => {
    const next = fields.filter((field): field is string => Boolean(field));
    setMissing(next);
    if (!next.length) return true;
    requestAnimationFrame(() => {
      const control = document.querySelector<HTMLElement>(`[data-gpa-required="${CSS.escape(key(next[0]))}"]`);
      control?.focus();
      if (control && typeof control.animate === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        control.getAnimations?.().filter((animation) => animation.id === "gpa-required").forEach((animation) => animation.cancel());
        const shake = control.animate([
          { transform: "translateX(0)" }, { transform: "translateX(-4px)" },
          { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "translateX(0)" },
        ], { duration: 220, easing: "ease-out" });
        shake.id = "gpa-required";
      }
    });
    return false;
  };

  const clear = (field: string) => setMissing((previous) => previous.includes(field) ? previous.filter((value) => value !== field) : previous);
  const props = (field: string) => ({
    "data-gpa-required": key(field),
    "aria-invalid": missing.includes(field) || undefined,
    "aria-describedby": missing.includes(field) ? key(field) : undefined,
  });
  const message = (field: string) => missing.includes(field)
    ? <span dir="auto" id={key(field)} role="alert" className="block text-xs leading-snug" style={{ color: "var(--color-danger)" }}>
        {lang === "ar" ? "هذا الحقل مطلوب" : "This field is required"}
      </span>
    : null;
  const style = (field: string) => missing.includes(field) ? { borderColor: "var(--color-danger)" } : {};
  return { validate, clear, props, message, style };
}
