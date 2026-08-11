"use client";

import Link from "next/link";
import { useT } from "@/i18n";

// Shared site footer for public / marketing surfaces (landing, auth, /premium,
// and the four (marketing) pages). NOT used inside the authenticated app shell.
// Bilingual, reads the active locale. "Haven" always stays Latin.

const LINKS: { href: string; en: string; ar: string }[] = [
  { href: "/privacy", en: "Privacy Policy", ar: "سياسة الخصوصية" },
  { href: "/terms", en: "Terms of Service", ar: "الشروط والأحكام" },
  { href: "/refund", en: "Refund Policy", ar: "سياسة الاسترجاع" },
  { href: "/contact", en: "Contact", ar: "تواصل معنا" },
];

export function Footer() {
  const { lang } = useT();
  const copyright =
    lang === "ar"
      ? "© 2026 Haven — جميع الحقوق محفوظة"
      : "© 2026 Haven — All rights reserved";

  return (
    <footer
      className="w-full border-t"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="mx-auto w-full max-w-[720px] px-5 pt-12 pb-8 text-center">
        <p className="text-[13px]" style={{ color: "var(--color-muted)" }}>
          {copyright}
        </p>
        <nav className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {LINKS.map((l, idx) => (
            <span key={l.href}>
              {idx > 0 && <span className="mx-1.5 opacity-60">·</span>}
              <Link href={l.href} className="transition-colors hover:underline hover:text-[color:var(--color-ink)]">
                {lang === "ar" ? l.ar : l.en}
              </Link>
            </span>
          ))}
        </nav>
      </div>
    </footer>
  );
}
