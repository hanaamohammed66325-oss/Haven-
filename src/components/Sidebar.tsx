"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  CalendarDays,
  Settings,
  Lock,
  Globe,
  User,
  Check,
  Sparkles,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
} from "lucide-react";
import { Logo } from "./Logo";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { useSubscription } from "@/lib/subscription";
import { PLANS, DEFAULT_PLAN_ID, PREMIUM_LIST, FEATURES, isVip, isActiveSubscriber } from "@/lib/premium";
import type { TranslationKey } from "@/i18n/translations/en";

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: typeof LayoutDashboard;
  locked?: boolean;
}

const MENU: NavItem[] = [
  { href: "/dashboard", labelKey: "nav_dashboard", icon: LayoutDashboard },
  { href: "/courses", labelKey: "nav_courses", icon: BookOpen },
  { href: "/assignments", labelKey: "nav_assignments", icon: ClipboardList },
  { href: "/schedule", labelKey: "nav_schedule", icon: CalendarDays },
];

const ACCOUNT: NavItem[] = [
  { href: "/settings", labelKey: "nav_settings", icon: Settings },
];

// Plans and the premium feature list both come from premium.js (the single
// source of truth) so marketing and gating can never drift apart.
const PREMIUM_BENEFITS: TranslationKey[] = PREMIUM_LIST.map(
  (key: string) => (FEATURES as Record<string, { labelKey?: string }>)[key]?.labelKey as TranslationKey
).filter(Boolean);

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="pointer-events-none absolute start-full top-1/2 -translate-y-1/2 ms-3 z-50 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      style={{ background: "var(--color-ink)", color: "#fff", boxShadow: "var(--shadow-card)" }}
      role="tooltip"
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-3.5 mb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em]"
      style={{ color: "rgba(231,239,240,0.38)" }}
    >
      {children}
    </div>
  );
}

