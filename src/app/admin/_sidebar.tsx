"use client";

import { useC, useTheme } from "./_lib";
import type { Session } from "@supabase/supabase-js";

export type AdminSection =
  | "dashboard" | "users" | "subscriptions" | "payments"
  | "support" | "coupons" | "beta";

interface NavItem { id: AdminSection; label: string; icon: string; badge?: number | string; }

export function AdminSidebar({
  current, onChange, session, onSignOut, badges,
}: {
  current: AdminSection;
  onChange: (s: AdminSection) => void;
  session: Session;
  onSignOut: () => void;
  badges?: Partial<Record<AdminSection, number>>;
}) {
  const C = useC();
  const { mode, setMode } = useTheme();
  const items: NavItem[] = [
    { id: "dashboard",     label: "Dashboard",     icon: "🏠" },
    { id: "users",         label: "Users",         icon: "👥" },
    { id: "subscriptions", label: "Subscriptions", icon: "💳" },
    { id: "payments",      label: "Payments",      icon: "💰", badge: badges?.payments },
    { id: "support",       label: "Support",       icon: "🎫", badge: badges?.support },
    { id: "coupons",       label: "Coupons",       icon: "🏷️" },
    { id: "beta",          label: "Beta",          icon: "🧪", badge: badges?.beta },
  ];

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 border-e"
      style={{ width: 240, background: C.panel, borderColor: C.border, minHeight: "100dvh" }}
    >
      <div className="px-5 py-5 border-b" style={{ borderColor: C.border }}>
        <div className="text-[15px] font-bold" style={{ color: C.text }}>🏠 Haven Admin</div>
        <div className="text-[11px] mt-1 truncate" style={{ color: C.textDim }}>{session.user.email}</div>
      </div>

      <nav className="flex-1 flex flex-col gap-1 p-3">
        {items.map((it) => {
          const isActive = current === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onChange(it.id)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors"
              style={{
                background: isActive ? C.primary : "transparent",
                color: isActive ? "#ffffff" : C.textMuted,
                border: "none", cursor: "pointer", textAlign: "start",
              }}
            >
              <span style={{ fontSize: 15 }}>{it.icon}</span>
              <span className="flex-1">{it.label}</span>
              {it.badge != null && Number(it.badge) > 0 && (
                <span
                  className="rounded-full px-2 text-[10px] font-semibold"
                  style={{ background: isActive ? "rgba(255,255,255,0.2)" : C.dangerBg, color: isActive ? "#fff" : C.danger }}
                >
                  {it.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Theme toggle */}
      <div className="px-3 pb-2">
        <div className="flex rounded-lg p-1" style={{ background: C.border }}>
          <ThemeButton current={mode} value="dark"  label="🌙 Dark"  onClick={() => setMode("dark")} />
          <ThemeButton current={mode} value="light" label="☀️ Light" onClick={() => setMode("light")} />
        </div>
      </div>

      <div className="p-3 border-t" style={{ borderColor: C.border }}>
        <button
          onClick={onSignOut}
          className="w-full rounded-lg px-3 py-2 text-[12px] font-medium"
          style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function ThemeButton({
  current, value, label, onClick,
}: { current: "dark" | "light"; value: "dark" | "light"; label: string; onClick: () => void; }) {
  const C = useC();
  const active = current === value;
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors"
      style={{
        background: active ? C.panel : "transparent",
        color: active ? C.text : C.textMuted,
        border: "none", cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export function AdminTopBar({
  current, onOpenMenu, session,
}: {
  current: AdminSection;
  onOpenMenu: () => void;
  session: Session;
}) {
  const C = useC();
  const label = current[0].toUpperCase() + current.slice(1);
  return (
    <header
      className="md:hidden sticky top-0 z-40 border-b flex items-center justify-between px-4 py-3"
      style={{ background: C.panel, borderColor: C.border }}
    >
      <button
        onClick={onOpenMenu}
        className="rounded-lg p-2"
        aria-label="Open menu"
        style={{ background: C.border, color: C.text, border: "none" }}
      >
        <span style={{ fontSize: 18 }}>☰</span>
      </button>
      <div className="text-[14px] font-semibold" style={{ color: C.text }}>Haven Admin · {label}</div>
      <span className="text-[10px] truncate max-w-[100px]" style={{ color: C.textDim }}>{session.user.email}</span>
    </header>
  );
}

export function AdminMobileDrawer({
  open, current, onChange, onClose, session, onSignOut,
}: {
  open: boolean;
  current: AdminSection;
  onChange: (s: AdminSection) => void;
  onClose: () => void;
  session: Session;
  onSignOut: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="md:hidden fixed inset-0 z-50 flex"
      onClick={onClose}
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div onClick={(e) => e.stopPropagation()} className="flex">
        <AdminSidebar
          current={current}
          onChange={(s) => { onChange(s); onClose(); }}
          session={session}
          onSignOut={onSignOut}
        />
      </div>
    </div>
  );
}
