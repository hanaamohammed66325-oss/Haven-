"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  TrendingUp,
  CalendarDays,
  Settings,
  Lock,
  Globe,
} from "lucide-react";
import { Logo } from "./Logo";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/translations/en";

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: typeof LayoutDashboard;
  locked?: boolean;
}

const navItems: NavItem[] = [
  { href: "/", labelKey: "nav_dashboard", icon: LayoutDashboard },
  { href: "/courses", labelKey: "nav_courses", icon: BookOpen },
  { href: "/progress", labelKey: "nav_progress", icon: TrendingUp, locked: true },
  { href: "/schedule", labelKey: "nav_schedule", icon: CalendarDays, locked: true },
  { href: "/settings", labelKey: "nav_settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t, lang } = useT();
  const { language, setLanguage } = useStore();

  return (
    <aside className="glass-sidebar shrink-0 w-60 sticky top-0 h-dvh flex flex-col px-4 py-6">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 mb-9">
        <Logo size={38} tile />
        <div className="leading-tight">
          <div className="font-semibold text-lg" style={{ color: "var(--color-ink)" }}>
            {t("appName")}
          </div>
          <div className="text-[11px]" style={{ color: "var(--color-muted)" }}>
            {t("tagline")}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1.5">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          if (item.locked) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm cursor-not-allowed select-none"
                style={{ color: "rgba(91,107,114,0.5)" }}
                title={t("comingSoon")}
              >
                <Icon size={18} />
                <span className="flex-1">{t(item.labelKey)}</span>
                <Lock size={13} />
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className="haven-nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium"
              style={
                active
                  ? {
                      background: "var(--grad-primary)",
                      color: "#fff",
                      boxShadow: "0 8px 20px rgba(54,90,98,0.28)",
                    }
                  : { color: "var(--color-muted)" }
              }
            >
              <Icon size={18} />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Language toggle */}
      <button
        onClick={() => setLanguage(language === "en" ? "ar" : "en")}
        className="haven-nav-item mt-auto flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium border"
        style={{ color: "var(--color-ink)", borderColor: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.4)" }}
      >
        <Globe size={18} />
        <span>{lang === "en" ? t("switchToArabic") : t("switchToEnglish")}</span>
      </button>
    </aside>
  );
}