function NavRow({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const { t } = useT();
  const Icon = item.icon;
  const label = t(item.labelKey);
  const base = collapsed
    ? "justify-center h-11 w-11 mx-auto"
    : "gap-3 px-3.5 py-2.5";

  if (item.locked) {
    return (
      <div
        className={`group relative flex items-center rounded-xl text-sm cursor-not-allowed select-none ${base}`}
        style={{ color: "rgba(231,239,240,0.36)" }}
        title={collapsed ? undefined : t("comingSoon")}
      >
        <Icon size={18} />
        {!collapsed && <span className="flex-1">{label}</span>}
        {!collapsed && <Lock size={13} />}
        {collapsed && <Tooltip>{label}</Tooltip>}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={`haven-nav-item relative flex items-center rounded-xl text-sm font-medium ${base} ${
        active ? "haven-nav-active text-white" : "text-[rgba(231,239,240,0.7)] hover:text-white"
      } group`}
    >
      {active && (
        <span
          className="absolute start-0 top-1/2 -translate-y-1/2 h-[18px] w-[3px] rounded-e-full"
          style={{ background: "var(--color-brass)", boxShadow: "0 0 10px rgba(184,151,90,0.7)" }}
        />
      )}
      <Icon size={18} style={active ? { color: "var(--color-brass)" } : undefined} />
      {!collapsed && <span>{label}</span>}
      {collapsed && <Tooltip>{label}</Tooltip>}
    </Link>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { t, lang } = useT();
  const { language, setLanguage, profileName, email, profilePhoto } = useStore();
  const { sub, profile } = useSubscription();
  // Go Premium is only relevant to users who can still subscribe. Hide it for
  // VIP and active subscribers (trial users still see it — they may want to
  // convert / view plans).
  const hideGoPremium = isVip(profile) || isActiveSubscriber(sub);
  const [plan, setPlan] = useState<string>(DEFAULT_PLAN_ID);
  // Collapsible Go Premium card. Default expanded; once the user collapses it we
  // remember that per browser so it stays a compact pill next time.
  const [premiumCardOpen, setPremiumCardOpen] = useState(true);
  useEffect(() => {
    try {
      const v = localStorage.getItem("haven_premium_card_open");
      if (v !== null) setPremiumCardOpen(v === "1");
    } catch {
      // ignore — default expanded
    }
  }, []);
  const togglePremiumCard = () =>
    setPremiumCardOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem("haven_premium_card_open", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });

  const initial = (profileName || "?").trim().charAt(0).toUpperCase();

  const avatar = (size: number) => (
    <span
      className="flex items-center justify-center rounded-full shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, rgba(184,151,90,0.32), rgba(255,255,255,0.12))",
        color: "#fff",
        boxShadow: "inset 0 0 0 1px rgba(184,151,90,0.4)",
      }}
    >
      {profilePhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profilePhoto} alt="" className="h-full w-full object-cover" />
      ) : initial ? (
        <span className="text-sm font-semibold">{initial}</span>
      ) : (
        <User size={18} />
      )}
    </span>
  );

  return (
    <aside
      data-havi-role="nav"
      className="haven-sidebar shrink-0 sticky top-0 h-dvh flex flex-col z-30"
      style={{
        width: collapsed ? 76 : 272,
        padding: collapsed ? 14 : 26,
        overflowY: collapsed ? "visible" : "auto",
        transition:
          "width 0.28s cubic-bezier(0.22,1,0.36,1), padding 0.28s cubic-bezier(0.22,1,0.36,1), background 0.45s ease",
      }}
    >
      {/* Brand + toggle */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-3">
          <Logo size={32} stroke="#ffffff" />
          <button
            onClick={onToggle}
            aria-label={t("expandSidebar")}
            className="haven-nav-item flex items-center justify-center h-9 w-9 rounded-lg"
            style={{ color: "rgba(231,239,240,0.65)" }}
          >
            <ChevronsRight size={18} className="rtl:rotate-180" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-3 min-w-0">
            <Logo size={34} stroke="#ffffff" />
            <span className="font-display text-2xl text-white truncate">{t("appName")}</span>
          </div>
          <button
            onClick={onToggle}
            aria-label={t("collapseSidebar")}
            className="haven-nav-item flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
            style={{ color: "rgba(231,239,240,0.6)" }}
          >
            <ChevronsLeft size={18} className="rtl:rotate-180" />
          </button>
        </div>
      )}

      {!collapsed && (
        <p className="mt-3 px-1 text-[13px] leading-relaxed" style={{ color: "rgba(231,239,240,0.5)" }}>
          {t("tagline")}
        </p>
      )}

      {/* brass hairline accent */}
      <div
        className="mt-6 mb-6 h-px"
        style={{ background: "linear-gradient(90deg, rgba(184,151,90,0.45), rgba(184,151,90,0.05) 60%, transparent)" }}
      />

      {/* Menu */}
      {!collapsed && <SectionLabel>{t("sidebarMenu")}</SectionLabel>}
      <nav className="flex flex-col gap-1">
        {MENU.map((item) => (
          <NavRow key={item.href} item={item} active={pathname === item.href} collapsed={collapsed} />
        ))}
      </nav>

      {/* hairline divider */}
      <div className="my-6 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />

      {/* Account */}
      {!collapsed && <SectionLabel>{t("sidebarAccount")}</SectionLabel>}
      <nav className="flex flex-col gap-1">
        {ACCOUNT.map((item) => (
          <NavRow key={item.href} item={item} active={pathname === item.href} collapsed={collapsed} />
        ))}
      </nav>

      {/* Bottom group */}
      <div className="mt-auto flex flex-col gap-4 pt-8">
        {!hideGoPremium && (collapsed ? (
          <Link
            href="/premium"
            aria-label={t("premiumTitle")}
            className="haven-upgrade-btn group relative mx-auto flex items-center justify-center h-11 w-11 rounded-xl hover:-translate-y-0.5"
          >
            <Sparkles size={18} />
            <Tooltip>{t("premiumTitle")}</Tooltip>
          </Link>
        ) : (
          // Expanded sidebar: collapsible Go Premium card. The brass pill is
          // always the header/toggle; the full card body drops down beneath it
          // with a grid-rows height animation (the global reduced-motion rule
          // snaps it instantly). Collapsed = just the pill, nothing else.
          <div className="flex flex-col">
            <button
              type="button"
              onClick={togglePremiumCard}
              aria-expanded={premiumCardOpen}
              aria-label={premiumCardOpen ? t("premiumCollapse") : t("premiumExpand")}
              className="haven-upgrade-btn flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:brightness-105"
            >
              <Sparkles size={16} />
              <span>{t("premiumTitle")}</span>
              {premiumCardOpen && (
                <ChevronDown
                  size={15}
                  className="transition-transform duration-300"
                  style={{ transform: "rotate(180deg)" }}
                />
              )}
            </button>

            <div
              aria-hidden={!premiumCardOpen}
              style={{
                display: "grid",
                gridTemplateRows: premiumCardOpen ? "1fr" : "0fr",
                transition: "grid-template-rows 0.3s cubic-bezier(0.22,1,0.36,1)",
              }}
            >
              <div style={{ overflow: "hidden", minHeight: 0 }}>
                <div className="haven-premium-card relative overflow-hidden rounded-2xl p-4 mt-3">
                  <span
                    aria-hidden
                    className="haven-premium-glow pointer-events-none absolute h-24 w-24 rounded-full"
                    style={{ top: -34, insetInlineEnd: -34 }}
                  />
                  <div className="relative">
                    <p className="text-[11.5px] leading-relaxed mb-3" style={{ color: "rgba(231,239,240,0.62)" }}>
                      {t("premiumSubtitle")}
                    </p>

                    {/* Plan selector — duration-based (months), defaults to 12 */}
                    <div role="radiogroup" aria-label={t("premiumTitle")} className="flex flex-col gap-1.5 mb-3">
                      {PLANS.map((p) => {
                        const selected = plan === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setPlan(p.id)}
                            className="w-full rounded-xl px-3 py-2 text-start transition-colors"
                            style={{
                              border: selected ? "1px solid var(--color-brass)" : "1px solid rgba(255,255,255,0.12)",
                              background: selected ? "rgba(255,255,255,0.1)" : "transparent",
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              {/* Line 1: full plan name (never truncated) + price */}
                              <span className="text-[12.5px] font-semibold text-white leading-snug">{t(p.labelKey as TranslationKey)}</span>
                              <span className="shrink-0 text-[13px] font-semibold" style={{ color: "var(--color-brass)" }}>
                                {t(p.priceKey as TranslationKey)}
                              </span>
                            </div>
                            {/* Badge on its own line, below the name */}
                            {p.tagKey && (
                              <span
                                className="mt-1 inline-block rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide"
                                style={{ background: "var(--color-brass)", color: "#1a1410" }}
                              >
                                {t(p.tagKey as TranslationKey)}
                              </span>
                            )}
                            {/* Line 2: per-month equivalent */}
                            <div className="mt-1 text-[10px]" style={{ color: "rgba(231,239,240,0.6)" }}>
                              {t(p.perMonthKey as TranslationKey)}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <ul className="flex flex-col gap-1.5 mb-3.5">
                      {PREMIUM_BENEFITS.map((b) => (
                        <li key={b} className="flex items-start gap-2 text-[11.5px] leading-snug" style={{ color: "rgba(231,239,240,0.85)" }}>
                          <Check size={12} className="shrink-0 mt-0.5" style={{ color: "var(--color-brass)" }} />
                          <span>{t(b)}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/premium"
                      className="haven-upgrade-btn block w-full rounded-xl py-2.5 text-center text-sm font-semibold hover:-translate-y-0.5 hover:brightness-105"
                    >
                      {t("premiumCta")}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Language toggle */}
        {collapsed ? (
          <button
            onClick={() => setLanguage(language === "en" ? "ar" : "en")}
            aria-label={lang === "en" ? t("switchToArabic") : t("switchToEnglish")}
            className="haven-nav-item group relative mx-auto flex items-center justify-center h-11 w-11 rounded-xl"
            style={{ color: "rgba(231,239,240,0.75)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <Globe size={18} />
            <Tooltip>{lang === "en" ? t("switchToArabic") : t("switchToEnglish")}</Tooltip>
          </button>
        ) : (
          <button
            onClick={() => setLanguage(language === "en" ? "ar" : "en")}
            className="haven-nav-item inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ color: "rgba(231,239,240,0.75)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <Globe size={14} />
            <span>{lang === "en" ? t("switchToArabic") : t("switchToEnglish")}</span>
          </button>
        )}

        {/* Profile area */}
        {collapsed ? (
          <Link
            href="/profile"
            aria-label={profileName || t("nav_profile")}
            className={`haven-nav-item group relative mx-auto flex items-center justify-center rounded-xl ${
              pathname === "/profile" ? "haven-nav-active" : ""
            }`}
            style={{ width: 44, height: 44 }}
          >
            {avatar(40)}
            <Tooltip>{profileName || t("nav_profile")}</Tooltip>
          </Link>
        ) : (
          <Link
            href="/profile"
            className={`haven-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl ${
              pathname === "/profile" ? "haven-nav-active" : ""
            }`}
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {avatar(40)}
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-white truncate tracking-tight">
                {profileName || t("nav_profile")}
              </span>
              <span className="block text-[11px] truncate mt-0.5" style={{ color: "rgba(231,239,240,0.45)" }}>
                {email || t("nav_profile")}
              </span>
            </span>
          </Link>
        )}
      </div>
    </aside>
  );
}
